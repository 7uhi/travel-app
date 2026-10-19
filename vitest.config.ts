import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" path alias.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // Fast, I/O-free unit tests only; tests/integration and e2e have their own runners.
    include: ["lib/**/*.test.ts"],
  },
});
