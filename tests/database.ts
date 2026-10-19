import { execFileSync } from "node:child_process";

import type { PrismaClient } from "@prisma/client";

const LOCAL_TEST_DATABASE_URL = "postgresql://postgres@localhost:5432/travel_test";

/**
 * DATABASE_URL for the integration and e2e suites, which wipe every table.
 * Refuses anything whose database name doesn't contain "test" so a developer
 * database can't be truncated by accident.
 */
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? LOCAL_TEST_DATABASE_URL;
  const name = new URL(url).pathname.slice(1);
  if (!name.includes("test")) {
    throw new Error(
      `Refusing to run against database "${name}": the test suites wipe every table, ` +
        `so DATABASE_URL must point at a disposable database whose name contains "test".`,
    );
  }
  return url;
}

export function migrateTestDatabase(url: string): void {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: ["ignore", "ignore", "inherit"],
  });
}

export async function truncateAllTables(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}
