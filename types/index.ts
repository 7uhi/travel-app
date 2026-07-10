/**
 * Frontend-facing types for the travel planner.
 *
 * These model the JSON-serialized shape your components receive across the
 * App Router server/client boundary: `DateTime` fields arrive as ISO 8601
 * strings and Prisma `Decimal` fields are assumed to be converted to plain
 * numbers before serialization (e.g. `trip.totalBudget?.toNumber()`).
 *
 * Server-side code (route handlers, server actions, data-access layers)
 * should prefer Prisma's generated types from `@prisma/client` instead.
 */

export interface User {
  id: string;
  email: string;
  name: string | null;
  /** ISO datetime string (set by Auth.js when the email is verified) */
  emailVerified: string | null;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TripRole = "OWNER" | "EDITOR" | "VIEWER";

/** Roles an invite link may grant — ownership is never granted via link. */
export type InviteRole = Exclude<TripRole, "OWNER">;

/** Returned by createInvite: a shareable link plus its terms. */
export interface InviteLink {
  url: string;
  token: string;
  role: InviteRole;
  /** ISO datetime */
  expiresAt: string;
}

export interface Trip {
  id: string;
  title: string;
  destination: string;
  /** ISO date string, e.g. "2026-08-01T00:00:00.000Z" */
  startDate: string;
  /** ISO date string */
  endDate: string;
  totalBudget: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TripMemberWithUser {
  id: string;
  role: TripRole;
  userId: string;
  tripId: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

export interface TripDay {
  id: string;
  /** ISO date string */
  date: string;
  tripId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  title: string;
  description: string | null;
  /** ISO datetime string */
  time: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  cost: number | null;
  tripDayId: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Composed shapes for typical queries                                  */
/* ------------------------------------------------------------------ */

/** Matches `prisma.tripDay.findMany({ include: { activities: true } })` after serialization. */
export interface TripDayWithActivities extends TripDay {
  activities: Activity[];
}

/** The full trip payload returned by getTripById, after serialization. */
export interface TripWithDays extends Trip {
  days: TripDayWithActivities[];
  members: TripMemberWithUser[];
}

/* ------------------------------------------------------------------ */
/* Create payloads (id/timestamps assigned by the database).            */
/* Nullable columns are also optional keys so form code can just        */
/* omit fields instead of passing explicit nulls.                       */
/* ------------------------------------------------------------------ */

export interface TripInput {
  title: string;
  destination: string;
  /** ISO date string (YYYY-MM-DD or full ISO) */
  startDate: string;
  /** ISO date string */
  endDate: string;
  totalBudget?: number | null;
}

export interface TripDayInput {
  /** ISO date string */
  date: string;
  tripId: string;
}

export interface ActivityInput {
  title: string;
  description?: string | null;
  /** ISO datetime string */
  time?: string | null;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  cost?: number | null;
  tripDayId: string;
}
