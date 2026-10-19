import { expect, test } from "./fixtures";
import { INVITE_TOKEN, TRIP, USERS, createUser, seedSharedDinner } from "./seed";

test("signed-out visitors are sent to sign in and back to the invite", async ({ page }) => {
  await page.goto(`/invite/${INVITE_TOKEN}`);

  await expect(page).toHaveURL(/\/api\/auth\/signin/);
  expect(new URL(page.url()).searchParams.get("callbackUrl")).toContain(`/invite/${INVITE_TOKEN}`);
});

test("opening an invite only previews the trip; Join adds the member", async ({ page, db, signIn }) => {
  const newcomer = await createUser(db, "Nina Newcomer");
  await signIn(newcomer);
  const membership = () =>
    db.tripMember.findUnique({
      where: { userId_tripId: { userId: newcomer.id, tripId: TRIP.id } },
    });

  await page.goto(`/invite/${INVITE_TOKEN}`);

  await expect(page.getByRole("heading", { level: 1, name: TRIP.title })).toBeVisible();
  await expect(page.getByText(`${USERS.owner.name} invited you`)).toBeVisible();
  await expect(page.getByText("You'll join as an editor")).toBeVisible();
  expect(await membership()).toBeNull();

  await page.getByRole("button", { name: "Join trip" }).click();

  await expect(page).toHaveURL(`/trips/${TRIP.id}/preferences/onboarding`);
  expect(await membership()).toMatchObject({ role: "EDITOR" });

  await page.goto(`/invite/${INVITE_TOKEN}`);
  await expect(page).toHaveURL(`/trips/${TRIP.id}`);
});

test("the owner shares an editor link, and revoking it stops it working", async ({ page, db, signIn }) => {
  const { trip, host } = await seedSharedDinner(db);
  await signIn(host);
  await page.goto(`/trips/${trip.id}`);

  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog", { name: "Share this trip" });
  await expect(dialog.getByText("No links are active.")).toBeVisible();
  await dialog.getByRole("radio", { name: /^Editor/ }).check();
  await dialog.getByRole("button", { name: "Create editor link" }).click();

  const newLink = dialog.getByRole("textbox", { name: "New invite link" });
  await expect(newLink).toHaveValue(/\/invite\//);
  const invitePath = new URL(await newLink.inputValue()).pathname;
  const activeLink = dialog.getByRole("listitem");
  await expect(activeLink).toHaveCount(1);
  await expect(activeLink).toContainText("Editor");
  await expect(activeLink).toContainText(`by ${host.name}`);
  expect(await db.invite.findMany({ where: { tripId: trip.id } })).toEqual([
    expect.objectContaining({ role: "EDITOR", createdBy: host.id, revokedAt: null }),
  ]);

  await activeLink.getByRole("button", { name: "Revoke", exact: true }).click();
  await activeLink.getByRole("button", { name: "Revoke link" }).click();

  await expect(dialog.getByText("No links are active.")).toBeVisible();
  await expect(newLink).toBeHidden();
  expect(await db.invite.findMany({ where: { tripId: trip.id } })).toEqual([
    expect.objectContaining({ revokedAt: expect.any(Date) }),
  ]);

  const newcomer = await createUser(db, "Nina Newcomer");
  await page.context().clearCookies();
  await signIn(newcomer);
  await page.goto(invitePath);

  await expect(page.getByRole("heading", { level: 1, name: "This invite won't open" })).toBeVisible();
  await expect(
    page.getByText(
      "This invite link was revoked, so it can't be used to join anymore. Ask whoever shared it for a new one.",
    ),
  ).toBeVisible();
  expect(await db.tripMember.count({ where: { tripId: trip.id, userId: newcomer.id } })).toBe(0);
});
