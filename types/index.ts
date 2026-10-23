/**
 * Frontend-facing types for the travel planner.
 *
 * These model the JSON-serialized shape your components receive across the
 * App Router server/client boundary: `DateTime` fields arrive as ISO 8601
 * strings and Prisma `Decimal` fields are assumed to be converted to plain
 * numbers before serialization (e.g. `trip.totalBudget?.toNumber()`).
 *
 * Server-side code (route handlers, server actions, data-access layers)
 * should prefer Prisma's generated types from `../generated/prisma/client` instead.
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

/** What an invite link offers, shown before anyone joins. */
export interface InvitePreview {
  tripId: string;
  tripTitle: string;
  destination: string | null;
  /** ISO date; null while the group is still picking dates */
  startDate: string | null;
  endDate: string | null;
  role: InviteRole;
  invitedBy: string | null;
  memberCount: number;
  /** ISO datetime */
  expiresAt: string;
  /** The signed-in user is already on the trip. */
  alreadyMember: boolean;
}

export interface Trip {
  id: string;
  title: string;
  /** null while the group is still deciding where to go */
  destination: string | null;
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
  /** null while the group is still deciding where to go */
  destination: string | null;
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

/** A person reference small enough to ship with every row that names one. */
export interface PersonSummary {
  id: string;
  name: string | null;
  image: string | null;
}

/** A recorded repayment between two members, with who logged it. */
export interface SettlementRecord {
  id: string;
  tripId: string;
  fromUserId: string;
  toUserId: string;
  /** Null when the recorder's account no longer exists. */
  createdById: string | null;
  amountCents: number;
  /** ISO datetime */
  date: string;
  fromUser: PersonSummary;
  toUser: PersonSummary;
  createdBy: PersonSummary | null;
}

/** Arguments for recording a repayment one member made to another. */
export interface RepaymentInput {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
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

/** A real amount from a trip, named so a confirmation can show what happens to it. */
export interface TripAmountExample {
  /** e.g. `“Dinner at Time Out”` or `the trip budget` */
  label: string;
  cents: number;
}

/** Options for updateTripCurrency. */
export interface CurrencyChangeOptions {
  /**
   * Required once the trip holds any amount: the caller confirms those
   * amounts keep their numbers under the new code rather than being
   * converted.
   */
  relabel?: boolean;
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
  /** Omitted while the group is still deciding where to go. */
  destination?: string;
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
  /** ISO 4217 code from lib/currencies; defaults to USD. */
  currency?: string;
  /** In `currency`, major units; whole numbers for zero-decimal currencies. */
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
/* Packing list — a shared checklist per trip plus a private personal   */
/* checklist per member                                                 */
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
  /** Checked off on the visible checklist. */
  packed: boolean;
  /** Null = shared trip item; set = private item on that member's personal list. */
  ownerId: string | null;
  /** ISO datetime string */
  createdAt: string;
  assigneeId: string | null;
  assignee: { id: string; name: string | null; image: string | null } | null;
}

export interface PackingItemInput {
  name: string;
  category: PackingCategory;
  /** Trip member bringing the item; omit or null for unclaimed. Shared items only. */
  assigneeId?: string | null;
  /** True to add to the caller's private personal list instead of the shared one. */
  personal?: boolean;
}

/** One entry of a packing template (no id — templates are import sources). */
export interface PackingTemplateItem {
  name: string;
  category: PackingCategory;
}

/**
 * A packing template a member can import into their personal checklist.
 * Built-in templates ship in code and have `"builtin:<key>"` ids; custom
 * ones are created per trip by OWNER/EDITOR members and have cuid ids.
 */
export interface PackingTemplateSummary {
  id: string;
  name: string;
  builtin: boolean;
  items: PackingTemplateItem[];
}

export interface PackingTemplateInput {
  name: string;
  items: PackingTemplateItem[];
}

/** Returned by importPackingTemplate: items copied vs. already present. */
export interface TemplateImportResult {
  imported: number;
  skipped: number;
}

/* ------------------------------------------------------------------ */
/* Activity ideas — a voting pool that feeds the itinerary              */
/* ------------------------------------------------------------------ */

/** An idea with its votes, after serialization. getIdeas returns these sorted by votes. */
export interface ActivityIdeaWithVotes {
  id: string;
  tripId: string;
  title: string;
  description: string | null;
  locationName: string | null;
  /** External reference (booking page, review site, …); always https?:// */
  link: string | null;
  estimatedCost: number | null;
  /** ISO datetime; set once the idea has been added to the itinerary. */
  promotedAt: string | null;
  createdById: string | null;
  createdBy: { id: string; name: string | null; image: string | null } | null;
  /** ISO datetime string */
  createdAt: string;
  /** ISO datetime string */
  updatedAt: string;
  votes: {
    userId: string;
    user: { id: string; name: string | null; image: string | null };
  }[];
}

export interface ActivityIdeaInput {
  title: string;
  description?: string | null;
  locationName?: string | null;
  link?: string | null;
  estimatedCost?: number | null;
}

/* ------------------------------------------------------------------ */
/* Travel preferences — durable per-user taste + per-trip answers       */
/* ------------------------------------------------------------------ */

export type TravelPace = "RELAXED" | "BALANCED" | "PACKED";
export type BudgetTier = "SHOESTRING" | "MODERATE" | "COMFORT" | "LUXURY";
export type DayRhythm = "EARLY_BIRD" | "FLEXIBLE" | "NIGHT_OWL";
export type LodgingStyle =
  | "HOSTEL"
  | "RENTAL"
  | "HOTEL"
  | "BOUTIQUE"
  | "CAMPING";

export type InterestTag =
  | "FOOD"
  | "NIGHTLIFE"
  | "ART_MUSEUMS"
  | "HISTORY"
  | "NATURE"
  | "HIKING"
  | "BEACH"
  | "WATER_SPORTS"
  | "ADVENTURE"
  | "SHOPPING"
  | "WELLNESS"
  | "LOCAL_LIFE";

/** ANYWHERE is an explicit "don't care" — not the same as an unanswered null. */
export type TravelRegion =
  | "ANYWHERE"
  | "DOMESTIC"
  | "EUROPE"
  | "ASIA"
  | "AFRICA"
  | "NORTH_AMERICA"
  | "SOUTH_AMERICA"
  | "OCEANIA";

/** NO_PREFERENCE is an explicit "don't care" — not the same as unanswered. */
export type Climate = "WARM" | "MILD" | "COLD" | "NO_PREFERENCE";

/** A signed interest weight, -2 (avoid) … +2 (love). */
export interface InterestWeight {
  tag: InterestTag;
  weight: number;
}

/** One member's durable cross-trip profile, after serialization. */
export interface TravelProfileSummary {
  userId: string;
  pace: TravelPace | null;
  budgetTier: BudgetTier | null;
  dayRhythm: DayRhythm | null;
  lodgingStyle: LodgingStyle | null;
  /** Hard filters. Unioned across the group, never averaged. */
  dietaryNotes: string | null;
  accessibilityNotes: string | null;
  /** Sorted by tag; weight-0 tags are omitted. */
  interests: InterestWeight[];
  /** ISO datetime of the last save. */
  answeredAt: string;
}

/**
 * One member's answers for a single trip, after serialization. Fields that
 * also exist on TravelProfileSummary are overrides: null means "same as usual".
 * Resolve the pair with resolveEffectiveProfile rather than reading one alone.
 */
export interface TripPreferenceSummary {
  userId: string;
  /** Overrides the durable budgetTier for this trip; null = same as usual. */
  budgetComfort: BudgetTier | null;
  /**
   * Absolute per-trip interest weights. When non-empty they replace the
   * durable set for this trip; empty means the durable set applies.
   */
  interests: InterestWeight[];
  mustDo: string | null;
  dealBreakers: string | null;
  /** Only collected while the trip's destination is undecided. */
  preferredRegion: TravelRegion | null;
  preferredClimate: Climate | null;
  maxTravelHours: number | null;
  /** ISO datetime of the last save. */
  answeredAt: string;
}

/** One row per trip member; profile/trip are null when they haven't answered. */
export interface MemberPreferences {
  userId: string;
  name: string | null;
  image: string | null;
  role: TripRole;
  profile: TravelProfileSummary | null;
  trip: TripPreferenceSummary | null;
}

/** The caller's own answers, used to prefill the deck. */
export interface MyPreferences {
  profile: TravelProfileSummary | null;
  trip: TripPreferenceSummary | null;
}

/**
 * A finished deck run, keyed by question id. Single-select, scale and text
 * answers are strings; multi-select answers are string arrays.
 */
export type PreferenceAnswers = Record<string, string | string[]>;

/* ------------------------------------------------------------------ */
/* Trip header, lifecycle, membership, and sharing                      */
/* ------------------------------------------------------------------ */

/**
 * Everything a trip page's header shows, returned by getTripHeader. Every
 * section loads the same contract so the hero and stat cards mean the same
 * thing on every tab; only the itinerary tab also loads the full day plan.
 */
export interface TripHeaderData extends Omit<Trip, "createdAt" | "updatedAt"> {
  /** The viewer's role on the trip. */
  role: TripRole;
  /** ISO datetime the viewer hid the trip from their list; null when shown. */
  archivedAt: string | null;
  memberCount: number;
  ownerName: string | null;
  dayCount: number;
  /** Days with at least one activity. */
  plannedDayCount: number;
  activityCount: number;
  /** Sum of the itinerary's activity costs, in currency units. */
  plannedCost: number;
  /**
   * Total logged expenses in cents. getTripHeader always loads it; null only
   * for header data built without expense access (the static /preview demo).
   */
  spentCents: number | null;
}

/** A row on the signed-in user's trip list, with their own hidden state. */
export interface MyTripSummary extends TripSummary {
  /** ISO datetime the user hid this trip from their list; null when shown. */
  archivedAt: string | null;
}

/** Arguments for updateTripDetails. */
export interface TripDetailsInput {
  title: string;
  /** Empty or null puts the trip back to "destination not decided". */
  destination?: string | null;
}

/** Arguments for rescheduleTrip: the new inclusive range (YYYY-MM-DD). */
export interface RescheduleInput {
  startDate: string;
  endDate: string;
}

/** Returned by rescheduleTrip. */
export interface RescheduleResult {
  /** ISO dates of the new range. */
  startDate: string;
  endDate: string;
  /** Whole days every day and activity time moved by (negative = earlier). */
  shiftDays: number;
  addedDays: number;
  removedDays: number;
}

/** One member as listed by getTripMembers. */
export interface TripMemberDetail {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: TripRole;
  /** ISO datetime they joined. */
  joinedAt: string;
  /** This row is the signed-in user. */
  isYou: boolean;
}

/** An invite link that still admits people (unexpired and not revoked). */
export interface ActiveInvite {
  id: string;
  url: string;
  role: InviteRole;
  /** ISO datetime */
  expiresAt: string;
  /** ISO datetime */
  createdAt: string;
  createdBy: PersonSummary;
  /** Whether the viewer may revoke it (the owner, or whoever created it). */
  canRevoke: boolean;
}
