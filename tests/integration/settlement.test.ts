import { describe, expect, it } from "vitest";

import { deleteSettlement, getTripSettlements, recordSettlement } from "@/actions/expense";
import { prisma } from "@/lib/prisma";

import { seedMember, seedSettlement, seedSharedDinner, seedTripWithRoles, seedUser } from "./factories";
import { actAs } from "./helpers";

describe("recordSettlement", () => {
  it("records a repayment along with who entered it", async () => {
    const { trip, owner, editor } = await seedSharedDinner();
    actAs(owner.id);

    const result = await recordSettlement(trip.id, {
      fromUserId: editor.id,
      toUserId: owner.id,
      amountCents: 1000,
    });

    expect(result).toMatchObject({
      success: true,
      data: { fromUserId: editor.id, toUserId: owner.id, amountCents: 1000, createdById: owner.id },
    });
  });

  it("accepts only one of two concurrent recordings of the same suggestion", async () => {
    const { trip, owner, editor } = await seedSharedDinner();
    actAs(editor.id);
    const repayment = { fromUserId: editor.id, toUserId: owner.id, amountCents: 1000 };

    const results = await Promise.all([
      recordSettlement(trip.id, repayment),
      recordSettlement(trip.id, repayment),
    ]);

    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.find((r) => !r.success)).toEqual({
      success: false,
      error:
        "Eddie Editor doesn't owe Olivia Owner anything right now. The balances may have changed — refresh to see them.",
    });
    expect(await prisma.settlement.count()).toBe(1);
  });

  it("rejects a repayment larger than the debt", async () => {
    const { trip, owner, editor } = await seedSharedDinner();
    actAs(editor.id);

    expect(
      await recordSettlement(trip.id, { fromUserId: editor.id, toUserId: owner.id, amountCents: 1001 }),
    ).toEqual({
      success: false,
      error: "Eddie Editor can repay Olivia Owner at most $10.00 right now.",
    });
    expect(await prisma.settlement.count()).toBe(0);
  });

  it("lets a viewer record their own repayment but not one between other members", async () => {
    const { trip, owner, editor, viewer } = await seedSharedDinner();
    actAs(viewer.id);

    expect(
      await recordSettlement(trip.id, { fromUserId: editor.id, toUserId: owner.id, amountCents: 1000 }),
    ).toEqual({
      success: false,
      error: "Viewers can only record repayments they made or received.",
    });
    expect(
      await recordSettlement(trip.id, { fromUserId: viewer.id, toUserId: owner.id, amountCents: 1000 }),
    ).toMatchObject({ success: true, data: { createdById: viewer.id } });
    expect(await prisma.settlement.count()).toBe(1);
  });

  it("hides the trip from non-members", async () => {
    const { trip, owner, editor, outsider } = await seedSharedDinner();
    actAs(outsider.id);

    expect(
      await recordSettlement(trip.id, { fromUserId: editor.id, toUserId: owner.id, amountCents: 1000 }),
    ).toEqual({ success: false, error: "Trip not found." });
  });

  it("answers the old positional call shape with a format error", async () => {
    const { trip, owner } = await seedSharedDinner();
    actAs(owner.id);

    expect(await recordSettlement(trip.id, owner.id as never)).toEqual({
      success: false,
      error: "That request wasn't in the expected format.",
    });
  });
});

describe("deleteSettlement", () => {
  /** The viewer repaid the editor; a third member, the bookkeeper, entered it. */
  async function seedRecordedRepayment() {
    const seed = await seedTripWithRoles();
    const [bookkeeper, bystander] = await Promise.all([
      seedUser({ name: "Bea Bookkeeper" }),
      seedUser({ name: "Bo Bystander" }),
    ]);
    await seedMember(seed.trip.id, bookkeeper.id, "EDITOR");
    await seedMember(seed.trip.id, bystander.id, "EDITOR");
    const settlement = await seedSettlement({
      tripId: seed.trip.id,
      fromUserId: seed.viewer.id,
      toUserId: seed.editor.id,
      amountCents: 500,
      createdById: bookkeeper.id,
    });
    return { ...seed, bookkeeper, bystander, settlement };
  }

  it.each([
    ["the trip owner", "owner"],
    ["the payer", "viewer"],
    ["the recipient", "editor"],
    ["whoever recorded it", "bookkeeper"],
  ] as const)("lets %s remove it", async (_, who) => {
    const seed = await seedRecordedRepayment();
    actAs(seed[who].id);

    expect(await deleteSettlement(seed.settlement.id)).toEqual({
      success: true,
      data: { id: seed.settlement.id },
    });
    expect(await prisma.settlement.count()).toBe(0);
  });

  it.each([
    [
      "an uninvolved editor",
      "bystander",
      "Only the people involved, whoever recorded it, or the owner can remove this repayment.",
    ],
    ["a non-member", "outsider", "Repayment not found."],
  ] as const)("refuses %s", async (_, who, error) => {
    const seed = await seedRecordedRepayment();
    actAs(seed[who].id);

    expect(await deleteSettlement(seed.settlement.id)).toEqual({ success: false, error });
    expect(await prisma.settlement.count()).toBe(1);
  });
});

describe("getTripSettlements", () => {
  it("lists repayments with who recorded them, for members only", async () => {
    const { trip, owner, editor, outsider } = await seedTripWithRoles();
    await seedSettlement({
      tripId: trip.id,
      fromUserId: editor.id,
      toUserId: owner.id,
      amountCents: 700,
      createdById: editor.id,
    });

    actAs(owner.id);
    expect(await getTripSettlements(trip.id)).toMatchObject({
      success: true,
      data: [{ amountCents: 700, createdBy: { id: editor.id, name: "Eddie Editor" } }],
    });

    actAs(outsider.id);
    expect(await getTripSettlements(trip.id)).toEqual({ success: false, error: "Trip not found." });
  });
});
