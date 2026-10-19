import { describe, expect, it } from "vitest";

import {
  createExpense,
  getTripBalances,
  recordSettlement,
  updateExpense,
} from "@/actions/expense";
import { leaveTrip } from "@/actions/members";
import { createTrip, updateTripBudget, updateTripCurrency } from "@/actions/trip";
import { prisma } from "@/lib/prisma";
import type { ExpenseInput } from "@/types";

import {
  seedExpense,
  seedSettlement,
  seedSharedDinner,
  seedTripWithRoles,
  seedUser,
} from "./factories";
import { actAs, actInTurn, holdOpen, outcomeOf, untilBlocked } from "./helpers";

type Seed = Awaited<ReturnType<typeof seedTripWithRoles>>;

const kyoto = { title: "Kyoto", startDate: "2030-04-01", endDate: "2030-04-03" };

const wholeYen = (subject: string) =>
  `${subject} must be a whole number in JPY, which has no decimal places.`;

function dinner(amountCents: number, split: ExpenseInput["split"]): ExpenseInput {
  return { description: "Dinner", amountCents, category: "FOOD", date: "2030-06-01", split };
}

async function sharesOf(expenseId: string) {
  const splits = await prisma.expenseSplit.findMany({ where: { expenseId } });
  return Object.fromEntries(splits.map((s) => [s.userId, s.amountCents]));
}

describe("createTrip", () => {
  it("denominates the trip in the chosen currency", async () => {
    actAs((await seedUser()).id);

    expect(await createTrip({ ...kyoto, currency: "JPY", totalBudget: 300000 })).toMatchObject({
      success: true,
      data: { currency: "JPY", totalBudget: 300000 },
    });
  });

  it("takes only whole units for a zero-decimal budget", async () => {
    actAs((await seedUser()).id);

    expect(await createTrip({ ...kyoto, currency: "JPY", totalBudget: 1000.5 })).toEqual({
      success: false,
      error: wholeYen("The total budget"),
    });
    expect(await prisma.trip.count()).toBe(0);
  });

  it("refuses a currency it can't format", async () => {
    actAs((await seedUser()).id);

    expect(await createTrip({ ...kyoto, currency: "KWD" })).toEqual({
      success: false,
      error: "Unsupported currency code.",
    });
  });
});

describe("updateTripCurrency", () => {
  it("switches freely while the trip holds no amounts", async () => {
    const { trip, owner } = await seedTripWithRoles();
    actAs(owner.id);

    expect(await updateTripCurrency(trip.id, "EUR")).toEqual({ success: true, data: { currency: "EUR" } });
    expect(await prisma.trip.findUnique({ where: { id: trip.id } })).toMatchObject({ currency: "EUR" });
  });

  it("relabels existing amounts only once the owner confirms it", async () => {
    const { trip, owner, dinner } = await seedSharedDinner();
    actAs(owner.id);

    expect(await updateTripCurrency(trip.id, "EUR")).toEqual({
      success: false,
      error:
        "This trip already has amounts in USD. Switching to EUR relabels them without converting, so it has to be confirmed first.",
    });
    expect(await updateTripCurrency(trip.id, "EUR", { relabel: true })).toMatchObject({ success: true });
    expect(await prisma.expense.findUnique({ where: { id: dinner.id } })).toMatchObject({
      currency: "EUR",
      amountCents: 3000,
    });
  });

  it("relabels whole amounts into a zero-decimal currency", async () => {
    const { trip, owner, dinner } = await seedSharedDinner();
    actAs(owner.id);

    expect(await updateTripCurrency(trip.id, "JPY", { relabel: true })).toMatchObject({ success: true });
    expect(await prisma.expense.findUnique({ where: { id: dinner.id } })).toMatchObject({
      currency: "JPY",
      amountCents: 3000,
    });
  });

  it.each(["JPY", "KRW", "VND"])("won't switch to %s while an expense has cents", async (target) => {
    const { trip, owner, editor } = await seedTripWithRoles();
    await seedExpense({
      tripId: trip.id,
      paidById: owner.id,
      splits: [
        { userId: owner.id, amountCents: 600 },
        { userId: editor.id, amountCents: 650 },
      ],
    });
    actAs(owner.id);

    expect(await updateTripCurrency(trip.id, target, { relabel: true })).toEqual({
      success: false,
      error: `${target} has no decimal places, but “Dinner” is $12.50. Change amounts with cents to whole numbers before switching to ${target}.`,
    });
    expect(await prisma.trip.findUnique({ where: { id: trip.id } })).toMatchObject({ currency: "USD" });
  });

  it.each([
    [
      "a share",
      async (seed: Seed) => {
        await seedExpense({
          tripId: seed.trip.id,
          paidById: seed.owner.id,
          description: "Taxi",
          splits: [
            { userId: seed.owner.id, amountCents: 250 },
            { userId: seed.editor.id, amountCents: 250 },
            { userId: seed.viewer.id, amountCents: 500 },
          ],
        });
      },
      "a share of “Taxi” is $2.50",
    ],
    [
      "a repayment",
      async (seed: Seed) => {
        await seedSettlement({
          tripId: seed.trip.id,
          fromUserId: seed.editor.id,
          toUserId: seed.owner.id,
          amountCents: 550,
          createdById: seed.editor.id,
        });
      },
      "a recorded repayment is $5.50",
    ],
    [
      "the budget",
      async (seed: Seed) => {
        await prisma.trip.update({ where: { id: seed.trip.id }, data: { totalBudget: 1200.5 } });
      },
      "the trip budget is $1,200.50",
    ],
  ])("won't switch to JPY while %s has cents", async (_, seedAmount, culprit) => {
    const seed = await seedTripWithRoles();
    await seedAmount(seed);
    actAs(seed.owner.id);

    expect(await updateTripCurrency(seed.trip.id, "JPY", { relabel: true })).toEqual({
      success: false,
      error: `JPY has no decimal places, but ${culprit}. Change amounts with cents to whole numbers before switching to JPY.`,
    });
  });

  it.each([
    ["editor", "Only the trip owner can change the currency."],
    ["viewer", "Only the trip owner can change the currency."],
    ["outsider", "Trip not found."],
  ] as const)("refuses the %s", async (who, error) => {
    const seed = await seedTripWithRoles();
    actAs(seed[who].id);

    expect(await updateTripCurrency(seed.trip.id, "EUR")).toEqual({ success: false, error });
    expect(await prisma.trip.findUnique({ where: { id: seed.trip.id } })).toMatchObject({ currency: "USD" });
  });

  it("can't let an expense with cents in while it switches to yen", async () => {
    const { trip, owner, editor } = await seedSharedDinner();
    const commitExpenseRead = await holdOpen(
      (tx) => tx.$queryRaw`SELECT id FROM "Expense" WHERE "tripId" = ${trip.id} FOR SHARE`,
    );
    actInTurn(owner.id, editor.id);

    const switched = updateTripCurrency(trip.id, "JPY", { relabel: true });
    await untilBlocked(1, switched);
    const taxi = createExpense(trip.id, dinner(1250, { mode: "EQUAL", participantIds: [editor.id] }));
    await untilBlocked(2, taxi);
    await commitExpenseRead();

    expect(await switched).toMatchObject({ success: true });
    expect(await taxi).toEqual({ success: false, error: wholeYen("The amount") });
    expect(await prisma.expense.count()).toBe(1);
  });
});

describe("a zero-decimal trip", () => {
  it.each([
    [
      "the expense amount",
      ({ owner, editor }: Seed) => dinner(1250, { mode: "EQUAL", participantIds: [owner.id, editor.id] }),
      wholeYen("The amount"),
    ],
    [
      "an exact share",
      ({ owner, editor }: Seed) =>
        dinner(100000, {
          mode: "EXACT",
          shares: [
            { userId: owner.id, amountCents: 50050 },
            { userId: editor.id, amountCents: 49950 },
          ],
        }),
      "Each share must be a whole number — this currency has no decimal places.",
    ],
  ])("refuses cents in %s", async (_, input, error) => {
    const seed = await seedTripWithRoles({ currency: "JPY" });
    actAs(seed.owner.id);

    expect(await createExpense(seed.trip.id, input(seed))).toEqual({ success: false, error });
    expect(await prisma.expense.count()).toBe(0);
  });

  it("refuses cents when an expense is edited", async () => {
    const { trip, owner, editor } = await seedTripWithRoles({ currency: "JPY" });
    const lunch = await seedExpense({
      tripId: trip.id,
      paidById: owner.id,
      currency: "JPY",
      splits: [
        { userId: owner.id, amountCents: 100000 },
        { userId: editor.id, amountCents: 100000 },
      ],
    });
    actAs(owner.id);

    expect(
      await updateExpense(lunch.id, dinner(200050, { mode: "EQUAL", participantIds: [owner.id, editor.id] })),
    ).toEqual({ success: false, error: wholeYen("The amount") });
  });

  it("splits evenly in whole yen, the leftover yen going to the first people", async () => {
    const { trip, owner, editor, viewer } = await seedTripWithRoles({ currency: "JPY" });
    actAs(owner.id);

    const result = await createExpense(
      trip.id,
      dinner(100000, { mode: "EQUAL", participantIds: [owner.id, editor.id, viewer.id] }),
    );

    if (!result.success) throw new Error(result.error);
    expect(await sharesOf(result.data.id)).toEqual({
      [owner.id]: 33400,
      [editor.id]: 33300,
      [viewer.id]: 33300,
    });
  });

  it("splits by percentage in whole yen", async () => {
    const { trip, owner, editor, viewer } = await seedTripWithRoles({ currency: "JPY" });
    actAs(owner.id);

    const result = await createExpense(
      trip.id,
      dinner(100000, {
        mode: "PERCENT",
        shares: [
          { userId: owner.id, percent: 33.33 },
          { userId: editor.id, percent: 33.33 },
          { userId: viewer.id, percent: 33.34 },
        ],
      }),
    );

    if (!result.success) throw new Error(result.error);
    expect(await sharesOf(result.data.id)).toEqual({
      [owner.id]: 33300,
      [editor.id]: 33300,
      [viewer.id]: 33400,
    });
  });

  it("takes repayments in whole yen only", async () => {
    const { trip, owner, editor } = await seedTripWithRoles({ currency: "JPY" });
    await seedExpense({
      tripId: trip.id,
      paidById: owner.id,
      currency: "JPY",
      splits: [
        { userId: owner.id, amountCents: 100000 },
        { userId: editor.id, amountCents: 100000 },
      ],
    });
    actAs(editor.id);

    expect(
      await recordSettlement(trip.id, { fromUserId: editor.id, toUserId: owner.id, amountCents: 50050 }),
    ).toEqual({ success: false, error: wholeYen("A repayment") });
    expect(
      await recordSettlement(trip.id, { fromUserId: editor.id, toUserId: owner.id, amountCents: 50000 }),
    ).toMatchObject({ success: true });
  });

  it("takes a budget in whole yen only", async () => {
    const { trip, owner } = await seedTripWithRoles({ currency: "JPY" });
    actAs(owner.id);

    expect(await updateTripBudget(trip.id, 1000.5)).toEqual({
      success: false,
      error: wholeYen("The total budget"),
    });
    expect(await updateTripBudget(trip.id, 1000)).toEqual({ success: true, data: { totalBudget: 1000 } });
  });
});

describe("a yen ledger saved with fractions before whole units were enforced", () => {
  async function seedLegacyDinner() {
    const seed = await seedTripWithRoles({ currency: "JPY" });
    await seedExpense({
      tripId: seed.trip.id,
      paidById: seed.owner.id,
      currency: "JPY",
      splits: [
        { userId: seed.owner.id, amountCents: 33334 },
        { userId: seed.editor.id, amountCents: 33333 },
        { userId: seed.viewer.id, amountCents: 33333 },
      ],
    });
    return seed;
  }

  async function balances(tripId: string) {
    const result = await getTripBalances(tripId);
    if (!result.success) throw new Error(result.error);
    return result.data;
  }

  it("shows whole-yen balances and settle-up suggestions", async () => {
    const { trip, owner, editor, viewer } = await seedLegacyDinner();
    actAs(viewer.id);

    const { members, suggestedPayments } = await balances(trip.id);
    expect(Object.fromEntries(members.map((m) => [m.userId, m.netCents]))).toEqual({
      [owner.id]: 66600,
      [editor.id]: -33300,
      [viewer.id]: -33300,
    });
    expect(suggestedPayments).toEqual([
      { fromUserId: editor.id, toUserId: owner.id, amountCents: 33300 },
      { fromUserId: viewer.id, toUserId: owner.id, amountCents: 33300 },
    ]);
  });

  it("lets everyone pay the suggestions, leave, and keep the rest whole", async () => {
    const { trip, owner, editor, viewer } = await seedLegacyDinner();

    actAs(editor.id);
    expect(
      await recordSettlement(trip.id, { fromUserId: editor.id, toUserId: owner.id, amountCents: 33400 }),
    ).toEqual({ success: false, error: "Eddie Editor can repay Olivia Owner at most ¥333 right now." });
    expect(
      await recordSettlement(trip.id, { fromUserId: editor.id, toUserId: owner.id, amountCents: 33300 }),
    ).toMatchObject({ success: true });
    expect(await outcomeOf(leaveTrip(trip.id))).toEqual({ redirectedTo: "/trips" });

    actAs(owner.id);
    const afterEditor = await balances(trip.id);
    expect(afterEditor.members.map((m) => [m.userId, m.netCents])).toEqual([
      [owner.id, 33300],
      [viewer.id, -33300],
    ]);
    expect(afterEditor.suggestedPayments).toEqual([
      { fromUserId: viewer.id, toUserId: owner.id, amountCents: 33300 },
    ]);

    actAs(viewer.id);
    expect(
      await recordSettlement(trip.id, { fromUserId: viewer.id, toUserId: owner.id, amountCents: 33300 }),
    ).toMatchObject({ success: true });
    expect(await outcomeOf(leaveTrip(trip.id))).toEqual({ redirectedTo: "/trips" });

    actAs(owner.id);
    expect(await balances(trip.id)).toMatchObject({
      members: [{ userId: owner.id, netCents: 0 }],
      suggestedPayments: [],
    });
  });
});
