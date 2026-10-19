import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { migrateTestDatabase, truncateAllTables } from "../tests/database";
import { DATABASE_URL, authStatePath } from "./env";
import { USERS, seedDatabase, type SeededUser } from "./seed";
import { sessionCookie } from "./session";

export default async function globalSetup(): Promise<void> {
  migrateTestDatabase(DATABASE_URL);

  const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });
  try {
    await truncateAllTables(prisma);
    await seedDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }

  await Promise.all(
    (Object.keys(USERS) as SeededUser[]).map(async (user) => {
      const file = authStatePath(user);
      const state = { cookies: [await sessionCookie(USERS[user])], origins: [] };
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(state, null, 2));
    }),
  );
}
