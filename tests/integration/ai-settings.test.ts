import { afterEach, describe, expect, it } from "vitest";

import {
  getTripAiSetting,
  setTripAiSuggestions,
} from "@/actions/ai-settings";
import { prisma } from "@/lib/prisma";

import { seedTripWithRoles } from "./factories";
import { actAs } from "./helpers";

const CONFIRM_REQUIRED =
  "Please confirm that you understand what would be shared before enabling.";
const OWNER_ONLY = "Only the trip owner can change AI settings.";

afterEach(() => {
  delete process.env.AI_SUGGESTIONS_ENABLED;
});

describe("setTripAiSuggestions", () => {
  it("lets the owner enable with explicit confirmation and records consent", async () => {
    const { trip, owner } = await seedTripWithRoles();
    actAs(owner.id);

    expect(await setTripAiSuggestions(trip.id, true, true)).toEqual({
      success: true,
      data: { suggestionsEnabled: true },
    });
    const row = await prisma.tripAiSetting.findUnique({
      where: { tripId: trip.id },
    });
    expect(row?.suggestionsEnabled).toBe(true);
    expect(row?.enabledById).toBe(owner.id);
    expect(row?.enabledAt).not.toBeNull();
  });

  it("refuses to enable without explicit confirmation", async () => {
    const { trip, owner } = await seedTripWithRoles();
    actAs(owner.id);

    expect(await setTripAiSuggestions(trip.id, true, false)).toEqual({
      success: false,
      error: CONFIRM_REQUIRED,
    });
    expect(await prisma.tripAiSetting.count()).toBe(0);
  });

  it.each([
    ["editor", OWNER_ONLY],
    ["viewer", OWNER_ONLY],
    ["outsider", "Trip not found."],
  ] as const)("refuses the %s", async (who, error) => {
    const seed = await seedTripWithRoles();
    actAs(seed[who].id);

    expect(await setTripAiSuggestions(seed.trip.id, true, true)).toEqual({
      success: false,
      error,
    });
    expect(await prisma.tripAiSetting.count()).toBe(0);
  });

  it("lets the owner disable without confirmation, keeping the consent record", async () => {
    const { trip, owner } = await seedTripWithRoles();
    actAs(owner.id);
    await setTripAiSuggestions(trip.id, true, true);

    expect(await setTripAiSuggestions(trip.id, false, false)).toEqual({
      success: true,
      data: { suggestionsEnabled: false },
    });
    const row = await prisma.tripAiSetting.findUnique({
      where: { tripId: trip.id },
    });
    expect(row?.suggestionsEnabled).toBe(false);
    expect(row?.enabledById).toBe(owner.id);
  });

  it("requires a session", async () => {
    const { trip } = await seedTripWithRoles();

    expect(await setTripAiSuggestions(trip.id, true, true)).toEqual({
      success: false,
      error: "You must be signed in to manage this trip.",
    });
  });
});

describe("getTripAiSetting", () => {
  it("defaults to off and tells members whether they can manage it", async () => {
    const seed = await seedTripWithRoles();
    actAs(seed.viewer.id);

    expect(await getTripAiSetting(seed.trip.id)).toEqual({
      success: true,
      data: { suggestionsEnabled: false, canManage: false, enabledByName: null },
    });
  });

  it("hides the trip from non-members exactly like a missing one", async () => {
    const seed = await seedTripWithRoles();
    actAs(seed.outsider.id);

    expect(await getTripAiSetting(seed.trip.id)).toEqual({
      success: false,
      error: "Trip not found.",
    });
    expect(await getTripAiSetting("missing-trip")).toEqual({
      success: false,
      error: "Trip not found.",
    });
  });
});
