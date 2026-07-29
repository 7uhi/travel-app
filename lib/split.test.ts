import { describe, expect, it } from "vitest";

import {
  computeBalances,
  prorate,
  simplifyDebts,
  type Payment,
} from "./split";

const w = (userId: string, weightCents: number) => ({ userId, weightCents });

describe("prorate", () => {
  it("divides exactly when weights divide evenly", () => {
    expect(prorate(300, [w("a", 100), w("b", 200)])).toEqual([
      { userId: "a", amountCents: 100 },
      { userId: "b", amountCents: 200 },
    ]);
  });

  it("gives leftover cents to the largest fractional remainders", () => {
    // $10.01 tip over items of $5 / $3 / $2: raw = 500.5, 300.3, 200.2
    expect(prorate(1001, [w("a", 500), w("b", 300), w("c", 200)])).toEqual([
      { userId: "a", amountCents: 501 },
      { userId: "b", amountCents: 300 },
      { userId: "c", amountCents: 200 },
    ]);
  });

  it("breaks remainder ties in favor of earlier participants", () => {
    // Equal weights, raw = 333.67 each: first two get the leftover cents.
    expect(prorate(1001, [w("a", 100), w("b", 100), w("c", 100)])).toEqual([
      { userId: "a", amountCents: 334 },
      { userId: "b", amountCents: 334 },
      { userId: "c", amountCents: 333 },
    ]);
  });

  it("returns all-zero shares for a zero extra", () => {
    expect(prorate(0, [w("a", 100), w("b", 900)])).toEqual([
      { userId: "a", amountCents: 0 },
      { userId: "b", amountCents: 0 },
    ]);
  });

  it("always sums exactly to the extra amount", () => {
    const weights = [w("a", 137), w("b", 991), w("c", 55), w("d", 2401)];
    for (const extra of [1, 7, 99, 1001, 12345, 100003]) {
      const sum = prorate(extra, weights).reduce(
        (s, x) => s + x.amountCents,
        0,
      );
      expect(sum).toBe(extra);
    }
  });

  it("rejects invalid inputs", () => {
    expect(() => prorate(-1, [w("a", 100)])).toThrow();
    expect(() => prorate(10.5, [w("a", 100)])).toThrow();
    expect(() => prorate(100, [])).toThrow();
    expect(() => prorate(100, [w("a", 0)])).toThrow();
    expect(() => prorate(100, [w("a", 100), w("b", -5)])).toThrow();
  });
});

/** Applies payments to a copy of the balances; result should be all zeros. */
function settle(
  balances: Map<string, number>,
  payments: Payment[],
): Map<string, number> {
  const next = new Map(balances);
  for (const p of payments) {
    next.set(p.fromUserId, (next.get(p.fromUserId) ?? 0) + p.amountCents);
    next.set(p.toUserId, (next.get(p.toUserId) ?? 0) - p.amountCents);
  }
  return next;
}

const MEMBER_ORDER = ["kevin", "yuhi", "eshan", "dj", "andrew"];

describe("simplifyDebts", () => {
  const balances = new Map([
    ["kevin", 90_000],
    ["andrew", 40_000],
    ["yuhi", -50_000],
    ["eshan", -30_000],
    ["dj", -50_000],
  ]);

  it("zeroes every balance with at most n−1 payments", () => {
    const payments = simplifyDebts(balances, MEMBER_ORDER);
    expect(payments.length).toBeLessThanOrEqual(balances.size - 1);
    for (const cents of settle(balances, payments).values()) {
      expect(cents).toBe(0);
    }
  });

  it("pairs in member order, not amount order", () => {
    const payments = simplifyDebts(balances, MEMBER_ORDER);
    // yuhi (first debtor) fills kevin (first creditor), then eshan and dj
    // finish kevin before spilling into andrew.
    expect(payments).toEqual([
      { fromUserId: "yuhi", toUserId: "kevin", amountCents: 50_000 },
      { fromUserId: "eshan", toUserId: "kevin", amountCents: 30_000 },
      { fromUserId: "dj", toUserId: "kevin", amountCents: 10_000 },
      { fromUserId: "dj", toUserId: "andrew", amountCents: 40_000 },
    ]);
  });

  it("keeps every other row unchanged after settling a suggested payment", () => {
    const original = simplifyDebts(balances, MEMBER_ORDER);
    // Whichever single row gets settled — including dj's partial row that
    // spans both creditors — the rest of the plan must not reshuffle.
    for (const settled of original) {
      const remaining = simplifyDebts(
        settle(balances, [settled]),
        MEMBER_ORDER,
      );
      expect(remaining).toEqual(original.filter((p) => p !== settled));
    }
  });

  it("keeps the plan stable while settling rows one by one in any position", () => {
    // Settle the plan front-to-back; after each settlement the recomputed
    // plan is exactly the yet-unsettled tail.
    let current = new Map(balances);
    const original = simplifyDebts(balances, MEMBER_ORDER);
    for (let i = 0; i < original.length; i++) {
      current = settle(current, [original[i]]);
      expect(simplifyDebts(current, MEMBER_ORDER)).toEqual(
        original.slice(i + 1),
      );
    }
  });

  it("puts balance holders missing from memberOrder last, ordered by id", () => {
    const withGhost = new Map([
      ["ghost-b", -1_000],
      ["ghost-a", -2_000],
      ["kevin", 3_000],
    ]);
    expect(simplifyDebts(withGhost, ["kevin"])).toEqual([
      { fromUserId: "ghost-a", toUserId: "kevin", amountCents: 2_000 },
      { fromUserId: "ghost-b", toUserId: "kevin", amountCents: 1_000 },
    ]);
  });

  it("returns no payments when everyone is settled", () => {
    expect(simplifyDebts(new Map([["kevin", 0]]), MEMBER_ORDER)).toEqual([]);
  });
});

describe("computeBalances", () => {
  it("nets expenses and settlements to zero-sum balances", () => {
    const balances = computeBalances({
      expenses: [
        {
          paidById: "kevin",
          amountCents: 9_000,
          splits: [
            { userId: "kevin", amountCents: 3_000 },
            { userId: "yuhi", amountCents: 3_000 },
            { userId: "eshan", amountCents: 3_000 },
          ],
        },
      ],
      settlements: [{ fromUserId: "yuhi", toUserId: "kevin", amountCents: 3_000 }],
    });
    expect(balances.get("kevin")).toBe(3_000);
    expect(balances.get("yuhi")).toBe(0);
    expect(balances.get("eshan")).toBe(-3_000);
    expect([...balances.values()].reduce((a, b) => a + b, 0)).toBe(0);
  });
});
