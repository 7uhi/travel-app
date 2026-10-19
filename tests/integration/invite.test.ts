import { describe, expect, it } from "vitest";

import {
  acceptInvite,
  acceptInviteFromForm,
  createInvite,
  getInvitePreview,
  getTripInvites,
  revokeInvite,
} from "@/actions/invite";
import { prisma } from "@/lib/prisma";
import type { InviteRole } from "@/types";

import { seedInvite, seedTripWithRoles, seedUser } from "./factories";
import { actAs } from "./helpers";

function joinForm(token: string) {
  const form = new FormData();
  form.set("token", token);
  return form;
}

describe("createInvite", () => {
  it.each(["EDITOR", "VIEWER"] as const)("lets the owner create a %s link", async (role) => {
    const { trip, owner } = await seedTripWithRoles();
    actAs(owner.id);

    const result = await createInvite(trip.id, role);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.role).toBe(role);
    expect(result.data.url).toBe(`http://localhost:3000/invite/${result.data.token}`);
    const ttlDays = (Date.parse(result.data.expiresAt) - Date.now()) / 86_400_000;
    expect(ttlDays).toBeGreaterThan(6.99);
    expect(ttlDays).toBeLessThanOrEqual(7);
    expect(await prisma.invite.findUnique({ where: { token: result.data.token } })).toMatchObject({
      tripId: trip.id,
      role,
      createdBy: owner.id,
    });
  });

  it.each([
    ["editor", "Only the trip owner can create invites."],
    ["viewer", "Only the trip owner can create invites."],
    ["outsider", "Trip not found."],
  ] as const)("refuses the %s", async (role, error) => {
    const seed = await seedTripWithRoles();
    actAs(seed[role].id);

    expect(await createInvite(seed.trip.id, "VIEWER")).toEqual({ success: false, error });
    expect(await prisma.invite.count()).toBe(0);
  });

  it("never grants ownership", async () => {
    const { trip, owner } = await seedTripWithRoles();
    actAs(owner.id);

    expect(await createInvite(trip.id, "OWNER" as InviteRole)).toEqual({
      success: false,
      error: "Invites can only grant the editor or viewer role.",
    });
  });
});

describe("getTripInvites", () => {
  it("shows the owner every link that still admits people", async () => {
    const { trip, owner, editor } = await seedTripWithRoles();
    const mine = await seedInvite({ tripId: trip.id, createdBy: owner.id, role: "EDITOR" });
    const fromBefore = await seedInvite({ tripId: trip.id, createdBy: editor.id });
    await seedInvite({ tripId: trip.id, createdBy: owner.id, revokedAt: new Date() });
    await seedInvite({ tripId: trip.id, createdBy: owner.id, expiresAt: new Date(Date.now() - 1000) });
    await seedInvite({ tripId: trip.id, createdBy: owner.id, role: "OWNER" });
    actAs(owner.id);

    const result = await getTripInvites(trip.id);

    if (!result.success) throw new Error(result.error);
    expect(result.data).toHaveLength(2);
    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: mine.id,
          role: "EDITOR",
          url: `http://localhost:3000/invite/${mine.token}`,
          createdBy: expect.objectContaining({ id: owner.id }),
          canRevoke: true,
        }),
        expect.objectContaining({
          id: fromBefore.id,
          role: "VIEWER",
          createdBy: expect.objectContaining({ id: editor.id }),
          canRevoke: true,
        }),
      ]),
    );
  });

  it.each([
    ["editor", "Only the trip owner can see invite links."],
    ["viewer", "Only the trip owner can see invite links."],
    ["outsider", "Trip not found."],
  ] as const)("refuses the %s", async (who, error) => {
    const seed = await seedTripWithRoles();
    await seedInvite({ tripId: seed.trip.id, createdBy: seed.owner.id });
    actAs(seed[who].id);

    expect(await getTripInvites(seed.trip.id)).toEqual({ success: false, error });
  });
});

describe("revokeInvite", () => {
  it.each([
    ["the owner", "owner", "editor"],
    ["the editor who created it", "editor", "editor"],
  ] as const)("lets %s turn a link off", async (_, actor, creator) => {
    const seed = await seedTripWithRoles();
    const invite = await seedInvite({ tripId: seed.trip.id, createdBy: seed[creator].id });
    actAs(seed[actor].id);

    expect(await revokeInvite(invite.id)).toEqual({ success: true, data: { id: invite.id } });
    expect(await prisma.invite.findUnique({ where: { id: invite.id } })).toMatchObject({
      revokedAt: expect.any(Date),
    });
  });

  it.each([
    ["another editor", "editor", "Only the trip owner or whoever created this link can revoke it."],
    ["a viewer", "viewer", "Only the trip owner or whoever created this link can revoke it."],
    ["a non-member", "outsider", "Invite not found."],
  ] as const)("refuses %s", async (_, actor, error) => {
    const seed = await seedTripWithRoles();
    const invite = await seedInvite({ tripId: seed.trip.id, createdBy: seed.owner.id });
    actAs(seed[actor].id);

    expect(await revokeInvite(invite.id)).toEqual({ success: false, error });
    expect(await prisma.invite.findUnique({ where: { id: invite.id } })).toMatchObject({
      revokedAt: null,
    });
  });

  it("keeps the people who already joined and the original revocation time", async () => {
    const { trip, owner } = await seedTripWithRoles();
    const invite = await seedInvite({ tripId: trip.id, createdBy: owner.id });
    const joiner = await seedUser();
    actAs(joiner.id);
    expect(await acceptInvite(invite.token)).toMatchObject({ success: true });
    actAs(owner.id);

    expect(await revokeInvite(invite.id)).toMatchObject({ success: true });
    const { revokedAt } = await prisma.invite.findUniqueOrThrow({ where: { id: invite.id } });
    expect(await revokeInvite(invite.id)).toMatchObject({ success: true });

    expect(await prisma.invite.findUnique({ where: { id: invite.id } })).toMatchObject({ revokedAt });
    expect(await prisma.tripMember.count({ where: { tripId: trip.id, userId: joiner.id } })).toBe(1);
  });
});

describe("getInvitePreview", () => {
  it("describes the invitation without adding the reader to the trip", async () => {
    const { trip, owner } = await seedTripWithRoles();
    const invite = await seedInvite({ tripId: trip.id, createdBy: owner.id, role: "EDITOR" });
    const newcomer = await seedUser();
    actAs(newcomer.id);

    expect(await getInvitePreview(invite.token)).toMatchObject({
      success: true,
      data: {
        tripId: trip.id,
        tripTitle: trip.title,
        role: "EDITOR",
        invitedBy: "Olivia Owner",
        memberCount: 3,
        alreadyMember: false,
      },
    });
    expect(await prisma.tripMember.count({ where: { userId: newcomer.id } })).toBe(0);
  });

  it("tells an existing member they're already on the trip", async () => {
    const { trip, owner, viewer } = await seedTripWithRoles();
    const invite = await seedInvite({ tripId: trip.id, createdBy: owner.id });
    actAs(viewer.id);

    expect(await getInvitePreview(invite.token)).toMatchObject({
      success: true,
      data: { alreadyMember: true },
    });
  });
});

describe("invite links that must not open", () => {
  it.each([
    ["an OWNER-role invite", { role: "OWNER" as const }, "This invite link is invalid."],
    [
      "an expired invite",
      { expiresAt: new Date(Date.now() - 1000) },
      "This invite link has expired. Ask for a new one.",
    ],
    [
      "a revoked invite",
      { revokedAt: new Date() },
      "This invite link was revoked, so it can't be used to join anymore. Ask whoever shared it for a new one.",
    ],
  ])("rejects %s in both the preview and the join", async (_, overrides, error) => {
    const { trip, owner } = await seedTripWithRoles();
    const invite = await seedInvite({ tripId: trip.id, createdBy: owner.id, ...overrides });
    const newcomer = await seedUser();
    actAs(newcomer.id);

    expect(await getInvitePreview(invite.token)).toEqual({ success: false, error });
    expect(await acceptInvite(invite.token)).toEqual({ success: false, error });
    expect(await prisma.tripMember.count({ where: { userId: newcomer.id } })).toBe(0);
  });

  it("rejects an unknown token", async () => {
    actAs((await seedUser()).id);

    expect(await getInvitePreview("no-such-token")).toEqual({
      success: false,
      error: "This invite link is invalid.",
    });
  });
});

describe("acceptInvite", () => {
  it("adds a new member with the link's role", async () => {
    const { trip, owner } = await seedTripWithRoles();
    const invite = await seedInvite({ tripId: trip.id, createdBy: owner.id, role: "EDITOR" });
    const newcomer = await seedUser();
    actAs(newcomer.id);

    expect(await acceptInvite(invite.token)).toEqual({
      success: true,
      data: { tripId: trip.id, alreadyMember: false },
    });
    expect(
      await prisma.tripMember.findUnique({
        where: { userId_tripId: { userId: newcomer.id, tripId: trip.id } },
      }),
    ).toMatchObject({ role: "EDITOR" });
  });

  it("never downgrades an existing member", async () => {
    const { trip, owner } = await seedTripWithRoles();
    const invite = await seedInvite({ tripId: trip.id, createdBy: owner.id, role: "VIEWER" });
    actAs(owner.id);

    expect(await acceptInvite(invite.token)).toEqual({
      success: true,
      data: { tripId: trip.id, alreadyMember: true },
    });
    expect(
      await prisma.tripMember.findUnique({
        where: { userId_tripId: { userId: owner.id, tripId: trip.id } },
      }),
    ).toMatchObject({ role: "OWNER" });
  });
});

describe("acceptInviteFromForm", () => {
  it("sends a new member to the trip's preference deck", async () => {
    const { trip, owner } = await seedTripWithRoles();
    const invite = await seedInvite({ tripId: trip.id, createdBy: owner.id });
    actAs((await seedUser()).id);

    await expect(acceptInviteFromForm(null, joinForm(invite.token))).rejects.toMatchObject({
      url: `/trips/${trip.id}/preferences/onboarding`,
    });
  });

  it("sends an existing member straight to the trip", async () => {
    const { trip, owner, editor } = await seedTripWithRoles();
    const invite = await seedInvite({ tripId: trip.id, createdBy: owner.id });
    actAs(editor.id);

    await expect(acceptInviteFromForm(null, joinForm(invite.token))).rejects.toMatchObject({
      url: `/trips/${trip.id}`,
    });
  });

  it("returns the error for the form to show", async () => {
    actAs((await seedUser()).id);

    expect(await acceptInviteFromForm(null, joinForm("no-such-token"))).toBe(
      "This invite link is invalid.",
    );
  });
});
