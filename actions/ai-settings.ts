"use server";

import { revalidatePath } from "next/cache";

import { fail, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { idSchema, parseInput } from "@/lib/schemas";
import { currentUserId } from "@/lib/session";

export interface TripAiSettingView {
  suggestionsEnabled: boolean;
  /** The viewer owns the trip and may change the setting. */
  canManage: boolean;
  /** Who enabled it (display name), when enabled. */
  enabledByName: string | null;
}

const CONFIRM_REQUIRED =
  "Please confirm that you understand what would be shared before enabling.";

/**
 * The trip's AI suggestion setting as any member may see it. Owners manage
 * it; everyone else just learns whether suggestions are on. Missing and
 * inaccessible trips answer identically.
 */
export async function getTripAiSetting(
  tripId: string,
): Promise<ActionResult<TripAiSettingView>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view this trip.");
  if (!parseInput(idSchema, tripId)) return fail("Trip not found.");

  try {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, members: { some: { userId } } },
      select: {
        members: { where: { userId }, select: { role: true } },
        aiSetting: {
          select: {
            suggestionsEnabled: true,
            enabledById: true,
          },
        },
      },
    });
    if (!trip) return fail("Trip not found.");

    let enabledByName: string | null = null;
    if (trip.aiSetting?.suggestionsEnabled && trip.aiSetting.enabledById) {
      const enabler = await prisma.user.findUnique({
        where: { id: trip.aiSetting.enabledById },
        select: { name: true },
      });
      enabledByName = enabler?.name ?? null;
    }

    return {
      success: true,
      data: {
        suggestionsEnabled: trip.aiSetting?.suggestionsEnabled ?? false,
        canManage: trip.members[0]?.role === "OWNER",
        enabledByName,
      },
    };
  } catch {
    return fail("Failed to load AI settings. Please try again.");
  }
}

/**
 * Enables or disables AI suggestions for a trip. OWNER only. Enabling is
 * the consent moment: the caller must explicitly confirm the disclosure
 * (what trip information a provider would receive; dietary/accessibility
 * notes are always excluded and are not part of this consent). Disabling
 * needs no confirmation and keeps the consent record for audit.
 */
export async function setTripAiSuggestions(
  tripId: string,
  enabled: boolean,
  confirmed: boolean,
): Promise<ActionResult<{ suggestionsEnabled: boolean }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to manage this trip.");
  if (!parseInput(idSchema, tripId)) return fail("Trip not found.");
  if (typeof enabled !== "boolean" || typeof confirmed !== "boolean") {
    return fail("That request wasn't in the expected format.");
  }
  if (enabled && !confirmed) return fail(CONFIRM_REQUIRED);

  try {
    const membership = await prisma.tripMember.findUnique({
      where: { userId_tripId: { userId, tripId } },
      select: { role: true },
    });
    if (!membership) return fail("Trip not found.");
    if (membership.role !== "OWNER") {
      return fail("Only the trip owner can change AI settings.");
    }

    await prisma.tripAiSetting.upsert({
      where: { tripId },
      create: {
        tripId,
        suggestionsEnabled: enabled,
        enabledById: enabled ? userId : null,
        enabledAt: enabled ? new Date() : null,
      },
      update: enabled
        ? { suggestionsEnabled: true, enabledById: userId, enabledAt: new Date() }
        : { suggestionsEnabled: false },
    });

    revalidatePath(`/trips/${tripId}/preferences`);
    revalidatePath(`/trips/${tripId}/ideas`);
    return { success: true, data: { suggestionsEnabled: enabled } };
  } catch {
    return fail("Failed to update AI settings. Please try again.");
  }
}
