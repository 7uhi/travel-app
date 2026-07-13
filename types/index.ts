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
  /** ISO date string, e.g. "2026-08-01T00:00:00.000Z"; null while the group is still picking dates */
  startDate: string | null;
  /** ISO date string; null while the group is still picking dates */
  endDate: string | null;
  /** Availability-poll candidate window (ISO date); null when dates were fixed at creation */
  windowStart: string | null;
  windowEnd: string | null;
  /** Desired trip length in days for the availability poll */
  durationDays: number | null;
  totalBudget: number | null;
  /** ISO 4217 code; all expenses on the trip use this currency. */
  currency: string;
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

/** Compact card data returned by getMyTrips. */
export interface TripSummary {
  id: string;
  title: string;
  destination: string;
  /** ISO date string; null while the group is still picking dates */
  startDate: string | null;
  /** ISO date string; null while the group is still picking dates */
  endDate: string | null;
  /** The requesting user's role on this trip. */
  role: TripRole;
  memberCount: number;
  dayCount: number;
}

/** The full trip payload returned by getTripById, after serialization. */
export interface TripWithDays extends Trip {
  days: TripDayWithActivities[];
  members: TripMemberWithUser[];
}

/* ------------------------------------------------------------------ */
/* Availability poll — collaborative date-picking                       */
/* ------------------------------------------------------------------ */

/** One member-day a member has marked themselves available. */
export interface AvailabilityEntry {
  userId: string;
  /** ISO date string at UTC midnight */
  date: string;
}

/** A candidate set of trip dates ranked by member overlap. */
export interface SuggestedWindow {
  /** ISO date string */
  startDate: string;
  /** ISO date string, inclusive */
  endDate: string;
  /** Members available on every day of the window */
  availableUserIds: string[];
  unavailableUserIds: string[];
}

/** Returned by getTripAvailability. */
export interface TripAvailability {
  windowStart: string | null;
  windowEnd: string | null;
  durationDays: number | null;
  /** Every member's marked-available days. */
  entries: AvailabilityEntry[];
  suggestions: SuggestedWindow[];
}

/* ------------------------------------------------------------------ */
/* Expense splitting — all money as integer cents                       */
/* ------------------------------------------------------------------ */

export type ExpenseCategory =
  | "FOOD"
  | "TRANSPORT"
  | "LODGING"
  | "ACTIVITY"
  | "SHOPPING"
  | "OTHER";

export type SplitInput =
  | { mode: "EQUAL"; participantIds: string[] }
  | { mode: "EXACT"; shares: { userId: string; amountCents: number }[] }
  | { mode: "PERCENT"; shares: { userId: string; percent: number }[] };

export interface ExpenseInput {
  description: string;
  amountCents: number;
  category: ExpenseCategory;
  /** ISO date */
  date: string;
  /** Defaults to the signed-in user; must be a trip member. */
  paidById?: string;
  split: SplitInput;
}

export interface ExpenseWithDetails {
  id: string;
  tripId: string;
  description: string;
  amountCents: number;
  currency: string;
  category: ExpenseCategory;
  /** ISO date */
  date: string;
  createdAt: string;
  paidBy: { id: string; name: string | null; image: string | null };
  splits: {
    userId: string;
    amountCents: number;
    user: { id: string; name: string | null; image: string | null };
  }[];
}

export interface SettlementRecord {
  id: string;
  tripId: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  /** ISO datetime */
  date: string;
}

export interface MemberBalance {
  userId: string;
  name: string | null;
  image: string | null;
  /** Positive = is owed money; negative = owes money. */
  netCents: number;
}

export interface SuggestedPayment {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

export interface TripBalances {
  currency: string;
  members: MemberBalance[];
  suggestedPayments: SuggestedPayment[];
}

/* ------------------------------------------------------------------ */
/* Create payloads (id/timestamps assigned by the database).            */
/* Nullable columns are also optional keys so form code can just        */
/* omit fields instead of passing explicit nulls.                       */
/* ------------------------------------------------------------------ */

/**
 * Exactly one of the two modes must be provided: fixed dates
 * (startDate + endDate) or an availability poll (windowStart + windowEnd +
 * durationDays).
 */
export interface TripInput {
  title: string;
  destination: string;
  /** ISO date string (YYYY-MM-DD or full ISO) */
  startDate?: string;
  /** ISO date string */
  endDate?: string;
  /** ISO date string — first day members can mark availability on */
  windowStart?: string;
  /** ISO date string — last day of the poll window */
  windowEnd?: string;
  /** Desired trip length in days */
  durationDays?: number;
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

/* ------------------------------------------------------------------ */
/* Packing list — one shared checklist per trip                         */
/* ------------------------------------------------------------------ */

export type PackingCategory =
  | "GEAR"
  | "CLOTHING"
  | "TOILETRIES"
  | "ELECTRONICS"
  | "DOCUMENTS"
  | "FOOD"
  | "OTHER";

/** A packing item with its (optional) assigned member, after serialization. */
export interface PackingItemWithAssignee {
  id: string;
  tripId: string;
  name: string;
  category: PackingCategory;
  /** ISO datetime string */
  createdAt: string;
  assigneeId: string | null;
  assignee: { id: string; name: string | null; image: string | null } | null;
}

export interface PackingItemInput {
  name: string;
  category: PackingCategory;
  /** Trip member bringing the item; omit or null for unclaimed. */
  assigneeId?: string | null;
}
