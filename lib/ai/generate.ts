import {
  AI_MAX_OUTPUT_CHARS,
  AI_MAX_SUGGESTIONS,
  aiMaxRetries,
  aiRequestTimeoutMs,
  isAiSuggestionsEnabled,
} from "@/lib/ai/config";
import type { SuggestionContext } from "@/lib/ai/context";
import { MockSuggestionProvider } from "@/lib/ai/mock-provider";
import { buildBudgetedAiRequest } from "@/lib/ai/prompt";
import type { AiSuggestionProvider } from "@/lib/ai/provider";
import {
  aiSuggestionRequestSchema,
  aiSuggestionResponseSchema,
  type AiConfidence,
  type AiSuggestionRequest,
  type AiSuggestionWithConfidence,
} from "@/lib/ai/schemas";

/**
 * Orchestrates one suggestion generation: flag gate, request build, bounded
 * provider call with timeout and retries, and strict validation of the
 * untrusted output. Never throws for expected failures — they come back as
 * `{ ok: false }` with a user-facing message. Never logs prompts, notes, or
 * raw provider output (those may carry member content).
 */

export interface GenerateOptions {
  /** Defaults to the deterministic mock. Tests inject failure modes here. */
  provider?: AiSuggestionProvider;
  /** Consent gate for dietary/accessibility notes. Defaults to false. */
  includeSensitiveNotes?: boolean;
}

/** Privacy-safe operational metadata: outcome, timing, attempts only. */
export interface GenerateMeta {
  attempts: number;
  durationMs: number;
  /** Provider output failed validation (subset of failures). */
  validationFailed: boolean;
}

export type GenerateResult =
  | {
      ok: true;
      suggestions: AiSuggestionWithConfidence[];
      provider: string;
      meta: GenerateMeta;
    }
  | { ok: false; error: string; meta: GenerateMeta };

const DISABLED_ERROR = "AI suggestions are not enabled for this workspace.";
const OVERLOADED_ERROR = "Suggestions are unavailable right now. Try again later.";
const TOO_LARGE_ERROR =
  "This trip has too much context to summarize safely. Try again with fewer ideas or a shorter itinerary.";

export async function generateActivitySuggestions(
  context: SuggestionContext,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const startedAt = Date.now();
  const meta = (attempts: number, validationFailed = false): GenerateMeta => ({
    attempts,
    durationMs: Date.now() - startedAt,
    validationFailed,
  });
  if (!isAiSuggestionsEnabled()) {
    return { ok: false, error: DISABLED_ERROR, meta: meta(0) };
  }

  // Budgeted structurally before rendering/validation: an oversized history
  // is omitted section-wise (constraints preserved), and only an
  // unbudgetable context fails.
  const budgeted = buildBudgetedAiRequest({
    ...context,
    includeSensitiveNotes: options.includeSensitiveNotes ?? false,
  });
  if (!budgeted) return { ok: false, error: TOO_LARGE_ERROR, meta: meta(0) };
  const parsed = aiSuggestionRequestSchema.safeParse(budgeted);
  if (!parsed.success) return { ok: false, error: OVERLOADED_ERROR, meta: meta(0) };
  const validated = parsed.data;

  // Duplicate filtering uses the originally loaded titles, never the
  // (possibly trimmed) prompt, so omitted history still blocks repeats.
  const takenTitles = new Set(
    [
      ...context.existingIdeas.map((idea) => idea.title),
      ...context.plannedActivities,
    ].map(normalizeTitle),
  );

  const provider = options.provider ?? new MockSuggestionProvider();
  const maxRetries = aiMaxRetries();
  let attempt = 0;
  for (;;) {
    const outcome = await callOnce(provider, validated, takenTitles);
    if (outcome.ok) {
      return {
        ok: true,
        suggestions: outcome.suggestions,
        provider: provider.name,
        meta: meta(attempt + 1),
      };
    }
    if (!isRetryable(outcome.error) || attempt >= maxRetries) {
      return {
        ok: false,
        error: toUserMessage(outcome.error),
        meta: meta(attempt + 1, outcome.error.kind === "bad_output"),
      };
    }
    attempt += 1;
  }
}

type AttemptOutcome =
  | { ok: true; suggestions: AiSuggestionWithConfidence[] }
  | { ok: false; error: { kind: "timeout" | "bad_output" | "unavailable" } };

/**
 * One provider attempt under an independently enforced deadline. The
 * provider races a timer — not just an AbortSignal — so a provider that
 * ignores cancellation still loses at the deadline. The signal is aborted
 * as well so cooperative providers can stop work. A result that settles
 * after the deadline is ignored, and a late rejection is swallowed via the
 * attached catch so it can never surface as an unhandled rejection.
 */
async function callOnce(
  provider: AiSuggestionProvider,
  request: AiSuggestionRequest,
  takenTitles: ReadonlySet<string>,
): Promise<AttemptOutcome> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ timedOut: true });
    }, aiRequestTimeoutMs());
  });

  const attempt = (async () => provider.generate(request, { signal: controller.signal }))();
  // Late rejections (after the deadline wins) must not go unhandled.
  attempt.catch(() => {});

  try {
    const raced = await Promise.race([
      attempt.then((value) => ({ timedOut: false as const, value })),
      deadline,
    ]);
    if (raced.timedOut) return { ok: false, error: { kind: "timeout" } };

    const result = raced.value;
    if (!result.ok) {
      if (result.error.kind === "timeout") return { ok: false, error: { kind: "timeout" } };
      return { ok: false, error: { kind: "unavailable" } };
    }
    if (result.rawOutput.length > AI_MAX_OUTPUT_CHARS) {
      return { ok: false, error: { kind: "bad_output" } };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.rawOutput);
    } catch {
      return { ok: false, error: { kind: "bad_output" } };
    }
    const validated = aiSuggestionResponseSchema.safeParse(parsed);
    if (!validated.success) return { ok: false, error: { kind: "bad_output" } };
    return {
      ok: true,
      suggestions: normalize(
        validated.data.suggestions,
        validated.data.confidence,
        takenTitles,
      ),
    };
  } catch {
    if (controller.signal.aborted) return { ok: false, error: { kind: "timeout" } };
    return { ok: false, error: { kind: "unavailable" } };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function isRetryable(error: { kind: string }): boolean {
  return error.kind === "timeout" || error.kind === "unavailable";
}

function toUserMessage(error: { kind: string }): string {
  switch (error.kind) {
    case "timeout":
      return "Suggestions timed out. Try again in a moment.";
    case "bad_output":
      return "The suggestion service returned something unexpected. Try again.";
    default:
      return OVERLOADED_ERROR;
  }
}

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Trims, drops empties, caps the rendered count, attaches estimate status,
 * and removes duplicates. Duplicates are checked against the originally
 * loaded existing/planned titles (post-validation, independent of prompt
 * budgeting) and against earlier suggestions in the same output. Provider
 * confidence is aligned by index; a missing entry is conservatively
 * "estimated" — status is never upgraded on trust.
 */
function normalize(
  suggestions: { title: string; description?: string | null; locationName?: string | null; estimatedCost?: number | null; reason?: string | null }[],
  confidence: AiConfidence[] | undefined,
  takenTitles: ReadonlySet<string>,
): AiSuggestionWithConfidence[] {
  const seen = new Set<string>(takenTitles);
  return suggestions
    .map((suggestion, index) => ({
      ...suggestion,
      title: suggestion.title.trim(),
      description: suggestion.description?.trim() || null,
      locationName: suggestion.locationName?.trim() || null,
      reason: suggestion.reason?.trim() || null,
      confidence: confidence?.[index] ?? "estimated",
    }))
    .filter((suggestion) => {
      if (suggestion.title.length === 0) return false;
      const key = normalizeTitle(suggestion.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, AI_MAX_SUGGESTIONS);
}
