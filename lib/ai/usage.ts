import { aiTripDailyLimit, aiUserDailyLimit } from "@/lib/ai/config";
import { prisma } from "@/lib/prisma";

/**
 * Persistent per-user and per-trip generation quotas on the AiGeneration
 * ledger. Enforcement is server-side only and atomic:
 *
 * - reserveAiGeneration locks the Trip row, then the User row (the same
 *   Trip→User order everywhere in this module), counts today's
 *   RESERVED + COMPLETED rows for both scopes, and inserts a RESERVED row
 *   only if both counts are below their limits. Because in-flight rows
 *   count, concurrent requests cannot bypass a limit while one runs.
 * - Settlement flips the row to COMPLETED (quota consumed) or FAILED
 *   (quota released, row kept as operational metadata). Internal provider
 *   retries share the request's single reservation; they only raise
 *   `attempts`.
 *
 * Rows never contain prompts, suggestions, or notes — outcome, timing,
 * and counts only.
 */

export type QuotaScope = "user" | "trip";

export type ReserveResult =
  | { ok: true; generationId: string }
  | { ok: false; scope: QuotaScope };

function utcDayStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export async function reserveAiGeneration(input: {
  tripId: string;
  userId: string;
  provider: string;
}): Promise<ReserveResult> {
  const since = utcDayStart(new Date());
  const counted = { in: ["RESERVED", "COMPLETED"] as ("RESERVED" | "COMPLETED")[] };

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${input.tripId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`;

    const [tripCount, userCount] = await Promise.all([
      tx.aiGeneration.count({
        where: { tripId: input.tripId, status: counted, createdAt: { gte: since } },
      }),
      tx.aiGeneration.count({
        where: { userId: input.userId, status: counted, createdAt: { gte: since } },
      }),
    ]);
    if (userCount >= aiUserDailyLimit()) return { ok: false, scope: "user" };
    if (tripCount >= aiTripDailyLimit()) return { ok: false, scope: "trip" };

    const row = await tx.aiGeneration.create({
      data: {
        tripId: input.tripId,
        userId: input.userId,
        provider: input.provider,
        status: "RESERVED",
      },
      select: { id: true },
    });
    return { ok: true, generationId: row.id };
  });
}

export async function completeAiGeneration(
  generationId: string,
  meta: { attempts: number; durationMs: number },
): Promise<void> {
  await prisma.aiGeneration.update({
    where: { id: generationId },
    data: {
      status: "COMPLETED",
      attempts: meta.attempts,
      durationMs: meta.durationMs,
      settledAt: new Date(),
    },
  });
}

export async function failAiGeneration(
  generationId: string,
  meta: { attempts: number; durationMs: number; validationFailed: boolean },
): Promise<void> {
  await prisma.aiGeneration.update({
    where: { id: generationId },
    data: {
      status: "FAILED",
      attempts: meta.attempts,
      durationMs: meta.durationMs,
      validationFailed: meta.validationFailed,
      settledAt: new Date(),
    },
  });
}

/** Records a generation that failed before any provider call (no quota used). */
export async function recordFailedAiGeneration(input: {
  tripId: string;
  userId: string;
  provider: string;
  durationMs: number;
  validationFailed: boolean;
}): Promise<void> {
  await prisma.aiGeneration.create({
    data: {
      tripId: input.tripId,
      userId: input.userId,
      provider: input.provider,
      status: "FAILED",
      attempts: 0,
      durationMs: input.durationMs,
      validationFailed: input.validationFailed,
      settledAt: new Date(),
    },
  });
}

export function quotaMessage(scope: QuotaScope): string {
  return scope === "user"
    ? "You've reached today's suggestion limit. Try again tomorrow."
    : "This trip has reached today's suggestion limit. Try again tomorrow.";
}
