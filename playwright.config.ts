import { defineConfig, devices } from "@playwright/test";

import { AUTH_SECRET, BASE_URL, DATABASE_URL, PORT } from "./e2e/env";

const isCI = Boolean(process.env.CI);
const start = `npm start -- --port ${PORT}`;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [[isCI ? "github" : "list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 667 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    // CI runs `next build` in its own step; locally, build first so the run covers the current code.
    command: isCI ? start : `npm run build && ${start}`,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 300_000,
    env: {
      AUTH_SECRET,
      AUTH_TRUST_HOST: "true",
      AUTH_URL: BASE_URL,
      DATABASE_URL,
    },
  },
});
