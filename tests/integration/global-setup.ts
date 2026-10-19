import { migrateTestDatabase, testDatabaseUrl } from "../database";

export default function setup(): void {
  migrateTestDatabase(testDatabaseUrl());
}
