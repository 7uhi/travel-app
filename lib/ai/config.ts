/**
 * Feature flag and safety bounds for AI suggestion generation.
 *
 * The preview is disabled by default and runs entirely on the deterministic
 * mock provider — no credentials, no network, no paid calls. A future real
 * provider must be added behind this same flag and must not weaken the
 * bounds below (see docs/ai-readiness.md for the enablement checklist,
 * including the distributed rate limiting and consent UI that in-memory
 * limits deliberately do not provide).
 */

export const AI_PROMPT_VERSION = "activity-suggestions/v1";

/**
 * Strict integer env parsing. Accepts only an optional sign + digits after
 * trimming (so "0" is a real value, while "", "1.5", "1e3", and "abc" are
 * not), then range-checks. Anything unset or malformed falls back to the
 * documented default — a typo can never silently widen a safety bound.
 */
function readInt(
  name: string,
  fallback: number,
  range: { min: number; max: number },
): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed)) return fallback;
  if (parsed < range.min || parsed > range.max) return fallback;
  return parsed;
}

/** True only when explicitly enabled — any other value (or unset) is off. */
export function isAiSuggestionsEnabled(): boolean {
  return process.env.AI_SUGGESTIONS_ENABLED === "1";
}

/** Wall-clock budget per provider attempt, in milliseconds. */
export function aiRequestTimeoutMs(): number {
  return readInt("AI_SUGGEST_TIMEOUT_MS", 8_000, { min: 10, max: 120_000 });
}

/**
 * Retries after the first failed attempt. "0" means try once — it is a
 * legitimate value, not a missing one. Out-of-range or malformed values
 * fall back to the default (1); the hard ceiling is 2 by design.
 */
export function aiMaxRetries(): number {
  return readInt("AI_SUGGEST_MAX_RETRIES", 1, { min: 0, max: 2 });
}

/**
 * Input budget: the maximum total length, in JS string characters (UTF-16
 * code units), of `systemPrompt + userContent` sent to the provider.
 * System instructions always fit; user content is then trimmed
 * oldest-history-first (planned activities, then existing ideas) until it
 * fits, and generation fails safe if the required group constraints alone
 * exceed the budget. See lib/ai/prompt.ts for the trimming order.
 */
export const AI_MAX_CONTEXT_CHARS = 6_000;

/**
 * Schema ceiling for user content before budgeting. Larger than the input
 * budget on purpose: budgeting (which preserves constraints) runs before
 * validation, so an oversized-but-budgetable context is trimmed instead of
 * rejected. Content beyond this cannot be budgeted and is refused.
 */
export const AI_MAX_RAW_USER_CONTENT_CHARS = 50_000;

/** Upper bound on characters of raw provider output accepted for parsing. */
export const AI_MAX_OUTPUT_CHARS = 8_000;

/** Upper bound on suggestions returned per generation. */
export const AI_MAX_SUGGESTIONS = 6;

/** Suggestions older than this are never served from a cache. */
export const AI_SUGGESTION_TTL_MS = 5 * 60 * 1_000;
