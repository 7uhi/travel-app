"use server";

import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { fail, type ActionResult } from "@/lib/action-result";
import { canCreateInvite, canRevokeInvite } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { idSchema, INVALID_INPUT, parseInput } from "@/lib/schemas";
import { currentUserId } from "@/lib/session";
import type {
  ActiveInvite,
  InviteLink,
  InvitePreview,
  InviteRole,
} from "@/types";

/** Invite links stop working this many days after creation. */
const INVITE_TTL_DAYS = 7;

const REVOKED_MESSAGE =
  "This invite link was revoked, so it can't be used to join anymore. Ask whoever shared it for a new one.";

/**
 * Creates a shareable invite link for a trip. The trip's OWNER and EDITORs
 * may create invites, and a link can grant EDITOR or VIEWER — never OWNER.
 * Links are multi-use until they expire or are revoked.
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
    if (!canCreateInvite(membership.role)) {
      return fail("Only the trip owner and editors can create invite links.");
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
        revokedAt: true,
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
    if (invite.revokedAt) return fail(REVOKED_MESSAGE);
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
      select: { tripId: true, role: true, expiresAt: true, revokedAt: true },
    });

    // Ownership is never granted by link, even if a row somehow says so.
    if (!invite || invite.role === "OWNER") {
      return fail("This invite link is invalid.");
    }
    if (invite.revokedAt) return fail(REVOKED_MESSAGE);
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
 * The trip's invite links that still admit people — not expired, not
 * revoked — newest first, with who created each and whether the viewer may
 * revoke it. Visible to the OWNER and EDITORs, the people who can share.
 */
export async function getTripInvites(
  tripId: string,
): Promise<ActionResult<ActiveInvite[]>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to see invite links.");
  if (!parseInput(idSchema, tripId)) return fail("Trip not found.");

  try {
    const membership = await prisma.tripMember.findUnique({
      where: { userId_tripId: { userId, tripId } },
      select: { role: true },
    });
    if (!membership) return fail("Trip not found.");
    if (!canCreateInvite(membership.role)) {
      return fail("Only the trip owner and editors can see invite links.");
    }

    const invites = await prisma.invite.findMany({
      where: {
        tripId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        // Ownership is never granted by link, even if a row somehow says so.
        role: { not: "OWNER" },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        token: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        creator: { select: { id: true, name: true, image: true } },
      },
    });

    const origin = await requestOrigin();
    return {
      success: true,
      data: invites.map((invite) => ({
        id: invite.id,
        url: `${origin}/invite/${invite.token}`,
        role: invite.role as InviteRole,
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
        createdBy: invite.creator,
        canRevoke: canRevokeInvite(membership.role, userId, {
          createdById: invite.creator.id,
        }),
      })),
    };
  } catch (error) {
    console.error("getTripInvites failed:", error);
    return fail("Failed to load invite links. Please try again.");
  }
}

/**
 * Turns an invite link off so nobody else can join with it. Allowed for the
 * trip OWNER and for whoever created the link. People who already joined
 * through it stay members — removing them is a separate, owner-only step.
 * Revoking an already-revoked link succeeds without changing anything.
 */
export async function revokeInvite(
  inviteId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to revoke an invite.");
  if (!parseInput(idSchema, inviteId)) return fail(INVALID_INPUT);

  try {
    const invite = await prisma.invite.findUnique({
      where: { id: inviteId },
      select: {
        createdBy: true,
        revokedAt: true,
        trip: {
          select: { members: { where: { userId }, select: { role: true } } },
        },
      },
    });

    // Non-members get the same answer as a missing invite: no existence leaks.
    const membership = invite?.trip.members[0];
    if (!invite || !membership) return fail("Invite not found.");
    if (
      !canRevokeInvite(membership.role, userId, {
        createdById: invite.createdBy,
      })
    ) {
      return fail(
        "Only the trip owner or whoever created this link can revoke it.",
      );
    }

    if (!invite.revokedAt) {
      await prisma.invite.update({
        where: { id: inviteId },
        data: { revokedAt: new Date() },
      });
    }

    return { success: true, data: { id: inviteId } };
  } catch (error) {
    console.error("revokeInvite failed:", error);
    return fail("Failed to revoke the invite. Please try again.");
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
