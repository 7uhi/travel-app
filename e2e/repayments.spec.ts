import { expect, test } from "./fixtures";
import { seedSharedDinner } from "./seed";

test("a viewer records their own repayment through the review dialog", async ({ page, db, signIn }) => {
  const { trip, host, editor, viewer } = await seedSharedDinner(db);
  await signIn(viewer);

  await page.goto(`/trips/${trip.id}/expenses`);

  await expect(
    page.getByRole("button", { name: `Record a repayment from ${editor.name} to ${host.name}` }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: `Record a repayment from ${viewer.name} to ${host.name}` })
    .click();

  const dialog = page.getByRole("dialog", { name: "Record a repayment" });
  await expect(dialog.getByLabel(/Amount/)).toHaveValue("10.00");
  await dialog.getByRole("button", { name: "Record $10.00" }).click();

  await expect(dialog).toBeHidden();
  // Next 15 intermittently drops router.refresh() after a server action (vercel/next.js#86055),
  // so read the result from a fresh render rather than the in-place update.
  await page.reload();
  await expect(page.getByText(`${viewer.name} paid ${host.name} $10.00`)).toBeVisible();
  await expect(page.getByText(`recorded by ${viewer.name}`)).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Record a repayment from ${viewer.name} to ${host.name}` }),
  ).toHaveCount(0);
  expect(await db.settlement.findMany({ where: { tripId: trip.id } })).toEqual([
    expect.objectContaining({ fromUserId: viewer.id, toUserId: host.id, amountCents: 1000, createdById: viewer.id }),
  ]);
});
