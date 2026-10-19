import { describe, expect, it } from "vitest";

import { deleteExpense, deleteSettlement, updateExpense } from "@/actions/expense";
import {
  getTripMembers,
  leaveTrip,
  removeMember,
  setMemberRole,
  transferOwnership,
} from "@/actions/members";
import { prisma } from "@/lib/prisma";
import type { InviteRole } from "@/types";

import {
  seedExpense,
  seedInvite,
  seedSettlement,
  seedSharedDinner,
  seedTripWithRoles,
} from "./factories";
import { actAs, actInTurn, holdOpen, outcomeOf, untilBlocked } from "./helpers";

const OWNER_ONLY = "Only the trip owner can manage members.";
const DEPARTED =
  "This involves someone who has left the trip, so it can't be changed: their balance was settled when they left.";

/** The editor paid $20 for lunch with the viewer: the viewer owes the editor $10. */
async function seedEditorPaidLunch() {
  const seed = await seedTripWithRoles();
  await seedExpense({
    tripId: seed.trip.id,
    paidById: seed.editor.id,
    splits: [
      { userId: seed.editor.id, amountCents: 1000 },
      { userId: seed.viewer.id, amountCents: 1000 },
    ],
  });
  return seed;
}

async function roleOf(tripId: string, userId: string) {
  const member = await prisma.tripMember.findUnique({
    where: { userId_tripId: { userId, tripId } },
  });
  return member?.role ?? null;
}

describe("getTripMembers", () => {
  it.each(["owner", "editor", "viewer"] as const)("lists everyone in join order for the %s", async (role) => {
    const seed = await seedTripWithRoles();
    actAs(seed[role].id);

    const result = await getTripMembers(seed.trip.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map((m) => [m.role, m.isYou])).toEqual([
      ["OWNER", role === "owner"],
      ["EDITOR", role === "editor"],
      ["VIEWER", role === "viewer"],
    ]);
  });

  it("hides the trip from non-members", async () => {
    const { trip, outsider } = await seedTripWithRoles();
    actAs(outsider.id);

    expect(await getTripMembers(trip.id)).toEqual({ success: false, error: "Trip not found." });
  });
});

describe("setMemberRole", () => {
  it.each([
    ["editor", "VIEWER"],
    ["viewer", "EDITOR"],
  ] as const)("lets the owner make the %s a %s", async (who, role) => {
    const seed = await seedTripWithRoles();
    actAs(seed.owner.id);

    expect(await setMemberRole(seed.trip.id, seed[who].id, role)).toEqual({
      success: true,
      data: { userId: seed[who].id, role },
    });
    expect(await roleOf(seed.trip.id, seed[who].id)).toBe(role);
  });

  it.each([
    ["editor", "viewer", OWNER_ONLY],
    ["viewer", "editor", OWNER_ONLY],
    ["outsider", "viewer", "Trip not found."],
  ] as const)("refuses the %s", async (actor, target, error) => {
    const seed = await seedTripWithRoles();
    actAs(seed[actor].id);

    expect(await setMemberRole(seed.trip.id, seed[target].id, "EDITOR")).toEqual({
      success: false,
      error,
    });
    expect(await roleOf(seed.trip.id, seed.viewer.id)).toBe("VIEWER");
  });

  it.each([
    [
      "hand out ownership",
      "viewer",
      "OWNER",
      "Members can be editors or viewers; use Make owner to hand over the trip.",
    ],
    [
      "change the owner's own role",
      "owner",
      "EDITOR",
      "You can't change your own membership as the owner. Make someone else the owner first.",
    ],
    ["change a non-member's role", "outsider", "EDITOR", "That person isn't a member of this trip."],
  ] as const)("doesn't %s", async (_, target, role, error) => {
    const seed = await seedTripWithRoles();
    actAs(seed.owner.id);

    expect(await setMemberRole(seed.trip.id, seed[target].id, role as InviteRole)).toEqual({
      success: false,
      error,
    });
    expect(await roleOf(seed.trip.id, seed.owner.id)).toBe("OWNER");
  });

  it("revokes the links a member created when they become a viewer", async () => {
    const { trip, owner, editor } = await seedTripWithRoles();
    const theirs = await seedInvite({ tripId: trip.id, createdBy: editor.id, role: "EDITOR" });
    const owners = await seedInvite({ tripId: trip.id, createdBy: owner.id });
    actAs(owner.id);

    await setMemberRole(trip.id, editor.id, "VIEWER");

    expect(await prisma.invite.findUnique({ where: { id: theirs.id } })).toMatchObject({
      revokedAt: expect.any(Date),
    });
    expect(await prisma.invite.findUnique({ where: { id: owners.id } })).toMatchObject({
      revokedAt: null,
    });
  });
});

describe("transferOwnership", () => {
  it("hands the trip over and makes the old owner an editor", async () => {
    const { trip, owner, viewer } = await seedTripWithRoles();
    actAs(owner.id);

    expect(await transferOwnership(trip.id, viewer.id)).toEqual({
      success: true,
      data: { ownerId: viewer.id },
    });
    expect(await roleOf(trip.id, viewer.id)).toBe("OWNER");
    expect(await roleOf(trip.id, owner.id)).toBe("EDITOR");
    expect(await prisma.tripMember.count({ where: { tripId: trip.id, role: "OWNER" } })).toBe(1);

    expect(await setMemberRole(trip.id, viewer.id, "VIEWER")).toEqual({
      success: false,
      error: OWNER_ONLY,
    });
  });

  it.each([
    ["editor", OWNER_ONLY],
    ["viewer", OWNER_ONLY],
    ["outsider", "Trip not found."],
  ] as const)("refuses the %s", async (actor, error) => {
    const seed = await seedTripWithRoles();
    actAs(seed[actor].id);

    expect(await transferOwnership(seed.trip.id, seed.editor.id)).toEqual({ success: false, error });
    expect(await roleOf(seed.trip.id, seed.owner.id)).toBe("OWNER");
  });
});

describe("removeMember", () => {
  it("removes a member whose balance is settled", async () => {
    const { trip, owner, viewer } = await seedTripWithRoles();
    actAs(owner.id);

    expect(await removeMember(trip.id, viewer.id)).toEqual({
      success: true,
      data: { userId: viewer.id },
    });
    expect(await roleOf(trip.id, viewer.id)).toBeNull();
  });

  it.each([
    ["owes", "viewer", "Vera Viewer still owes $10.00"],
    ["is owed", "editor", "Eddie Editor is still owed $10.00"],
  ] as const)("refuses while the member %s money", async (_, who, balance) => {
    const seed = await seedEditorPaidLunch();
    actAs(seed.owner.id);

    expect(await removeMember(seed.trip.id, seed[who].id)).toEqual({
      success: false,
      error: `${balance} on this trip. Record their repayments on the Expenses tab first — members can only be removed once their balance is settled.`,
    });
    expect(await prisma.tripMember.count({ where: { tripId: seed.trip.id } })).toBe(3);
  });

  it("removes a member once their repayment is recorded", async () => {
    const { trip, owner, viewer } = await seedSharedDinner();
    await seedSettlement({
      tripId: trip.id,
      fromUserId: viewer.id,
      toUserId: owner.id,
      amountCents: 1000,
      createdById: viewer.id,
    });
    actAs(owner.id);

    expect(await removeMember(trip.id, viewer.id)).toMatchObject({ success: true });
  });

  it.each([
    ["editor", OWNER_ONLY],
    ["viewer", OWNER_ONLY],
    ["outsider", "Trip not found."],
  ] as const)("refuses the %s", async (actor, error) => {
    const seed = await seedTripWithRoles();
    const target = actor === "viewer" ? seed.editor : seed.viewer;
    actAs(seed[actor].id);

    expect(await removeMember(seed.trip.id, target.id)).toEqual({ success: false, error });
    expect(await prisma.tripMember.count({ where: { tripId: seed.trip.id } })).toBe(3);
  });
});

describe("leaveTrip", () => {
  it.each(["editor", "viewer"] as const)("lets a settled %s leave", async (role) => {
    const seed = await seedTripWithRoles();
    actAs(seed[role].id);

    expect(await outcomeOf(leaveTrip(seed.trip.id))).toEqual({ redirectedTo: "/trips" });
    expect(await roleOf(seed.trip.id, seed[role].id)).toBeNull();
  });

  it.each([
    [
      "the owner",
      "owner",
      "The owner can't leave the trip. Make someone else the owner first, or delete the trip.",
    ],
    [
      "a member who owes",
      "viewer",
      "You still owe $10.00 on this trip. Record your repayments on the Expenses tab first — you can leave once your balance is settled.",
    ],
    [
      "a member who is owed",
      "editor",
      "You're still owed $10.00 on this trip. Record the repayments you've received on the Expenses tab first — you can leave once your balance is settled.",
    ],
    ["a non-member", "outsider", "Trip not found."],
  ] as const)("refuses %s", async (_, who, error) => {
    const seed = await seedEditorPaidLunch();
    actAs(seed[who].id);

    expect(await outcomeOf(leaveTrip(seed.trip.id))).toEqual({
      returned: { success: false, error },
    });
    expect(await prisma.tripMember.count({ where: { tripId: seed.trip.id } })).toBe(3);
  });

  it("takes only the leaver's own trip data with them", async () => {
    const { trip, owner, viewer } = await seedTripWithRoles();
    const date = new Date("2030-06-01T00:00:00.000Z");
    const idea = await prisma.activityIdea.create({
      data: { tripId: trip.id, title: "Fado night", createdById: owner.id },
    });
    for (const userId of [owner.id, viewer.id]) {
      await prisma.availabilityDay.create({ data: { tripId: trip.id, userId, date } });
      await prisma.tripPreference.create({ data: { tripId: trip.id, userId } });
      await prisma.activityVote.create({ data: { ideaId: idea.id, userId } });
      await prisma.packingItem.create({ data: { tripId: trip.id, name: "Toothbrush", ownerId: userId } });
    }
    const claimed = await prisma.packingItem.create({
      data: { tripId: trip.id, name: "Speaker", assigneeId: viewer.id },
    });
    const link = await seedInvite({ tripId: trip.id, createdBy: viewer.id });
    actAs(viewer.id);

    expect(await outcomeOf(leaveTrip(trip.id))).toEqual({ redirectedTo: "/trips" });

    const left = { tripId: trip.id, userId: viewer.id };
    expect(await prisma.availabilityDay.count({ where: left })).toBe(0);
    expect(await prisma.tripPreference.count({ where: left })).toBe(0);
    expect(await prisma.activityVote.count({ where: { userId: viewer.id } })).toBe(0);
    expect(await prisma.packingItem.count({ where: { ownerId: viewer.id } })).toBe(0);
    expect(await prisma.packingItem.findUnique({ where: { id: claimed.id } })).toMatchObject({
      assigneeId: null,
    });
    expect(await prisma.invite.findUnique({ where: { id: link.id } })).toMatchObject({
      revokedAt: expect.any(Date),
    });

    const stayed = { tripId: trip.id, userId: owner.id };
    expect(await prisma.availabilityDay.count({ where: stayed })).toBe(1);
    expect(await prisma.tripPreference.count({ where: stayed })).toBe(1);
    expect(await prisma.activityVote.count({ where: { userId: owner.id } })).toBe(1);
    expect(await prisma.packingItem.count({ where: { ownerId: owner.id } })).toBe(1);
  });

  it("can't race a repayment's removal into leaving with an open debt", async () => {
    const { trip, owner, editor } = await seedSharedDinner();
    const repayment = await seedSettlement({
      tripId: trip.id,
      fromUserId: editor.id,
      toUserId: owner.id,
      amountCents: 1000,
      createdById: editor.id,
    });
    const commitAvailabilitySave = await holdOpen(
      (tx) =>
        tx.$queryRaw`SELECT id FROM "TripMember" WHERE "tripId" = ${trip.id} AND "userId" = ${editor.id} FOR UPDATE`,
    );
    actInTurn(editor.id, owner.id);

    const leave = outcomeOf(leaveTrip(trip.id));
    await untilBlocked(1, leave);
    const removal = deleteSettlement(repayment.id);
    await untilBlocked(2, removal);
    await commitAvailabilitySave();

    expect(await leave).toEqual({ redirectedTo: "/trips" });
    expect(await removal).toEqual({ success: false, error: DEPARTED });
    expect(await roleOf(trip.id, editor.id)).toBeNull();
    expect(await prisma.settlement.count()).toBe(1);
  });
});

describe("the ledger after a member leaves", () => {
  async function seedDeparture() {
    const seed = await seedSharedDinner();
    const repayment = await seedSettlement({
      tripId: seed.trip.id,
      fromUserId: seed.editor.id,
      toUserId: seed.owner.id,
      amountCents: 1000,
      createdById: seed.editor.id,
    });
    actAs(seed.editor.id);
    expect(await outcomeOf(leaveTrip(seed.trip.id))).toEqual({ redirectedTo: "/trips" });
    actAs(seed.owner.id);
    return { ...seed, repayment };
  }

  it("freezes expenses that involve the departed member", async () => {
    const { dinner, owner, viewer } = await seedDeparture();

    expect(
      await updateExpense(dinner.id, {
        description: "Dinner",
        amountCents: 3000,
        category: "FOOD",
        date: "2030-06-01",
        split: { mode: "EQUAL", participantIds: [owner.id, viewer.id] },
      }),
    ).toEqual({ success: false, error: DEPARTED });
    expect(await deleteExpense(dinner.id)).toEqual({ success: false, error: DEPARTED });
    expect(await prisma.expense.count()).toBe(1);
  });

  it("freezes repayments that involve the departed member", async () => {
    const { repayment } = await seedDeparture();

    expect(await deleteSettlement(repayment.id)).toEqual({ success: false, error: DEPARTED });
    expect(await prisma.settlement.count()).toBe(1);
  });

  it("leaves expenses between remaining members editable", async () => {
    const { trip, owner, viewer } = await seedDeparture();
    const lunch = await seedExpense({
      tripId: trip.id,
      paidById: owner.id,
      splits: [
        { userId: owner.id, amountCents: 500 },
        { userId: viewer.id, amountCents: 500 },
      ],
    });

    expect(await deleteExpense(lunch.id)).toEqual({ success: true, data: { id: lunch.id } });
  });
});
