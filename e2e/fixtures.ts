import { test as base } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { DATABASE_URL, authStatePath } from "./env";
import type { SeededUser } from "./seed";
import { sessionCookie, type SessionUser } from "./session";

/**
 * - `test.use({ signedInAs: "viewer" })` signs every page in a block in as a seeded user.
 * - `signIn(user)` signs the test's page in as any user, such as one the test just created.
 * - `db` reads and writes the e2e database, for tests that need their own data.
 */
export const test = base.extend<
  { signedInAs: SeededUser | null; signIn: (user: SessionUser) => Promise<void> },
  { db: PrismaClient }
>({
  signedInAs: [null, { option: true }],
  storageState: async ({ signedInAs, storageState }, use) => {
    await use(signedInAs ? authStatePath(signedInAs) : storageState);
  },
  signIn: async ({ context }, use) => {
    await use(async (user) => {
      await context.addCookies([await sessionCookie(user)]);
    });
  },
  db: [
    async ({}, use) => {
      const db = new PrismaClient({ datasourceUrl: DATABASE_URL });
      await use(db);
      await db.$disconnect();
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
