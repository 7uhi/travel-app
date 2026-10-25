"use server";

import type { Prisma } from "../generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { fail, type ActionResult } from "@/lib/action-result";
import { currencyUnitCents } from "@/lib/currencies";
import { formatCents } from "@/lib/format";
import { canLeaveTrip, canManageMembers } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  idSchema,
  INVALID_INPUT,
  memberRoleSchema,
  parseInput,
} from "@/lib/schemas";
import { currentUserId } from "@/lib/session";
import { computeBalances, roundBalances } from "@/lib/split";
import type { InviteRole, TripMemberDetail } from "@/types";

/*
 * Membership changes on a trip. Every mutation here runs in a transaction
 * that first locks the trip row — the same lock recordSettlement takes — so
 * membership changes, ownership transfers, and repayments on one trip happen
 * one at a time: a balance checked before someone leaves can't change under
 * the check, and two transfers can't both see themselves as the owner.
 *
 * Leaving and removal keep the trip's money history intact: expenses, splits,
 * and repayments that involve the departed member stay as they are (they
 * reference the user, not the membership), which is why both are refused
 * until that member's balance is exactly zero.
 */

/** Lists a trip's members with their roles, in join order. Members only. */
export async function getTripMembers(
  tripId: string,
): Promise<ActionResult<TripMemberDetail[]>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view this trip.");
  if (!parseInput(idSchema, tripId)) return fail("Trip not found.");

  try {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, members: { some: { userId } } },
      select: {
        members: {
          orderBy: { createdAt: "asc" },
          select: {
            role: true,
            createdAt: true,
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
      },
    });
    if (!trip) return fail("Trip not found.");

    return {
      success: true,
      data: trip.members.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
        isYou: m.user.id === userId,
      })),
    };
  } catch (error) {
    console.error("getTripMembers failed:", error);
    return fail("Failed to load the trip's members. Please try again.");
  }
}

/**
 * Leaves a trip. Any member except the owner, who hands ownership to someone
 * else first. Refused while the member's balance isn't settled. On success it
 * redirects to /trips — the trip is no longer theirs to see — so it only ever
 * returns failures.
 */
export async function leaveTrip(tripId: string): Promise<ActionResult<never>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to leave a trip.");
  if (!parseInput(idSchema, tripId)) return fail(INVALID_INPUT);

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      await lockTrip(tx, tripId);
      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        select: {
          currency: true,
          members: { where: { userId }, select: { role: true } },
        },
      });
      const mine = trip?.members[0];
      if (!trip || !mine) return { error: "Trip not found." };
      if (!canLeaveTrip(mine.role)) {
        return {
          error:
            "The owner can't leave the trip. Make someone else the owner first, or delete the trip.",
        };
      }

      const net = await balanceOf(tx, tripId, userId, trip.currency);
      if (net !== 0) {
        const amount = formatCents(Math.abs(net), trip.currency);
        return {
          error:
            net < 0
              ? `You still owe ${amount} on this trip. Record your repayments on the Expenses tab first — you can leave once your balance is settled.`
              : `You're still owed ${amount} on this trip. Record the repayments you've received on the Expenses tab first — you can leave once your balance is settled.`,
        };
      }

      await removeFromTrip(tx, tripId, userId);
      return null;
    });
    if (outcome) return fail(outcome.error);
  } catch (error) {
    console.error("leaveTrip failed:", error);
    return fail("Failed to leave the trip. Please try again.");
  }

  revalidatePath("/trips");
  redirect("/trips");
}

/** Removes another member from the trip. OWNER only; balance must be settled. */
export async function removeMember(
  tripId: string,
  memberUserId: string,
): Promise<ActionResult<{ userId: string }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to manage members.");
  if (!parseInput(idSchema, tripId) || !parseInput(idSchema, memberUserId)) {
    return fail(INVALID_INPUT);
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      await lockTrip(tx, tripId);
      const gate = await ownerGate(tx, tripId, userId, memberUserId);
      if ("error" in gate) return gate;

      const net = await balanceOf(tx, tripId, memberUserId, gate.currency);
      if (net !== 0) {
        const amount = formatCents(Math.abs(net), gate.currency);
        const owes = net < 0 ? `still owes ${amount}` : `is still owed ${amount}`;
        return {
          error: `${gate.targetName} ${owes} on this trip. Record their repayments on the Expenses tab first — members can only be removed once their balance is settled.`,
        };
      }

      await removeFromTrip(tx, tripId, memberUserId);
      return null;
    });
    if (outcome) return fail(outcome.error);

    revalidateMembership(tripId);
    return { success: true, data: { userId: memberUserId } };
  } catch (error) {
    console.error("removeMember failed:", error);
    return fail("Failed to remove the member. Please try again.");
  }
}

/**
 * Moves a member between EDITOR and VIEWER. OWNER only; ownership itself
 * only moves through transferOwnership. Demoting someone to viewer also
 * revokes the invite links they created, since viewers can't share the trip
 * and a link they sent shouldn't keep handing out editor access.
 */
export async function setMemberRole(
  tripId: string,
  memberUserId: string,
  role: InviteRole,
): Promise<ActionResult<{ userId: string; role: InviteRole }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to manage members.");
  if (!parseInput(idSchema, tripId) || !parseInput(idSchema, memberUserId)) {
    return fail(INVALID_INPUT);
  }
  const nextRole = parseInput(memberRoleSchema, role);
  if (!nextRole) {
    return fail(
      "Members can be editors or viewers; use Make owner to hand over the trip.",
    );
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      await lockTrip(tx, tripId);
      const gate = await ownerGate(tx, tripId, userId, memberUserId);
      if ("error" in gate) return gate;

      await tx.tripMember.update({
        where: { userId_tripId: { userId: memberUserId, tripId } },
        data: { role: nextRole },
      });
      if (nextRole === "VIEWER") await revokeInvitesBy(tx, tripId, memberUserId);
      return null;
    });
    if (outcome) return fail(outcome.error);

    revalidateMembership(tripId);
    return { success: true, data: { userId: memberUserId, role: nextRole } };
  } catch (error) {
    console.error("setMemberRole failed:", error);
    return fail("Failed to change the member's role. Please try again.");
  }
}

/**
 * Makes another member the trip's owner; the previous owner becomes an
 * editor. OWNER only. Both changes happen in one locked transaction, so the
 * trip always has exactly one owner.
 */
export async function transferOwnership(
  tripId: string,
  newOwnerId: string,
): Promise<ActionResult<{ ownerId: string }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to manage members.");
  if (!parseInput(idSchema, tripId) || !parseInput(idSchema, newOwnerId)) {
    return fail(INVALID_INPUT);
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      await lockTrip(tx, tripId);
      const gate = await ownerGate(tx, tripId, userId, newOwnerId);
      if ("error" in gate) return gate;

      await tx.tripMember.update({
        where: { userId_tripId: { userId, tripId } },
        data: { role: "EDITOR" },
      });
      await tx.tripMember.update({
        where: { userId_tripId: { userId: newOwnerId, tripId } },
        data: { role: "OWNER" },
      });
      return null;
    });
    if (outcome) return fail(outcome.error);

    revalidateMembership(tripId);
    return { success: true, data: { ownerId: newOwnerId } };
  } catch (error) {
    console.error("transferOwnership failed:", error);
    return fail("Failed to transfer ownership. Please try again.");
  }
}

/* ------------------------------------------------------------------ */
/* Helpers (module-private)                                             */
/* ------------------------------------------------------------------ */

type Tx = Prisma.TransactionClient;

/** Serializes membership changes and repayments on one trip. */
async function lockTrip(tx: Tx, tripId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`;
}

/**
 * Checks the caller owns the trip and the target is another member of it.
 * Non-members get "not found"; members already see the member list, so the
 * other messages disclose nothing new.
 */
async function ownerGate(
  tx: Tx,
  tripId: string,
  userId: string,
  targetId: string,
): Promise<{ error: string } | { currency: string; targetName: string }> {
  const trip = await tx.trip.findUnique({
    where: { id: tripId },
    select: {
      currency: true,
      members: {
        where: { userId: { in: [userId, targetId] } },
        select: {
          userId: true,
          role: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });
  const mine = trip?.members.find((m) => m.userId === userId);
  if (!trip || !mine) return { error: "Trip not found." };
  if (!canManageMembers(mine.role)) {
    return { error: "Only the trip owner can manage members." };
  }
  if (targetId === userId) {
    return {
      error:
        "You can't change your own membership as the owner. Make someone else the owner first.",
    };
  }
  const target = trip.members.find((m) => m.userId === targetId);
  if (!target) return { error: "That person isn't a member of this trip." };
  return {
    currency: trip.currency,
    targetName: target.user.name ?? target.user.email,
  };
}

/**
 * A member's net balance on the trip in cents (positive = is owed), exactly
 * as the Expenses tab shows it: the whole trip's balances rounded to whole
 * currency units (see roundBalances). Gating on the raw figure would refuse
 * someone the tab shows as settled over a fraction of a yen nobody can pay.
 */
async function balanceOf(
  tx: Tx,
  tripId: string,
  userId: string,
  currency: string,
): Promise<number> {
  const expenses = await tx.expense.findMany({
    where: { tripId },
    select: {
      paidById: true,
      amountCents: true,
      splits: { select: { userId: true, amountCents: true } },
    },
  });
  const settlements = await tx.settlement.findMany({
    where: { tripId },
    select: { fromUserId: true, toUserId: true, amountCents: true },
  });
  return (
    roundBalances(
      computeBalances({ expenses, settlements }),
      currencyUnitCents(currency),
    ).get(userId) ?? 0
  );
}

/**
 * Takes someone off a trip. The ledger stays untouched (see the note at the
 * top of this file); what was only theirs on this trip goes with them —
 * availability, trip preference answers, idea votes, and their personal
 * packing list — shared packing items they'd claimed become unclaimed, and
 * invite links they created stop working.
 */
async function removeFromTrip(tx: Tx, tripId: string, userId: string): Promise<void> {
  await tx.tripMember.delete({ where: { userId_tripId: { userId, tripId } } });
  await tx.availabilityDay.deleteMany({ where: { tripId, userId } });
  await tx.tripPreference.deleteMany({ where: { tripId, userId } });
  await tx.activityVote.deleteMany({ where: { userId, idea: { tripId } } });
  await tx.packingItem.deleteMany({ where: { tripId, ownerId: userId } });
  await tx.packingItem.updateMany({
    where: { tripId, assigneeId: userId },
    data: { assigneeId: null },
  });
  await revokeInvitesBy(tx, tripId, userId);
}

/** Revokes the still-active invite links a member created on a trip. */
async function revokeInvitesBy(tx: Tx, tripId: string, userId: string): Promise<void> {
  await tx.invite.updateMany({
    where: { tripId, createdBy: userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Member counts and roles show in every section's header and on /trips. */
function revalidateMembership(tripId: string): void {
  revalidatePath("/trips");
  for (const section of ["", "/ideas", "/expenses", "/packing", "/preferences"]) {
    revalidatePath(`/trips/${tripId}${section}`);
  }
}
