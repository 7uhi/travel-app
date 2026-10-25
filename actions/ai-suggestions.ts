"use server";

import { fail, type ActionResult } from "@/lib/action-result";
import { isAiSuggestionsEnabled } from "@/lib/ai/config";
import { loadSuggestionContext } from "@/lib/ai/context";
import { generateActivitySuggestions } from "@/lib/ai/generate";
import { logSuggestionFailure } from "@/lib/ai/log";
import { prisma } from "@/lib/prisma";
import type { AiSuggestionWithConfidence } from "@/lib/ai/schemas";
import {
  completeAiGeneration,
  failAiGeneration,
  quotaMessage,
  reserveAiGeneration,
} from "@/lib/ai/usage";
import { currentUserId } from "@/lib/session";

const PROVIDER_NAME = "mock";

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

    // Per-trip consent: the owner must have enabled suggestions for this
    // trip (global flag alone is never enough once a provider is live).
    const setting = await prisma.tripAiSetting.findUnique({
      where: { tripId },
      select: { suggestionsEnabled: true },
    });
    if (!setting?.suggestionsEnabled) {
      return fail(
        "AI suggestions are turned off for this trip. The owner can turn them on from Preferences.",
      );
    }

    // Persistent quota: one atomic reservation per request; provider
    // retries share it. FAILED settlements release the reservation.
    const reservation = await reserveAiGeneration({
      tripId,
      userId,
      provider: PROVIDER_NAME,
    });
    if (!reservation.ok) return fail(quotaMessage(reservation.scope));

    const result = await generateActivitySuggestions(context);
    if (!result.ok) {
      await failAiGeneration(reservation.generationId, {
        attempts: result.meta.attempts,
        durationMs: result.meta.durationMs,
        validationFailed: result.meta.validationFailed,
      });
      return fail(result.error);
    }
    await completeAiGeneration(reservation.generationId, {
      attempts: result.meta.attempts,
      durationMs: result.meta.durationMs,
    });
    return { success: true, data: { suggestions: result.suggestions } };
  } catch {
    // Never log the caught error: it can embed prompts, notes, or payloads.
    logSuggestionFailure();
    return fail("Failed to generate suggestions. Please try again.");
  }
}
