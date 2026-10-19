import { describe, expect, it } from "vitest";

import { setMyAvailability, setTripDates } from "@/actions/availability";
import { prisma } from "@/lib/prisma";

import { seedMember, seedPollTrip, seedUser } from "./factories";
import { actAs } from "./helpers";

describe("setTripDates", () => {
  it("lets exactly one of two concurrent confirmations claim the trip", async () => {
    const owner = await seedUser();
    const trip = await seedPollTrip({ ownerId: owner.id });
    actAs(owner.id);

    const results = await Promise.all([
      setTripDates(trip.id, "2030-07-01", "2030-07-04"),
      setTripDates(trip.id, "2030-07-10", "2030-07-15"),
    ]);

    const winners = results.filter((r) => r.success);
    expect(winners).toHaveLength(1);
    expect(results.find((r) => !r.success)).toEqual({
      success: false,
      error: "This trip's dates are already set.",
    });

    const winner = winners[0];
    if (!winner.success) return;
    const days = await prisma.tripDay.findMany({ where: { tripId: trip.id }, orderBy: { date: "asc" } });
    expect(days[0].date.toISOString()).toBe(winner.data.startDate);
    expect(days[days.length - 1].date.toISOString()).toBe(winner.data.endDate);
    expect(days).toHaveLength(winner.data.startDate.startsWith("2030-07-01") ? 4 : 6);
  });

  it("rejects an impossible calendar date", async () => {
    const owner = await seedUser();
    const trip = await seedPollTrip({ ownerId: owner.id });
    actAs(owner.id);

    expect(await setTripDates(trip.id, "2030-02-30", "2030-03-02")).toEqual({
      success: false,
      error: "Start and end dates must be valid ISO dates (YYYY-MM-DD).",
    });
  });
});

describe("setMyAvailability", () => {
  it("keeps exactly one of two concurrent submissions", async () => {
    const owner = await seedUser();
    const trip = await seedPollTrip({ ownerId: owner.id });
    const viewer = await seedUser();
    await seedMember(trip.id, viewer.id, "VIEWER");
    actAs(viewer.id);
    const first = ["2030-07-01", "2030-07-02"];
    const second = ["2030-07-10", "2030-07-11", "2030-07-12"];

    const results = await Promise.all([
      setMyAvailability(trip.id, first),
      setMyAvailability(trip.id, second),
    ]);

    expect(results.every((r) => r.success)).toBe(true);
    const stored = await prisma.availabilityDay.findMany({
      where: { tripId: trip.id, userId: viewer.id },
      orderBy: { date: "asc" },
    });
    expect([first, second]).toContainEqual(stored.map((d) => d.date.toISOString().slice(0, 10)));
  });
});
