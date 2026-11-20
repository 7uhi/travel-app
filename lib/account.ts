import { cache } from "react";

import type { Tx } from "@/lib/membership";
import { prisma } from "@/lib/prisma";

/** What a deleted account is called wherever trip history still shows it. */
export const DELETED_USER_NAME = "Former member";

/**
 * The placeholder email a deleted account keeps: User.email is unique and
 * required, and freeing the real address lets the person sign up again as a
 * brand-new user. `.invalid` is a reserved TLD, so it can never be delivered.
 */
export function deletedUserEmail(userId: string): string {
  return `deleted-${userId}@deleted.invalid`;
}

/**
 * Whether a session's user still exists and hasn't deleted their account.
 * Sessions are stateless JWTs, so this is what ends them on every device once
 * the account is gone (auth.ts's jwt callback). Memoized per request: a page
 * checks the session once per server action it calls.
 */
export const isActiveUser = cache(async (userId: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletedAt: true },
  });
  return user !== null && user.deletedAt === null;
});

/**
 * Inside a transaction that's about to create rows owned by the user (a
 * membership, a trip, a travel profile): takes a share lock on the user row
 * and reports whether the account is still active. If an account deletion
 * holds the row, this waits for it and then sees the deletion — so a request
 * authenticated just before the deletion can't attach new data to the
 * anonymized "Former member" afterwards.
 */
export async function lockActiveUser(tx: Tx, userId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ deletedAt: Date | null }[]>`
    SELECT "deletedAt" FROM "User" WHERE id = ${userId} FOR KEY SHARE`;
  return rows.length === 1 && rows[0].deletedAt === null;
}

/** The failure every user-scoped write returns once the account is gone. */
export const ACCOUNT_DELETED = "This account has been deleted.";

/** Typed to confirm account deletion, and checked again on the server. */
export const DELETE_ACCOUNT_PHRASE = "DELETE";
