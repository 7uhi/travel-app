"use server";

import type {
  Expense as DbExpense,
  ExpenseSplit as DbExpenseSplit,
  User as DbUser,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

import { fail, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/session";
import {
  computeBalances,
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
  SettlementRecord,
  SplitInput,
  TripBalances,
} from "@/types";

export type { ExpenseInput, SplitInput };

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
 * trip members; split amounts always sum exactly to the total (enforced by
 * lib/split.ts for EQUAL/PERCENT and validated for EXACT).
 */
export async function createExpense(
  tripId: string,
  data: ExpenseInput,
): Promise<ActionResult<ExpenseWithDetails>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to add expenses.");
  if (!tripId) return fail("Trip id is required.");

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        currency: true,
        members: { select: { userId: true, role: true } },
      },
    });
    const gate = editGate(trip?.members, userId, "add expenses");
    if (gate) return fail(gate);

    const memberIds = new Set(trip!.members.map((m) => m.userId));
    const parsed = parseExpenseFields(data, memberIds, userId);
    if ("error" in parsed) return fail(parsed.error);

    const shares = resolveShares(parsed.amountCents, data.split, memberIds);
    if ("error" in shares) return fail(shares.error);

    const expense = await prisma.expense.create({
      data: {
        tripId,
        description: parsed.description,
        amountCents: parsed.amountCents,
        currency: trip!.currency,
        category: parsed.category,
        date: parsed.date,
        paidById: parsed.paidById,
        splits: { create: shares.shares },
      },
      include: EXPENSE_INCLUDE,
    });

    revalidatePath(`/trips/${tripId}/expenses`);
    return { success: true, data: serializeExpense(expense) };
  } catch (error) {
    console.error("createExpense failed:", error);
    return fail("Failed to add expense. Please try again.");
  }
}

/** Replaces an expense's fields and splits. Only the payer or trip OWNER. */
export async function updateExpense(
  expenseId: string,
  data: ExpenseInput,
): Promise<ActionResult<ExpenseWithDetails>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit expenses.");
  if (!expenseId) return fail("Expense id is required.");

  try {
    const existing = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: {
        tripId: true,
        paidById: true,
        trip: {
          select: {
            currency: true,
            members: { select: { userId: true, role: true } },
          },
        },
      },
    });
    const gate = payerOrOwnerGate(existing, userId, "edit");
    if (gate) return fail(gate);

    const memberIds = new Set(existing!.trip.members.map((m) => m.userId));
    const parsed = parseExpenseFields(data, memberIds, userId);
    if ("error" in parsed) return fail(parsed.error);

    const shares = resolveShares(parsed.amountCents, data.split, memberIds);
    if ("error" in shares) return fail(shares.error);

    // deleteMany + create inside one update = atomic split replacement
    const expense = await prisma.expense.update({
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
    });

    revalidatePath(`/trips/${existing!.tripId}/expenses`);
    return { success: true, data: serializeExpense(expense) };
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
    const existing = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: {
        tripId: true,
        paidById: true,
        trip: { select: { members: { select: { userId: true, role: true } } } },
      },
    });
    const gate = payerOrOwnerGate(existing, userId, "delete");
    if (gate) return fail(gate);

    await prisma.expense.delete({ where: { id: expenseId } });

    revalidatePath(`/trips/${existing!.tripId}/expenses`);
    return { success: true, data: { id: expenseId } };
  } catch (error) {
    console.error("deleteExpense failed:", error);
    return fail("Failed to delete expense. Please try again.");
  }
}

/**
 * Records a repayment between two trip members. Any member may record one
 * (Splitwise-style — "he paid me back in cash" can be logged by anyone in
 * the group), for any positive amount.
 */
export async function recordSettlement(
  tripId: string,
  fromUserId: string,
  toUserId: string,
  amountCents: number,
): Promise<ActionResult<SettlementRecord>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to settle up.");
  if (!tripId) return fail("Trip id is required.");

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return fail("Amount must be a positive whole number of cents.");
  }
  if (amountCents > MAX_AMOUNT_CENTS) return fail("Amount is too large.");
  if (!fromUserId || !toUserId || fromUserId === toUserId) {
    return fail("A settlement needs two different members.");
  }

  try {
    const members = await prisma.tripMember.findMany({
      where: { tripId },
      select: { userId: true },
    });
    const memberIds = new Set(members.map((m) => m.userId));
    if (!memberIds.has(userId)) return fail("Trip not found.");
    if (!memberIds.has(fromUserId) || !memberIds.has(toUserId)) {
      return fail("Both people must be members of this trip.");
    }

    const settlement = await prisma.settlement.create({
      data: { tripId, fromUserId, toUserId, amountCents },
    });

    revalidatePath(`/trips/${tripId}/expenses`);
    return {
      success: true,
      data: {
        id: settlement.id,
        tripId: settlement.tripId,
        fromUserId: settlement.fromUserId,
        toUserId: settlement.toUserId,
        amountCents: settlement.amountCents,
        date: settlement.date.toISOString(),
      },
    };
  } catch (error) {
    console.error("recordSettlement failed:", error);
    return fail("Failed to record settlement. Please try again.");
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
 * Each member's net position (paid − owed, adjusted by settlements) plus the
 * greedy-simplified "who pays whom" list. Members only.
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

    const balances = computeBalances({
      expenses: trip.expenses,
      settlements: trip.settlements,
    });

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
        suggestedPayments: simplifyDebts(balances),
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
):
  | {
      description: string;
      amountCents: number;
      category: ExpenseCategory;
      date: Date;
      paidById: string;
    }
  | { error: string } {
  const description = data.description?.trim();
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

  if (!CATEGORIES.includes(data.category)) {
    return { error: "Unknown expense category." };
  }

  if (!/^\d{4}-\d{2}-\d{2}/.test(data.date ?? "")) {
    return { error: "Date must be a valid ISO date (YYYY-MM-DD)." };
  }
  const date = new Date(`${data.date.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return { error: "Date must be a valid ISO date (YYYY-MM-DD)." };
  }

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

function resolveShares(
  amountCents: number,
  split: SplitInput,
  memberIds: Set<string>,
): { shares: Share[] } | { error: string } {
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

  try {
    switch (split.mode) {
      case "EQUAL": {
        const err = checkMembers(split.participantIds);
        if (err) return { error: err };
        return { shares: splitEqual(amountCents, split.participantIds) };
      }
      case "EXACT": {
        const err =
          checkMembers(split.shares.map((s) => s.userId)) ??
          validateExactShares(amountCents, split.shares);
        if (err) return { error: err };
        return { shares: split.shares };
      }
      case "PERCENT": {
        const err = checkMembers(split.shares.map((s) => s.userId));
        if (err) return { error: err };
        return { shares: splitByPercent(amountCents, split.shares) };
      }
      default:
        return { error: "Unknown split mode." };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Invalid split.",
    };
  }
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
