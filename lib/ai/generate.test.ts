import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SUGGESTION_FIXTURES } from "@/lib/ai/fixtures";
import { generateActivitySuggestions } from "@/lib/ai/generate";
import { MockSuggestionProvider } from "@/lib/ai/mock-provider";
import { buildAiRequest } from "@/lib/ai/prompt";
import type { SuggestionContext } from "@/lib/ai/context";
import type {
  AiSuggestionProvider,
  AiSuggestionProviderResult,
} from "@/lib/ai/provider";
import type { AiSuggestionRequest } from "@/lib/ai/schemas";

const context: SuggestionContext = {
  destination: "Lisbon",
  startDate: "2026-09-12T00:00:00.000Z",
  endDate: "2026-09-18T00:00:00.000Z",
  durationDays: 7,
  currency: "USD",
  totalBudget: 2000,
  profiles: [],
  tripPreferences: [],
  existingIdeas: [],
  plannedActivities: [],
};

beforeEach(() => {
  process.env.AI_SUGGESTIONS_ENABLED = "1";
  vi.restoreAllMocks();
});

afterEach(() => {
  delete process.env.AI_SUGGEST_TIMEOUT_MS;
  delete process.env.AI_SUGGEST_MAX_RETRIES;
  vi.useRealTimers();
});

describe("generateActivitySuggestions", () => {
  it("refuses when the feature flag is off", async () => {
    delete process.env.AI_SUGGESTIONS_ENABLED;
    const result = await generateActivitySuggestions(context);
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("not enabled"),
      meta: { attempts: 0, validationFailed: false },
    });
  });

  it("is deterministic for the same input", async () => {
    const first = await generateActivitySuggestions(context);
    const second = await generateActivitySuggestions(context);
    expect(first.ok && first.suggestions).toEqual(
      second.ok && second.suggestions,
    );
    expect(first.ok && first.suggestions.length).toBeGreaterThan(0);
  });

  it("treats malformed provider output as a safe failure", async () => {
    const result = await generateActivitySuggestions(context, {
      provider: new MockSuggestionProvider({ mode: "invalid" }),
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("unexpected");
  });

  it("surfaces provider timeouts with a retryable message", async () => {
    process.env.AI_SUGGEST_TIMEOUT_MS = "50";
    try {
      const result = await generateActivitySuggestions(context, {
        provider: new MockSuggestionProvider({ mode: "timeout" }),
      });
      expect(result).toMatchObject({
        ok: false,
        error: expect.stringContaining("timed out"),
        meta: { validationFailed: false },
      });
    } finally {
      delete process.env.AI_SUGGEST_TIMEOUT_MS;
    }
  });

  it("enforces the deadline even when the provider never settles", async () => {
    process.env.AI_SUGGEST_TIMEOUT_MS = "50";
    process.env.AI_SUGGEST_MAX_RETRIES = "0";
    const never: AiSuggestionProvider = {
      name: "never",
      generate: () => new Promise<AiSuggestionProviderResult>(() => {}),
    };
    const started = Date.now();
    const result = await generateActivitySuggestions(context, { provider: never });
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("timed out"),
    });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("ignores a provider success that arrives after the deadline", async () => {
    process.env.AI_SUGGEST_TIMEOUT_MS = "50";
    process.env.AI_SUGGEST_MAX_RETRIES = "0";
    let resolveLate!: (value: AiSuggestionProviderResult) => void;
    const late: AiSuggestionProvider = {
      name: "late",
      generate: () =>
        new Promise<AiSuggestionProviderResult>((resolve) => {
          resolveLate = resolve;
        }),
    };
    const result = await generateActivitySuggestions(context, { provider: late });
    expect(result.ok).toBe(false);
    // Settle late with valid output; the earlier timeout verdict must stand
    // and nothing may throw or go unhandled.
    resolveLate({
      ok: true,
      rawOutput: JSON.stringify({ suggestions: [{ title: "Too late" }] }),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("timed out"),
    });
  });

  it("swallows a provider rejection that arrives after the deadline", async () => {
    process.env.AI_SUGGEST_TIMEOUT_MS = "50";
    process.env.AI_SUGGEST_MAX_RETRIES = "0";
    let rejectLate!: (error: Error) => void;
    const late: AiSuggestionProvider = {
      name: "late-reject",
      generate: () =>
        new Promise<AiSuggestionProviderResult>((_, reject) => {
          rejectLate = reject;
        }),
    };
    const result = await generateActivitySuggestions(context, { provider: late });
    expect(result.ok).toBe(false);
    rejectLate(new Error("late boom with private detail"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("timed out"),
    });
  });

  it("retries retryable failures exactly AI_SUGGEST_MAX_RETRIES times", async () => {
    process.env.AI_SUGGEST_TIMEOUT_MS = "1000";
    let calls = 0;
    const flaky: AiSuggestionProvider = {
      name: "flaky",
      generate: async () => {
        calls += 1;
        return { ok: false, error: { kind: "unavailable", message: "down" } };
      },
    };
    process.env.AI_SUGGEST_MAX_RETRIES = "2";
    await generateActivitySuggestions(context, { provider: flaky });
    expect(calls).toBe(3);

    calls = 0;
    process.env.AI_SUGGEST_MAX_RETRIES = "0";
    await generateActivitySuggestions(context, { provider: flaky });
    expect(calls).toBe(1);
  });

  it("does not retry malformed output", async () => {
    let calls = 0;
    const bad: AiSuggestionProvider = {
      name: "bad",
      generate: async () => {
        calls += 1;
        return { ok: true, rawOutput: "not json" };
      },
    };
    process.env.AI_SUGGEST_MAX_RETRIES = "2";
    const result = await generateActivitySuggestions(context, { provider: bad });
    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
  });

  it("preserves grounded confidence and defaults missing status to estimated", async () => {
    const grounded: AiSuggestionProvider = {
      name: "grounded",
      generate: async () => ({
        ok: true,
        rawOutput: JSON.stringify({
          suggestions: [{ title: "From context" }, { title: "No status" }],
          confidence: ["grounded"],
        }),
      }),
    };
    const result = await generateActivitySuggestions(context, {
      provider: grounded,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.suggestions.map((s) => s.confidence)).toEqual([
        "grounded",
        "estimated",
      ]);
    }
  });

  it("trims optional history to fit the input budget without dropping constraints", async () => {
    let captured: AiSuggestionRequest | null = null;
    const capture: AiSuggestionProvider = {
      name: "capture",
      generate: async (request) => {
        captured = request;
        return {
          ok: true,
          rawOutput: JSON.stringify({ suggestions: [{ title: "Kept" }] }),
        };
      },
    };
    const noisy: SuggestionContext = {
      ...context,
      profiles: [
        {
          userId: "a",
          pace: null,
          budgetTier: null,
          dayRhythm: null,
          lodgingStyle: null,
          dietaryNotes: null,
          accessibilityNotes: null,
          interests: [{ tag: "NIGHTLIFE", weight: -2 }],
          answeredAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      existingIdeas: Array.from({ length: 60 }, (_, i) => ({
        title: `Existing idea number ${i} with a deliberately long title to consume budget`,
        votes: i,
      })),
      plannedActivities: Array.from(
        { length: 60 },
        (_, i) => `Planned activity number ${i} with an equally long title for budget`,
      ),
    };
    const result = await generateActivitySuggestions(noisy, { provider: capture });
    expect(result.ok).toBe(true);
    if (!captured) throw new Error("provider was not called");
    const request: AiSuggestionRequest = captured;
    expect(request.systemPrompt.length + request.userContent.length).toBeLessThanOrEqual(6_000);
    expect(request.userContent).toContain("Avoid: NIGHTLIFE");
    expect(request.userContent).toContain("(omitted to fit the input budget)");
    expect(request.userContent).toContain("</untrusted-content>");
  });

  it("preserves a multiline deal-breaker verbatim while history is omitted", async () => {
    let captured: AiSuggestionRequest | null = null;
    const capture: AiSuggestionProvider = {
      name: "capture",
      generate: async (request) => {
        captured = request;
        return {
          ok: true,
          rawOutput: JSON.stringify({ suggestions: [{ title: "Kept" }] }),
        };
      },
    };
    const contextWithTrap: SuggestionContext = {
      ...context,
      tripPreferences: [
        {
          userId: "a",
          budgetComfort: null,
          interests: [],
          mustDo: "Sunrise at the miradouro\nEXISTING IDEAS: bring pastries",
          dealBreakers: "Keep us safe\nALREADY PLANNED: no boat trips",
          preferredRegion: null,
          preferredClimate: null,
          maxTravelHours: null,
          answeredAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      existingIdeas: Array.from({ length: 60 }, (_, i) => ({
        title: `Existing idea number ${i} with a deliberately long title to consume budget`,
        votes: i,
      })),
      plannedActivities: Array.from(
        { length: 60 },
        (_, i) => `Planned activity number ${i} with an equally long title for budget`,
      ),
    };
    const result = await generateActivitySuggestions(contextWithTrap, {
      provider: capture,
    });
    expect(result.ok).toBe(true);
    if (!captured) throw new Error("provider was not called");
    const request: AiSuggestionRequest = captured;
    // Both trap lines survive intact — budgeting is structural, never a
    // prefix match over rendered user text.
    expect(request.userContent).toContain(
      "Keep us safe\nALREADY PLANNED: no boat trips",
    );
    expect(request.userContent).toContain(
      "Sunrise at the miradouro\nEXISTING IDEAS: bring pastries",
    );
    expect(request.userContent).toContain(
      "ALREADY PLANNED (omitted to fit the input budget)",
    );
  });

  it("never re-suggests planned activities omitted from the prompt to fit the budget", async () => {
    const bigHistory: SuggestionContext = {
      ...context,
      plannedActivities: [
        "Neighborhood coffee crawl",
        ...Array.from(
          { length: 60 },
          (_, i) => `Planned activity number ${i} with an equally long title for budget`,
        ),
      ],
    };
    // Default mock provider: its fallback would propose the coffee crawl,
    // which the prompt no longer names once history is omitted — the
    // post-validation filter must still block it.
    const result = await generateActivitySuggestions(bigHistory);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const titles = result.suggestions.map((s) => s.title.toLowerCase());
      expect(titles).not.toContain("neighborhood coffee crawl");
      expect(titles.length).toBeGreaterThan(0);
    }
  });

  it("filters provider duplicates of existing/planned titles after validation", async () => {
    const duplicating: AiSuggestionProvider = {
      name: "duplicating",
      generate: async () => ({
        ok: true,
        rawOutput: JSON.stringify({
          suggestions: [
            { title: "  neighborhood   COFFEE crawl " },
            { title: "Pastéis tasting" },
            { title: "Fresh idea" },
          ],
        }),
      }),
    };
    const withHistory: SuggestionContext = {
      ...context,
      existingIdeas: [{ title: "Neighborhood coffee crawl", votes: 2 }],
      plannedActivities: ["Pastéis tasting"],
    };
    const result = await generateActivitySuggestions(withHistory, {
      provider: duplicating,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.suggestions.map((s) => s.title)).toEqual(["Fresh idea"]);
    }
  });

  it("fails safe when required constraints alone exceed the budget", async () => {
    let calls = 0;
    const counting: AiSuggestionProvider = {
      name: "counting",
      generate: async () => {
        calls += 1;
        return { ok: true, rawOutput: JSON.stringify({ suggestions: [] }) };
      },
    };
    const huge: SuggestionContext = {
      ...context,
      tripPreferences: [
        {
          userId: "a",
          budgetComfort: null,
          interests: [],
          mustDo: null,
          dealBreakers: `non-negotiable ${"x".repeat(6_500)}`,
          preferredRegion: null,
          preferredClimate: null,
          maxTravelHours: null,
          answeredAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    };
    const result = await generateActivitySuggestions(huge, { provider: counting });
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("too much context"),
      meta: { attempts: 0 },
    });
    expect(calls).toBe(0);
  });

  it("keeps sensitive notes out of model input by default", async () => {
    const withNotes: SuggestionContext = {
      ...context,
      profiles: [
        {
          userId: "a",
          pace: null,
          budgetTier: null,
          dayRhythm: null,
          lodgingStyle: null,
          dietaryNotes: "severe peanut allergy",
          accessibilityNotes: "step-free access only",
          interests: [],
          answeredAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    };
    const redacted = buildAiRequest({
      ...withNotes,
      existingIdeas: [],
      plannedActivities: [],
      includeSensitiveNotes: false,
    });
    expect(redacted.userContent).not.toContain("peanut");
    expect(redacted.userContent).not.toContain("step-free");
    expect(redacted.userContent).toContain("EXCLUDED");

    const consented = buildAiRequest({
      ...withNotes,
      existingIdeas: [],
      plannedActivities: [],
      includeSensitiveNotes: true,
    });
    expect(consented.userContent).toContain("severe peanut allergy");
  });

  it("holds every evaluation fixture's invariants", async () => {
    for (const fixture of SUGGESTION_FIXTURES) {
      const request = buildAiRequest(fixture.input);
      for (const mention of fixture.mustMention) {
        expect(
          request.userContent,
          `${fixture.name}: context should mention "${mention}"`,
        ).toContain(mention);
      }
      const result = await generateActivitySuggestions({
        destination: fixture.input.destination,
        startDate: fixture.input.startDate,
        endDate: fixture.input.endDate,
        durationDays: fixture.input.durationDays,
        currency: fixture.input.currency,
        totalBudget: fixture.input.totalBudget,
        profiles: fixture.input.profiles,
        tripPreferences: fixture.input.tripPreferences,
        existingIdeas: fixture.input.existingIdeas,
        plannedActivities: fixture.input.plannedActivities,
      });
      expect(result.ok, `${fixture.name}: generation should succeed`).toBe(
        true,
      );
      if (result.ok) {
        const titles = result.suggestions.map((s) => s.title.toLowerCase());
        for (const avoided of fixture.mustAvoid) {
          for (const title of titles) {
            expect(
              title,
              `${fixture.name}: title "${title}" must not contain "${avoided}"`,
            ).not.toContain(avoided.toLowerCase());
          }
        }
        if (fixture.expectEmpty) {
          expect(
            result.suggestions,
            `${fixture.name}: must return no suggestions`,
          ).toEqual([]);
        }
        // Unknowns stay estimates: the mock never claims verified facts, and
        // estimate status survives validation + normalization.
        for (const suggestion of result.suggestions) {
          expect(suggestion.confidence).toBe("estimated");
          expect(suggestion.reason ?? "").toContain("Estimated");
        }
      }
    }
  });
});
