import { expect, test } from "./fixtures";
import { seedSharedDinner } from "./seed";

test("the owner changes a role but can't remove someone who still owes", async ({ page, db, signIn }) => {
  const { trip, host, editor, viewer } = await seedSharedDinner(db);
  await signIn(host);
  await page.goto(`/trips/${trip.id}`);

  await page.getByRole("button", { name: "3 members" }).click();
  const dialog = page.getByRole("dialog", { name: "Members" });
  const editorRole = dialog.getByRole("combobox", { name: `Role for ${editor.name}` });
  await expect(editorRole).toHaveValue("EDITOR");
  await editorRole.selectOption({ label: "Viewer" });

  await expect
    .poll(async () => (await db.tripMember.findFirst({ where: { tripId: trip.id, userId: editor.id } }))?.role)
    .toBe("VIEWER");
  await expect(editorRole).toHaveValue("VIEWER");

  const viewerRow = dialog.getByRole("listitem").filter({ hasText: viewer.name });
  await viewerRow.getByRole("button", { name: "Remove" }).click();
  await expect(viewerRow.getByText(`Remove ${viewer.name} from the trip?`)).toBeVisible();
  await viewerRow.getByRole("button", { name: "Remove" }).click();

  await expect(viewerRow.getByRole("alert")).toHaveText(
    `${viewer.name} still owes $10.00 on this trip. Record their repayments on the Expenses tab first — members can only be removed once their balance is settled.`,
  );
  expect(await db.tripMember.count({ where: { tripId: trip.id } })).toBe(3);
});

test("a viewer sees who's on the trip but can't manage anyone", async ({ page, db, signIn }) => {
  const { trip, host, editor, viewer } = await seedSharedDinner(db);
  await signIn(viewer);
  await page.goto(`/trips/${trip.id}`);

  await page.getByRole("button", { name: "3 members" }).click();
  const dialog = page.getByRole("dialog", { name: "Members" });

  const rows = dialog.getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: host.name })).toContainText("Owner");
  await expect(rows.filter({ hasText: editor.name })).toContainText("Editor");
  await expect(rows.filter({ hasText: `${viewer.name} (you)` })).toContainText("Viewer");
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Remove|Make owner/ })).toHaveCount(0);
});
