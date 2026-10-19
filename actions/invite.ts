"use server";

import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { fail, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/session";
import type { InviteLink, InvitePreview, InviteRole } from "@/types";

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
 * What an invite link offers, for the page shown before anyone joins: the
 * trip, the role it grants, and who sent it. Reading it changes nothing —
 * joining shares the member's profile with the group, so it only happens
 * when they explicitly accept. The token is the capability: anyone holding a
 * valid link may see this much about the trip.
 */
export async function getInvitePreview(
  token: string,
): Promise<ActionResult<InvitePreview>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to open an invite.");
  if (!token || typeof token !== "string") {
    return fail("This invite link is invalid.");
  }

  try {
    const invite = await prisma.invite.findUnique({
      where: { token },
      select: {
        role: true,
        expiresAt: true,
        creator: { select: { name: true } },
        trip: {
          select: {
            id: true,
            title: true,
            destination: true,
            startDate: true,
            endDate: true,
            _count: { select: { members: true } },
            members: { where: { userId }, select: { id: true } },
          },
        },
      },
    });

    if (!invite || invite.role === "OWNER") {
      return fail("This invite link is invalid.");
    }
    if (invite.expiresAt < new Date()) {
      return fail("This invite link has expired. Ask for a new one.");
    }

    return {
      success: true,
      data: {
        tripId: invite.trip.id,
        tripTitle: invite.trip.title,
        destination: invite.trip.destination,
        startDate: invite.trip.startDate?.toISOString() ?? null,
        endDate: invite.trip.endDate?.toISOString() ?? null,
        role: invite.role,
        invitedBy: invite.creator.name,
        memberCount: invite.trip._count.members,
        expiresAt: invite.expiresAt.toISOString(),
        alreadyMember: invite.trip.members.length > 0,
      },
    };
  } catch (error) {
    console.error("getInvitePreview failed:", error);
    return fail("Failed to open this invite. Please try again.");
  }
}

/**
 * Accepts an invite for the signed-in user. Idempotent: if the user is
 * already a member of the trip (in any role), the call succeeds without
 * changing their existing role — so an OWNER clicking their own link is
 * never downgraded.
 *
 * Only ever reached through an explicit POST (the invite page's Join
 * button), never while rendering the invite page itself, so following a link
 * can't make someone join a trip — and share their profile — by accident.
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

    // Ownership is never granted by link, even if a row somehow says so.
    if (!invite || invite.role === "OWNER") {
      return fail("This invite link is invalid.");
    }
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

    revalidatePath("/trips");
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

/**
 * Form action behind the invite page's Join button: accepts, then sends a
 * brand-new member to the trip's preference deck (every question is
 * skippable) and a returning one straight to the trip.
 */
export async function acceptInviteFromForm(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const result = await acceptInvite(String(formData.get("token") ?? ""));
  if (!result.success) return result.error;
  redirect(
    result.data.alreadyMember
      ? `/trips/${result.data.tripId}`
      : `/trips/${result.data.tripId}/preferences/onboarding`,
  );
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
