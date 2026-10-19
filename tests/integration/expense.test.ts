import { describe, expect, it } from "vitest";

import { createExpense, getTripBalances } from "@/actions/expense";
import { prisma } from "@/lib/prisma";
import type { ExpenseInput } from "@/types";

import { seedExpense, seedTripWithRoles } from "./factories";
import { actAs } from "./helpers";

function dinner(amountCents: number, split: ExpenseInput["split"]): ExpenseInput {
  return { description: "Dinner at Taberna", amountCents, category: "FOOD", date: "2030-06-01", split };
}

async function storedShareTotal(expenseId: string) {
  const { _sum } = await prisma.expenseSplit.aggregate({
    where: { expenseId },
    _sum: { amountCents: true },
  });
  return _sum.amountCents;
}

describe("createExpense", () => {
  it.each([1000, 1001, 2, 99_999])(
    "splits %i cents equally with shares that sum to the total",
    async (amountCents) => {
      const { trip, owner, editor, viewer } = await seedTripWithRoles();
      actAs(owner.id);

      const result = await createExpense(
        trip.id,
        dinner(amountCents, { mode: "EQUAL", participantIds: [owner.id, editor.id, viewer.id] }),
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      const shares = result.data.splits.map((s) => s.amountCents);
      expect(shares).toHaveLength(3);
      expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      expect(await storedShareTotal(result.data.id)).toBe(amountCents);
    },
  );

  it.each([
    [50, 50.001],
    [50, 49.999],
    [33.33, 66.67],
  ])("splits 1,000,000¢ as %s / %s percent into shares that sum exactly", async (first, second) => {
    const { trip, owner, editor } = await seedTripWithRoles();
    actAs(owner.id);

    const result = await createExpense(
      trip.id,
      dinner(1_000_000, {
        mode: "PERCENT",
        shares: [
          { userId: owner.id, percent: first },
          { userId: editor.id, percent: second },
        ],
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.splits.reduce((sum, s) => sum + s.amountCents, 0)).toBe(1_000_000);
    expect(await storedShareTotal(result.data.id)).toBe(1_000_000);
  });

  it("rejects percentages that don't add up to 100", async () => {
    const { trip, owner, editor } = await seedTripWithRoles();
    actAs(owner.id);

    const result = await createExpense(
      trip.id,
      dinner(1_000_000, {
        mode: "PERCENT",
        shares: [
          { userId: owner.id, percent: 60 },
          { userId: editor.id, percent: 60 },
        ],
      }),
    );

    expect(result).toEqual({ success: false, error: "Percentages must add up to 100." });
    expect(await prisma.expense.count()).toBe(0);
  });

  it("defaults the payer to the caller and uses the trip currency", async () => {
    const { trip, editor, viewer } = await seedTripWithRoles();
    actAs(editor.id);

    const result = await createExpense(
      trip.id,
      dinner(1200, { mode: "EQUAL", participantIds: [editor.id, viewer.id] }),
    );

    expect(result).toMatchObject({
      success: true,
      data: { paidBy: { id: editor.id }, currency: "USD", amountCents: 1200 },
    });
  });

  it.each([
    ["viewer", "Viewers can't add expenses on this trip."],
    ["outsider", "Trip not found."],
  ] as const)("refuses the %s", async (role, error) => {
    const seed = await seedTripWithRoles();
    actAs(seed[role].id);

    const result = await createExpense(
      seed.trip.id,
      dinner(1000, { mode: "EQUAL", participantIds: [seed.owner.id] }),
    );

    expect(result).toEqual({ success: false, error });
    expect(await prisma.expense.count()).toBe(0);
  });

  it("rejects participants who aren't trip members", async () => {
    const { trip, owner, outsider } = await seedTripWithRoles();
    actAs(owner.id);

    expect(
      await createExpense(
        trip.id,
        dinner(1000, { mode: "EQUAL", participantIds: [owner.id, outsider.id] }),
      ),
    ).toEqual({ success: false, error: "All participants must be members of this trip." });
  });

  it("answers malformed input with a format error instead of throwing", async () => {
    const { trip, owner } = await seedTripWithRoles();
    actAs(owner.id);

    const malformed = { ...dinner(1000, { mode: "EQUAL", participantIds: [owner.id] }), amountCents: "1000" };

    expect(await createExpense(trip.id, malformed as never)).toEqual({
      success: false,
      error: "That request wasn't in the expected format.",
    });
  });
});

describe("getTripBalances", () => {
  it("nets what each member paid against their shares", async () => {
    const { trip, owner, editor, viewer } = await seedTripWithRoles();
    await seedExpense({
      tripId: trip.id,
      paidById: owner.id,
      splits: [
        { userId: owner.id, amountCents: 1000 },
        { userId: editor.id, amountCents: 1000 },
        { userId: viewer.id, amountCents: 1000 },
      ],
    });
    actAs(viewer.id);

    const result = await getTripBalances(trip.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const net = Object.fromEntries(result.data.members.map((m) => [m.userId, m.netCents]));
    expect(net).toEqual({ [owner.id]: 2000, [editor.id]: -1000, [viewer.id]: -1000 });
    expect(result.data.suggestedPayments).toHaveLength(2);
  });
});
