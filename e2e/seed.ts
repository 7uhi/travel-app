import { randomUUID } from "node:crypto";

import type { PrismaClient } from "../generated/prisma/client";

export const USERS = {
  owner: { id: "e2e-owner", name: "Olivia Owner", email: "owner@e2e.test" },
  editor: { id: "e2e-editor", name: "Eddie Editor", email: "editor@e2e.test" },
  viewer: { id: "e2e-viewer", name: "Vera Viewer", email: "viewer@e2e.test" },
  outsider: { id: "e2e-outsider", name: "Oscar Outsider", email: "outsider@e2e.test" },
} as const;

export type SeededUser = keyof typeof USERS;

export const TRIP = {
  id: "e2e-trip",
  title: "Lisbon long weekend",
  destination: "Lisbon, Portugal",
  activity: "Pastéis de Belém tasting",
} as const;

/** A multi-use editor invite to TRIP from its owner. */
export const INVITE_TOKEN = "e2e-editor-invite";

const utcDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  // An existing travel profile keeps /trips from redirecting to /onboarding.
  await Promise.all(
    Object.values(USERS).map((user) =>
      prisma.user.create({ data: { ...user, travelProfile: { create: {} } } }),
    ),
  );

  await prisma.trip.create({
    data: {
      id: TRIP.id,
      title: TRIP.title,
      destination: TRIP.destination,
      startDate: utcDate("2030-06-01"),
      endDate: utcDate("2030-06-03"),
      days: {
        create: [
          { date: utcDate("2030-06-01"), activities: { create: { title: TRIP.activity } } },
          { date: utcDate("2030-06-02") },
          { date: utcDate("2030-06-03") },
        ],
      },
      members: {
        create: [
          { userId: USERS.owner.id, role: "OWNER" },
          { userId: USERS.editor.id, role: "EDITOR" },
          { userId: USERS.viewer.id, role: "VIEWER" },
        ],
      },
      invites: {
        create: {
          token: INVITE_TOKEN,
          role: "EDITOR",
          createdBy: USERS.owner.id,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
      },
    },
  });
}

/** A brand-new user with a unique id, for tests that change what a user belongs to. */
export async function createUser(prisma: PrismaClient, name: string) {
  const id = `e2e-${randomUUID()}`;
  const user = await prisma.user.create({
    data: { id, name, email: `${id}@e2e.test`, travelProfile: { create: {} } },
  });
  return { ...user, name };
}

/**
 * A trip of its own, so a test that changes it can't disturb other tests or a
 * retry: the host paid $30 for dinner split three ways, so the editor and the
 * viewer each owe the host $10.
 */
export async function seedSharedDinner(db: PrismaClient) {
  const [host, editor, viewer] = await Promise.all([
    createUser(db, "Hana Host"),
    createUser(db, "Eli Editor"),
    createUser(db, "Val Viewer"),
  ]);
  const trip = await db.trip.create({
    data: {
      title: "Porto food tour",
      startDate: new Date("2030-09-10T00:00:00.000Z"),
      endDate: new Date("2030-09-10T00:00:00.000Z"),
      days: { create: { date: new Date("2030-09-10T00:00:00.000Z") } },
      members: {
        create: [
          { userId: host.id, role: "OWNER" },
          { userId: editor.id, role: "EDITOR" },
          { userId: viewer.id, role: "VIEWER" },
        ],
      },
      expenses: {
        create: {
          description: "Dinner",
          amountCents: 3000,
          currency: "USD",
          date: new Date("2030-09-10T00:00:00.000Z"),
          paidById: host.id,
          splits: {
            create: [host, editor, viewer].map((u) => ({ userId: u.id, amountCents: 1000 })),
          },
        },
      },
    },
  });
  return { trip, host, editor, viewer };
}
