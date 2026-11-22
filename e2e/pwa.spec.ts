import { expect, test } from "./fixtures";

test("the manifest describes an installable full-screen app", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();

  const response = await request.get(href!);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "Roam",
    short_name: "Roam",
    display: "standalone",
    start_url: "/?source=pwa",
  });

  for (const icon of manifest.icons) {
    const image = await request.get(icon.src);
    expect(image.ok(), icon.src).toBe(true);
    expect(image.headers()["content-type"]).toBe("image/png");
  }
});

test("iOS gets a home screen icon and app title", async ({ page, request }) => {
  await page.goto("/");

  const icon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(icon!)).ok()).toBe(true);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    "content",
    "Roam",
  );
});

test("the installed app shows sign-in to signed-out visitors", async ({ page }) => {
  await page.goto("/?source=pwa");

  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
});

test.describe("signed in", () => {
  test.use({ signedInAs: "owner" });

  test("the installed app opens on the trips list", async ({ page }) => {
    await page.goto("/?source=pwa");

    await expect(page).toHaveURL("/trips");
  });

  test("the regular home page stays put", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "Your trips" })).toBeVisible();
  });
});
