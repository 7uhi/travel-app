import { describe, expect, it } from "vitest";

import { itineraryTotals } from "./trip-header";

describe("itineraryTotals", () => {
  it("counts days, planned days, activities, and planned cost", () => {
    expect(
      itineraryTotals([
        { activities: [{ cost: 12.5 }, { cost: null }] },
        { activities: [] },
        { activities: [{ cost: 30 }] },
      ]),
    ).toEqual({
      dayCount: 3,
      plannedDayCount: 2,
      activityCount: 3,
      plannedCost: 42.5,
    });
  });

  it("sums decimal costs without floating-point drift", () => {
    const totals = itineraryTotals([
      { activities: [{ cost: 0.1 }, { cost: 0.2 }] },
    ]);
    expect(totals.plannedCost).toBe(0.3);
  });

  it("is all zeros for a trip without days", () => {
    expect(itineraryTotals([])).toEqual({
      dayCount: 0,
      plannedDayCount: 0,
      activityCount: 0,
      plannedCost: 0,
    });
  });
});
