import { expect, test } from "./fixtures";
import { seedSharedDinner } from "./seed";

test("a viewer opens an expense's breakdown without being able to change it", async ({ page, db, signIn }) => {
  const { trip, host, editor, viewer } = await seedSharedDinner(db);
  await signIn(viewer);
  await page.goto(`/trips/${trip.id}/expenses`);

  await expect(page.getByRole("button", { name: "Edit expense" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete expense" })).toHaveCount(0);
  await page.getByRole("button", { name: /Dinner.*view details/ }).click();

  const dialog = page.getByRole("dialog", { name: "Dinner" });
  await expect(dialog.getByText("$30.00")).toBeVisible();
  await expect(dialog.getByText(host.name)).toHaveCount(2);
  await expect(dialog.getByText("Equally between 3 people")).toBeVisible();
  const shares = dialog.getByRole("listitem");
  await expect(shares).toHaveCount(3);
  for (const name of [host.name, editor.name, `${viewer.name} (you)`]) {
    await expect(shares.filter({ hasText: name })).toContainText("$10.00");
  }
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Edit|Delete|Save/ })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
