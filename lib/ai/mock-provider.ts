import type {
  AiSuggestionProvider,
  AiSuggestionProviderResult,
} from "@/lib/ai/provider";
import type { AiSuggestionRequest } from "@/lib/ai/schemas";

/**
 * Deterministic mock provider for local development and automated tests.
 * No network, no credentials, no personal data leaves the process.
 *
 * It derives suggestions from the request itself (liked interests named in
 * the group context, destination line) so evaluation fixtures covering
 * overrides, vetoes, and conflicts produce stable, inspectable output — and
 * it never emits a vetoed interest. `mode` simulates failure paths:
 * "invalid" returns malformed output, "timeout" never resolves before the
 * caller's AbortSignal fires, "slow" resolves after `delayMs`.
 */
export type MockProviderMode = "ok" | "invalid" | "timeout" | "slow";

const INTEREST_IDEAS: Record<string, { title: string; reason: string }[]> = {
  FOOD: [
    { title: "Neighborhood food walk", reason: "The group is into food." },
    { title: "Local cooking class", reason: "Hands-on and highly rated." },
  ],
  HIKING: [
    { title: "Sunrise ridge hike", reason: "Matches the group's hiking love." },
  ],
  BEACH: [{ title: "Morning beach swim", reason: "Easy beach morning." }],
  ART_MUSEUMS: [
    { title: "Old-town gallery afternoon", reason: "For the art lovers." },
  ],
  HISTORY: [
    { title: "Guided historic quarter tour", reason: "Fits the history fans." },
  ],
  NATURE: [
    { title: "Botanical garden picnic", reason: "Low-key nature time." },
  ],
  ADVENTURE: [
    { title: "Kayak the coastline", reason: "An adventure the group wants." },
  ],
  WELLNESS: [{ title: "Sunset thermal baths", reason: "Slow wellness evening." }],
  SHOPPING: [{ title: "Craft market browse", reason: "For the shoppers." }],
  NIGHTLIFE: [
    { title: "Rooftop music night", reason: "A night out together." },
  ],
  WATER_SPORTS: [
    { title: "Beginner surf lesson", reason: "Water sports the group likes." },
  ],
  LOCAL_LIFE: [
    { title: "Neighborhood coffee crawl", reason: "Local life, low effort." },
  ],
};

export class MockSuggestionProvider implements AiSuggestionProvider {
  readonly name = "mock";

  constructor(
    private readonly options: { mode?: MockProviderMode; delayMs?: number } = {},
  ) {}

  async generate(
    request: AiSuggestionRequest,
    { signal }: { signal: AbortSignal },
  ): Promise<AiSuggestionProviderResult> {
    const mode = this.options.mode ?? "ok";
    if (mode === "timeout") {
      await new Promise<void>((_, reject) => {
        signal.addEventListener("abort", () =>
          reject(new Error("Mock provider timed out.")),
        );
      });
      return { ok: false, error: { kind: "timeout" } };
    }
    if (mode === "slow") {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.options.delayMs ?? 50);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Mock provider timed out."));
        });
      });
      if (signal.aborted) return { ok: false, error: { kind: "timeout" } };
    }
    if (signal.aborted) return { ok: false, error: { kind: "timeout" } };
    if (mode === "invalid") {
      return { ok: true, rawOutput: "not-json{{{sorry" };
    }
    return { ok: true, rawOutput: JSON.stringify(buildMockPayload(request)) };
  }
}

const FALLBACK_TAGS = ["LOCAL_LIFE", "FOOD", "NATURE"] as const;

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseHistoryTitles(userContent: string, prefix: string): Set<string> {
  const line = userContent
    .split("\n")
    .find((entry) => entry.startsWith(prefix));
  if (!line || line.includes("none yet") || line.includes("nothing yet")) {
    return new Set();
  }
  const body = line.slice(line.indexOf(":") + 1);
  return new Set(
    body
      .split(";")
      .map((entry) => entry.replace(/\s*\(\d+ votes?\)\s*$/, "").trim())
      .filter(Boolean)
      .map(normalizeTitle),
  );
}

function buildMockPayload(request: AiSuggestionRequest): {
  suggestions: {
    title: string;
    description: string;
    locationName: null;
    estimatedCost: null;
    reason: string;
  }[];
  confidence: "estimated"[];
} {
  const vetoed = new Set(
    [...request.userContent.matchAll(/Avoid: ([^\n]+)/g)].flatMap((match) =>
      match[1].split(",").map((entry) => entry.trim().split(" ")[0]),
    ),
  );
  const liked = [...request.userContent.matchAll(/Interests: ([^\n]+)/g)]
    .flatMap((match) =>
      match[1].split(",").map((entry) => entry.trim().split(" ")[0]),
    )
    .filter((tag) => tag && !vetoed.has(tag) && INTEREST_IDEAS[tag]);
  const destination =
    request.userContent.match(/Destination: ([^\n]+)/)?.[1] ?? "undecided";

  // Every candidate passes the veto filter — fallbacks included. A vetoed
  // fallback tag is skipped, never emitted.
  const candidates = (liked.length > 0 ? liked : [...FALLBACK_TAGS]).filter(
    (tag) => !vetoed.has(tag),
  );

  // Never repeat what the group already has: existing ideas, planned
  // activities, or an earlier candidate with the same title.
  const taken = new Set([
    ...parseHistoryTitles(request.userContent, "EXISTING IDEAS"),
    ...parseHistoryTitles(request.userContent, "ALREADY PLANNED"),
  ]);
  const seen = new Set<string>();
  const suggestions = [...new Set(candidates)]
    .flatMap((tag) => INTEREST_IDEAS[tag] ?? [])
    .filter((idea) => {
      const key = normalizeTitle(idea.title);
      if (taken.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3)
    .map((idea) => ({
      title: idea.title,
      description: `Mock suggestion near ${destination}. ${idea.reason} (Estimated — verify locally.)`,
      locationName: null,
      estimatedCost: null,
      reason: `${idea.reason} (Estimated — verify locally.)`,
    }));

  return {
    suggestions,
    confidence: suggestions.map(() => "estimated" as const),
  };
}
