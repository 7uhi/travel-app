import { describe, expect, it } from "vitest";

import { addActivityToDay, deleteActivity, updateActivity } from "@/actions/trip";
import { prisma } from "@/lib/prisma";

import { seedActivity, seedTripWithRoles } from "./factories";
import { actAs } from "./helpers";

const EDITORS = ["owner", "editor"] as const;
const READ_ONLY = "You don't have permission to edit this trip.";

describe("addActivityToDay", () => {
  it.each(EDITORS)("lets the %s add an activity", async (role) => {
    const seed = await seedTripWithRoles();
    const dayId = seed.trip.days[0].id;
    actAs(seed[role].id);

    const result = await addActivityToDay(dayId, { title: "Tram 28 ride", cost: 3.5 });

    expect(result).toMatchObject({
      success: true,
      data: { title: "Tram 28 ride", cost: 3.5, tripDayId: dayId },
    });
    expect(await prisma.activity.count({ where: { tripDayId: dayId } })).toBe(1);
  });

  it.each([
    ["viewer", READ_ONLY],
    ["outsider", "Trip day not found."],
  ] as const)("refuses the %s", async (role, error) => {
    const seed = await seedTripWithRoles();
    actAs(seed[role].id);

    const result = await addActivityToDay(seed.trip.days[0].id, { title: "Sneaky" });

    expect(result).toEqual({ success: false, error });
    expect(await prisma.activity.count()).toBe(0);
  });

  it("reports a missing day exactly like one the caller can't see", async () => {
    const { owner } = await seedTripWithRoles();
    actAs(owner.id);

    expect(await addActivityToDay("missing-day", { title: "Ghost" })).toEqual({
      success: false,
      error: "Trip day not found.",
    });
  });

  it("requires a session", async () => {
    const { trip } = await seedTripWithRoles();

    expect(await addActivityToDay(trip.days[0].id, { title: "Anon" })).toEqual({
      success: false,
      error: "You must be signed in to edit this trip.",
    });
  });
});

describe("updateActivity", () => {
  it.each(EDITORS)("lets the %s update an activity", async (role) => {
    const seed = await seedTripWithRoles();
    const activity = await seedActivity(seed.trip.days[0].id);
    actAs(seed[role].id);

    const result = await updateActivity(activity.id, { title: "Sunset at Miradouro" });

    expect(result).toMatchObject({ success: true, data: { id: activity.id, title: "Sunset at Miradouro" } });
    expect(await prisma.activity.findUnique({ where: { id: activity.id } })).toMatchObject({
      title: "Sunset at Miradouro",
    });
  });

  it.each([
    ["viewer", READ_ONLY],
    ["outsider", "Activity not found."],
  ] as const)("refuses the %s", async (role, error) => {
    const seed = await seedTripWithRoles();
    const activity = await seedActivity(seed.trip.days[0].id, "Original");
    actAs(seed[role].id);

    const result = await updateActivity(activity.id, { title: "Hijacked" });

    expect(result).toEqual({ success: false, error });
    expect(await prisma.activity.findUnique({ where: { id: activity.id } })).toMatchObject({
      title: "Original",
    });
  });
});

describe("deleteActivity", () => {
  it.each(EDITORS)("lets the %s delete an activity", async (role) => {
    const seed = await seedTripWithRoles();
    const activity = await seedActivity(seed.trip.days[0].id);
    actAs(seed[role].id);

    expect(await deleteActivity(activity.id)).toEqual({ success: true, data: { id: activity.id } });
    expect(await prisma.activity.count()).toBe(0);
  });

  it.each([
    ["viewer", READ_ONLY],
    ["outsider", "Activity not found."],
  ] as const)("refuses the %s", async (role, error) => {
    const seed = await seedTripWithRoles();
    const activity = await seedActivity(seed.trip.days[0].id);
    actAs(seed[role].id);

    expect(await deleteActivity(activity.id)).toEqual({ success: false, error });
    expect(await prisma.activity.count()).toBe(1);
  });
});
