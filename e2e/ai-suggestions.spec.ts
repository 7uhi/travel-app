import type { PrismaClient } from "../generated/prisma/client";

import { expect, test } from "./fixtures";
import { createUser } from "./seed";

/**
 * Mock suggestion preview. The enabled describe runs only when the server
 * under test was started with the feature on:
 *   AI_SUGGESTIONS_ENABLED=1 npm run test:e2e -- e2e/ai-suggestions.spec.ts
 * CI runs exactly that as a separate step after the default (disabled) run.
 * Every test seeds its own trip and users, so desktop/mobile projects and
 * retries never share mutable data. Screenshots are attached on success as
 * well as failure for desktop + 375px review.
 */
const ENABLED = process.env.AI_SUGGESTIONS_ENABLED === "1";

type PageLike = import("@playwright/test").Page;
type TestInfoLike = import("@playwright/test").TestInfo;

/** Captures a screenshot and attaches it so it survives the run either way. */
async function snap(page: PageLike, testInfo: TestInfoLike, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

/** A fresh undecided trip with one user per role. */
async function seedOwnTrip(db: PrismaClient) {
  const [owner, editor, viewer] = await Promise.all([
    createUser(db, "Ora Owner"),
    createUser(db, "Eli Editor"),
    createUser(db, "Vera Viewer"),
  ]);
  const trip = await db.trip.create({
    data: {
      title: "Isolated AI test trip",
      destination: "Lisbon, Portugal",
      startDate: new Date("2030-06-01T00:00:00.000Z"),
      endDate: new Date("2030-06-03T00:00:00.000Z"),
      days: {
        create: [
          { date: new Date("2030-06-01T00:00:00.000Z") },
          { date: new Date("2030-06-02T00:00:00.000Z") },
          { date: new Date("2030-06-03T00:00:00.000Z") },
        ],
      },
      members: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: editor.id, role: "EDITOR" },
          { userId: viewer.id, role: "VIEWER" },
        ],
      },
    },
  });
  await db.tripAiSetting.create({
    data: {
      tripId: trip.id,
      suggestionsEnabled: true,
      enabledById: owner.id,
      enabledAt: new Date(),
    },
  });
  return { trip, owner, editor, viewer };
}

test.describe("AI suggestion preview (mock, enabled)", () => {
  test.skip(!ENABLED, "requires AI_SUGGESTIONS_ENABLED=1 on the test server");

  test("viewer generates suggestions but cannot apply them", async ({
    page,
    db,
    signIn,
  }, testInfo) => {
    const { trip, viewer } = await seedOwnTrip(db);
    await signIn(viewer);
    await page.goto(`/trips/${trip.id}/ideas`);

    const preview = page.locator('section[aria-label="Suggested ideas preview"]');
    await expect(preview).toBeVisible();
    await expect(preview.getByText("Preview")).toBeVisible();

    await preview.getByRole("button", { name: "Suggest ideas" }).click();

    await expect(
      preview.getByText("Estimate — verify locally").first(),
    ).toBeVisible();
    await expect(
      preview.getByRole("button", { name: "Add as idea" }),
    ).toHaveCount(0);
    await snap(page, testInfo, "ai-preview-viewer");
  });

  test("editor applies a suggestion through the normal idea flow", async ({
    page,
    db,
    signIn,
  }, testInfo) => {
    const { trip, editor } = await seedOwnTrip(db);
    await signIn(editor);
    await page.goto(`/trips/${trip.id}/ideas`);

    const preview = page.locator('section[aria-label="Suggested ideas preview"]');
    await preview.getByRole("button", { name: "Suggest ideas" }).click();

    // The mock is deterministic for an empty group: this title is stable.
    const title = "Neighborhood coffee crawl";
    const card = preview.locator("li", { hasText: title });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Add as idea" }).click();

    await expect(preview.getByText(title)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await snap(page, testInfo, "ai-preview-applied");
  });

  test("region/climate disagreement is stated, not hidden", async ({
    page,
    db,
    signIn,
  }, testInfo) => {
    const [owner, editor] = await Promise.all([
      createUser(db, "Rita Region"),
      createUser(db, "Cal Climate"),
    ]);
    const trip = await db.trip.create({
      data: {
        title: "Somewhere undecided",
        members: {
          create: [
            { userId: owner.id, role: "OWNER" },
            { userId: editor.id, role: "EDITOR" },
          ],
        },
      },
    });
    await db.tripPreference.createMany({
      data: [
        {
          userId: owner.id,
          tripId: trip.id,
          preferredRegion: "EUROPE",
          preferredClimate: "WARM",
        },
        {
          userId: editor.id,
          tripId: trip.id,
          preferredRegion: "ASIA",
          preferredClimate: "COLD",
        },
      ],
    });

    await signIn(owner);
    await page.goto(`/trips/${trip.id}/preferences`);

    await expect(
      page.getByText("No single region works for the whole group yet"),
    ).toBeVisible();
    await expect(
      page.getByText("No single climate works for the whole group yet"),
    ).toBeVisible();
    // "Where to go" appears in both boxes; assert each in its own scope,
    // anchored on the box's unique heading (text alone matches ancestors).
    const panel = page.locator("div.rounded-2xl", {
      has: page.getByRole("heading", { name: "What the group agrees on" }),
    });
    await expect(panel.getByText("Where to go", { exact: true })).toBeVisible();
    const conflicts = page.locator("div.rounded-2xl", {
      has: page.getByRole("heading", { name: "Worth talking about" }),
    });
    await expect(conflicts.getByText("Where to go", { exact: true })).toBeVisible();
    await expect(
      conflicts.getByText("want different regions: ASIA vs EUROPE"),
    ).toBeVisible();
    await conflicts.scrollIntoViewIfNeeded();
    await snap(page, testInfo, "preference-conflicts");
  });
});

test.describe("per-trip AI consent (enabled server)", () => {
  test.skip(!ENABLED, "requires AI_SUGGESTIONS_ENABLED=1 on the test server");

  test("owner enables suggestions only after explicit confirmation", async ({
    page,
    db,
    signIn,
  }, testInfo) => {
    const { trip, owner } = await seedOwnTrip(db);
    await db.tripAiSetting.update({
      where: { tripId: trip.id },
      data: { suggestionsEnabled: false },
    });
    await signIn(owner);
    await page.goto(`/trips/${trip.id}/preferences`);

    const panel = page.locator('section[aria-label="AI suggestion settings"]');
    await expect(panel.getByText("What a provider would receive")).toBeVisible();
    await expect(
      panel.getByText(/Never sent: dietary or accessibility notes/),
    ).toBeVisible();
    const enable = panel.getByRole("button", { name: "Turn on for this trip" });
    await expect(enable).toBeDisabled();

    await panel.getByRole("checkbox").check();
    await expect(enable).toBeEnabled();
    await enable.click();
    await expect(panel.getByText(/Turned on/)).toBeVisible();
    await snap(page, testInfo, "ai-consent-enabled");

    await page.goto(`/trips/${trip.id}/ideas`);
    await expect(
      page.locator('section[aria-label="Suggested ideas preview"]'),
    ).toBeVisible();
  });

  test("viewer sees the state but cannot change it", async ({
    page,
    db,
    signIn,
  }) => {
    const { trip, viewer } = await seedOwnTrip(db);
    await signIn(viewer);
    await page.goto(`/trips/${trip.id}/preferences`);

    const panel = page.locator('section[aria-label="AI suggestion settings"]');
    await expect(panel.getByText("Only the trip owner can change this.")).toBeVisible();
    await expect(
      panel.getByRole("button", { name: /Turn (on|off) for this trip/ }),
    ).toHaveCount(0);
  });
});

test.describe("AI suggestion preview (feature disabled)", () => {
  test.skip(ENABLED, "runs only when the feature is disabled");

  test("no preview section is offered", async ({ page, db, signIn }) => {
    const { trip, viewer } = await seedOwnTrip(db);
    await signIn(viewer);
    await page.goto(`/trips/${trip.id}/ideas`);

    await expect(
      page.locator('section[aria-label="Suggested ideas preview"]'),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Activity ideas" }),
    ).toBeVisible();
  });
});
