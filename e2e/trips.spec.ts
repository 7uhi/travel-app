import { expect, test } from "./fixtures";
import { TRIP } from "./seed";

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/trips");

  await expect(page).toHaveURL(/\/api\/auth\/signin\?callbackUrl=/);
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
});

test.describe("as the owner", () => {
  test.use({ signedInAs: "owner" });

  test("the trip list shows the seeded trip and opens it", async ({ page }) => {
    await page.goto("/trips");

    const card = page.getByRole("link", { name: new RegExp(TRIP.title) });
    await expect(card).toContainText(TRIP.destination);
    await expect(card).toContainText("owner");

    await card.click();
    await expect(page).toHaveURL(`/trips/${TRIP.id}`);
    await expect(page.getByRole("heading", { level: 1, name: TRIP.title })).toBeVisible();
    await expect(page.getByText(TRIP.activity)).toBeVisible();
  });
});

test.describe("as a signed-in non-member", () => {
  test.use({ signedInAs: "outsider" });

  test("the trip list is empty", async ({ page }) => {
    await page.goto("/trips");

    await expect(page.getByText("No trips yet")).toBeVisible();
  });

  test("the trip page reports the trip as not found", async ({ page }) => {
    await page.goto(`/trips/${TRIP.id}`);

    await expect(page.getByRole("heading", { name: "Trip not found" })).toBeVisible();
    await expect(page.getByText(TRIP.title)).toHaveCount(0);
  });
});
