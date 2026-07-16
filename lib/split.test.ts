import { describe, expect, it } from "vitest";

import { prorate } from "./split";

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
