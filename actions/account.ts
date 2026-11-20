"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { signOut } from "@/auth";
import {
  DELETE_ACCOUNT_PHRASE,
  DELETED_USER_NAME,
  deletedUserEmail,
} from "@/lib/account";
import { reportError } from "@/lib/report-error";
import { fail, type ActionResult } from "@/lib/action-result";
import { formatCents } from "@/lib/format";
import { balanceOf, lockTrip, removeFromTrip, type Tx } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { deleteAccountConfirmationSchema, INVALID_INPUT, parseInput } from "@/lib/schemas";
import { currentUserId } from "@/lib/session";
import type { AccountDeletionBlocker, AccountDeletionPlan } from "@/types";

/*
 * Account deletion follows the same rules as leaving a trip, applied to every
 * trip at once:
 *
 * - Refused while the person owns a trip other people are on (they hand it
 *   over or delete it first — a trip is never left without an owner) or has
 *   an unsettled balance anywhere (Expenses-tab rounding, as for leaving).
 * - Trips only they are on are deleted. Every other trip they leave through
 *   the same cleanup as leaveTrip (lib/membership.ts → removeFromTrip).
 * - The User row is kept, anonymized, because expenses, splits, and
 *   repayments reference it: deleting it would cascade those rows away and
 *   silently rewrite everyone else's balances. Its name becomes "Former
 *   member"; email, photo, Google link, sessions, and travel profile go.
 *   The real email is freed, so signing in again creates a new account.
 *
 * Sessions are stateless JWTs, so the deletion also ends sessions on other
 * devices through auth.ts's jwt callback (lib/account.ts → isActiveUser).
 */

/** What deleting the signed-in account would do right now. */
export async function getAccountDeletionPlan(): Promise<
  ActionResult<AccountDeletionPlan>
> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to manage your account.");

  try {
    return { success: true, data: await planDeletion(prisma, userId) };
  } catch (error) {
    reportError("getAccountDeletionPlan", error);
    return fail("Failed to load your account. Please try again.");
  }
}

/**
 * Permanently deletes the signed-in account (see the note at the top of this
 * file). `confirmation` must be DELETE_ACCOUNT_PHRASE. On success it signs out
 * and redirects to the landing page, so it only ever returns failures.
 */
export async function deleteMyAccount(
  confirmation: string,
): Promise<ActionResult<never>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to delete your account.");
  const typed = parseInput(deleteAccountConfirmationSchema, confirmation);
  if (typed === null) return fail(INVALID_INPUT);
  if (typed.trim() !== DELETE_ACCOUNT_PHRASE) {
    return fail(`Type ${DELETE_ACCOUNT_PHRASE} to confirm.`);
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // Lock order matches every other writer: Trip rows (ascending, so two
      // deletions sharing trips can't deadlock), then the User row — the
      // order AI admission uses too. The membership checks below run under
      // these locks, so a balance or ownership can't change underneath them.
      const lockedTripIds = (
        await tx.tripMember.findMany({ where: { userId }, select: { tripId: true } })
      )
        .map((m) => m.tripId)
        .sort();
      for (const tripId of lockedTripIds) await lockTrip(tx, tripId);

      const [user] = await tx.$queryRaw<{ deletedAt: Date | null }[]>`
        SELECT "deletedAt" FROM "User" WHERE id = ${userId} FOR UPDATE`;
      // A repeated submit after a deletion that already committed.
      if (!user || user.deletedAt) return null;

      const plan = await planDeletion(tx, userId);
      const plannedTripIds = [
        ...plan.blockers.map((b) => b.tripId),
        ...plan.tripsToDelete.map((t) => t.id),
        ...plan.tripsToLeave.map((t) => t.id),
      ].sort();
      // Joined a trip between the first read and the locks: that trip isn't
      // locked, and taking its lock now would invert the Trip → User order.
      if (plannedTripIds.join() !== lockedTripIds.join()) {
        return {
          error: "Your trips changed while your account was being deleted. Please try again.",
        };
      }
      if (plan.blockers.length > 0) {
        return {
          error: `Your account can't be deleted yet. ${plan.blockers
            .map((b) => b.message)
            .join(" ")}`,
        };
      }

      for (const trip of plan.tripsToDelete) {
        await tx.trip.delete({ where: { id: trip.id } });
      }
      for (const trip of plan.tripsToLeave) {
        await removeFromTrip(tx, trip.id, userId);
      }
      // Travel interests cascade from the profile.
      await tx.travelProfile.deleteMany({ where: { userId } });
      await tx.account.deleteMany({ where: { userId } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          name: DELETED_USER_NAME,
          email: deletedUserEmail(userId),
          emailVerified: null,
          image: null,
          deletedAt: new Date(),
        },
      });
      return null;
    });
    if (outcome) return fail(outcome.error);
  } catch (error) {
    reportError("deleteMyAccount", error);
    return fail("Failed to delete your account. Please try again.");
  }

  revalidatePath("/", "layout");
  // Clears this device's session cookie; other devices are refused by the
  // jwt callback. Both throw Next's redirect, so nothing below runs.
  await signOut({ redirectTo: "/?accountDeleted=1" });
  redirect("/?accountDeleted=1");
}

/* ------------------------------------------------------------------ */
/* Helpers (module-private)                                             */
/* ------------------------------------------------------------------ */

/** Sorts each of the person's trips into blocked / deleted / left. */
async function planDeletion(
  db: Tx,
  userId: string,
): Promise<AccountDeletionPlan> {
  const memberships = await db.tripMember.findMany({
    where: { userId },
    select: {
      role: true,
      trip: {
        select: {
          id: true,
          title: true,
          currency: true,
          _count: { select: { members: true } },
        },
      },
    },
    orderBy: { trip: { title: "asc" } },
  });

  const plan: AccountDeletionPlan = {
    blockers: [],
    tripsToDelete: [],
    tripsToLeave: [],
  };
  for (const { role, trip } of memberships) {
    const { id, title } = trip;
    if (role === "OWNER") {
      if (trip._count.members === 1) {
        plan.tripsToDelete.push({ id, title });
      } else {
        plan.blockers.push(ownerBlocker(id, title));
      }
      continue;
    }
    const net = await balanceOf(db, id, userId, trip.currency);
    if (net === 0) {
      plan.tripsToLeave.push({ id, title });
    } else {
      plan.blockers.push(
        balanceBlocker(id, title, net, formatCents(Math.abs(net), trip.currency)),
      );
    }
  }
  return plan;
}

function ownerBlocker(tripId: string, title: string): AccountDeletionBlocker {
  return {
    tripId,
    title,
    reason: "owner",
    amount: null,
    message: `You own “${title}”, which has other members. Make someone else the owner, or delete the trip.`,
  };
}

function balanceBlocker(
  tripId: string,
  title: string,
  net: number,
  amount: string,
): AccountDeletionBlocker {
  return net < 0
    ? {
        tripId,
        title,
        reason: "owes",
        amount,
        message: `You still owe ${amount} on “${title}”. Record your repayments there first.`,
      }
    : {
        tripId,
        title,
        reason: "owed",
        amount,
        message: `You're still owed ${amount} on “${title}”. Record the repayments you've received there first.`,
      };
}
