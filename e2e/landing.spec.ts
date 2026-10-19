import { expect, test } from "./fixtures";
import { USERS } from "./seed";

test("landing page offers Google sign-in to visitors", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: /Plan group trips/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await page.getByRole("link", { name: /See a sample trip/ }).click();

  await expect(page).toHaveURL("/preview");
  await expect(page.getByText("Sample trip.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Trip options" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Share/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add activity" })).toHaveCount(0);
});

test.describe("signed in", () => {
  test.use({ signedInAs: "owner" });

  test("landing page greets the user and links to their trips", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(`Signed in as ${USERS.owner.name}`)).toBeVisible();
    await page.getByRole("link", { name: "Your trips" }).click();
    await expect(page).toHaveURL("/trips");
    await expect(page.getByRole("heading", { name: "Your trips" })).toBeVisible();
  });
});
