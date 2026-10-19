import { describe, expect, it } from "vitest";

import { MAX_TRIP_DAYS } from "./dates";
import { describeBlockedDays, planReschedule, type ExistingDay } from "./reschedule";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Sep 12–15: four days, activities on the 12th and 15th. */
const days: ExistingDay[] = [
  { id: "a", date: d("2026-09-12"), activityCount: 2 },
  { id: "b", date: d("2026-09-13"), activityCount: 0 },
  { id: "c", date: d("2026-09-14"), activityCount: 0 },
  { id: "e", date: d("2026-09-15"), activityCount: 1 },
];
const oldStart = d("2026-09-12");

describe("planReschedule", () => {
  it("shifts a same-length range by whole days", () => {
    const plan = planReschedule(oldStart, days, d("2026-10-01"), d("2026-10-04"));
    expect(plan.shiftDays).toBe(19);
    expect(plan.droppedDays).toEqual([]);
    expect(plan.blockedDays).toEqual([]);
    expect(plan.newDates).toEqual([]);
  });

  it("moves earlier with a negative shift", () => {
    const plan = planReschedule(oldStart, days, d("2026-09-10"), d("2026-09-13"));
    expect(plan.shiftDays).toBe(-2);
    expect(plan.newDates).toEqual([]);
  });

  it("adds empty days at the end of a longer range", () => {
    const plan = planReschedule(oldStart, days, d("2026-09-13"), d("2026-09-18"));
    expect(plan.shiftDays).toBe(1);
    expect(plan.droppedDays).toEqual([]);
    expect(plan.newDates.map(iso)).toEqual(["2026-09-17", "2026-09-18"]);
  });

  it("drops days from the end of a shorter range", () => {
    const plan = planReschedule(oldStart, days, d("2026-09-12"), d("2026-09-13"));
    expect(plan.droppedDays.map((day) => day.id)).toEqual(["c", "e"]);
    expect(plan.blockedDays.map((day) => day.id)).toEqual(["e"]);
    expect(plan.newDates).toEqual([]);
  });

  it("allows shrinking when the dropped days are empty", () => {
    const plan = planReschedule(oldStart, days.slice(0, 3), d("2026-09-20"), d("2026-09-21"));
    expect(plan.droppedDays.map((day) => day.id)).toEqual(["c"]);
    expect(plan.blockedDays).toEqual([]);
  });

  it("fills a gap in the stored days instead of shifting the rest", () => {
    const gappy = [days[0], days[2]];
    const plan = planReschedule(oldStart, gappy, d("2026-09-12"), d("2026-09-14"));
    expect(plan.newDates.map(iso)).toEqual(["2026-09-13"]);
  });

  it("refuses ranges longer than MAX_TRIP_DAYS", () => {
    const end = new Date(oldStart.getTime() + MAX_TRIP_DAYS * 86_400_000);
    expect(() => planReschedule(oldStart, days, oldStart, end)).toThrow(RangeError);
  });
});

describe("describeBlockedDays", () => {
  it("names a single day and its activity count", () => {
    expect(describeBlockedDays([days[3]])).toBe(
      "Shortening the trip would drop a day that still has activities: Tue, Sep 15 (1 activity). Move or delete those activities first, or pick a longer range.",
    );
  });

  it("lists several days in date order", () => {
    expect(describeBlockedDays([days[3], days[0]])).toBe(
      "Shortening the trip would drop 2 days that still have activities: Sat, Sep 12 (2 activities) and Tue, Sep 15 (1 activity). Move or delete those activities first, or pick a longer range.",
    );
  });

  it("counts the rest once more than five days are blocked", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: String(i),
      date: new Date(d("2026-09-01").getTime() + i * 86_400_000),
      activityCount: 1,
    }));
    const message = describeBlockedDays(many);
    expect(message).toContain("7 days that still have activities");
    expect(message).toContain("Sat, Sep 5 (1 activity) and 2 more days.");
  });
});
