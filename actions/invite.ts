"use server";

import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";
import { headers } from "next/headers";

import { fail, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/session";
import type { InviteLink, InviteRole } from "@/types";

/** Invite links stop working this many days after creation. */
const INVITE_TTL_DAYS = 7;

/**
 * Creates a shareable invite link for a trip. Only the trip's OWNER may
 * create invites, and a link can grant EDITOR or VIEWER — never OWNER.
 * Links are multi-use until they expire.
 */
export async function createInvite(
  tripId: string,
  role: InviteRole,
): Promise<ActionResult<InviteLink>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to share this trip.");

  if (!tripId) return fail("Trip id is required.");
  if (role !== "EDITOR" && role !== "VIEWER") {
    return fail("Invites can only grant the editor or viewer role.");
  }

  try {
    const membership = await prisma.tripMember.findUnique({
      where: { userId_tripId: { userId, tripId } },
      select: { role: true },
    });

    // Non-members get the same answer as a missing trip: no existence leaks.
    if (!membership) return fail("Trip not found.");
    if (membership.role !== "OWNER") {
      return fail("Only the trip owner can create invites.");
    }

    const invite = await prisma.invite.create({
      data: {
        token: randomBytes(24).toString("base64url"),
        role,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
        tripId,
        createdBy: userId,
      },
    });

    return {
      success: true,
      data: {
        url: `${await requestOrigin()}/invite/${invite.token}`,
        token: invite.token,
        role,
        expiresAt: invite.expiresAt.toISOString(),
      },
    };
  } catch (error) {
    console.error("createInvite failed:", error);
    return fail("Failed to create invite. Please try again.");
  }
}

/**
 * Accepts an invite for the signed-in user. Idempotent: if the user is
 * already a member of the trip (in any role), the call succeeds without
 * changing their existing role — so an OWNER clicking their own link is
 * never downgraded.
 */
export async function acceptInvite(
  token: string,
): Promise<ActionResult<{ tripId: string; alreadyMember: boolean }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to accept an invite.");

  if (!token) return fail("This invite link is invalid.");

  try {
    const invite = await prisma.invite.findUnique({
      where: { token },
      select: { tripId: true, role: true, expiresAt: true },
    });

    if (!invite) return fail("This invite link is invalid.");
    if (invite.expiresAt < new Date()) {
      return fail("This invite link has expired. Ask for a new one.");
    }

    const existing = await prisma.tripMember.findUnique({
      where: { userId_tripId: { userId, tripId: invite.tripId } },
      select: { id: true },
    });
    if (existing) {
      return {
        success: true,
        data: { tripId: invite.tripId, alreadyMember: true },
      };
    }

    await prisma.tripMember.create({
      data: { userId, tripId: invite.tripId, role: invite.role },
    });

    // No revalidatePath here: this action runs during the /invite/[token]
    // page render (a GET), where revalidation is unsupported and throws.
    // The caller redirects to /trips/[id], which is dynamic and re-fetches.
    return {
      success: true,
      data: { tripId: invite.tripId, alreadyMember: false },
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Raced a concurrent accept from the same user — already a member.
      const invite = await prisma.invite.findUnique({
        where: { token },
        select: { tripId: true },
      });
      if (invite) {
        return {
          success: true,
          data: { tripId: invite.tripId, alreadyMember: true },
        };
      }
    }
    console.error("acceptInvite failed:", error);
    return fail("Failed to accept invite. Please try again.");
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Origin of the current request, e.g. "http://localhost:3000". */
async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ??
    headerList.get("host") ??
    "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}
