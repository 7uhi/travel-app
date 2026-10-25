import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setTripAiSuggestions } from "@/actions/ai-settings";
import { suggestActivityIdeas } from "@/actions/ai-suggestions";
import { removeMember, transferOwnership } from "@/actions/members";
import { generateActivitySuggestions } from "@/lib/ai/generate";
import { prisma } from "@/lib/prisma";
import { completeAiGeneration, failAiGeneration } from "@/lib/ai/usage";

import { seedTripWithRoles } from "./factories";
import { actAs, actInTurn, holdOpen, untilBlocked } from "./helpers";

vi.mock("@/lib/ai/generate", async (original) => {
  const actual = await original<typeof import("@/lib/ai/generate")>();
  return {
    ...actual,
    generateActivitySuggestions: vi.fn(actual.generateActivitySuggestions),
  };
});

const holdTrip = (tripId: string) =>
  holdOpen(
    (tx) => tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`,
  );

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

beforeEach(() => {
  vi.stubEnv("AI_SUGGESTIONS_ENABLED", "1");
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("AI settings racing ownership transfer", () => {
  it("rechecks owner authorization after a queued ownership transfer", async () => {
    const { trip, owner, editor } = await seedTripWithRoles();
    const release = await holdTrip(trip.id);
    actInTurn(owner.id, owner.id);

    const transfer = transferOwnership(trip.id, editor.id);
    await untilBlocked(1, transfer);
    const setting = setTripAiSuggestions(trip.id, true, true);
    await untilBlocked(2, setting);
    await release();

    expect((await transfer).success).toBe(true);
    expect(await setting).toEqual({
      success: false,
      error: "Only the trip owner can change AI settings.",
    });
    expect(await prisma.tripAiSetting.count()).toBe(0);
  });
});

describe("generation admission racing membership and consent changes", () => {
  it("does not generate after queued membership removal wins the trip lock", async () => {
    const { trip, owner, viewer } = await seedTripWithRoles();
    await enableAi(trip.id, owner.id);
    const release = await holdTrip(trip.id);
    actInTurn(owner.id, viewer.id);

    const removal = removeMember(trip.id, viewer.id);
    await untilBlocked(1, removal);
    const generation = suggestActivityIdeas(trip.id);
    await untilBlocked(2, generation);
    await release();

    expect((await removal).success).toBe(true);
    expect(await generation).toEqual({
      success: false,
      error: "Trip not found.",
    });
    expect(generateActivitySuggestions).not.toHaveBeenCalled();
    expect(await prisma.aiGeneration.count()).toBe(0);
  });

  it("does not generate when consent disablement wins the trip lock", async () => {
    const { trip, owner, viewer } = await seedTripWithRoles();
    await enableAi(trip.id, owner.id);
    const release = await holdTrip(trip.id);
    actInTurn(owner.id, viewer.id);

    const disable = setTripAiSuggestions(trip.id, false, false);
    await untilBlocked(1, disable);
    const generation = suggestActivityIdeas(trip.id);
    await untilBlocked(2, generation);
    await release();

    expect((await disable).success).toBe(true);
    expect(await generation).toEqual({
      success: false,
      error:
        "AI suggestions are turned off for this trip. The owner can turn them on from Preferences.",
    });
    expect(generateActivitySuggestions).not.toHaveBeenCalled();
    expect(await prisma.aiGeneration.count()).toBe(0);
  });

  it("an already-queued generation is admitted before a later disablement", async () => {
    const { trip, owner, viewer } = await seedTripWithRoles();
    await enableAi(trip.id, owner.id);
    const release = await holdTrip(trip.id);
    actInTurn(viewer.id, owner.id);

    const generation = suggestActivityIdeas(trip.id);
    await untilBlocked(1, generation);
    const disable = setTripAiSuggestions(trip.id, false, false);
    await untilBlocked(2, disable);
    await release();

    // Admission (reservation under the lock) already happened, so this
    // generation may finish; disablement applies to later requests.
    expect((await generation).success).toBe(true);
    expect((await disable).success).toBe(true);
    const rows = await prisma.aiGeneration.findMany({
      where: { tripId: trip.id },
      select: { status: true },
    });
    expect(rows).toEqual([{ status: "COMPLETED" }]);
  });

  it.each(["removal", "disablement"] as const)(
    "an admitted generation can finish after %s commits during the provider call",
    async (change) => {
      const { trip, owner, viewer } = await seedTripWithRoles();
      await enableAi(trip.id, owner.id);
      let started!: () => void;
      const providerStarted = new Promise<void>((resolve) => (started = resolve));
      let finish!: (result: Awaited<ReturnType<typeof generateActivitySuggestions>>) => void;
      vi.mocked(generateActivitySuggestions).mockImplementationOnce(() => {
        const result = new Promise<Awaited<ReturnType<typeof generateActivitySuggestions>>>(
          (resolve) => (finish = resolve),
        );
        started();
        return result;
      });

      actAs(viewer.id);
      const generation = suggestActivityIdeas(trip.id);
      await providerStarted;
      actAs(owner.id);
      try {
        // This must commit while the provider is pending: its call cannot
        // keep a Trip lock or a database transaction open.
        const changed = change === "removal"
          ? await removeMember(trip.id, viewer.id)
          : await setTripAiSuggestions(trip.id, false, false);
        expect(changed.success).toBe(true);
      } finally {
        finish({
          ok: true,
          provider: "mock",
          suggestions: [],
          meta: { attempts: 1, durationMs: 10, validationFailed: false },
        });
      }

      expect((await generation).success).toBe(true);
      expect(await prisma.aiGeneration.findMany({
        where: { tripId: trip.id }, select: { status: true },
      })).toEqual([{ status: "COMPLETED" }]);
    },
  );
});

describe("settlement of unexpected generation failures", () => {
  it("settles a reservation when generation throws unexpectedly", async () => {
    vi.stubEnv("AI_SUGGEST_TRIP_DAILY_LIMIT", "1");
    const { trip, owner, viewer } = await seedTripWithRoles();
    await enableAi(trip.id, owner.id);
    actAs(viewer.id);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(generateActivitySuggestions).mockRejectedValueOnce(
      new Error("Unexpected generation failure"),
    );

    expect((await suggestActivityIdeas(trip.id)).success).toBe(false);
    const rows = await prisma.aiGeneration.findMany({
      where: { tripId: trip.id },
      select: { status: true },
    });
    expect(rows).toEqual([{ status: "FAILED" }]);
    expect(log.mock.calls).toEqual([
      ["suggestActivityIdeas failed", { code: "generation_failed" }],
    ]);
    // A ledger status alone isn't enough: the failed request must actually
    // free the only quota slot for another generation.
    expect((await suggestActivityIdeas(trip.id)).success).toBe(true);
  });

  it.each(["success", "failure"] as const)(
    "preserves generation %s when settlement fails and allows later reconciliation",
    async (outcome) => {
      const { trip, owner, viewer } = await seedTripWithRoles();
      await enableAi(trip.id, owner.id);
      actAs(viewer.id);
      const error = "The suggestion service is unavailable.";
      if (outcome === "failure") {
        vi.mocked(generateActivitySuggestions).mockResolvedValueOnce({
          ok: false, error,
          meta: { attempts: 2, durationMs: 10, validationFailed: false },
        });
      }
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(prisma.aiGeneration, "updateMany").mockRejectedValueOnce(
        new Error("Database failure containing private content"),
      );

      const result = await suggestActivityIdeas(trip.id);
      if (outcome === "success") expect(result.success).toBe(true);
      else expect(result).toEqual({ success: false, error });
      expect(log.mock.calls).toEqual([
        ["suggestActivityIdeas failed", { code: "generation_failed" }],
      ]);
      const row = await prisma.aiGeneration.findFirstOrThrow({
        where: { tripId: trip.id },
      });
      expect(row.status).toBe("RESERVED");

      // Database recovery can reconcile the same reservation without
      // calling the provider a second time.
      if (outcome === "success") {
        await completeAiGeneration(row.id, { attempts: 1, durationMs: 10 });
      } else {
        await failAiGeneration(row.id, {
          attempts: 2, durationMs: 10, validationFailed: false,
        });
      }
      expect((await prisma.aiGeneration.findUniqueOrThrow({
        where: { id: row.id },
      })).status).toBe(outcome === "success" ? "COMPLETED" : "FAILED");
      expect(generateActivitySuggestions).toHaveBeenCalledTimes(1);
    },
  );
});
