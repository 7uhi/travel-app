import { expect, test } from "./fixtures";
import { createUser } from "./seed";
import { sessionCookie } from "./session";

/** Each test seeds its own users and trips, so projects and retries never share data. */

test("deleting an account signs the person out everywhere and removes their solo trips", async ({
  page,
  browser,
  db,
  signIn,
}, testInfo) => {
  const user = await createUser(db, "Dana Departing");
  const solo = await db.trip.create({
    data: {
      title: `Solo trip ${user.id}`,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  await signIn(user);

  await page.goto("/trips");
  await page.getByRole("link", { name: "Account" }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByText(solo.title)).toBeVisible();
  const shot = testInfo.outputPath("account.png");
  await page.screenshot({ path: shot, fullPage: true });
  await testInfo.attach("account", { path: shot, contentType: "image/png" });

  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  const confirm = dialog.getByRole("button", { name: "Delete my account" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await confirm.click();

  await expect(page).toHaveURL(/\/\?accountDeleted=1$/);
  await expect(page.getByRole("status")).toHaveText("Your account has been deleted.");
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(row.deletedAt).not.toBeNull();
  expect(row.name).toBe("Former member");
  expect(await db.trip.findUnique({ where: { id: solo.id } })).toBeNull();

  // A session minted before the deletion — another device — is refused too.
  const other = await browser.newContext();
  await other.addCookies([await sessionCookie(user)]);
  const otherPage = await other.newPage();
  await otherPage.goto("/trips");
  await expect(otherPage).toHaveURL(/\/api\/auth\/signin/);
  await other.close();
});

test("an owner of a shared trip sees what to resolve first, with no delete button", async ({
  page,
  db,
  signIn,
}) => {
  const [owner, friend] = await Promise.all([
    createUser(db, "Owen Owner"),
    createUser(db, "Fran Friend"),
  ]);
  const shared = await db.trip.create({
    data: {
      title: `Shared trip ${owner.id}`,
      members: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: friend.id, role: "EDITOR" },
        ],
      },
    },
  });
  await signIn(owner);

  await page.goto("/account");
  await expect(page.getByText(`You own “${shared.title}”, which has other members.`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete account" })).toHaveCount(0);
  await page.getByRole("link", { name: "Open trip" }).click();
  await expect(page).toHaveURL(new RegExp(`/trips/${shared.id}$`));
});
