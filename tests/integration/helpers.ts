import type { Prisma } from "../../generated/prisma/client";
import { vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/session";

/** Backs the mocked next/headers cookies(); cleared before every test. */
export const cookieJar = new Map<string, string>();

/** Thrown by the mocked next/navigation redirect() so tests can assert the target. */
export class Redirect extends Error {
  constructor(readonly url: string) {
    super(`Redirected to ${url}`);
  }
}

/** Makes server actions see `userId` as the signed-in user (null = signed out). */
export function actAs(userId: string | null): void {
  vi.mocked(currentUserId).mockResolvedValue(userId);
}

/**
 * The next actions called see these users, one each, in call order; later
 * calls fall back to actAs. For two people acting at the same moment.
 */
export function actInTurn(...userIds: string[]): void {
  for (const userId of userIds) vi.mocked(currentUserId).mockResolvedValueOnce(userId);
}

/** Settles an action that redirects on success: the redirect target, or the failure it returned. */
export async function outcomeOf(action: Promise<unknown>) {
  try {
    return { returned: await action };
  } catch (error) {
    if (error instanceof Redirect) return { redirectedTo: error.url };
    throw error;
  }
}

/**
 * Runs `write` in a transaction of its own and leaves it uncommitted, holding
 * its row locks like another request caught mid-write, until commit() is called.
 */
export async function holdOpen(write: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  let commit!: () => void;
  const committed = new Promise<void>((resolve) => (commit = resolve));
  let wrote!: () => void;
  const written = new Promise<void>((resolve) => (wrote = resolve));
  const transaction = prisma.$transaction(
    async (tx) => {
      await write(tx);
      wrote();
      await committed;
    },
    { timeout: 10_000 },
  );
  await Promise.race([written, transaction]);
  return async () => {
    commit();
    await transaction;
  };
}

/**
 * Waits until `count` queries on the test database are blocked on a lock —
 * or until `action` settles without blocking, so a missing lock surfaces in
 * the test's own assertions.
 */
export async function untilBlocked(count: number, action: Promise<unknown>) {
  let settled = false;
  action.then(
    () => (settled = true),
    () => (settled = true),
  );
  for (const start = Date.now(); Date.now() - start < 5000; ) {
    if (settled) return;
    const [{ blocked }] = await prisma.$queryRaw<{ blocked: number }[]>`
      SELECT count(*)::int AS blocked FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (blocked >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${count} queries to block on a lock.`);
}
