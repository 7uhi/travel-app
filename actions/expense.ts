"use server";

import type {
  Expense as DbExpense,
  ExpenseSplit as DbExpenseSplit,
  Prisma,
  User as DbUser,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

import { fail, type ActionResult } from "@/lib/action-result";
import {
  currencyUnitCents,
  isWholeUnit,
  wholeUnitsMessage,
} from "@/lib/currencies";
import { parseUtcDate } from "@/lib/dates";
import { formatCents } from "@/lib/format";
import { canRecordRepayment, canRemoveRepayment } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  expenseInputSchema,
  INVALID_INPUT,
  parseInput,
  repaymentInputSchema,
} from "@/lib/schemas";
import { currentUserId } from "@/lib/session";
import {
  checkSharesTotal,
  computeBalances,
  maxRepaymentCents,
  roundBalances,
  simplifyDebts,
  splitByPercent,
  splitEqual,
  validateExactShares,
  type Share,
} from "@/lib/split";
import type {
  ExpenseCategory,
  ExpenseInput,
  ExpenseWithDetails,
  RepaymentInput,
  SettlementRecord,
  SplitInput,
  TripBalances,
} from "@/types";

export type { ExpenseInput, RepaymentInput, SplitInput };

/** €10M in cents — also keeps values far away from Postgres int overflow. */
const MAX_AMOUNT_CENTS = 1_000_000_000;

const CATEGORIES: readonly ExpenseCategory[] = [
  "FOOD",
  "TRANSPORT",
  "LODGING",
  "ACTIVITY",
  "SHOPPING",
  "OTHER",
];

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

/**
 * Creates an expense with its splits in one transaction. The caller must be
 * an OWNER or EDITOR member; the payer and every split participant must be
 * trip members; the amount and every share are whole units of the trip's
 * currency (whole yen in JPY); split amounts always sum exactly to the total
 * (enforced by lib/split.ts for EQUAL/PERCENT and validated for EXACT).
 */
export async function createExpense(
  tripId: string,
  input: ExpenseInput,
): Promise<ActionResult<ExpenseWithDetails>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to add expenses.");
  if (!tripId) return fail("Trip id is required.");
  const data = parseInput(expenseInputSchema, input);
  if (!data) return fail(INVALID_INPUT);

  try {
    const outcome = await prisma.$transaction(async (tx): Promise<
      { error: string } | { expense: ExpenseRow }
    > => {
      const currency = await lockTripCurrency(tx, tripId);
      if (!currency) return { error: "Trip not found." };
      const members = await tx.tripMember.findMany({
        where: { tripId },
        select: { userId: true, role: true },
      });
      const gate = editGate(members, userId, "add expenses");
      if (gate) return { error: gate };

      const memberIds = new Set(members.map((m) => m.userId));
      const parsed = parseExpenseFields(data, memberIds, userId, currency);
      if ("error" in parsed) return parsed;

      const shares = resolveShares(
        parsed.amountCents,
        data.split,
        memberIds,
        currency,
      );
      if ("error" in shares) return shares;

      return {
        expense: await tx.expense.create({
          data: {
            tripId,
            description: parsed.description,
            amountCents: parsed.amountCents,
            currency,
            category: parsed.category,
            date: parsed.date,
            paidById: parsed.paidById,
            splits: { create: shares.shares },
          },
          include: EXPENSE_INCLUDE,
        }),
      };
    });
    if ("error" in outcome) return fail(outcome.error);

    revalidateTripPages(tripId);
    return { success: true, data: serializeExpense(outcome.expense) };
  } catch (error) {
    console.error("createExpense failed:", error);
    return fail("Failed to add expense. Please try again.");
  }
}

/** Replaces an expense's fields and splits. Only the payer or trip OWNER. */
export async function updateExpense(
  expenseId: string,
  input: ExpenseInput,
): Promise<ActionResult<ExpenseWithDetails>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit expenses.");
  if (!expenseId) return fail("Expense id is required.");
  const data = parseInput(expenseInputSchema, input);
  if (!data) return fail(INVALID_INPUT);

  try {
    const outcome = await prisma.$transaction(async (tx): Promise<
      { error: string } | { expense: ExpenseRow }
    > => {
      const found = await tx.expense.findUnique({
        where: { id: expenseId },
        select: { tripId: true },
      });
      if (!found) return { error: "Expense not found." };
      // Lock before reading membership, so a member leaving at the same
      // moment is either fully gone or fully still here for the checks below.
      const currency = await lockTripCurrency(tx, found.tripId);
      if (!currency) return { error: "Expense not found." };

      const existing = await tx.expense.findUnique({
        where: { id: expenseId },
        select: EXISTING_EXPENSE_SELECT,
      });
      const gate = payerOrOwnerGate(existing, userId, "edit");
      if (gate) return { error: gate };
      const memberIds = new Set(existing!.trip.members.map((m) => m.userId));
      if (involvesDeparted(expenseParticipants(existing!), memberIds)) {
        return { error: DEPARTED_MESSAGE };
      }

      const parsed = parseExpenseFields(data, memberIds, userId, currency);
      if ("error" in parsed) return parsed;

      const shares = resolveShares(
        parsed.amountCents,
        data.split,
        memberIds,
        currency,
      );
      if ("error" in shares) return shares;

      // deleteMany + create inside one update = atomic split replacement
      return {
        expense: await tx.expense.update({
          where: { id: expenseId },
          data: {
            description: parsed.description,
            amountCents: parsed.amountCents,
            category: parsed.category,
            date: parsed.date,
            paidById: parsed.paidById,
            splits: { deleteMany: {}, create: shares.shares },
          },
          include: EXPENSE_INCLUDE,
        }),
      };
    });
    if ("error" in outcome) return fail(outcome.error);

    revalidateTripPages(outcome.expense.tripId);
    return { success: true, data: serializeExpense(outcome.expense) };
  } catch (error) {
    console.error("updateExpense failed:", error);
    return fail("Failed to update expense. Please try again.");
  }
}

/** Deletes an expense (splits cascade). Only the payer or trip OWNER. */
export async function deleteExpense(
  expenseId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to delete expenses.");
  if (!expenseId) return fail("Expense id is required.");

  try {
    const outcome = await prisma.$transaction(async (tx): Promise<
      { error: string } | { tripId: string }
    > => {
      const found = await tx.expense.findUnique({
        where: { id: expenseId },
        select: { tripId: true },
      });
      if (!found || !(await lockTripCurrency(tx, found.tripId))) {
        return { error: "Expense not found." };
      }
      const existing = await tx.expense.findUnique({
        where: { id: expenseId },
        select: EXISTING_EXPENSE_SELECT,
      });
      const gate = payerOrOwnerGate(existing, userId, "delete");
      if (gate) return { error: gate };
      const memberIds = new Set(existing!.trip.members.map((m) => m.userId));
      if (involvesDeparted(expenseParticipants(existing!), memberIds)) {
        return { error: DEPARTED_MESSAGE };
      }

      await tx.expense.delete({ where: { id: expenseId } });
      return { tripId: found.tripId };
    });
    if ("error" in outcome) return fail(outcome.error);

    revalidateTripPages(outcome.tripId);
    return { success: true, data: { id: expenseId } };
  } catch (error) {
    console.error("deleteExpense failed:", error);
    return fail("Failed to delete expense. Please try again.");
  }
}

/**
 * Records a repayment one member made to another outside the app (cash, a
 * bank transfer). Either person involved may record it, as may an owner or
 * editor; see canRecordRepayment.
 *
 * The amount must be a whole unit of the trip's currency and can't exceed
 * what the (whole-unit) balances currently support — what the payer owes
 * overall, capped by what the recipient is owed — so a repayment can settle a
 * debt but never flip it. Recording is serialized per trip by locking the
 * trip row, so two people recording the same suggested payment from stale
 * pages can't both succeed: the second sees the debt already gone.
 */
export async function recordSettlement(
  tripId: string,
  input: RepaymentInput,
): Promise<ActionResult<SettlementRecord>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to record a repayment.");
  if (!tripId) return fail("Trip id is required.");

  const data = parseInput(repaymentInputSchema, input);
  if (!data) return fail(INVALID_INPUT);
  const { fromUserId, toUserId, amountCents } = data;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return fail("Amount must be a positive whole number of cents.");
  }
  if (amountCents > MAX_AMOUNT_CENTS) return fail("Amount is too large.");
  if (fromUserId === toUserId) {
    return fail("A repayment needs two different members.");
  }

  try {
    const outcome = await prisma.$transaction(async (tx): Promise<
      { error: string } | { settlement: SettlementRow }
    > => {
      await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`;

      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        select: {
          currency: true,
          members: {
            select: { userId: true, role: true, user: { select: { name: true } } },
          },
          expenses: {
            select: {
              paidById: true,
              amountCents: true,
              splits: { select: { userId: true, amountCents: true } },
            },
          },
          settlements: {
            select: { fromUserId: true, toUserId: true, amountCents: true },
          },
        },
      });
      const mine = trip?.members.find((m) => m.userId === userId);
      if (!trip || !mine) return { error: "Trip not found." };

      const from = trip.members.find((m) => m.userId === fromUserId);
      const to = trip.members.find((m) => m.userId === toUserId);
      if (!from || !to) {
        return { error: "Both people must be members of this trip." };
      }
      if (!canRecordRepayment(mine.role, userId, fromUserId, toUserId)) {
        return {
          error: "Viewers can only record repayments they made or received.",
        };
      }

      if (!isWholeUnit(amountCents, trip.currency)) {
        return { error: wholeUnitsMessage("A repayment", trip.currency) };
      }

      const fromName = from.user.name ?? "This member";
      const toName = to.user.name ?? "the other member";
      const max = maxRepaymentCents(
        roundBalances(
          computeBalances({ expenses: trip.expenses, settlements: trip.settlements }),
          currencyUnitCents(trip.currency),
        ),
        fromUserId,
        toUserId,
      );
      if (max === 0) {
        return {
          error: `${fromName} doesn't owe ${toName} anything right now. The balances may have changed — refresh to see them.`,
        };
      }
      if (amountCents > max) {
        return {
          error: `${fromName} can repay ${toName} at most ${formatCents(max, trip.currency)} right now.`,
        };
      }

      return {
        settlement: await tx.settlement.create({
          data: { tripId, fromUserId, toUserId, amountCents, createdById: userId },
          include: SETTLEMENT_INCLUDE,
        }),
      };
    });
    if ("error" in outcome) return fail(outcome.error);

    revalidatePath(`/trips/${tripId}/expenses`);
    return { success: true, data: serializeSettlement(outcome.settlement) };
  } catch (error) {
    console.error("recordSettlement failed:", error);
    return fail("Failed to record the repayment. Please try again.");
  }
}

/**
 * Removes a recorded repayment, restoring the debt it settled. Allowed for
 * whoever recorded it, either person involved, or the trip owner.
 */
export async function deleteSettlement(
  settlementId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to remove a repayment.");
  if (!settlementId) return fail("Repayment id is required.");

  try {
    const outcome = await prisma.$transaction(async (tx): Promise<
      { error: string } | { tripId: string }
    > => {
      const found = await tx.settlement.findUnique({
        where: { id: settlementId },
        select: { tripId: true },
      });
      // Serialized with recording repayments and with members leaving, which
      // both lock the trip row FOR UPDATE.
      if (!found || !(await lockTripCurrency(tx, found.tripId))) {
        return { error: "Repayment not found." };
      }
      const existing = await tx.settlement.findUnique({
        where: { id: settlementId },
        select: {
          fromUserId: true,
          toUserId: true,
          createdById: true,
          trip: { select: { members: { select: { userId: true, role: true } } } },
        },
      });
      const mine = existing?.trip.members.find((m) => m.userId === userId);
      if (!existing || !mine) return { error: "Repayment not found." };
      if (!canRemoveRepayment(mine.role, userId, existing)) {
        return {
          error:
            "Only the people involved, whoever recorded it, or the owner can remove this repayment.",
        };
      }
      const memberIds = new Set(existing.trip.members.map((m) => m.userId));
      if (involvesDeparted([existing.fromUserId, existing.toUserId], memberIds)) {
        return { error: DEPARTED_MESSAGE };
      }

      await tx.settlement.delete({ where: { id: settlementId } });
      return { tripId: found.tripId };
    });
    if ("error" in outcome) return fail(outcome.error);

    revalidatePath(`/trips/${outcome.tripId}/expenses`);
    return { success: true, data: { id: settlementId } };
  } catch (error) {
    console.error("deleteSettlement failed:", error);
    return fail("Failed to remove the repayment. Please try again.");
  }
}

/** A trip's recorded repayments, newest first. Members only. */
export async function getTripSettlements(
  tripId: string,
): Promise<ActionResult<SettlementRecord[]>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view repayments.");
  if (!tripId) return fail("Trip id is required.");

  try {
    const membership = await prisma.tripMember.findUnique({
      where: { userId_tripId: { userId, tripId } },
      select: { id: true },
    });
    if (!membership) return fail("Trip not found.");

    const settlements = await prisma.settlement.findMany({
      where: { tripId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: SETTLEMENT_INCLUDE,
    });
    return { success: true, data: settlements.map(serializeSettlement) };
  } catch (error) {
    console.error("getTripSettlements failed:", error);
    return fail("Failed to load repayments. Please try again.");
  }
}

/** All expenses for a trip, newest first. Members only. */
export async function getTripExpenses(
  tripId: string,
): Promise<ActionResult<ExpenseWithDetails[]>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view expenses.");
  if (!tripId) return fail("Trip id is required.");

  try {
    const membership = await prisma.tripMember.findUnique({
      where: { userId_tripId: { userId, tripId } },
      select: { id: true },
    });
    if (!membership) return fail("Trip not found.");

    const expenses = await prisma.expense.findMany({
      where: { tripId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: EXPENSE_INCLUDE,
    });

    return { success: true, data: expenses.map(serializeExpense) };
  } catch (error) {
    console.error("getTripExpenses failed:", error);
    return fail("Failed to load expenses. Please try again.");
  }
}

/**
 * Total logged spending for a trip in cents. Members only. Cheap aggregate
 * for pages that show the budget header without loading full expenses.
 */
export async function getTripSpentCents(
  tripId: string,
): Promise<ActionResult<number>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view spending.");
  if (!tripId) return fail("Trip id is required.");

  try {
    const membership = await prisma.tripMember.findUnique({
      where: { userId_tripId: { userId, tripId } },
      select: { id: true },
    });
    if (!membership) return fail("Trip not found.");

    const agg = await prisma.expense.aggregate({
      where: { tripId },
      _sum: { amountCents: true },
    });
    return { success: true, data: agg._sum.amountCents ?? 0 };
  } catch (error) {
    console.error("getTripSpentCents failed:", error);
    return fail("Failed to load spending. Please try again.");
  }
}

/**
 * Each member's net position (paid − owed, adjusted by settlements) plus the
 * greedy-simplified "who pays whom" list, both in whole units of the trip's
 * currency (see roundBalances). Members only.
 */
export async function getTripBalances(
  tripId: string,
): Promise<ActionResult<TripBalances>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view balances.");
  if (!tripId) return fail("Trip id is required.");

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        currency: true,
        members: {
          // Join order keeps simplifyDebts pairings stable across reloads.
          orderBy: { createdAt: "asc" },
          select: {
            userId: true,
            user: { select: { name: true, image: true } },
          },
        },
        expenses: {
          select: {
            paidById: true,
            amountCents: true,
            splits: { select: { userId: true, amountCents: true } },
          },
        },
        settlements: {
          select: { fromUserId: true, toUserId: true, amountCents: true },
        },
      },
    });
    if (!trip || !trip.members.some((m) => m.userId === userId)) {
      return fail("Trip not found.");
    }

    const memberOrder = trip.members.map((m) => m.userId);
    const balances = roundBalances(
      computeBalances({ expenses: trip.expenses, settlements: trip.settlements }),
      currencyUnitCents(trip.currency),
    );

    return {
      success: true,
      data: {
        currency: trip.currency,
        members: trip.members
          .map((m) => ({
            userId: m.userId,
            name: m.user.name,
            image: m.user.image,
            netCents: balances.get(m.userId) ?? 0,
          }))
          .sort((a, b) => b.netCents - a.netCents),
        suggestedPayments: simplifyDebts(balances, memberOrder),
      },
    };
  } catch (error) {
    console.error("getTripBalances failed:", error);
    return fail("Failed to load balances. Please try again.");
  }
}

/* ------------------------------------------------------------------ */
/* Helpers (module-private)                                             */
/* ------------------------------------------------------------------ */

const EXPENSE_INCLUDE = {
  paidBy: true,
  splits: { include: { user: true } },
} as const;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof EXPENSE_INCLUDE }>;

/**
 * Locks the trip row for the rest of the transaction and returns its
 * currency (null when the trip doesn't exist), so amounts validated as whole
 * units of that currency are written under it. updateTripCurrency takes the
 * row FOR UPDATE and so waits for this KEY SHARE lock (and vice versa);
 * expense writes never wait on each other.
 */
async function lockTripCurrency(
  tx: Prisma.TransactionClient,
  tripId: string,
): Promise<string | null> {
  const rows = await tx.$queryRaw<{ currency: string }[]>`
    SELECT currency FROM "Trip" WHERE id = ${tripId} FOR KEY SHARE`;
  return rows[0]?.currency ?? null;
}

/** Spending totals surface in every tab's header, so refresh all trip pages. */
function revalidateTripPages(tripId: string): void {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/expenses`);
  revalidatePath(`/trips/${tripId}/packing`);
}

type Membership = { userId: string; role: "OWNER" | "EDITOR" | "VIEWER" };

/** Caller must be a member and not a read-only VIEWER. */
function editGate(
  members: Membership[] | undefined,
  userId: string,
  verb: string,
): string | null {
  const mine = members?.find((m) => m.userId === userId);
  if (!mine) return "Trip not found.";
  if (mine.role === "VIEWER") {
    return `Viewers can't ${verb} on this trip.`;
  }
  return null;
}

const EXISTING_EXPENSE_SELECT = {
  tripId: true,
  paidById: true,
  splits: { select: { userId: true } },
  trip: { select: { members: { select: { userId: true, role: true } } } },
} as const;

function expenseParticipants(expense: {
  paidById: string;
  splits: { userId: string }[];
}): string[] {
  return [expense.paidById, ...expense.splits.map((s) => s.userId)];
}

/**
 * Expenses and repayments involving someone who has left the trip are
 * frozen. Leaving required a settled balance, so changing one of them would
 * reopen a debt for a person who's no longer there to settle it.
 */
const DEPARTED_MESSAGE =
  "This involves someone who has left the trip, so it can't be changed: their balance was settled when they left.";

function involvesDeparted(userIds: string[], memberIds: Set<string>): boolean {
  return userIds.some((id) => !memberIds.has(id));
}

/** Caller must be a member, and either the expense's payer or the trip OWNER. */
function payerOrOwnerGate(
  existing:
    | { paidById: string; trip: { members: Membership[] } }
    | null
    | undefined,
  userId: string,
  verb: string,
): string | null {
  const mine = existing?.trip.members.find((m) => m.userId === userId);
  if (!existing || !mine) return "Expense not found.";
  if (existing.paidById !== userId && mine.role !== "OWNER") {
    return `Only the person who paid or the trip owner can ${verb} an expense.`;
  }
  return null;
}

function parseExpenseFields(
  data: ExpenseInput,
  memberIds: Set<string>,
  currentUser: string,
  currency: string,
):
  | {
      description: string;
      amountCents: number;
      category: ExpenseCategory;
      date: Date;
      paidById: string;
    }
  | { error: string } {
  const description = data.description.trim();
  if (!description) return { error: "Description is required." };
  if (description.length > 200) {
    return { error: "Description must be 200 characters or fewer." };
  }

  if (!Number.isInteger(data.amountCents) || data.amountCents <= 0) {
    return { error: "Amount must be a positive whole number of cents." };
  }
  if (data.amountCents > MAX_AMOUNT_CENTS) {
    return { error: "Amount is too large." };
  }
  if (!isWholeUnit(data.amountCents, currency)) {
    return { error: wholeUnitsMessage("The amount", currency) };
  }

  if (!CATEGORIES.includes(data.category)) {
    return { error: "Unknown expense category." };
  }

  const date = parseUtcDate(data.date);
  if (!date) return { error: "Date must be a valid ISO date (YYYY-MM-DD)." };

  const paidById = data.paidById ?? currentUser;
  if (!memberIds.has(paidById)) {
    return { error: "The payer must be a member of this trip." };
  }

  return {
    description,
    amountCents: data.amountCents,
    category: data.category,
    date,
    paidById,
  };
}

/**
 * Turns a split request into stored shares. Whatever the mode, the result is
 * checked against the final invariant (whole non-negative units of the
 * currency summing to the total) before it can be written, so no rounding
 * path can unbalance the ledger or leave a fraction of a yen.
 */
function resolveShares(
  amountCents: number,
  split: SplitInput,
  memberIds: Set<string>,
  currency: string,
): { shares: Share[] } | { error: string } {
  const unit = currencyUnitCents(currency);
  const checkMembers = (ids: string[]): string | null => {
    if (ids.length === 0) return "Pick at least one participant.";
    if (new Set(ids).size !== ids.length) {
      return "Each participant can only appear once.";
    }
    if (ids.some((id) => !memberIds.has(id))) {
      return "All participants must be members of this trip.";
    }
    return null;
  };

  let shares: Share[];
  try {
    switch (split.mode) {
      case "EQUAL": {
        const err = checkMembers(split.participantIds);
        if (err) return { error: err };
        shares = splitEqual(amountCents, split.participantIds, unit);
        break;
      }
      case "EXACT": {
        const err =
          checkMembers(split.shares.map((s) => s.userId)) ??
          validateExactShares(amountCents, split.shares, unit);
        if (err) return { error: err };
        shares = split.shares.map((s) => ({
          userId: s.userId,
          amountCents: s.amountCents,
        }));
        break;
      }
      case "PERCENT": {
        const err = checkMembers(split.shares.map((s) => s.userId));
        if (err) return { error: err };
        shares = splitByPercent(amountCents, split.shares, unit);
        break;
      }
      default:
        return { error: "Unknown split mode." };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Invalid split.",
    };
  }

  const err = checkSharesTotal(amountCents, shares, unit);
  return err ? { error: err } : { shares };
}

const SETTLEMENT_INCLUDE = {
  fromUser: { select: { id: true, name: true, image: true } },
  toUser: { select: { id: true, name: true, image: true } },
  createdBy: { select: { id: true, name: true, image: true } },
} as const;

type SettlementRow = Prisma.SettlementGetPayload<{
  include: typeof SETTLEMENT_INCLUDE;
}>;

function serializeSettlement(settlement: SettlementRow): SettlementRecord {
  return {
    id: settlement.id,
    tripId: settlement.tripId,
    fromUserId: settlement.fromUserId,
    toUserId: settlement.toUserId,
    createdById: settlement.createdById,
    amountCents: settlement.amountCents,
    date: settlement.date.toISOString(),
    fromUser: settlement.fromUser,
    toUser: settlement.toUser,
    createdBy: settlement.createdBy,
  };
}

function serializeExpense(
  expense: DbExpense & {
    paidBy: DbUser;
    splits: (DbExpenseSplit & { user: DbUser })[];
  },
): ExpenseWithDetails {
  return {
    id: expense.id,
    tripId: expense.tripId,
    description: expense.description,
    amountCents: expense.amountCents,
    currency: expense.currency,
    category: expense.category,
    date: expense.date.toISOString(),
    createdAt: expense.createdAt.toISOString(),
    paidBy: {
      id: expense.paidBy.id,
      name: expense.paidBy.name,
      image: expense.paidBy.image,
    },
    splits: expense.splits.map((s) => ({
      userId: s.userId,
      amountCents: s.amountCents,
      user: { id: s.user.id, name: s.user.name, image: s.user.image },
    })),
  };
}
