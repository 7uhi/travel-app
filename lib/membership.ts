import type { Prisma } from "../generated/prisma/client";

import { currencyUnitCents } from "@/lib/currencies";
import { computeBalances, roundBalances } from "@/lib/split";

/*
 * Membership building blocks shared by the member actions (leave, remove,
 * demote) and account deletion. Kept out of the "use server" action files so
 * none of them is exposed as a callable server action.
 */

export type Tx = Prisma.TransactionClient;

/** Serializes membership changes and repayments on one trip. */
export async function lockTrip(tx: Tx, tripId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`;
}

/**
 * A member's net balance on the trip in cents (positive = is owed), exactly
 * as the Expenses tab shows it: the whole trip's balances rounded to whole
 * currency units (see roundBalances). Gating on the raw figure would refuse
 * someone the tab shows as settled over a fraction of a yen nobody can pay.
 */
export async function balanceOf(
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
 * top of actions/members.ts); what was only theirs on this trip goes with
 * them — availability, trip preference answers, idea votes, and their
 * personal packing list — shared packing items they'd claimed become
 * unclaimed, and invite links they created stop working.
 */
export async function removeFromTrip(
  tx: Tx,
  tripId: string,
  userId: string,
): Promise<void> {
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
export async function revokeInvitesBy(
  tx: Tx,
  tripId: string,
  userId: string,
): Promise<void> {
  await tx.invite.updateMany({
    where: { tripId, createdBy: userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
