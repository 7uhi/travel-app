import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { suggestActivityIdeas } from "@/actions/ai-suggestions";
import {
  completeAiGeneration,
  failAiGeneration,
  reserveAiGeneration,
} from "@/lib/ai/usage";
import { prisma } from "@/lib/prisma";

import { seedTripWithRoles, seedUser } from "./factories";
import { actAs, holdOpen, untilBlocked } from "./helpers";

const LIMIT_KEYS = [
  "AI_SUGGESTIONS_ENABLED",
  "AI_SUGGEST_USER_DAILY_LIMIT",
  "AI_SUGGEST_TRIP_DAILY_LIMIT",
] as const;

beforeEach(() => {
  process.env.AI_SUGGESTIONS_ENABLED = "1";
});

afterEach(() => {
  for (const key of LIMIT_KEYS) delete process.env[key];
});

async function enableAi(tripId: string, ownerId: string) {
  await prisma.tripAiSetting.create({
    data: {
      tripId,
      suggestionsEnabled: true,
      enabledById: ownerId,
      enabledAt: new Date(),
    },
  });
}

async function ledger(tripId: string) {
  return prisma.aiGeneration.findMany({
    where: { tripId },
    orderBy: { createdAt: "asc" },
    select: { status: true, attempts: true, validationFailed: true, provider: true },
  });
}

describe("suggestActivityIdeas quota accounting", () => {
  it("records a completed generation with attempts and provider metadata", async () => {
    const seed = await seedTripWithRoles();
    await enableAi(seed.trip.id, seed.owner.id);
    actAs(seed.viewer.id);

    const result = await suggestActivityIdeas(seed.trip.id);
    expect(result.success).toBe(true);

    const rows = await ledger(seed.trip.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "COMPLETED",
      provider: "mock",
      validationFailed: false,
    });
    expect(rows[0].attempts).toBeGreaterThanOrEqual(1);
    expect(
      Object.keys(rows[0]).sort(),
    ).toEqual(["attempts", "provider", "status", "validationFailed"]);
  });

  it("enforces the per-trip daily limit with a clear message", async () => {
    process.env.AI_SUGGEST_TRIP_DAILY_LIMIT = "1";
    const seed = await seedTripWithRoles();
    await enableAi(seed.trip.id, seed.owner.id);
    actAs(seed.viewer.id);

    expect((await suggestActivityIdeas(seed.trip.id)).success).toBe(true);
    expect(await suggestActivityIdeas(seed.trip.id)).toEqual({
      success: false,
      error: "This trip has reached today's suggestion limit. Try again tomorrow.",
    });
    expect(await ledger(seed.trip.id)).toHaveLength(1);
  });

  it("enforces the per-user daily limit across trips", async () => {
    process.env.AI_SUGGEST_USER_DAILY_LIMIT = "1";
    const first = await seedTripWithRoles();
    const second = await seedTripWithRoles();
    await enableAi(first.trip.id, first.owner.id);
    await enableAi(second.trip.id, second.owner.id);
    // Same viewer generates on both trips; only the first may succeed.
    await prisma.tripMember.create({
      data: { tripId: second.trip.id, userId: first.viewer.id, role: "VIEWER" },
    });
    actAs(first.viewer.id);

    expect((await suggestActivityIdeas(first.trip.id)).success).toBe(true);
    expect(await suggestActivityIdeas(second.trip.id)).toEqual({
      success: false,
      error: "You've reached today's suggestion limit. Try again tomorrow.",
    });
  });
});

describe("reserveAiGeneration", () => {
  it("counts in-flight reservations so concurrent requests cannot bypass the limit", async () => {
    process.env.AI_SUGGEST_TRIP_DAILY_LIMIT = "1";
    const seed = await seedTripWithRoles();
    const other = await seedUser({ name: "Second Generator" });
    await prisma.tripMember.create({
      data: { tripId: seed.trip.id, userId: other.id, role: "VIEWER" },
    });

    const commit = await holdOpen(
      (tx) =>
        tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${seed.trip.id} FOR UPDATE`,
    );
    const first = reserveAiGeneration({
      tripId: seed.trip.id,
      userId: seed.viewer.id,
      provider: "mock",
    });
    await untilBlocked(1, first);
    const second = reserveAiGeneration({
      tripId: seed.trip.id,
      userId: other.id,
      provider: "mock",
    });
    await untilBlocked(2, second);
    await commit();

    expect(await first).toMatchObject({ ok: true });
    expect(await second).toEqual({ ok: false, scope: "trip" });
  });

  it("releases quota when a generation fails, but keeps the record", async () => {
    process.env.AI_SUGGEST_TRIP_DAILY_LIMIT = "1";
    const seed = await seedTripWithRoles();

    const reserved = await reserveAiGeneration({
      tripId: seed.trip.id,
      userId: seed.viewer.id,
      provider: "mock",
    });
    if (!reserved.ok) throw new Error("reservation should succeed");
    await failAiGeneration(reserved.generationId, {
      attempts: 2,
      durationMs: 120,
      validationFailed: true,
    });

    // The failed attempt freed the slot: a fresh reservation succeeds.
    const again = await reserveAiGeneration({
      tripId: seed.trip.id,
      userId: seed.viewer.id,
      provider: "mock",
    });
    expect(again.ok).toBe(true);

    const rows = await ledger(seed.trip.id);
    expect(rows.map((r) => r.status)).toEqual(["FAILED", "RESERVED"]);
    expect(rows[0]).toMatchObject({ attempts: 2, validationFailed: true });
  });

  it("consumes quota on completion", async () => {
    process.env.AI_SUGGEST_USER_DAILY_LIMIT = "1";
    const seed = await seedTripWithRoles();

    const reserved = await reserveAiGeneration({
      tripId: seed.trip.id,
      userId: seed.viewer.id,
      provider: "mock",
    });
    if (!reserved.ok) throw new Error("reservation should succeed");
    await completeAiGeneration(reserved.generationId, {
      attempts: 1,
      durationMs: 40,
    });

    expect(
      await reserveAiGeneration({
        tripId: seed.trip.id,
        userId: seed.viewer.id,
        provider: "mock",
      }),
    ).toEqual({ ok: false, scope: "user" });
  });
});
