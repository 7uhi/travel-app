import { describe, expect, it } from "vitest";

import {
  checkSharesTotal,
  computeBalances,
  isEqualSplit,
  maxRepaymentCents,
  prorate,
  roundBalances,
  simplifyDebts,
  splitByPercent,
  splitEqual,
  validateExactShares,
  type Payment,
} from "./split";

/** One yen in stored hundredths — the unit of a zero-decimal currency. */
const YEN = 100;

const w = (userId: string, weightCents: number) => ({ userId, weightCents });

const sum = (shares: { amountCents: number }[]) =>
  shares.reduce((s, x) => s + x.amountCents, 0);

describe("splitEqual", () => {
  it("gives leftover cents to the earliest participants", () => {
    expect(splitEqual(1000, ["a", "b", "c"]).map((s) => s.amountCents)).toEqual(
      [334, 333, 333],
    );
  });

  it("splits ¥1000 three ways into whole yen, leftover yen first", () => {
    expect(
      splitEqual(1_000 * YEN, ["a", "b", "c"], YEN).map((s) => s.amountCents),
    ).toEqual([334 * YEN, 333 * YEN, 333 * YEN]);
  });

  it("always sums to the total in whole units, deterministically", () => {
    for (const total of [1, 2, 7, 999, 1_000, 123_457]) {
      for (const n of [1, 2, 3, 4, 7]) {
        const ids = Array.from({ length: n }, (_, i) => `u${i}`);
        const shares = splitEqual(total * YEN, ids, YEN);
        expect(sum(shares)).toBe(total * YEN);
        expect(shares.every((s) => s.amountCents % YEN === 0)).toBe(true);
        expect(splitEqual(total * YEN, ids, YEN)).toEqual(shares);
        expect(checkSharesTotal(total * YEN, shares, YEN)).toBeNull();
      }
    }
  });

  it("rejects a total that isn't a whole unit", () => {
    expect(() => splitEqual(100_050, ["a", "b"], YEN)).toThrow();
  });
});

describe("isEqualSplit", () => {
  it("allows the one-unit leftover an equal split leaves", () => {
    expect(isEqualSplit([334, 333, 333])).toBe(true);
    expect(isEqualSplit([334 * YEN, 333 * YEN, 333 * YEN], YEN)).toBe(true);
    expect(isEqualSplit([334 * YEN, 333 * YEN, 333 * YEN])).toBe(false);
    expect(isEqualSplit([600, 400])).toBe(false);
    expect(isEqualSplit([])).toBe(false);
  });
});

describe("splitByPercent", () => {
  it("splits exactly when percentages divide the total", () => {
    expect(
      splitByPercent(10_000, [
        { userId: "a", percent: 25 },
        { userId: "b", percent: 75 },
      ]),
    ).toEqual([
      { userId: "a", amountCents: 2_500 },
      { userId: "b", amountCents: 7_500 },
    ]);
  });

  it("never creates or loses money inside the ±0.01 tolerance", () => {
    for (const percents of [
      [50, 50.001],
      [50, 49.999],
      [33.33, 33.33, 33.33],
      [33.34, 33.33, 33.34],
    ]) {
      for (const total of [1, 99, 10_001, 1_000_000, 123_456_789]) {
        const shares = splitByPercent(
          total,
          percents.map((percent, i) => ({ userId: `u${i}`, percent })),
        );
        expect(sum(shares)).toBe(total);
        expect(checkSharesTotal(total, shares)).toBeNull();
      }
    }
  });

  it("accepts exactly the ±0.01 tolerance despite floating-point noise", () => {
    const shares = (...percents: number[]) =>
      percents.map((percent, i) => ({ userId: `u${i}`, percent }));
    expect(() => splitByPercent(100, shares(33.34, 33.33, 33.34))).not.toThrow();
    expect(() => splitByPercent(100, shares(33.35, 33.33, 33.34))).toThrow();
  });

  it("hands out whole yen by largest remainder, summing to the total", () => {
    // ¥999 at 25/75: raw ¥249.75 / ¥749.25 → floors 249 + 749, and the one
    // leftover yen goes to the larger remainder.
    expect(
      splitByPercent(
        999 * YEN,
        [
          { userId: "a", percent: 25 },
          { userId: "b", percent: 75 },
        ],
        YEN,
      ),
    ).toEqual([
      { userId: "a", amountCents: 250 * YEN },
      { userId: "b", amountCents: 749 * YEN },
    ]);

    for (const total of [1, 10, 999, 1_000, 54_321]) {
      const shares = splitByPercent(
        total * YEN,
        [33.33, 33.33, 33.34].map((percent, i) => ({ userId: `u${i}`, percent })),
        YEN,
      );
      expect(sum(shares)).toBe(total * YEN);
      expect(checkSharesTotal(total * YEN, shares, YEN)).toBeNull();
    }
  });

  it("rejects totals outside the tolerance and non-finite percentages", () => {
    const share = (percent: number) => ({ userId: "a", percent });
    expect(() => splitByPercent(100, [share(99.9)])).toThrow();
    expect(() => splitByPercent(100, [share(Number.NaN)])).toThrow();
    expect(() =>
      splitByPercent(100, [share(Number.POSITIVE_INFINITY)]),
    ).toThrow();
    expect(() =>
      splitByPercent(100, [share(150), { userId: "b", percent: -50 }]),
    ).toThrow();
  });
});

describe("checkSharesTotal", () => {
  const s = (userId: string, amountCents: number) => ({ userId, amountCents });

  it("accepts shares that sum to the total, including zero shares", () => {
    expect(checkSharesTotal(1, [s("a", 1), s("b", 0), s("c", 0)])).toBeNull();
  });

  it("rejects shares that aren't whole units", () => {
    expect(checkSharesTotal(1_000 * YEN, [s("a", 50_050), s("b", 49_950)], YEN))
      .not.toBeNull();
    expect(checkSharesTotal(1_000 * YEN, [s("a", 50_000), s("b", 50_000)], YEN))
      .toBeNull();
  });

  it("rejects mismatched sums, fractions, negatives, and duplicates", () => {
    expect(checkSharesTotal(100, [s("a", 60), s("b", 50)])).not.toBeNull();
    expect(checkSharesTotal(100, [s("a", 49.5), s("b", 50.5)])).not.toBeNull();
    expect(checkSharesTotal(100, [s("a", 150), s("b", -50)])).not.toBeNull();
    expect(checkSharesTotal(100, [s("a", 50), s("a", 50)])).not.toBeNull();
    expect(checkSharesTotal(100, [])).not.toBeNull();
  });
});

describe("validateExactShares", () => {
  const s = (userId: string, amountCents: number) => ({ userId, amountCents });

  it("requires whole units and reports totals in the currency's decimals", () => {
    expect(validateExactShares(1_000 * YEN, [s("a", 33_333), s("b", 66_667)], YEN))
      .toMatch(/whole number/);
    expect(validateExactShares(1_000 * YEN, [s("a", 30_000), s("b", 60_000)], YEN))
      .toBe("Shares add up to 900 but the expense total is 1000.");
    expect(validateExactShares(1_000, [s("a", 300), s("b", 600)])).toBe(
      "Shares add up to 9.00 but the expense total is 10.00.",
    );
    expect(validateExactShares(1_000 * YEN, [s("a", 40_000), s("b", 60_000)], YEN))
      .toBeNull();
  });
});

describe("maxRepaymentCents", () => {
  const balances = new Map([
    ["alex", 8_000],
    ["sam", -4_000],
    ["taylor", -4_000],
  ]);

  it("caps a repayment at what the payer owes and the recipient is owed", () => {
    expect(maxRepaymentCents(balances, "sam", "alex")).toBe(4_000);
  });

  it("allows nothing once a debt is settled, so a duplicate can't reverse it", () => {
    const settled = new Map(balances).set("sam", 0).set("alex", 4_000);
    expect(maxRepaymentCents(settled, "sam", "alex")).toBe(0);
  });

  it("allows nothing between two debtors or toward a debtor", () => {
    expect(maxRepaymentCents(balances, "sam", "taylor")).toBe(0);
    expect(maxRepaymentCents(balances, "alex", "sam")).toBe(0);
  });
});

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

  it("prorates whole yen, leftover to the largest remainder", () => {
    // ¥101 tax over ¥500 / ¥300 / ¥200 items: raw ¥50.5 / ¥30.3 / ¥20.2.
    expect(
      prorate(101 * YEN, [w("a", 500 * YEN), w("b", 300 * YEN), w("c", 200 * YEN)], YEN),
    ).toEqual([
      { userId: "a", amountCents: 51 * YEN },
      { userId: "b", amountCents: 30 * YEN },
      { userId: "c", amountCents: 20 * YEN },
    ]);
    expect(() => prorate(10_050, [w("a", 100)], YEN)).toThrow();
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

describe("roundBalances", () => {
  // ¥1000 paid by alex, stored before whole yen were enforced as
  // ¥333.34 / ¥333.33 / ¥333.33.
  const legacy = computeBalances({
    expenses: [
      {
        paidById: "alex",
        amountCents: 100_000,
        splits: [
          { userId: "alex", amountCents: 33_334 },
          { userId: "sam", amountCents: 33_333 },
          { userId: "taylor", amountCents: 33_333 },
        ],
      },
    ],
    settlements: [],
  });
  const order = ["alex", "sam", "taylor"];

  it("leaves cent balances alone", () => {
    const balances = new Map([
      ["a", 1_001],
      ["b", -667],
      ["c", -334],
    ]);
    expect(roundBalances(balances, 1, ["a", "b", "c"])).toEqual(balances);
  });

  it("rounds to whole yen without breaking the zero sum", () => {
    const rounded = roundBalances(legacy, YEN, order);
    expect(rounded).toEqual(
      new Map([
        ["alex", 666 * YEN],
        ["sam", -333 * YEN],
        ["taylor", -333 * YEN],
      ]),
    );
  });

  it("makes settle-up suggestions and the repayment cap whole yen", () => {
    const rounded = roundBalances(legacy, YEN, order);
    const payments = simplifyDebts(rounded, order);
    expect(payments).toEqual([
      { fromUserId: "sam", toUserId: "alex", amountCents: 333 * YEN },
      { fromUserId: "taylor", toUserId: "alex", amountCents: 333 * YEN },
    ]);
    expect(maxRepaymentCents(rounded, "sam", "alex")).toBe(333 * YEN);
  });

  it("holds still while the group pays the rounded suggestions", () => {
    let raw = legacy;
    for (const payment of simplifyDebts(roundBalances(legacy, YEN, order), order)) {
      const before = roundBalances(raw, YEN, order);
      raw = settle(raw, [payment]);
      expect(roundBalances(raw, YEN, order)).toEqual(settle(before, [payment]));
    }
    for (const cents of roundBalances(raw, YEN, order).values()) {
      expect(cents).toBe(0);
    }
  });

  it("breaks remainder ties in member order", () => {
    const tied = new Map([
      ["b", -50],
      ["a", 50],
    ]);
    expect(roundBalances(tied, YEN, ["a", "b"])).toEqual(
      new Map([
        ["b", -100],
        ["a", 100],
      ]),
    );
    expect(roundBalances(tied, YEN, ["b", "a"])).toEqual(
      new Map([
        ["b", 0],
        ["a", 0],
      ]),
    );
  });

  it("stays within one unit of every balance and sums to zero", () => {
    let seed = 7;
    const next = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648);
    for (let trial = 0; trial < 50; trial++) {
      const ids = ["a", "b", "c", "d", "e"].slice(0, 2 + (next() % 4));
      const expenses = Array.from({ length: 1 + (next() % 6) }, () => {
        const amountCents = 1 + (next() % 500_000);
        return {
          paidById: ids[next() % ids.length],
          amountCents,
          splits: splitEqual(amountCents, ids),
        };
      });
      const raw = computeBalances({ expenses, settlements: [] });
      const rounded = roundBalances(raw, YEN, ids);
      expect([...rounded.values()].reduce((a, b) => a + b, 0)).toBe(0);
      for (const [id, cents] of rounded) {
        expect(Number.isInteger(cents / YEN)).toBe(true);
        expect(Math.abs(cents - raw.get(id)!)).toBeLessThan(YEN);
      }
    }
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
