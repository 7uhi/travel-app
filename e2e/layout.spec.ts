import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { createUser, TRIP } from "./seed";

test.use({ signedInAs: "owner" });

const tripPath = `/trips/${TRIP.id}`;
const PAGES = [
  "/",
  "/account",
  "/trips",
  tripPath,
  `${tripPath}/ideas`,
  `${tripPath}/expenses`,
  `${tripPath}/packing`,
  `${tripPath}/preferences`,
];

async function expectNoSidewaysScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

for (const path of PAGES) {
  test(`${path} fits the viewport without horizontal scrolling`, async ({ page }) => {
    await page.goto(path);
    await expectNoSidewaysScroll(page);
  });
}

test("a long unbroken trip title and destination stay on screen", async ({
  page,
  db,
  signIn,
}) => {
  const user = await createUser(db, "Long Name Traveller");
  const trip = await db.trip.create({
    data: {
      title: "L".repeat(120),
      destination: "D".repeat(120),
      startDate: new Date("2030-06-01T00:00:00.000Z"),
      endDate: new Date("2030-06-02T00:00:00.000Z"),
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  await signIn(user);

  await page.goto(`/trips/${trip.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("a long packing template name stays on screen", async ({
  page,
  db,
  signIn,
}) => {
  const user = await createUser(db, "Template Traveller");
  const trip = await db.trip.create({
    data: {
      title: "Template trip",
      startDate: new Date("2030-06-01T00:00:00.000Z"),
      endDate: new Date("2030-06-02T00:00:00.000Z"),
      members: { create: { userId: user.id, role: "OWNER" } },
      packingTemplates: {
        create: {
          name: "T".repeat(80),
          items: { create: { name: "I".repeat(80), category: "GEAR" } },
        },
      },
    },
  });
  await signIn(user);

  await page.goto(`/trips/${trip.id}/packing`);
  await page.getByRole("tab", { name: /^Templates/ }).click();
  await expect(page.getByRole("heading", { name: "T".repeat(80) })).toBeVisible();
  await expectNoSidewaysScroll(page);
});

for (const mode of ["Dates are set", "Poll the group"]) {
  test(`New trip fields stay inside the dialog with "${mode}"`, async ({
    page,
  }, testInfo) => {
    await page.goto("/trips");
    await page.getByRole("button", { name: "New trip" }).click();
    const dialog = page.getByRole("dialog", { name: "New trip" });
    await dialog.getByRole("radio", { name: mode }).click();

    const fields = await dialog
      .locator("input:not([type=radio]), select")
      .evaluateAll((elements) => {
        const panel = elements[0].closest("dialog")!.getBoundingClientRect();
        return elements.map((element) => {
          const box = element.getBoundingClientRect();
          return {
            name: element.getAttribute("name"),
            inside: box.left >= panel.left && box.right <= panel.right,
            fontSize: parseFloat(getComputedStyle(element).fontSize),
          };
        });
      });

    expect(fields.filter((field) => !field.inside)).toEqual([]);
    // iOS Safari zooms the page when a field under 16px is focused.
    if (testInfo.project.name === "mobile") {
      expect(fields.filter((field) => field.fontSize < 16)).toEqual([]);
    }
  });
}
