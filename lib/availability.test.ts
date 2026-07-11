import { describe, expect, it } from "vitest";

import { dailyCounts, suggestWindows } from "@/lib/availability";
import type { AvailabilityEntry } from "@/types";

/** ISO string at UTC midnight for a day in July 2026. */
const day = (d: number) =>
  new Date(Date.UTC(2026, 6, d)).toISOString();

/** Entries marking `userId` available on each given July day. */
const avail = (userId: string, days: number[]): AvailabilityEntry[] =>
  days.map((d) => ({ userId, date: day(d) }));

const WINDOW = { windowStart: day(1), windowEnd: day(14), durationDays: 3 };

describe("dailyCounts", () => {
  it("counts available members per day", () => {
    const counts = dailyCounts([
      ...avail("a", [1, 2]),
      ...avail("b", [2, 3]),
    ]);
    expect(counts.get(day(1))).toBe(1);
    expect(counts.get(day(2))).toBe(2);
    expect(counts.get(day(3))).toBe(1);
    expect(counts.get(day(4))).toBeUndefined();
  });
});

describe("suggestWindows", () => {
  it("suggests the earliest window when everyone is free everywhere", () => {
    const [best] = suggestWindows({
      ...WINDOW,
      memberIds: ["a", "b"],
      entries: [
        ...avail("a", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]),
        ...avail("b", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]),
      ],
    });
    expect(best.startDate).toBe(day(1));
    expect(best.endDate).toBe(day(3));
    expect(best.availableUserIds).toEqual(["a", "b"]);
    expect(best.unavailableUserIds).toEqual([]);
  });

  it("ranks full-group windows above partial ones", () => {
    const suggestions = suggestWindows({
      ...WINDOW,
      memberIds: ["a", "b", "c"],
      entries: [
        // Everyone is free days 8–10; only a and b are free days 1–3.
        ...avail("a", [1, 2, 3, 8, 9, 10]),
        ...avail("b", [1, 2, 3, 8, 9, 10]),
        ...avail("c", [8, 9, 10]),
      ],
    });
    expect(suggestions[0].startDate).toBe(day(8));
    expect(suggestions[0].availableUserIds).toEqual(["a", "b", "c"]);
    expect(suggestions[1].startDate).toBe(day(1));
    expect(suggestions[1].availableUserIds).toEqual(["a", "b"]);
    expect(suggestions[1].unavailableUserIds).toEqual(["c"]);
  });

  it("returns non-overlapping distinct suggestions", () => {
    const suggestions = suggestWindows({
      ...WINDOW,
      memberIds: ["a"],
      entries: avail("a", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]),
    });
    const starts = suggestions.map((s) => Date.parse(s.startDate));
    for (let i = 1; i < starts.length; i++) {
      const gapDays = Math.abs(starts[i] - starts[i - 1]) / 86_400_000;
      expect(gapDays).toBeGreaterThanOrEqual(WINDOW.durationDays);
    }
  });

  it("suggests nothing when nobody has marked availability", () => {
    expect(
      suggestWindows({ ...WINDOW, memberIds: ["a", "b"], entries: [] }),
    ).toEqual([]);
  });

  it("suggests nothing when the trip is longer than the window", () => {
    expect(
      suggestWindows({
        windowStart: day(1),
        windowEnd: day(4),
        durationDays: 5,
        memberIds: ["a"],
        entries: avail("a", [1, 2, 3, 4]),
      }),
    ).toEqual([]);
  });

  it("is deterministic on ties: earliest window wins", () => {
    const suggestions = suggestWindows({
      ...WINDOW,
      memberIds: ["a"],
      // Two equally good, non-adjacent options: days 2–4 and days 9–11.
      entries: avail("a", [2, 3, 4, 9, 10, 11]),
    });
    expect(suggestions[0].startDate).toBe(day(2));
    expect(suggestions[1].startDate).toBe(day(9));
  });

  it("drops nobody-fully-free windows when a full window exists", () => {
    const suggestions = suggestWindows({
      ...WINDOW,
      memberIds: ["a", "b"],
      entries: [
        // Both fully free 8–10; days 1–2 have stray partial availability.
        ...avail("a", [1, 8, 9, 10]),
        ...avail("b", [2, 8, 9, 10]),
      ],
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].startDate).toBe(day(8));
  });

  it("counts partial availability toward ranking but not full membership", () => {
    const [best] = suggestWindows({
      ...WINDOW,
      memberIds: ["a", "b"],
      entries: [...avail("a", [5, 6, 7]), ...avail("b", [5, 6])],
    });
    expect(best.startDate).toBe(day(5));
    expect(best.availableUserIds).toEqual(["a"]);
    expect(best.unavailableUserIds).toEqual(["b"]);
  });
});
