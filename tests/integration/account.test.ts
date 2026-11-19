import { describe, expect, it, vi } from "vitest";

import { deleteMyAccount, getAccountDeletionPlan } from "@/actions/account";
import { getTripBalances } from "@/actions/expense";
import { acceptInvite } from "@/actions/invite";
import { saveMyProfile } from "@/actions/preferences";
import { createTrip } from "@/actions/trip";
import { ACCOUNT_DELETED, DELETED_USER_NAME, isActiveUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";

import {
  seedExpense,
  seedInvite,
  seedMember,
  seedSettlement,
  seedSharedDinner,
  seedTrip,
  seedTripWithRoles,
  seedUser,
} from "./factories";
import { actAs, holdOpen, outcomeOf, untilBlocked } from "./helpers";

// signOut clears the cookie and redirects; here it just throws the redirect.
vi.mock("@/auth", async () => {
  const { Redirect } = await import("./helpers");
  return {
    signOut: vi.fn(async ({ redirectTo }: { redirectTo: string }) => {
      throw new Redirect(redirectTo);
    }),
  };
});

const DELETED_REDIRECT = { redirectedTo: "/?accountDeleted=1" };

async function userRow(id: string) {
  return prisma.user.findUniqueOrThrow({ where: { id } });
}

/** Simulates an account deletion caught mid-commit: holds the User row, marked deleted. */
function deletionInProgress(userId: string) {
  return holdOpen(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    await tx.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
  });
}

describe("deleteMyAccount", () => {
  it("refuses signed-out callers and a wrong confirmation, changing nothing", async () => {
    const user = await seedUser();
    const trip = await seedTrip({ ownerId: user.id });

    actAs(null);
    expect(await deleteMyAccount("DELETE")).toEqual({
      success: false,
      error: "You must be signed in to delete your account.",
    });

    actAs(user.id);
    for (const typed of ["", "delete", "DELETE MY ACCOUNT"]) {
      expect(await deleteMyAccount(typed)).toEqual({
        success: false,
        error: "Type DELETE to confirm.",
      });
    }

    expect((await userRow(user.id)).deletedAt).toBeNull();
    expect(await prisma.trip.findUnique({ where: { id: trip.id } })).not.toBeNull();
  });

  it("is refused while the person owns a trip other people are on", async () => {
    const { owner, trip } = await seedTripWithRoles();
    actAs(owner.id);

    expect(await deleteMyAccount("DELETE")).toEqual({
      success: false,
      error:
        "Your account can't be deleted yet. You own “Lisbon long weekend”, which has other members. Make someone else the owner, or delete the trip.",
    });
    expect((await userRow(owner.id)).deletedAt).toBeNull();
    expect(await prisma.tripMember.count({ where: { tripId: trip.id } })).toBe(3);
  });

  it("is refused while the person owes or is owed money, as leaving is", async () => {
    // The owner paid $30 three ways: the viewer owes $10.
    const { viewer, trip } = await seedSharedDinner();
    actAs(viewer.id);

    expect(await deleteMyAccount("DELETE")).toEqual({
      success: false,
      error:
        "Your account can't be deleted yet. You still owe $10.00 on “Lisbon long weekend”. Record your repayments there first.",
    });
    expect(
      await prisma.tripMember.findUnique({
        where: { userId_tripId: { userId: viewer.id, tripId: trip.id } },
      }),
    ).not.toBeNull();
  });

  it("deletes solo trips, leaves the rest, and anonymizes the account without touching anyone's balances", async () => {
    const { owner, editor, viewer, trip, dinner } = await seedSharedDinner();
    // The viewer has paid the owner back, so they're settled.
    await seedSettlement({
      tripId: trip.id,
      fromUserId: viewer.id,
      toUserId: owner.id,
      amountCents: 1000,
      createdById: viewer.id,
    });
    const solo = await seedTrip({ ownerId: viewer.id, title: "Solo hike" });
    const idea = await prisma.activityIdea.create({
      data: { tripId: trip.id, title: "Fado night", createdById: viewer.id },
    });
    await prisma.activityVote.create({ data: { ideaId: idea.id, userId: viewer.id } });
    await prisma.availabilityDay.create({
      data: { tripId: trip.id, userId: viewer.id, date: new Date("2030-06-01") },
    });
    await prisma.tripPreference.create({
      data: { tripId: trip.id, userId: viewer.id, mustDo: "Pastéis de nata" },
    });
    const personal = await prisma.packingItem.create({
      data: { tripId: trip.id, name: "Toothbrush", ownerId: viewer.id },
    });
    const claimed = await prisma.packingItem.create({
      data: { tripId: trip.id, name: "Speaker", assigneeId: viewer.id },
    });
    const invite = await seedInvite({ tripId: trip.id, createdBy: viewer.id });
    await prisma.travelProfile.create({
      data: {
        userId: viewer.id,
        dietaryNotes: "Peanut allergy",
        interests: { create: { tag: "FOOD", weight: 2 } },
      },
    });
    await prisma.account.create({
      data: {
        userId: viewer.id,
        type: "oidc",
        provider: "google",
        providerAccountId: "google-viewer",
      },
    });
    await prisma.session.create({
      data: { userId: viewer.id, sessionToken: "viewer-session", expires: new Date(Date.now() + 86_400_000) },
    });
    await prisma.user.update({
      where: { id: viewer.id },
      data: { image: "https://lh3.googleusercontent.com/viewer" },
    });
    const originalEmail = viewer.email;

    actAs(owner.id);
    const balancesBefore = await getTripBalances(trip.id);

    actAs(viewer.id);
    expect(await getAccountDeletionPlan()).toEqual({
      success: true,
      data: {
        blockers: [],
        tripsToDelete: [{ id: solo.id, title: "Solo hike" }],
        tripsToLeave: [{ id: trip.id, title: "Lisbon long weekend" }],
      },
    });
    expect(await outcomeOf(deleteMyAccount(" DELETE "))).toEqual(DELETED_REDIRECT);

    // Solo trip gone; shared trip left with leaveTrip's cleanup.
    expect(await prisma.trip.findUnique({ where: { id: solo.id } })).toBeNull();
    expect(
      await prisma.tripMember.findMany({ where: { tripId: trip.id }, select: { userId: true } }),
    ).toEqual(expect.not.arrayContaining([{ userId: viewer.id }]));
    expect(await prisma.availabilityDay.count({ where: { userId: viewer.id } })).toBe(0);
    expect(await prisma.tripPreference.count({ where: { userId: viewer.id } })).toBe(0);
    expect(await prisma.activityVote.count({ where: { userId: viewer.id } })).toBe(0);
    expect(await prisma.packingItem.findUnique({ where: { id: personal.id } })).toBeNull();
    expect((await prisma.packingItem.findUniqueOrThrow({ where: { id: claimed.id } })).assigneeId).toBeNull();
    expect((await prisma.invite.findUniqueOrThrow({ where: { id: invite.id } })).revokedAt).not.toBeNull();

    // Everything personal on the account is gone.
    expect(await prisma.travelProfile.count({ where: { userId: viewer.id } })).toBe(0);
    expect(await prisma.travelInterest.count()).toBe(0);
    expect(await prisma.account.count({ where: { userId: viewer.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: viewer.id } })).toBe(0);
    const tombstone = await userRow(viewer.id);
    expect(tombstone).toMatchObject({
      name: DELETED_USER_NAME,
      email: `deleted-${viewer.id}@deleted.invalid`,
      image: null,
      emailVerified: null,
    });
    expect(tombstone.deletedAt).toBeInstanceOf(Date);

    // The money history and the idea stay, credited to "Former member".
    expect(await prisma.expense.findUnique({ where: { id: dinner.id } })).not.toBeNull();
    expect(await prisma.expenseSplit.count({ where: { userId: viewer.id } })).toBe(1);
    expect(await prisma.settlement.count({ where: { fromUserId: viewer.id } })).toBe(1);
    expect((await prisma.activityIdea.findUniqueOrThrow({ where: { id: idea.id } })).createdById).toBe(
      viewer.id,
    );
    actAs(owner.id);
    const balancesAfter = await getTripBalances(trip.id);
    expect(balancesAfter.success && balancesBefore.success).toBe(true);
    if (!balancesAfter.success || !balancesBefore.success) return;
    const net = (b: typeof balancesAfter.data) =>
      Object.fromEntries(b.members.map((m) => [m.userId, m.netCents]));
    // The settled viewer drops off the panel, as anyone who leaves does;
    // everyone else's figures are exactly what they were.
    const { [viewer.id]: viewerBefore, ...othersBefore } = net(balancesBefore.data);
    expect(viewerBefore).toBe(0);
    expect(net(balancesAfter.data)).toEqual(othersBefore);
    expect(net(balancesAfter.data)).toEqual({ [owner.id]: 1000, [editor.id]: -1000 });

    // Sessions are refused, and the real email can sign up again.
    expect(await isActiveUser(viewer.id)).toBe(false);
    expect(await isActiveUser(owner.id)).toBe(true);
    expect(await isActiveUser("no-such-user")).toBe(false);
    await expect(prisma.user.create({ data: { email: originalEmail } })).resolves.toBeTruthy();
  });

  it("treats a repeated submit after the deletion committed as done", async () => {
    const user = await seedUser();
    actAs(user.id);

    expect(await outcomeOf(deleteMyAccount("DELETE"))).toEqual(DELETED_REDIRECT);
    const deletedAt = (await userRow(user.id)).deletedAt;
    expect(await outcomeOf(deleteMyAccount("DELETE"))).toEqual(DELETED_REDIRECT);
    expect((await userRow(user.id)).deletedAt).toEqual(deletedAt);
  });
});

describe("getAccountDeletionPlan", () => {
  it("lists every blocker with its reason, and nothing is deleted", async () => {
    const user = await seedUser();
    const other = await seedUser();
    // Owns a shared trip.
    const owned = await seedTrip({ ownerId: user.id, title: "A owned" });
    await seedMember(owned.id, other.id, "EDITOR");
    // Is owed $15 on another.
    const owedTrip = await seedTrip({ ownerId: other.id, title: "B owed" });
    await seedMember(owedTrip.id, user.id, "EDITOR");
    await seedExpense({
      tripId: owedTrip.id,
      paidById: user.id,
      splits: [
        { userId: user.id, amountCents: 1500 },
        { userId: other.id, amountCents: 1500 },
      ],
    });
    // A solo trip and a settled shared trip are fine.
    const solo = await seedTrip({ ownerId: user.id, title: "C solo" });
    const settled = await seedTrip({ ownerId: other.id, title: "D settled" });
    await seedMember(settled.id, user.id, "VIEWER");

    actAs(user.id);
    const plan = await getAccountDeletionPlan();
    expect(plan).toEqual({
      success: true,
      data: {
        blockers: [
          expect.objectContaining({ tripId: owned.id, reason: "owner", amount: null }),
          expect.objectContaining({ tripId: owedTrip.id, reason: "owed", amount: "$15.00" }),
        ],
        tripsToDelete: [{ id: solo.id, title: "C solo" }],
        tripsToLeave: [{ id: settled.id, title: "D settled" }],
      },
    });

    const result = await deleteMyAccount("DELETE");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("You own “A owned”");
    expect(result.error).toContain("You're still owed $15.00 on “B owed”");
    expect(await prisma.trip.findUnique({ where: { id: solo.id } })).not.toBeNull();
    expect((await userRow(user.id)).deletedAt).toBeNull();
  });

  it("requires a session", async () => {
    actAs(null);
    expect(await getAccountDeletionPlan()).toEqual({
      success: false,
      error: "You must be signed in to manage your account.",
    });
  });
});

describe("account deletion races", () => {
  it("an invite accepted while the deletion commits can't add the deleted account to the trip", async () => {
    const { owner, trip } = await seedTripWithRoles();
    const joiner = await seedUser();
    const invite = await seedInvite({ tripId: trip.id, createdBy: owner.id });

    const commit = await deletionInProgress(joiner.id);
    actAs(joiner.id);
    const accept = acceptInvite(invite.token);
    await untilBlocked(1, accept);
    await commit();

    expect(await accept).toEqual({ success: false, error: ACCOUNT_DELETED });
    expect(
      await prisma.tripMember.findUnique({
        where: { userId_tripId: { userId: joiner.id, tripId: trip.id } },
      }),
    ).toBeNull();
  });

  it("a trip created while the deletion commits is refused", async () => {
    const user = await seedUser();

    const commit = await deletionInProgress(user.id);
    actAs(user.id);
    const create = createTrip({ title: "Kyoto", startDate: "2030-04-01", endDate: "2030-04-03" });
    await untilBlocked(1, create);
    await commit();

    expect(await create).toEqual({ success: false, error: ACCOUNT_DELETED });
    expect(await prisma.tripMember.count({ where: { userId: user.id } })).toBe(0);
  });

  it("a travel profile saved while the deletion commits is refused", async () => {
    const user = await seedUser();

    const commit = await deletionInProgress(user.id);
    actAs(user.id);
    const save = saveMyProfile({ pace: "RELAXED" });
    await untilBlocked(1, save);
    await commit();

    expect(await save).toEqual({ success: false, error: ACCOUNT_DELETED });
    expect(await prisma.travelProfile.count({ where: { userId: user.id } })).toBe(0);
  });

  it("a trip joined mid-deletion makes the deletion stop and change nothing", async () => {
    const user = await seedUser();
    const other = await seedUser();
    const solo = await seedTrip({ ownerId: user.id, title: "Solo" });
    const joined = await seedTrip({ ownerId: other.id, title: "Joined" });

    // A membership insert holds a key-share lock on the User row until commit.
    const commit = await holdOpen((tx) =>
      tx.tripMember.create({ data: { tripId: joined.id, userId: user.id, role: "VIEWER" } }),
    );
    actAs(user.id);
    const deletion = outcomeOf(deleteMyAccount("DELETE"));
    await untilBlocked(1, deletion);
    await commit();

    expect(await deletion).toEqual({
      returned: {
        success: false,
        error: "Your trips changed while your account was being deleted. Please try again.",
      },
    });
    expect((await userRow(user.id)).deletedAt).toBeNull();
    expect(await prisma.trip.findUnique({ where: { id: solo.id } })).not.toBeNull();
  });
});
