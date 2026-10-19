import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { testDatabaseUrl } from "./tests/database";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    env: { DATABASE_URL: testDatabaseUrl() },
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    // Every file shares one database and truncates it before each test.
    fileParallelism: false,
  },
});
