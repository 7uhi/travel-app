import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generation and preview builds need no database. Commands that connect
  // (such as migrate deploy) still require DATABASE_URL.
  datasource: { url: process.env.DATABASE_URL },
});
