import { describe, expect, it } from "vitest";

import {
  addActivityToDay,
  deleteTrip,
  getMyTrips,
  getTripById,
  getTripHeader,
  rescheduleTrip,
  setTripArchived,
  updateTripDetails,
} from "@/actions/trip";
import { prisma } from "@/lib/prisma";

import { seedActivity, seedPollTrip, seedSharedDinner, seedTripWithRoles } from "./factories";
import { actAs, actInTurn, holdOpen, outcomeOf, untilBlocked } from "./helpers";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function storedDays(tripId: string) {
  const days = await prisma.tripDay.findMany({ where: { tripId }, orderBy: { date: "asc" } });
  return days.map((d) => ({ id: d.id, date: d.date.toISOString().slice(0, 10) }));
}

describe("getTripHeader", () => {
  it.each([
    ["owner", "OWNER"],
    ["editor", "EDITOR"],
    ["viewer", "VIEWER"],
  ] as const)("gives the %s their role and the trip's totals", async (who, role) => {
    const seed = await seedSharedDinner();
    actAs(seed[who].id);

    expect(await getTripHeader(seed.trip.id)).toMatchObject({
      success: true,
      data: { role, memberCount: 3, ownerName: "Olivia Owner", spentCents: 3000, archivedAt: null },
    });
  });

  it("hides the trip from non-members", async () => {
    const { trip, outsider } = await seedTripWithRoles();
    actAs(outsider.id);

    expect(await getTripHeader(trip.id)).toEqual({ success: false, error: "Trip not found." });
  });
});

describe("updateTripDetails", () => {
  it.each(["owner", "editor"] as const)("lets the %s rename the trip and move it", async (who) => {
    const seed = await seedTripWithRoles();
    actAs(seed[who].id);

    expect(
      await updateTripDetails(seed.trip.id, { title: "  Porto instead  ", destination: "Porto, Portugal" }),
    ).toEqual({ success: true, data: { title: "Porto instead", destination: "Porto, Portugal" } });
    expect(await prisma.trip.findUnique({ where: { id: seed.trip.id } })).toMatchObject({
      title: "Porto instead",
      destination: "Porto, Portugal",
    });
  });

  it.each([
    ["viewer", "Viewers can't edit the trip details."],
    ["outsider", "Trip not found."],
  ] as const)("refuses the %s", async (who, error) => {
    const seed = await seedTripWithRoles();
    actAs(seed[who].id);

    expect(await updateTripDetails(seed.trip.id, { title: "Mine now" })).toEqual({ success: false, error });
    expect(await prisma.trip.findUnique({ where: { id: seed.trip.id } })).toMatchObject({
      title: seed.trip.title,
    });
  });

  it.each([null, "", "   "])("puts the destination back to undecided when it's %j", async (destination) => {
    const { trip, editor } = await seedTripWithRoles();
    actAs(editor.id);

    expect(await updateTripDetails(trip.id, { title: trip.title, destination })).toMatchObject({
      success: true,
      data: { destination: null },
    });
    expect(await prisma.trip.findUnique({ where: { id: trip.id } })).toMatchObject({ destination: null });
  });

  it("requires a title", async () => {
    const { trip, owner } = await seedTripWithRoles();
    actAs(owner.id);

    expect(await updateTripDetails(trip.id, { title: "  " })).toEqual({
      success: false,
      error: "Title is required.",
    });
  });
});

describe("rescheduleTrip", () => {
  it("keeps day N as day N and moves activity times with it", async () => {
    const { trip, owner } = await seedTripWithRoles();
    const before = await storedDays(trip.id);
    const tram = await prisma.activity.create({
      data: { tripDayId: before[1].id, title: "Tram 28", time: new Date("2030-06-02T10:30:00.000Z") },
    });
    actAs(owner.id);

    expect(await rescheduleTrip(trip.id, { startDate: "2030-06-11", endDate: "2030-06-13" })).toEqual({
      success: true,
      data: {
        startDate: "2030-06-11T00:00:00.000Z",
        endDate: "2030-06-13T00:00:00.000Z",
        shiftDays: 10,
        addedDays: 0,
        removedDays: 0,
      },
    });
    expect(await storedDays(trip.id)).toEqual([
      { id: before[0].id, date: "2030-06-11" },
      { id: before[1].id, date: "2030-06-12" },
      { id: before[2].id, date: "2030-06-13" },
    ]);
    expect(await prisma.activity.findUnique({ where: { id: tram.id } })).toMatchObject({
      tripDayId: before[1].id,
      time: new Date("2030-06-12T10:30:00.000Z"),
    });
    expect(await prisma.trip.findUnique({ where: { id: trip.id } })).toMatchObject({
      startDate: day("2030-06-11"),
      endDate: day("2030-06-13"),
    });
  });

  it("shifts by a single day onto dates the trip already covers", async () => {
    const { trip, owner } = await seedTripWithRoles();
    const before = await storedDays(trip.id);
    actAs(owner.id);

    expect(await rescheduleTrip(trip.id, { startDate: "2030-06-02", endDate: "2030-06-04" })).toMatchObject({
      success: true,
    });
    expect(await storedDays(trip.id)).toEqual([
      { id: before[0].id, date: "2030-06-02" },
      { id: before[1].id, date: "2030-06-03" },
      { id: before[2].id, date: "2030-06-04" },
    ]);
  });

  it("adds empty days at the end when the trip gets longer", async () => {
    const { trip, owner } = await seedTripWithRoles();
    const before = await storedDays(trip.id);
    actAs(owner.id);

    expect(await rescheduleTrip(trip.id, { startDate: "2030-06-01", endDate: "2030-06-05" })).toMatchObject({
      success: true,
      data: { addedDays: 2, removedDays: 0 },
    });
    const after = await storedDays(trip.id);
    expect(after.map((d) => d.date)).toEqual([
      "2030-06-01",
      "2030-06-02",
      "2030-06-03",
      "2030-06-04",
      "2030-06-05",
    ]);
    expect(after.slice(0, 3)).toEqual(before);
  });

  it("drops empty days from the end when the trip gets shorter", async () => {
    const { trip, owner } = await seedTripWithRoles();
    actAs(owner.id);

    expect(await rescheduleTrip(trip.id, { startDate: "2030-06-01", endDate: "2030-06-02" })).toMatchObject({
      success: true,
      data: { addedDays: 0, removedDays: 1 },
    });
    expect((await storedDays(trip.id)).map((d) => d.date)).toEqual(["2030-06-01", "2030-06-02"]);
  });

  it("refuses to drop a day that still has activities", async () => {
    const { trip, owner } = await seedTripWithRoles();
    const before = await storedDays(trip.id);
    await seedActivity(before[2].id, "Farewell dinner");
    actAs(owner.id);

    expect(await rescheduleTrip(trip.id, { startDate: "2030-06-01", endDate: "2030-06-02" })).toEqual({
      success: false,
      error:
        "Shortening the trip would drop a day that still has activities: Mon, Jun 3 (1 activity). Move or delete those activities first, or pick a longer range.",
    });
    expect(await storedDays(trip.id)).toEqual(before);
  });

  it.each([
    ["editor", "Only the trip owner can change the trip dates."],
    ["viewer", "Only the trip owner can change the trip dates."],
    ["outsider", "Trip not found."],
  ] as const)("refuses the %s", async (who, error) => {
    const seed = await seedTripWithRoles();
    actAs(seed[who].id);

    expect(await rescheduleTrip(seed.trip.id, { startDate: "2030-07-01", endDate: "2030-07-03" })).toEqual({
      success: false,
      error,
    });
    expect((await storedDays(seed.trip.id))[0].date).toBe("2030-06-01");
  });

  it("refuses a trip that is still picking its dates", async () => {
    const owner = await prisma.user.create({ data: { name: "Poll owner", email: "poll@example.test" } });
    const trip = await seedPollTrip({ ownerId: owner.id });
    actAs(owner.id);

    expect(await rescheduleTrip(trip.id, { startDate: "2030-07-01", endDate: "2030-07-03" })).toEqual({
      success: false,
      error:
        "This trip's dates haven't been picked yet — confirm them from the availability poll first.",
    });
  });

  it("never drops a day that gets activities while the shrink is under way", async () => {
    const { trip, owner, editor } = await seedTripWithRoles();
    const lastDay = (await storedDays(trip.id))[2];
    const commitOtherSave = await holdOpen((tx) =>
      tx.activity.create({ data: { tripDayId: lastDay.id, title: "Sunset cruise" } }),
    );
    actInTurn(owner.id, editor.id);

    const shrink = rescheduleTrip(trip.id, { startDate: "2030-06-01", endDate: "2030-06-02" });
    await untilBlocked(1, shrink);
    const added = await addActivityToDay(lastDay.id, { title: "Farewell dinner" });
    await commitOtherSave();

    expect(added).toMatchObject({ success: true, data: { title: "Farewell dinner" } });
    expect(await shrink).toEqual({
      success: false,
      error:
        "Shortening the trip would drop a day that still has activities: Mon, Jun 3 (2 activities). Move or delete those activities first, or pick a longer range.",
    });
    expect(await storedDays(trip.id)).toHaveLength(3);
    expect(await prisma.activity.count({ where: { tripDayId: lastDay.id } })).toBe(2);
  });

  it("turns away an activity for a day the shrink already dropped", async () => {
    const { trip, owner, editor } = await seedTripWithRoles();
    const lastDay = (await storedDays(trip.id))[2];
    actAs(owner.id);
    await rescheduleTrip(trip.id, { startDate: "2030-06-01", endDate: "2030-06-02" });
    actAs(editor.id);

    expect(await addActivityToDay(lastDay.id, { title: "Farewell dinner" })).toEqual({
      success: false,
      error: "Trip day not found.",
    });
    expect(await prisma.activity.count()).toBe(0);
  });
});

describe("deleteTrip", () => {
  it("deletes the trip and everything on it once the owner types its title", async () => {
    const { trip, owner } = await seedSharedDinner();
    actAs(owner.id);

    expect(await outcomeOf(deleteTrip(trip.id, `  ${trip.title} `))).toEqual({ redirectedTo: "/trips" });
    expect(await prisma.trip.count()).toBe(0);
    expect(await prisma.tripDay.count()).toBe(0);
    expect(await prisma.expense.count()).toBe(0);
    expect(await prisma.tripMember.count()).toBe(0);
  });

  it("keeps the trip when the typed title doesn't match", async () => {
    const { trip, owner } = await seedTripWithRoles();
    actAs(owner.id);

    expect(await outcomeOf(deleteTrip(trip.id, "Lisbon"))).toEqual({
      returned: { success: false, error: "Type the trip's title exactly to confirm." },
    });
    expect(await prisma.trip.count()).toBe(1);
  });

  it.each([
    ["editor", "Only the trip owner can delete this trip."],
    ["viewer", "Only the trip owner can delete this trip."],
    ["outsider", "Trip not found."],
  ] as const)("refuses the %s", async (who, error) => {
    const seed = await seedTripWithRoles();
    actAs(seed[who].id);

    expect(await outcomeOf(deleteTrip(seed.trip.id, seed.trip.title))).toEqual({
      returned: { success: false, error },
    });
    expect(await prisma.trip.count()).toBe(1);
  });
});

describe("setTripArchived", () => {
  async function archivedFor(userId: string) {
    actAs(userId);
    const trips = await getMyTrips();
    if (!trips.success) throw new Error(trips.error);
    return trips.data[0].archivedAt;
  }

  it.each(["owner", "editor", "viewer"] as const)(
    "hides the trip from only the %s's own list",
    async (who) => {
      const seed = await seedTripWithRoles();
      actAs(seed[who].id);

      expect(await setTripArchived(seed.trip.id, true)).toMatchObject({
        success: true,
        data: { archivedAt: expect.any(String) },
      });

      for (const member of ["owner", "editor", "viewer"] as const) {
        expect(await archivedFor(seed[member].id)).toEqual(member === who ? expect.any(String) : null);
      }
      actAs(seed[who].id);
      expect(await getTripById(seed.trip.id)).toMatchObject({ success: true });
    },
  );

  it("keeps the original date when archived again, and restores the trip", async () => {
    const { trip, viewer } = await seedTripWithRoles();
    actAs(viewer.id);

    const first = await setTripArchived(trip.id, true);
    const again = await setTripArchived(trip.id, true);
    expect(again).toEqual(first);

    expect(await setTripArchived(trip.id, false)).toEqual({ success: true, data: { archivedAt: null } });
    expect(await archivedFor(viewer.id)).toBeNull();
  });

  it("hides the trip from non-members", async () => {
    const { trip, outsider } = await seedTripWithRoles();
    actAs(outsider.id);

    expect(await setTripArchived(trip.id, true)).toEqual({ success: false, error: "Trip not found." });
  });
});
