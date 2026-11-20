import { expect, test } from "./fixtures";

test("signed-out visitors can read the privacy policy and terms from the landing page", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("By signing in, you agree to the Terms and Privacy Policy.")).toBeVisible();

  await page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
  await expect(page).toHaveTitle("Privacy policy — Roam");
  await expect(page.getByText("CONTACT_EMAIL is not set")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "privacy@example.com" }).first()).toHaveAttribute(
    "href",
    "mailto:privacy@example.com",
  );

  await page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Terms" }).click();
  await expect(page).toHaveURL("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "Terms of service" })).toBeVisible();
  await page.getByRole("link", { name: "privacy policy" }).click();
  await expect(page).toHaveURL("/privacy");
});

test.describe("signed in", () => {
  test.use({ signedInAs: "owner" });

  test("the account page links to the legal pages", async ({ page }) => {
    await page.goto("/account");
    await page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Terms" }).click();
    await expect(page).toHaveURL("/terms");
  });
});
