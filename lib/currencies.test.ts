import { describe, expect, it } from "vitest";

import {
  amountInputProps,
  amountInputValue,
  CURRENCIES,
  currencyUnitCents,
  isWholeUnit,
  isZeroDecimal,
  parseAmountInput,
  summarizeTripAmounts,
  zeroDecimalRefusal,
  type TripAmountsInput,
} from "@/lib/currencies";
import { formatCents, formatCurrency } from "@/lib/format";

describe("currencyUnitCents", () => {
  it("gives every listed currency a unit hundredths can hold (no 3-decimal currencies)", () => {
    for (const { code } of CURRENCIES) {
      expect([1, 100]).toContain(currencyUnitCents(code));
    }
  });

  it("uses whole units for the zero-decimal currencies on the list", () => {
    const zeroDecimal = CURRENCIES.map((c) => c.code).filter(isZeroDecimal);
    expect(zeroDecimal).toEqual(["JPY", "KRW", "VND"]);
    expect(currencyUnitCents("JPY")).toBe(100);
    expect(currencyUnitCents("USD")).toBe(1);
  });

  it("refuses 3-decimal currencies instead of dropping a digit", () => {
    expect(() => currencyUnitCents("KWD")).toThrow(/3 decimal places/);
  });
});

describe("isWholeUnit", () => {
  it("accepts any whole cent in a cent currency", () => {
    expect(isWholeUnit(10_050, "USD")).toBe(true);
    expect(isWholeUnit(1, "EUR")).toBe(true);
    expect(isWholeUnit(10.5, "USD")).toBe(false);
  });

  it("accepts only whole yen in JPY", () => {
    expect(isWholeUnit(100_000, "JPY")).toBe(true);
    expect(isWholeUnit(10_050, "JPY")).toBe(false);
    expect(isWholeUnit(33_333, "KRW")).toBe(false);
  });
});

describe("amount inputs", () => {
  it("only steps in whole numbers for zero-decimal currencies", () => {
    expect(amountInputProps("JPY")).toEqual({
      type: "number",
      step: "1",
      inputMode: "numeric",
    });
    expect(amountInputProps("USD")).toEqual({
      type: "number",
      step: "0.01",
      inputMode: "decimal",
    });
  });

  it("parses typed amounts into hundredths", () => {
    expect(parseAmountInput("45.5")).toBe(4_550);
    expect(parseAmountInput("0.1")).toBe(10);
    expect(parseAmountInput("1000")).toBe(100_000);
    expect(parseAmountInput("")).toBe(0);
  });

  it("prefills without a meaningless .00 in JPY, but never hides stored cents", () => {
    expect(amountInputValue(4_500, "USD")).toBe("45.00");
    expect(amountInputValue(450_000, "JPY")).toBe("4500");
    expect(amountInputValue(33_333, "JPY")).toBe("333.33");
  });
});

describe("formatCents", () => {
  it("formats whole amounts in each currency's own style", () => {
    expect(formatCents(4_500, "USD")).toBe("$45.00");
    expect(formatCents(100_000, "JPY")).toBe("¥1,000");
  });

  it("shows the cents of a zero-decimal amount that has them", () => {
    expect(formatCents(33_333, "JPY")).toBe("¥333.33");
    expect(formatCents(10_050, "JPY")).toBe("¥100.50");
  });
});

describe("formatCurrency", () => {
  it("drops .00 from whole amounts but never shows a single decimal", () => {
    expect(formatCurrency(2_000, "USD")).toBe("$2,000");
    expect(formatCurrency(110.5, "EUR")).toBe("€110.50");
    expect(formatCurrency(4_500, "JPY")).toBe("¥4,500");
  });

  it("rounds fractional estimates to the currency's own precision", () => {
    expect(formatCurrency(5_300 / 3, "JPY")).toBe("¥1,767");
    expect(formatCurrency(100 / 3, "USD")).toBe("$33.33");
  });
});

describe("summarizeTripAmounts", () => {
  const empty: TripAmountsInput = {
    totalBudget: null,
    expenses: [],
    settlementCents: [],
    plannedCost: 0,
  };
  const dinner = {
    description: "Dinner",
    amountCents: 9_000,
    splits: [{ amountCents: 4_500 }, { amountCents: 4_500 }],
  };

  it("reports nothing to relabel on a trip without amounts", () => {
    expect(summarizeTripAmounts(empty)).toEqual({
      example: null,
      fractional: null,
    });
    expect(
      summarizeTripAmounts({
        ...empty,
        totalBudget: 0,
        plannedCost: 0,
      }).example,
    ).toBeNull();
  });

  it("prefers the newest expense as the example, then budget, repayment, planned cost", () => {
    expect(summarizeTripAmounts({ ...empty, expenses: [dinner] }).example).toEqual({
      label: "“Dinner”",
      cents: 9_000,
    });
    expect(
      summarizeTripAmounts({ ...empty, totalBudget: 2_000, settlementCents: [500] })
        .example,
    ).toEqual({ label: "the trip budget", cents: 200_000 });
    expect(summarizeTripAmounts({ ...empty, settlementCents: [500] }).example).toEqual(
      { label: "a recorded repayment", cents: 500 },
    );
    expect(
      summarizeTripAmounts({
        ...empty,
        plannedCost: 12.5,
      }).example,
    ).toEqual({ label: "the itinerary's planned costs", cents: 1_250 });
  });

  it("finds the first ledger amount with cents", () => {
    expect(summarizeTripAmounts({ ...empty, expenses: [dinner] }).fractional).toBeNull();
    expect(summarizeTripAmounts({ ...empty, totalBudget: 1_999.5 }).fractional).toEqual({
      label: "the trip budget",
      cents: 199_950,
    });
    expect(
      summarizeTripAmounts({
        ...empty,
        expenses: [
          {
            description: "Taxi",
            amountCents: 1_000,
            splits: [{ amountCents: 334 }, { amountCents: 333 }, { amountCents: 333 }],
          },
        ],
      }).fractional,
    ).toEqual({ label: "a share of “Taxi”", cents: 334 });
    expect(summarizeTripAmounts({ ...empty, settlementCents: [1_050] }).fractional).toEqual(
      { label: "a recorded repayment", cents: 1_050 },
    );
  });

  it("doesn't block on planned activity costs, which are estimates", () => {
    expect(
      summarizeTripAmounts({
        ...empty,
        plannedCost: 12.5,
      }).fractional,
    ).toBeNull();
  });
});

describe("zeroDecimalRefusal", () => {
  it("names the amount that doesn't fit, in the current currency", () => {
    expect(
      zeroDecimalRefusal("JPY", "USD", { label: "“Dinner”", cents: 4_550 }),
    ).toBe(
      "JPY has no decimal places, but “Dinner” is $45.50. Change amounts with cents to whole numbers before switching to JPY.",
    );
  });
});
