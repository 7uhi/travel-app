import type { ExpenseCategory, TripRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/*
 * Seed helpers write rows straight to the database, bypassing the server
 * actions under test, so every test can start from an exact state.
 */

const DAY_MS = 86_400_000;

const utcDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let sequence = 0;

export function seedUser(data: { name?: string; email?: string } = {}) {
  const n = ++sequence;
  return prisma.user.create({
    data: {
      name: data.name ?? `User ${n}`,
      email: data.email ?? `user-${n}@example.test`,
    },
  });
}

/** A fixed-date trip owned by `ownerId`, with one TripDay per date. */
export function seedTrip({
  ownerId,
  title = "Lisbon long weekend",
  startDate = "2030-06-01",
  days = 3,
  currency = "USD",
}: {
  ownerId: string;
  title?: string;
  startDate?: string;
  days?: number;
  currency?: string;
}) {
  const start = utcDate(startDate).getTime();
  const dates = Array.from({ length: days }, (_, i) => new Date(start + i * DAY_MS));
  return prisma.trip.create({
    data: {
      title,
      destination: "Lisbon, Portugal",
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      currency,
      days: { create: dates.map((date) => ({ date })) },
      members: { create: { userId: ownerId, role: "OWNER" } },
    },
    include: { days: { orderBy: { date: "asc" } } },
  });
}

/** A trip still picking its dates through the availability poll: a window, no days. */
export function seedPollTrip({
  ownerId,
  windowStart = "2030-07-01",
  windowEnd = "2030-07-31",
  durationDays = 4,
}: {
  ownerId: string;
  windowStart?: string;
  windowEnd?: string;
  durationDays?: number;
}) {
  return prisma.trip.create({
    data: {
      title: "Somewhere sunny",
      windowStart: utcDate(windowStart),
      windowEnd: utcDate(windowEnd),
      durationDays,
      members: { create: { userId: ownerId, role: "OWNER" } },
    },
  });
}

export function seedMember(tripId: string, userId: string, role: TripRole) {
  return prisma.tripMember.create({ data: { tripId, userId, role } });
}

/** A trip with one member per role, plus a signed-in user who isn't a member. */
export async function seedTripWithRoles({ currency = "USD" }: { currency?: string } = {}) {
  const [owner, editor, viewer, outsider] = await Promise.all([
    seedUser({ name: "Olivia Owner" }),
    seedUser({ name: "Eddie Editor" }),
    seedUser({ name: "Vera Viewer" }),
    seedUser({ name: "Oscar Outsider" }),
  ]);
  const trip = await seedTrip({ ownerId: owner.id, currency });
  await seedMember(trip.id, editor.id, "EDITOR");
  await seedMember(trip.id, viewer.id, "VIEWER");
  return { trip, owner, editor, viewer, outsider };
}

/** seedTripWithRoles where the owner paid $30 split three ways: the editor and the viewer each owe $10. */
export async function seedSharedDinner() {
  const seed = await seedTripWithRoles();
  const dinner = await seedExpense({
    tripId: seed.trip.id,
    paidById: seed.owner.id,
    splits: [seed.owner, seed.editor, seed.viewer].map((u) => ({ userId: u.id, amountCents: 1000 })),
  });
  return { ...seed, dinner };
}

export function seedActivity(tripDayId: string, title = "Tram 28 ride") {
  return prisma.activity.create({ data: { tripDayId, title } });
}

export function seedExpense({
  tripId,
  paidById,
  splits,
  description = "Dinner",
  category = "FOOD",
  date = "2030-06-01",
  currency = "USD",
}: {
  tripId: string;
  paidById: string;
  splits: { userId: string; amountCents: number }[];
  description?: string;
  category?: ExpenseCategory;
  date?: string;
  currency?: string;
}) {
  return prisma.expense.create({
    data: {
      tripId,
      paidById,
      description,
      category,
      amountCents: splits.reduce((sum, s) => sum + s.amountCents, 0),
      currency,
      date: utcDate(date),
      splits: { create: splits },
    },
    include: { splits: true },
  });
}

export function seedSettlement(data: {
  tripId: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  createdById: string;
}) {
  return prisma.settlement.create({ data });
}

export function seedInvite({
  tripId,
  createdBy,
  role = "VIEWER",
  expiresAt = new Date(Date.now() + 7 * DAY_MS),
  revokedAt = null,
  token = `invite-${++sequence}`,
}: {
  tripId: string;
  createdBy: string;
  role?: TripRole;
  expiresAt?: Date;
  revokedAt?: Date | null;
  token?: string;
}) {
  return prisma.invite.create({
    data: { tripId, createdBy, role, expiresAt, revokedAt, token },
  });
}

export function seedPackingTemplate(tripId: string, items: string[]) {
  return prisma.packingTemplate.create({
    data: {
      tripId,
      name: "Beach bag",
      items: { create: items.map((name) => ({ name, category: "OTHER" as const })) },
    },
  });
}
