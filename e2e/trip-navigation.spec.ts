import { expect, test } from "./fixtures";
import { TRIP } from "./seed";

test.use({ signedInAs: "viewer" });

const SECTIONS = [
  { tab: "Ideas", path: "/ideas", heading: "Activity ideas" },
  { tab: "Expenses", path: "/expenses", heading: "Expenses" },
  { tab: "Packing", path: "/packing", heading: "Packing" },
  { tab: "Preferences", path: "/preferences", heading: "Preferences" },
  { tab: "Itinerary", path: "", heading: "Itinerary" },
];

test("section tabs move between the trip's pages", async ({ page }) => {
  await page.goto(`/trips/${TRIP.id}`);
  const tabs = page.getByRole("navigation", { name: "Trip sections" });

  for (const { tab, path, heading } of SECTIONS) {
    await tabs.getByRole("link", { name: tab }).click();

    await expect(page).toHaveURL(`/trips/${TRIP.id}${path}`);
    await expect(tabs.getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 2, name: heading, exact: true })).toBeVisible();
  }
});
