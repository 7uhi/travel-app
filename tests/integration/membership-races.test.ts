import { describe, expect, it } from "vitest";

import { acceptInvite, revokeInvite } from "@/actions/invite";
import {
  leaveTrip,
  removeMember,
  setMemberRole,
  transferOwnership,
} from "@/actions/members";
import { prisma } from "@/lib/prisma";

import { seedInvite, seedTripWithRoles, seedUser } from "./factories";
import { actAs, actInTurn, holdOpen, outcomeOf, untilBlocked } from "./helpers";

const REVOKED =
  "This invite link was revoked, so it can't be used to join anymore. Ask whoever shared it for a new one.";
const OWNER_ONLY = "Only the trip owner can manage members.";
const NOT_MEMBER = "That person isn't a member of this trip.";

async function roleOf(tripId: string, userId: string) {
  const member = await prisma.tripMember.findUnique({
    where: { userId_tripId: { userId, tripId } },
    select: { role: true },
  });
  return member?.role ?? null;
}

async function ownerCount(tripId: string) {
  return prisma.tripMember.count({ where: { tripId, role: "OWNER" } });
}

describe("invite acceptance racing revocation", () => {
  it("revocation queued first: the link cannot grant access", async () => {
    const { trip, owner } = await seedTripWithRoles();
    const joiner = await seedUser({ name: "Jo Joiner" });
    const invite = await seedInvite({ tripId: trip.id, createdBy: owner.id });
    const commit = await holdOpen(
      (tx) => tx.$queryRaw`SELECT id FROM "Invite" WHERE id = ${invite.id} FOR UPDATE`,
    );
    actInTurn(owner.id, joiner.id);

    const revoke = revokeInvite(invite.id);
    await untilBlocked(1, revoke);
    const accept = acceptInvite(invite.token);
    await untilBlocked(2, accept);
    await commit();

    expect(await revoke).toEqual({ success: true, data: { id: invite.id } });
    expect(await accept).toEqual({ success: false, error: REVOKED });
    expect(await roleOf(trip.id, joiner.id)).toBeNull();
  });

  it("acceptance queued first: the member joins, revocation still lands", async () => {
    const { trip, owner } = await seedTripWithRoles();
    const joiner = await seedUser({ name: "Jo Joiner" });
    const invite = await seedInvite({ tripId: trip.id, createdBy: owner.id });
    const commit = await holdOpen(
      (tx) => tx.$queryRaw`SELECT id FROM "Invite" WHERE id = ${invite.id} FOR UPDATE`,
    );
    actInTurn(joiner.id, owner.id);

    const accept = acceptInvite(invite.token);
    await untilBlocked(1, accept);
    const revoke = revokeInvite(invite.id);
    await untilBlocked(2, revoke);
    await commit();

    expect(await accept).toEqual({
      success: true,
      data: { tripId: trip.id, alreadyMember: false },
    });
    expect(await revoke).toEqual({ success: true, data: { id: invite.id } });
    // Revoking never removes people who already joined.
    expect(await roleOf(trip.id, joiner.id)).toBe("VIEWER");
    expect(
      (await prisma.invite.findUnique({ where: { id: invite.id } }))?.revokedAt,
    ).not.toBeNull();
  });
});

/**
 * Setup for the creator-cleanup races: the invite's creator hands ownership
 * to the editor, so the new owner can remove, demote, or watch the creator
 * depart — each of which revokes the creator's invite links.
 */
async function seedTransferredInvite() {
  const seed = await seedTripWithRoles();
  const joiner = await seedUser({ name: "Jo Joiner" });
  const invite = await seedInvite({
    tripId: seed.trip.id,
    createdBy: seed.owner.id,
  });
  actAs(seed.owner.id);
  expect((await transferOwnership(seed.trip.id, seed.editor.id)).success).toBe(
    true,
  );
  return { ...seed, joiner, invite };
}

const holdTrip = (tripId: string) =>
  holdOpen(
    (tx) => tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`,
  );

describe("invite acceptance racing creator cleanup", () => {
  it("removal queued first: cleanup revokes the link, acceptance is refused", async () => {
    const { trip, owner, editor, joiner, invite } =
      await seedTransferredInvite();
    const commit = await holdTrip(trip.id);
    actInTurn(editor.id, joiner.id);

    const removal = removeMember(trip.id, owner.id);
    await untilBlocked(1, removal);
    const accept = acceptInvite(invite.token);
    await untilBlocked(2, accept);
    await commit();

    expect(await removal).toEqual({ success: true, data: { userId: owner.id } });
    expect(await accept).toEqual({ success: false, error: REVOKED });
    expect(await roleOf(trip.id, joiner.id)).toBeNull();
  });

  it("acceptance queued first: the joined membership survives creator removal", async () => {
    const { trip, owner, editor, joiner, invite } =
      await seedTransferredInvite();
    const commit = await holdTrip(trip.id);
    actInTurn(joiner.id, editor.id);

    const accept = acceptInvite(invite.token);
    await untilBlocked(1, accept);
    const removal = removeMember(trip.id, owner.id);
    await untilBlocked(2, removal);
    await commit();

    expect(await accept).toEqual({
      success: true,
      data: { tripId: trip.id, alreadyMember: false },
    });
    expect(await removal).toEqual({ success: true, data: { userId: owner.id } });
    expect(await roleOf(trip.id, joiner.id)).toBe("VIEWER");
    expect(
      (await prisma.invite.findUnique({ where: { id: invite.id } }))?.revokedAt,
    ).not.toBeNull();
  });

  it("departure queued first: cleanup revokes the link, acceptance is refused", async () => {
    const { trip, owner, joiner, invite } = await seedTransferredInvite();
    const commit = await holdTrip(trip.id);
    actInTurn(owner.id, joiner.id);

    const leave = outcomeOf(leaveTrip(trip.id));
    await untilBlocked(1, leave);
    const accept = acceptInvite(invite.token);
    await untilBlocked(2, accept);
    await commit();

    expect(await leave).toEqual({ redirectedTo: "/trips" });
    expect(await accept).toEqual({ success: false, error: REVOKED });
    expect(await roleOf(trip.id, joiner.id)).toBeNull();
  });

  it("acceptance queued first: the joined membership survives creator departure", async () => {
    const { trip, owner, joiner, invite } = await seedTransferredInvite();
    const commit = await holdTrip(trip.id);
    actInTurn(joiner.id, owner.id);

    const accept = acceptInvite(invite.token);
    await untilBlocked(1, accept);
    const leave = outcomeOf(leaveTrip(trip.id));
    await untilBlocked(2, leave);
    await commit();

    expect(await accept).toEqual({
      success: true,
      data: { tripId: trip.id, alreadyMember: false },
    });
    expect(await leave).toEqual({ redirectedTo: "/trips" });
    expect(await roleOf(trip.id, joiner.id)).toBe("VIEWER");
  });

  it("demotion queued first: cleanup revokes the link, acceptance is refused", async () => {
    const { trip, owner, editor, joiner, invite } =
      await seedTransferredInvite();
    const commit = await holdTrip(trip.id);
    actInTurn(editor.id, joiner.id);

    const demotion = setMemberRole(trip.id, owner.id, "VIEWER");
    await untilBlocked(1, demotion);
    const accept = acceptInvite(invite.token);
    await untilBlocked(2, accept);
    await commit();

    expect(await demotion).toEqual({
      success: true,
      data: { userId: owner.id, role: "VIEWER" },
    });
    expect(await accept).toEqual({ success: false, error: REVOKED });
    expect(await roleOf(trip.id, joiner.id)).toBeNull();
  });

  it("acceptance queued first: the joined membership survives creator demotion", async () => {
    const { trip, owner, editor, joiner, invite } =
      await seedTransferredInvite();
    const commit = await holdTrip(trip.id);
    actInTurn(joiner.id, editor.id);

    const accept = acceptInvite(invite.token);
    await untilBlocked(1, accept);
    const demotion = setMemberRole(trip.id, owner.id, "VIEWER");
    await untilBlocked(2, demotion);
    await commit();

    expect(await accept).toEqual({
      success: true,
      data: { tripId: trip.id, alreadyMember: false },
    });
    expect(await demotion).toEqual({
      success: true,
      data: { userId: owner.id, role: "VIEWER" },
    });
    expect(await roleOf(trip.id, joiner.id)).toBe("VIEWER");
  });

  // The original deadlock: acceptance parked mid-insert (its member row
  // waits on the joiner's User row) while removal, holding the trip lock,
  // reaches for the invite row. Serialized lock order (Trip, then Invite)
  // must let both complete — no 40P01, no generic failure.
  it("acceptance parked mid-insert still completes alongside creator removal", async () => {
    const { trip, owner, editor, joiner, invite } =
      await seedTransferredInvite();
    const releaseUser = await holdOpen(
      (tx) =>
        tx.$queryRaw`SELECT id FROM "User" WHERE id = ${joiner.id} FOR UPDATE`,
    );
    actInTurn(joiner.id, editor.id);

    const accept = acceptInvite(invite.token);
    await untilBlocked(1, accept);
    const removal = removeMember(trip.id, owner.id);
    await untilBlocked(2, removal);
    await releaseUser();

    expect(await accept).toEqual({
      success: true,
      data: { tripId: trip.id, alreadyMember: false },
    });
    expect(await removal).toEqual({ success: true, data: { userId: owner.id } });
    expect(await roleOf(trip.id, joiner.id)).toBe("VIEWER");
    expect(await ownerCount(trip.id)).toBe(1);
  }, 15_000);
});

describe("concurrent ownership transfers", () => {
  it("serializes: the first transfer wins, the second is rechecked and refused", async () => {
    const { trip, owner, editor, viewer } = await seedTripWithRoles();
    const commit = await holdOpen(
      (tx) => tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${trip.id} FOR UPDATE`,
    );
    actAs(owner.id);

    const first = transferOwnership(trip.id, editor.id);
    await untilBlocked(1, first);
    const second = transferOwnership(trip.id, viewer.id);
    await untilBlocked(2, second);
    await commit();

    expect(await first).toEqual({ success: true, data: { ownerId: editor.id } });
    expect(await second).toEqual({ success: false, error: OWNER_ONLY });
    expect(await roleOf(trip.id, editor.id)).toBe("OWNER");
    expect(await roleOf(trip.id, owner.id)).toBe("EDITOR");
    expect(await ownerCount(trip.id)).toBe(1);
  });
});

describe("ownership transfer racing removal or departure", () => {
  it("removal queued first: the transfer then finds no member", async () => {
    const { trip, owner, editor } = await seedTripWithRoles();
    const commit = await holdOpen(
      (tx) => tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${trip.id} FOR UPDATE`,
    );
    actAs(owner.id);

    const removal = removeMember(trip.id, editor.id);
    await untilBlocked(1, removal);
    const transfer = transferOwnership(trip.id, editor.id);
    await untilBlocked(2, transfer);
    await commit();

    expect(await removal).toEqual({ success: true, data: { userId: editor.id } });
    expect(await transfer).toEqual({ success: false, error: NOT_MEMBER });
    expect(await roleOf(trip.id, owner.id)).toBe("OWNER");
    expect(await ownerCount(trip.id)).toBe(1);
  });

  it("transfer queued first: the old owner can no longer remove the new owner", async () => {
    const { trip, owner, editor } = await seedTripWithRoles();
    const commit = await holdOpen(
      (tx) => tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${trip.id} FOR UPDATE`,
    );
    actAs(owner.id);

    const transfer = transferOwnership(trip.id, editor.id);
    await untilBlocked(1, transfer);
    const removal = removeMember(trip.id, editor.id);
    await untilBlocked(2, removal);
    await commit();

    expect(await transfer).toEqual({ success: true, data: { ownerId: editor.id } });
    expect(await removal).toEqual({ success: false, error: OWNER_ONLY });
    expect(await roleOf(trip.id, editor.id)).toBe("OWNER");
    expect(await ownerCount(trip.id)).toBe(1);
  });

  it("departure queued first: the transfer then finds no member", async () => {
    const { trip, owner, editor } = await seedTripWithRoles();
    const commit = await holdOpen(
      (tx) => tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${trip.id} FOR UPDATE`,
    );
    actInTurn(editor.id, owner.id);

    const leave = outcomeOf(leaveTrip(trip.id));
    await untilBlocked(1, leave);
    const transfer = transferOwnership(trip.id, editor.id);
    await untilBlocked(2, transfer);
    await commit();

    expect(await leave).toEqual({ redirectedTo: "/trips" });
    expect(await transfer).toEqual({ success: false, error: NOT_MEMBER });
    expect(await roleOf(trip.id, owner.id)).toBe("OWNER");
    expect(await ownerCount(trip.id)).toBe(1);
  });

  it("transfer queued first: the new owner cannot simply leave", async () => {
    const { trip, owner, editor } = await seedTripWithRoles();
    const commit = await holdOpen(
      (tx) => tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${trip.id} FOR UPDATE`,
    );
    actInTurn(owner.id, editor.id);

    const transfer = transferOwnership(trip.id, editor.id);
    await untilBlocked(1, transfer);
    const leave = outcomeOf(leaveTrip(trip.id));
    await untilBlocked(2, leave);
    await commit();

    expect(await transfer).toEqual({ success: true, data: { ownerId: editor.id } });
    expect(await leave).toEqual({
      returned: {
        success: false,
        error:
          "The owner can't leave the trip. Make someone else the owner first, or delete the trip.",
      },
    });
    expect(await roleOf(trip.id, editor.id)).toBe("OWNER");
    expect(await ownerCount(trip.id)).toBe(1);
  });
});
