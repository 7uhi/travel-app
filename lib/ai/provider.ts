import type {
  AiSuggestionRequest,
  AiSuggestionResponse,
} from "@/lib/ai/schemas";

/**
 * Narrow typed seam between the feature and any model backend.
 *
 * A provider takes a validated request and returns untrusted output plus how
 * it failed, if it did. The feature validates `rawOutput` against
 * aiSuggestionResponseSchema before use — a provider must never be trusted
 * to return well-formed data, including the mock.
 *
 * Insertion point for a real backend: implement this interface (one adapter,
 * behind the existing feature flag and consent gate) and select it in
 * actions/ai-suggestions.ts. Do not add more providers without a concrete
 * need; see docs/ai-readiness.md.
 */
export interface AiSuggestionProvider {
  /** Stable name for logs and the evaluation fixtures (e.g. "mock"). */
  readonly name: string;
  generate(
    request: AiSuggestionRequest,
    options: { signal: AbortSignal },
  ): Promise<AiSuggestionProviderResult>;
}

export type AiSuggestionProviderResult =
  | { ok: true; rawOutput: string }
  | { ok: false; error: AiProviderError };

export type AiProviderError =
  | { kind: "timeout" }
  | { kind: "rate_limited"; retryAfterMs?: number }
  | { kind: "invalid_output"; detail: string }
  | { kind: "unavailable"; message: string };
