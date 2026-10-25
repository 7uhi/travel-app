import { z } from "zod";

import { AI_MAX_CONTEXT_CHARS } from "@/lib/ai/config";
import { INVALID_INPUT } from "@/lib/schemas";

/**
 * Runtime-validated shapes for the activity-suggestion feature, following the
 * lib/schemas.ts convention: schemas check types and payload bounds at the
 * trust boundary (provider output is untrusted), while user-facing messages
 * are produced by the caller.
 */

const text = z.string().max(10_000);
const shortText = z.string().max(200);

export const aiSuggestionSchema = z.object({
  title: shortText.min(1).max(80),
  description: z.string().max(500).nullish(),
  locationName: z.string().max(80).nullish(),
  estimatedCost: z.number().nullish(),
  /** Why this fits the group, in one sentence. Shown with the suggestion. */
  reason: z.string().max(280).nullish(),
});

export type AiSuggestion = z.infer<typeof aiSuggestionSchema>;

/** How much of a suggestion came from trip context vs. generic knowledge. */
export type AiConfidence = "grounded" | "estimated";

/**
 * A suggestion as the feature returns it: provider output plus its estimate
 * status. Missing provider confidence is conservatively treated as
 * "estimated" during normalization — never upgraded to "grounded".
 */
export type AiSuggestionWithConfidence = AiSuggestion & {
  confidence: AiConfidence;
};

/**
 * What a provider returns. Unknowns and estimates must be explicit downstream:
 * the prompt forbids inventing verified prices, hours, links, or
 * accessibility guarantees, and `confidence` marks how much of a suggestion
 * came from trip context versus generic knowledge.
 */
export const aiSuggestionResponseSchema = z.object({
  suggestions: z.array(aiSuggestionSchema).max(12),
  /** Provider-declared confidence per suggestion, aligned by index. */
  confidence: z.array(z.enum(["grounded", "estimated"])).max(12).optional(),
});

export type AiSuggestionResponse = z.infer<typeof aiSuggestionResponseSchema>;

/**
 * What the feature asks the provider for. Built only by
 * buildBudgetedAiRequest before validation, so userContent here is
 * already within AI_MAX_CONTEXT_CHARS — the cap measures systemPrompt +
 * userContent together, and this schema re-checks the user half.
 */
export const aiSuggestionRequestSchema = z.object({
  promptVersion: z.string().min(1).max(60),
  /** Trusted instructions + rendered trip context (never raw user text). */
  systemPrompt: text,
  /** Untrusted user-entered content, labeled as such for the provider. */
  userContent: z.string().max(AI_MAX_CONTEXT_CHARS),
});

export type AiSuggestionRequest = z.infer<typeof aiSuggestionRequestSchema>;

export { INVALID_INPUT };
