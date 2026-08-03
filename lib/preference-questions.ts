import type { InterestTag, TravelProfileSummary } from "@/types";

/**
 * The preference question banks, shipped as code rather than database rows so
 * every trip gets them without seeding — the same reasoning as the built-in
 * packing templates in lib/packing-templates.ts.
 *
 * This module imports types only, so the client deck can import it directly
 * instead of receiving ~20 question objects through the RSC payload. Both the
 * deck UI and saveMyPreferences call `deckFor`, so what gets rendered and what
 * gets validated cannot drift apart.
 *
 * Questions are declared as data so adding one is a one-line change, and so a
 * future image-swipe deck can render the same bank a different way.
 */

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type QuestionKind = "single-select" | "multi-select" | "text";

/** Columns on TravelProfile a question may write. */
export type ProfileField =
  | "pace"
  | "budgetTier"
  | "dayRhythm"
  | "lodgingStyle"
  | "dietaryNotes"
  | "accessibilityNotes";

/** Columns on TripPreference a question may write. */
export type TripPreferenceField =
  | "budgetComfort"
  | "mustDo"
  | "dealBreakers"
  | "preferredRegion"
  | "preferredClimate"
  | "maxTravelHours";

/** Trip fields whose option values are numeric strings, parsed on save. */
export const NUMERIC_TRIP_FIELDS: readonly TripPreferenceField[] = [
  "maxTravelHours",
];

/** Where an answer is written. */
export type AnswerTarget =
  | { kind: "profileField"; field: ProfileField }
  | { kind: "tripField"; field: TripPreferenceField }
  /**
   * Sets durable TravelInterest weights (the account-level deck).
   *
   * Picked tags are set to `weight`; unpicked tags already sitting at exactly
   * that weight are cleared. Clearing only at the answer's own weight is what
   * lets the +2 "love" and -2 "skip" questions both run over the same option
   * set without the second wiping out the first.
   */
  | { kind: "interests"; weight: number }
  /**
   * Sets TripInterest weights — the same semantics, scoped to one trip. These
   * are absolute overrides of the durable set, never deltas applied to it, so
   * answering here never rewrites the member's general taste.
   */
  | { kind: "tripInterests"; weight: number };

export interface QuestionOption {
  /** Stored value: an enum member, an InterestTag, or a numeric string. */
  value: string;
  label: string;
  emoji: string;
  description?: string;
}

export interface PreferenceQuestion {
  /** Stable: the answer-map key and the deck's React key. */
  id: string;
  prompt: string;
  /** One supporting line under the prompt. */
  hint?: string;
  kind: QuestionKind;
  target: AnswerTarget;
  /** Present for every kind except "text". */
  options?: readonly QuestionOption[];
  /** kind: "text" only. */
  placeholder?: string;
  maxLength?: number;
}

/* ------------------------------------------------------------------ */
/* Interest tag display data — the single source for labels and emoji  */
/* ------------------------------------------------------------------ */

export const INTEREST_TAGS: readonly InterestTag[] = [
  "FOOD",
  "NIGHTLIFE",
  "ART_MUSEUMS",
  "HISTORY",
  "NATURE",
  "HIKING",
  "BEACH",
  "WATER_SPORTS",
  "ADVENTURE",
  "SHOPPING",
  "WELLNESS",
  "LOCAL_LIFE",
];

export const INTEREST_LABELS: Record<InterestTag, string> = {
  FOOD: "Food & drink",
  NIGHTLIFE: "Nightlife",
  ART_MUSEUMS: "Art & museums",
  HISTORY: "History & ruins",
  NATURE: "Nature & parks",
  HIKING: "Hiking",
  BEACH: "Beaches",
  WATER_SPORTS: "Water sports",
  ADVENTURE: "Adventure sports",
  SHOPPING: "Shopping & markets",
  WELLNESS: "Spa & wellness",
  LOCAL_LIFE: "Just wandering",
};

export const INTEREST_EMOJI: Record<InterestTag, string> = {
  FOOD: "🍜",
  NIGHTLIFE: "🍸",
  ART_MUSEUMS: "🎨",
  HISTORY: "🏛️",
  NATURE: "🌲",
  HIKING: "🥾",
  BEACH: "🏖️",
  WATER_SPORTS: "🤿",
  ADVENTURE: "🪂",
  SHOPPING: "🛍️",
  WELLNESS: "💆",
  LOCAL_LIFE: "🚶",
};

/** Every interest tag as a tile, in INTEREST_TAGS order. */
const INTEREST_OPTIONS: readonly QuestionOption[] = INTEREST_TAGS.map(
  (tag) => ({
    value: tag,
    label: INTEREST_LABELS[tag],
    emoji: INTEREST_EMOJI[tag],
  }),
);

/** The four budget tiers, reused by the durable and per-trip budget questions. */
const BUDGET_OPTIONS: readonly QuestionOption[] = [
  {
    value: "SHOESTRING",
    label: "Shoestring",
    emoji: "🎒",
    description: "Hostels, street food, buses",
  },
  {
    value: "MODERATE",
    label: "Moderate",
    emoji: "💸",
    description: "Mid-range stays, the odd nice dinner",
  },
  {
    value: "COMFORT",
    label: "Comfortable",
    emoji: "🛎️",
    description: "Good hotels, book what I want",
  },
  {
    value: "LUXURY",
    label: "Splurge",
    emoji: "✨",
    description: "Best of everything, price second",
  },
];

/* ------------------------------------------------------------------ */
/* PROFILE_QUESTIONS — durable taste, asked on every deck run           */
/* ------------------------------------------------------------------ */

export const PROFILE_QUESTIONS: readonly PreferenceQuestion[] = [
  {
    id: "pace",
    prompt: "How do you like a trip to feel?",
    kind: "single-select",
    target: { kind: "profileField", field: "pace" },
    options: [
      {
        value: "RELAXED",
        label: "Slow and easy",
        emoji: "🌿",
        description: "Two things a day, long lunches",
      },
      {
        value: "BALANCED",
        label: "A bit of both",
        emoji: "⚖️",
        description: "Plans in the morning, free afternoons",
      },
      {
        value: "PACKED",
        label: "See everything",
        emoji: "🚀",
        description: "Out the door early, back late",
      },
    ],
  },
  {
    id: "budget-tier",
    prompt: "What's your usual travel budget?",
    hint: "Your everyday setting — you can change it per trip later.",
    kind: "single-select",
    target: { kind: "profileField", field: "budgetTier" },
    options: BUDGET_OPTIONS,
  },
  {
    id: "day-rhythm",
    prompt: "When are you at your best?",
    kind: "single-select",
    target: { kind: "profileField", field: "dayRhythm" },
    options: [
      {
        value: "EARLY_BIRD",
        label: "Early bird",
        emoji: "🌅",
        description: "Sunrise hikes, first in line",
      },
      {
        value: "FLEXIBLE",
        label: "Depends on the day",
        emoji: "🕰️",
        description: "Happy either way",
      },
      {
        value: "NIGHT_OWL",
        label: "Night owl",
        emoji: "🌙",
        description: "Late dinners, later bars",
      },
    ],
  },
  {
    id: "lodging",
    prompt: "Where do you like to sleep?",
    kind: "single-select",
    target: { kind: "profileField", field: "lodgingStyle" },
    options: [
      { value: "HOSTEL", label: "Hostel or dorm", emoji: "🛏️" },
      { value: "RENTAL", label: "Apartment rental", emoji: "🏡" },
      { value: "HOTEL", label: "Regular hotel", emoji: "🏨" },
      { value: "BOUTIQUE", label: "Boutique or design", emoji: "🕯️" },
      { value: "CAMPING", label: "Tent or campervan", emoji: "⛺" },
    ],
  },
  {
    id: "interests-love",
    prompt: "Pick what you'd plan a whole day around.",
    hint: "Choose as many as you like.",
    kind: "multi-select",
    target: { kind: "interests", weight: 2 },
    options: INTEREST_OPTIONS,
  },
  {
    id: "interests-skip",
    prompt: "And what would you happily skip?",
    hint: "Nothing here is wrong — this just keeps it off your days.",
    kind: "multi-select",
    target: { kind: "interests", weight: -2 },
    options: INTEREST_OPTIONS,
  },
  {
    id: "dietary",
    prompt: "Anything the group needs to know about food?",
    hint: "Allergies, vegetarian, halal, kosher. Everyone on your trips can see this.",
    kind: "text",
    target: { kind: "profileField", field: "dietaryNotes" },
    placeholder: "Vegetarian, no shellfish",
    maxLength: 200,
  },
  {
    id: "accessibility",
    prompt: "Anything that affects how you get around?",
    hint: "Mobility, stamina, motion sickness. Everyone on your trips can see this.",
    kind: "text",
    target: { kind: "profileField", field: "accessibilityNotes" },
    placeholder: "Bad knee — no long stair climbs",
    maxLength: 200,
  },
];

/* ------------------------------------------------------------------ */
/* Shared trip questions — used by both trip banks                      */
/* ------------------------------------------------------------------ */

/*
 * Every trip question that also exists on the profile is an override: it opens
 * pre-filled with the member's usual answer, and leaving it alone means "same
 * as usual". Nothing here ever writes back to the durable profile.
 */

const TRIP_BUDGET_COMFORT: PreferenceQuestion = {
  id: "trip-budget-comfort",
  prompt: "For this trip, what feels comfortable?",
  hint: "Starts from your usual budget — change it if this trip is different.",
  kind: "single-select",
  target: { kind: "tripField", field: "budgetComfort" },
  options: BUDGET_OPTIONS,
};

const TRIP_INTERESTS_UP: PreferenceQuestion = {
  id: "trip-interests-up",
  prompt: "What are you into on this trip?",
  hint: "Starts from your usual picks — adjust them just for this trip.",
  kind: "multi-select",
  target: { kind: "tripInterests", weight: 2 },
  options: INTEREST_OPTIONS,
};

const TRIP_INTERESTS_DOWN: PreferenceQuestion = {
  id: "trip-interests-down",
  prompt: "Anything you'd rather skip here?",
  kind: "multi-select",
  target: { kind: "tripInterests", weight: -2 },
  options: INTEREST_OPTIONS,
};

const TRIP_MUST_DO: PreferenceQuestion = {
  id: "trip-must-do",
  prompt: "One thing you'd be sad to miss?",
  kind: "text",
  target: { kind: "tripField", field: "mustDo" },
  placeholder: "The night market",
  maxLength: 300,
};

const TRIP_DEAL_BREAKERS: PreferenceQuestion = {
  id: "trip-deal-breakers",
  prompt: "Anything that would ruin the trip for you?",
  hint: "Say it now, not on day three.",
  kind: "text",
  target: { kind: "tripField", field: "dealBreakers" },
  placeholder: "6am wake-ups",
  maxLength: 300,
};

/* ------------------------------------------------------------------ */
/* ITINERARY_QUESTIONS — asked once the destination is settled          */
/* ------------------------------------------------------------------ */

export const ITINERARY_QUESTIONS: readonly PreferenceQuestion[] = [
  TRIP_BUDGET_COMFORT,
  TRIP_INTERESTS_UP,
  TRIP_INTERESTS_DOWN,
  TRIP_MUST_DO,
  TRIP_DEAL_BREAKERS,
];

/* ------------------------------------------------------------------ */
/* DESTINATION_QUESTIONS — asked while the destination is undecided     */
/* ------------------------------------------------------------------ */

export const DESTINATION_QUESTIONS: readonly PreferenceQuestion[] = [
  {
    id: "dest-region",
    prompt: "Roughly where are you up for going?",
    hint: "The group needs one region that works for everyone.",
    kind: "single-select",
    target: { kind: "tripField", field: "preferredRegion" },
    options: [
      { value: "ANYWHERE", label: "Anywhere", emoji: "🌍" },
      { value: "DOMESTIC", label: "Stay in the country", emoji: "🏠" },
      { value: "EUROPE", label: "Europe", emoji: "🏰" },
      { value: "ASIA", label: "Asia", emoji: "🏯" },
      { value: "AFRICA", label: "Africa", emoji: "🦁" },
      { value: "NORTH_AMERICA", label: "North America", emoji: "🗽" },
      { value: "SOUTH_AMERICA", label: "South America", emoji: "🌴" },
      { value: "OCEANIA", label: "Oceania", emoji: "🐨" },
    ],
  },
  {
    id: "dest-climate",
    prompt: "What weather are you after?",
    kind: "single-select",
    target: { kind: "tripField", field: "preferredClimate" },
    options: [
      { value: "WARM", label: "Warm", emoji: "☀️" },
      { value: "MILD", label: "Mild", emoji: "🍃" },
      { value: "COLD", label: "Cold", emoji: "❄️" },
      { value: "NO_PREFERENCE", label: "Doesn't matter", emoji: "🤷" },
    ],
  },
  {
    id: "dest-max-travel",
    prompt: "How far will you travel to get there?",
    hint: "The group is capped by whoever picks the shortest.",
    kind: "single-select",
    target: { kind: "tripField", field: "maxTravelHours" },
    options: [
      { value: "3", label: "Under 3 hours", emoji: "🚗" },
      { value: "6", label: "Up to 6 hours", emoji: "✈️" },
      { value: "12", label: "Up to 12 hours", emoji: "🛫" },
      { value: "24", label: "I'll fly anywhere", emoji: "🌐" },
    ],
  },
  TRIP_BUDGET_COMFORT,
  TRIP_INTERESTS_UP,
  TRIP_INTERESTS_DOWN,
  TRIP_MUST_DO,
  TRIP_DEAL_BREAKERS,
];

/* ------------------------------------------------------------------ */
/* Selectors                                                            */
/* ------------------------------------------------------------------ */

/**
 * The trip deck. An undecided destination means the group is still choosing
 * where to go, so it asks what would help them pick; otherwise it asks what
 * would shape the itinerary. The account-level deck is PROFILE_QUESTIONS, and
 * the two are asked at different times — signup versus joining a trip.
 */
export function tripDeckFor(
  destination: string | null,
): readonly PreferenceQuestion[] {
  return destination === null ? DESTINATION_QUESTIONS : ITINERARY_QUESTIONS;
}

/**
 * The member's usual answer to a trip question that overrides a profile field,
 * used to open the question pre-filled. Returns undefined for trip-only
 * questions (must-do, deal-breakers, region…) which have nothing to inherit.
 */
export function profileDefaultFor(
  question: PreferenceQuestion,
  profile: TravelProfileSummary | null,
): string | string[] | undefined {
  if (!profile) return undefined;

  if (question.target.kind === "tripField") {
    // Budget is the one scalar that exists in both layers.
    if (question.target.field === "budgetComfort") {
      return profile.budgetTier ?? undefined;
    }
    return undefined;
  }

  if (question.target.kind === "tripInterests") {
    const wanted = Math.sign(question.target.weight);
    const tags = profile.interests
      .filter((interest) => Math.sign(interest.weight) === wanted)
      .map((interest) => interest.tag);
    return tags.length > 0 ? tags : undefined;
  }

  return undefined;
}

/** Looks a question up across every bank. */
export function findQuestion(id: string): PreferenceQuestion | undefined {
  return ALL_QUESTIONS.get(id);
}

const ALL_QUESTIONS = new Map<string, PreferenceQuestion>(
  [
    ...PROFILE_QUESTIONS,
    ...ITINERARY_QUESTIONS,
    ...DESTINATION_QUESTIONS,
  ].map((question) => [question.id, question]),
);

/** Trip questions that inherit a default from the profile, for UI labelling. */
export function inheritsFromProfile(question: PreferenceQuestion): boolean {
  return (
    question.target.kind === "tripInterests" ||
    (question.target.kind === "tripField" &&
      question.target.field === "budgetComfort")
  );
}
