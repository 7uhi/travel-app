"use server";

import { fail, type ActionResult } from "@/lib/action-result";
import { isAiSuggestionsEnabled } from "@/lib/ai/config";
import { loadSuggestionContext } from "@/lib/ai/context";
import { generateActivitySuggestions } from "@/lib/ai/generate";
import { logSuggestionFailure } from "@/lib/ai/log";
import type { AiSuggestionWithConfidence } from "@/lib/ai/schemas";
import { currentUserId } from "@/lib/session";

/**
 * Generates activity-idea suggestions for a trip. Generation is read-only:
 * nothing is written — applying a suggestion means calling the existing
 * `addIdea` action (OWNER/EDITOR), which re-checks authorization and
 * validates every field. Any trip member may generate; only editors may
 * apply, consistent with the Ideas workflow.
 */
export async function suggestActivityIdeas(
  tripId: string,
): Promise<ActionResult<{ suggestions: AiSuggestionWithConfidence[] }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view this trip.");
  if (!tripId) return fail("Trip id is required.");
  if (!isAiSuggestionsEnabled()) {
    return fail("AI suggestions are not enabled for this workspace.");
  }

  try {
    // Null covers both missing and inaccessible trips: no existence leaks.
    const context = await loadSuggestionContext(tripId, userId);
    if (!context) return fail("Trip not found.");

    const result = await generateActivitySuggestions(context);
    if (!result.ok) return fail(result.error);
    return { success: true, data: { suggestions: result.suggestions } };
  } catch {
    // Never log the caught error: it can embed prompts, notes, or payloads.
    logSuggestionFailure();
    return fail("Failed to generate suggestions. Please try again.");
  }
}
