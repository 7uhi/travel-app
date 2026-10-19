import { describe, expect, it } from "vitest";

import { createTrip, getMyTrips, getTripById } from "@/actions/trip";
import { prisma } from "@/lib/prisma";

import { seedTripWithRoles, seedUser } from "./factories";
import { actAs } from "./helpers";

describe("getTripById", () => {
  it.each(["owner", "editor", "viewer"] as const)(
    "returns the trip with its days and members to the %s",
    async (role) => {
      const seed = await seedTripWithRoles();
      actAs(seed[role].id);

      const result = await getTripById(seed.trip.id);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.title).toBe(seed.trip.title);
      expect(result.data.days.map((d) => d.date)).toEqual([
        "2030-06-01T00:00:00.000Z",
        "2030-06-02T00:00:00.000Z",
        "2030-06-03T00:00:00.000Z",
      ]);
      expect(result.data.members.map((m) => m.role).sort()).toEqual(["EDITOR", "OWNER", "VIEWER"]);
    },
  );

  it("hides the trip from non-members", async () => {
    const { trip, outsider } = await seedTripWithRoles();
    actAs(outsider.id);

    expect(await getTripById(trip.id)).toEqual({ success: false, error: "Trip not found." });
  });

  it("reports a missing trip exactly like one the caller can't see", async () => {
    const { owner } = await seedTripWithRoles();
    actAs(owner.id);

    expect(await getTripById("missing-trip")).toEqual({ success: false, error: "Trip not found." });
  });

  it("requires a session", async () => {
    const { trip } = await seedTripWithRoles();

    expect(await getTripById(trip.id)).toEqual({
      success: false,
      error: "You must be signed in to view this trip.",
    });
  });
});

describe("createTrip", () => {
  it("makes the creator the owner and pre-generates one day per date", async () => {
    const user = await seedUser();
    actAs(user.id);

    const result = await createTrip({
      title: "  Porto  ",
      destination: "Porto, Portugal",
      startDate: "2030-09-10",
      endDate: "2030-09-13",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({ title: "Porto", currency: "USD" });
    expect(result.data.days).toHaveLength(4);
    expect(result.data.members).toEqual([
      expect.objectContaining({ userId: user.id, role: "OWNER" }),
    ]);
  });

  it.each([
    ["a null payload", null, "That request wasn't in the expected format."],
    [
      "an impossible date",
      { title: "Leap-less", startDate: "2026-02-28", endDate: "2026-02-30" },
      "Start and end dates must be valid ISO dates (YYYY-MM-DD).",
    ],
    [
      "an end date before the start date",
      { title: "Backwards", startDate: "2030-09-10", endDate: "2030-09-01" },
      "End date must be on or after the start date.",
    ],
    [
      "a 367-day trip",
      { title: "Gap year", startDate: "2030-01-01", endDate: "2031-01-02" },
      "Trips are limited to 366 days.",
    ],
  ])("rejects %s without writing anything", async (_, input, error) => {
    actAs((await seedUser()).id);

    expect(await createTrip(input as never)).toEqual({ success: false, error });
    expect(await prisma.trip.count()).toBe(0);
  });

  it("accepts a trip of exactly 366 days", async () => {
    actAs((await seedUser()).id);

    const result = await createTrip({ title: "Year out", startDate: "2030-01-01", endDate: "2031-01-01" });

    expect(result.success).toBe(true);
    expect(await prisma.tripDay.count()).toBe(366);
  });
});

describe("getMyTrips", () => {
  it("lists only the caller's trips, with their role on each", async () => {
    const { trip, viewer } = await seedTripWithRoles();
    const other = await seedUser();
    actAs(other.id);
    await createTrip({ title: "Someone else's", startDate: "2030-01-01", endDate: "2030-01-02" });
    actAs(viewer.id);

    const result = await getMyTrips();

    expect(result).toEqual({
      success: true,
      data: [expect.objectContaining({ id: trip.id, role: "VIEWER", memberCount: 3, dayCount: 3 })],
    });
  });
});
