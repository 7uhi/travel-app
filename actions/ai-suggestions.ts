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
 * Settlement must never mask the generation outcome or leak content: a
 * failed settle is logged statically (the row stays RESERVED and keeps
 * counting until UTC day rollover; settling is idempotent, so a later
 * settle can still land).
 */
async function settleSafely(settle: () => Promise<void>): Promise<void> {
  try {
    await settle();
  } catch {
    logSuggestionFailure();
  }
}

/**
 * Generates activity-idea suggestions and records quota/operational metadata.
 * Applying a suggestion calls the existing `addIdea` action (OWNER/EDITOR),
 * which re-checks authorization and validates every field. Any trip member
 * may generate; only editors may apply, consistent with the Ideas workflow.
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
    // Membership and consent are rechecked inside the reservation's lock
    // (admission), so unlocked reads above are only a fast path.
    const reservation = await reserveAiGeneration({
      tripId,
      userId,
      provider: PROVIDER_NAME,
    });
    if (!reservation.ok) {
      if (reservation.scope === "not_member") return fail("Trip not found.");
      if (reservation.scope === "disabled") {
        return fail(
          "AI suggestions are turned off for this trip. The owner can turn them on from Preferences.",
        );
      }
      return fail(quotaMessage(reservation.scope));
    }

    const generationId = reservation.generationId;
    const startedAt = Date.now();
    try {
      const result = await generateActivitySuggestions(context);
      if (!result.ok) {
        await settleSafely(() =>
          failAiGeneration(generationId, {
            attempts: result.meta.attempts,
            durationMs: result.meta.durationMs,
            validationFailed: result.meta.validationFailed,
          }),
        );
        return fail(result.error);
      }
      await settleSafely(() =>
        completeAiGeneration(generationId, {
          attempts: result.meta.attempts,
          durationMs: result.meta.durationMs,
        }),
      );
      return { success: true, data: { suggestions: result.suggestions } };
    } catch (error) {
      // Unexpected generation failure: the reservation must still settle
      // (FAILED, quota released) instead of leaking as RESERVED. Re-throw
      // into the outer handler for the generic response.
      await settleSafely(() =>
        failAiGeneration(generationId, {
          attempts: 0,
          durationMs: Date.now() - startedAt,
          validationFailed: false,
        }),
      );
      throw error;
    }
  } catch {
    // Never log the caught error: it can embed prompts, notes, or payloads.
    logSuggestionFailure();
    return fail("Failed to generate suggestions. Please try again.");
  }
}
