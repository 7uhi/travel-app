import { describe, expect, it } from "vitest";

import {
  dayDatesBetween,
  inclusiveDayCount,
  MAX_TRIP_DAYS,
  parseIsoDateTime,
  parseUtcDate,
} from "@/lib/dates";

describe("parseUtcDate", () => {
  it("parses a calendar date as UTC midnight", () => {
    expect(parseUtcDate("2026-09-12")?.toISOString()).toBe(
      "2026-09-12T00:00:00.000Z",
    );
  });

  it("accepts the same date written as full ISO at UTC midnight", () => {
    expect(parseUtcDate("2026-09-12T00:00:00.000Z")?.toISOString()).toBe(
      "2026-09-12T00:00:00.000Z",
    );
  });

  it("rejects impossible dates instead of rolling them forward", () => {
    expect(parseUtcDate("2026-02-30")).toBeNull();
    expect(parseUtcDate("2026-04-31")).toBeNull();
    expect(parseUtcDate("2026-13-01")).toBeNull();
    expect(parseUtcDate("2028-02-29")?.toISOString()).toBe(
      "2028-02-29T00:00:00.000Z",
    );
  });

  it("rejects trailing garbage, other times of day, and non-strings", () => {
    expect(parseUtcDate("2026-10-18garbage")).toBeNull();
    expect(parseUtcDate("2026-10-18T10:00:00.000Z")).toBeNull();
    expect(parseUtcDate(["2026-10-18"])).toBeNull();
    expect(parseUtcDate(null)).toBeNull();
  });

  it("rejects years far outside any real trip", () => {
    expect(parseUtcDate("0000-01-01")).toBeNull();
    expect(parseUtcDate("9999-12-31")).toBeNull();
  });
});

describe("parseIsoDateTime", () => {
  it("parses date-times with an explicit offset", () => {
    expect(parseIsoDateTime("2026-09-12T09:40:00.000Z")?.toISOString()).toBe(
      "2026-09-12T09:40:00.000Z",
    );
    expect(parseIsoDateTime("2026-09-12T09:40+02:00")?.toISOString()).toBe(
      "2026-09-12T07:40:00.000Z",
    );
  });

  it("rejects loose or impossible date-times", () => {
    expect(parseIsoDateTime("Sep 12 2026 09:40")).toBeNull();
    expect(parseIsoDateTime("2026-09-12T09:40")).toBeNull();
    expect(parseIsoDateTime("2026-02-30T09:40:00Z")).toBeNull();
    expect(parseIsoDateTime(1_700_000_000_000)).toBeNull();
  });
});

describe("dayDatesBetween", () => {
  it("lists every day inclusively", () => {
    const days = dayDatesBetween(
      new Date("2026-02-27T00:00:00Z"),
      new Date("2026-03-02T00:00:00Z"),
    );
    expect(days.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });

  it("refuses oversized ranges before allocating them", () => {
    const start = new Date("1900-01-01T00:00:00Z");
    const end = new Date("2999-12-31T00:00:00Z");
    expect(inclusiveDayCount(start, end)).toBeGreaterThan(MAX_TRIP_DAYS);
    expect(() => dayDatesBetween(start, end)).toThrow(RangeError);
  });
});
