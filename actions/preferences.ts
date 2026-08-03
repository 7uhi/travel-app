"use server";

import {
  Prisma,
  type TravelInterest as DbTravelInterest,
  type TravelProfile as DbTravelProfile,
  type TripInterest as DbTripInterest,
  type TripPreference as DbTripPreference,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { fail, type ActionResult } from "@/lib/action-result";
import {
  NUMERIC_TRIP_FIELDS,
  PROFILE_QUESTIONS,
  tripDeckFor,
  type PreferenceQuestion,
} from "@/lib/preference-questions";
import {
  PROFILE_ONBOARDING_SEEN,
  PROFILE_ONBOARDING_SEEN_MAX_AGE,
} from "@/lib/onboarding";
import { applyInterestAnswer } from "@/lib/preferences";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/session";
import type {
  BudgetTier,
  Climate,
  DayRhythm,
  InterestTag,
  InterestWeight,
  LodgingStyle,
  MemberPreferences,
  MyPreferences,
  PreferenceAnswers,
  TravelPace,
  TravelProfileSummary,
  TravelRegion,
  TripPreferenceSummary,
} from "@/types";

/*
 * Preferences are personal data, so every action here uses tripMemberGate and
 * none uses tripEditGate: VIEWERs answer for themselves exactly as they vote on
 * ideas. Reads are open to every member on purpose — seeing each other's
 * answers is the point of planning as a group.
 *
 * Ownership needs no gate of its own, which is stronger than having one: every
 * write is keyed by the userId from currentUserId(), and no exported action
 * accepts a profileId or another member's id, so there is no code path that can
 * address someone else's row. Do not add a userId parameter to these actions.
 */

/** Free-text answers longer than this are almost certainly a paste mistake. */
const MAX_NOTE_LENGTH = 300;
/** Runaway-payload guard on a submitted deck run. */
const MAX_ANSWER_KEYS = 40;

const PROFILE_INCLUDE = {
  interests: { select: { tag: true, weight: true }, orderBy: { tag: "asc" } },
} satisfies Prisma.TravelProfileInclude;

const TRIP_PREFERENCE_INCLUDE = {
  interests: { select: { tag: true, weight: true }, orderBy: { tag: "asc" } },
} satisfies Prisma.TripPreferenceInclude;

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

/**
 * The caller's own answers, used to prefill the deck. Requires membership on
 * the trip (any role).
 */
export async function getMyPreferences(
  tripId: string,
): Promise<ActionResult<MyPreferences>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view this trip.");
  if (!tripId) return fail("Trip id is required.");

  try {
    const gate = await tripMemberGate(tripId, userId);
    if ("error" in gate) return fail(gate.error);

    const [profile, trip] = await Promise.all([
      prisma.travelProfile.findUnique({
        where: { userId },
        include: PROFILE_INCLUDE,
      }),
      prisma.tripPreference.findUnique({
        where: { userId_tripId: { userId, tripId } },
        include: TRIP_PREFERENCE_INCLUDE,
      }),
    ]);

    return {
      success: true,
      data: {
        profile: profile ? serializeProfile(profile) : null,
        trip: trip ? serializeTripPreference(trip) : null,
      },
    };
  } catch (error) {
    console.error("getMyPreferences failed:", error);
    return fail("Failed to load your preferences. Please try again.");
  }
}

/**
 * Whether the caller has answered yet — a deliberately cheap query for the
 * nudge banner on the trip page. Requires membership (any role).
 */
export async function getMyPreferenceStatus(
  tripId: string,
): Promise<ActionResult<{ hasProfile: boolean; hasTripPreference: boolean }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view this trip.");
  if (!tripId) return fail("Trip id is required.");

  try {
    const gate = await tripMemberGate(tripId, userId);
    if ("error" in gate) return fail(gate.error);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        travelProfile: { select: { id: true } },
        tripPreferences: { where: { tripId }, select: { id: true } },
      },
    });

    return {
      success: true,
      data: {
        hasProfile: Boolean(user?.travelProfile),
        hasTripPreference: (user?.tripPreferences.length ?? 0) > 0,
      },
    };
  } catch (error) {
    console.error("getMyPreferenceStatus failed:", error);
    return fail("Failed to load your preferences. Please try again.");
  }
}

/**
 * Every member's answers, for the Preferences tab: one row per member, with
 * null profile/trip for those who haven't answered. Requires membership (any
 * role) — all members may read all summaries.
 */
export async function getTripPreferences(
  tripId: string,
): Promise<ActionResult<MemberPreferences[]>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view this trip.");
  if (!tripId) return fail("Trip id is required.");

  try {
    const gate = await tripMemberGate(tripId, userId);
    if ("error" in gate) return fail(gate.error);

    const members = await prisma.tripMember.findMany({
      where: { tripId },
      select: {
        role: true,
        userId: true,
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            travelProfile: { include: PROFILE_INCLUDE },
            tripPreferences: {
              where: { tripId },
              include: TRIP_PREFERENCE_INCLUDE,
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      success: true,
      data: members.map((member) => {
        const trip = member.user.tripPreferences[0];
        return {
          userId: member.userId,
          name: member.user.name,
          image: member.user.image,
          role: member.role,
          profile: member.user.travelProfile
            ? serializeProfile(member.user.travelProfile)
            : null,
          trip: trip ? serializeTripPreference(trip) : null,
        };
      }),
    };
  } catch (error) {
    console.error("getTripPreferences failed:", error);
    return fail("Failed to load preferences. Please try again.");
  }
}

/**
 * The caller's durable profile, for the account-level deck. Needs no trip —
 * this data belongs to the user, not to any trip they're on.
 */
export async function getMyProfile(): Promise<
  ActionResult<TravelProfileSummary | null>
> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view your profile.");

  try {
    const profile = await prisma.travelProfile.findUnique({
      where: { userId },
      include: PROFILE_INCLUDE,
    });
    return { success: true, data: profile ? serializeProfile(profile) : null };
  } catch (error) {
    console.error("getMyProfile failed:", error);
    return fail("Failed to load your profile. Please try again.");
  }
}

/**
 * Saves the account-level deck: the caller's durable travel profile and its
 * interest weights. Answered once at signup and editable later; no trip
 * context is involved, so the only requirement is being signed in.
 */
export async function saveMyProfile(
  answers: PreferenceAnswers,
): Promise<ActionResult<{ answeredAt: string }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to answer.");
  if (!answers || typeof answers !== "object") {
    return fail("Answers are required.");
  }
  if (Object.keys(answers).length > MAX_ANSWER_KEYS) {
    return fail("That's more answers than the deck has questions.");
  }

  // Interests are absolute, so a run starts from a clean set rather than
  // composing onto whatever was stored before.
  const parsed = parseAnswers(PROFILE_QUESTIONS, answers, []);
  if ("error" in parsed) return fail(parsed.error);

  try {
    const answeredAt = await prisma.$transaction(async (tx) => {
      const profile = await tx.travelProfile.upsert({
        where: { userId },
        create: { userId, ...parsed.profileFields },
        // updatedAt is set explicitly: a run that only changes interests
        // leaves profileFields empty, and Prisma skips the write (and the
        // @updatedAt bump) entirely for an empty update.
        update: { ...parsed.profileFields, updatedAt: new Date() },
        select: { id: true, updatedAt: true },
      });

      // Replace the weight set wholesale, mirroring setMyAvailability.
      await tx.travelInterest.deleteMany({ where: { profileId: profile.id } });
      if (parsed.interests.length > 0) {
        await tx.travelInterest.createMany({
          data: parsed.interests.map((interest) => ({
            profileId: profile.id,
            tag: interest.tag,
            weight: interest.weight,
          })),
        });
      }

      return profile.updatedAt;
    });

    // Every trip the caller is on renders their profile somewhere.
    revalidatePath("/trips", "layout");
    return { success: true, data: { answeredAt: answeredAt.toISOString() } };
  } catch (error) {
    console.error("saveMyProfile failed:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // A concurrent double-submit already created the row.
      return fail("Your answers were already saved. Refresh to see them.");
    }
    return fail("Failed to save your answers. Please try again.");
  }
}

/**
 * Records that the caller has been shown the profile deck, so skipping it
 * doesn't send them straight back into it. Called when they skip; finishing
 * the deck needs no cookie, since the profile row itself stops the prompt.
 */
export async function dismissProfileOnboarding(): Promise<
  ActionResult<{ dismissed: true }>
> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in.");

  const jar = await cookies();
  jar.set(PROFILE_ONBOARDING_SEEN, "1", {
    maxAge: PROFILE_ONBOARDING_SEEN_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return { success: true, data: { dismissed: true } };
}

/**
 * Saves the trip deck: the caller's answers for this trip only. Fields that
 * also exist on the profile are stored as overrides, and interests go to
 * TripInterest — nothing here ever writes back to the durable profile.
 *
 * Requires membership on the trip — any role, including VIEWER.
 */
export async function saveMyTripPreferences(
  tripId: string,
  answers: PreferenceAnswers,
): Promise<ActionResult<{ answeredAt: string }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to answer.");
  if (!tripId) return fail("Trip id is required.");
  if (!answers || typeof answers !== "object") {
    return fail("Answers are required.");
  }
  if (Object.keys(answers).length > MAX_ANSWER_KEYS) {
    return fail("That's more answers than the deck has questions.");
  }

  try {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, members: { some: { userId } } },
      select: { destination: true },
    });
    if (!trip) return fail("Trip not found.");

    // Re-derive the deck server-side: a client can only answer questions the
    // trip actually asks.
    const parsed = parseAnswers(tripDeckFor(trip.destination), answers, []);
    if ("error" in parsed) return fail(parsed.error);

    const answeredAt = await prisma.$transaction(async (tx) => {
      const pref = await tx.tripPreference.upsert({
        where: { userId_tripId: { userId, tripId } },
        create: { userId, tripId, ...parsed.tripFields },
        // See saveMyProfile: an interests-only run leaves tripFields empty.
        update: { ...parsed.tripFields, updatedAt: new Date() },
        select: { id: true, updatedAt: true },
      });

      await tx.tripInterest.deleteMany({
        where: { tripPreferenceId: pref.id },
      });
      if (parsed.tripInterests.length > 0) {
        await tx.tripInterest.createMany({
          data: parsed.tripInterests.map((interest) => ({
            tripPreferenceId: pref.id,
            tag: interest.tag,
            weight: interest.weight,
          })),
        });
      }

      return pref.updatedAt;
    });

    revalidatePath(`/trips/${tripId}/preferences`);
    // The nudge banner on the itinerary tab disappears once answers exist.
    revalidatePath(`/trips/${tripId}`);
    return { success: true, data: { answeredAt: answeredAt.toISOString() } };
  } catch (error) {
    console.error("saveMyTripPreferences failed:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        // A concurrent double-submit already created the row.
        return fail("Your answers were already saved. Refresh to see them.");
      }
      if (error.code === "P2003") {
        // The trip was deleted between the gate check and the write.
        return fail("Trip not found.");
      }
    }
    return fail("Failed to save your answers. Please try again.");
  }
}

/**
 * Clears the caller's answers for this trip. The durable cross-trip profile
 * survives — it belongs to the user, not the trip. Requires membership.
 */
export async function clearMyTripPreferences(
  tripId: string,
): Promise<ActionResult<{ tripId: string }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit your answers.");
  if (!tripId) return fail("Trip id is required.");

  try {
    const gate = await tripMemberGate(tripId, userId);
    if ("error" in gate) return fail(gate.error);

    // deleteMany rather than delete: clearing twice is not an error.
    await prisma.tripPreference.deleteMany({ where: { userId, tripId } });

    revalidatePath(`/trips/${tripId}/preferences`);
    revalidatePath(`/trips/${tripId}`);
    return { success: true, data: { tripId } };
  } catch (error) {
    console.error("clearMyTripPreferences failed:", error);
    return fail("Failed to clear your answers. Please try again.");
  }
}

/* ------------------------------------------------------------------ */
/* Helpers (module-private: "use server" files may only export          */
/* async functions and types)                                           */
/* ------------------------------------------------------------------ */

/*
 * Prisma-ready field values. Every enum-valued question offers exactly its
 * field's enum members as options, so a value that passed the option check is
 * a member of that enum — but the option list is declared as plain strings, so
 * TypeScript can't see it. `assign` below is where that one runtime-guaranteed
 * invariant is asserted, so the rest of the file stays properly typed.
 */
type ProfileFieldValues = {
  pace?: TravelPace | null;
  budgetTier?: BudgetTier | null;
  dayRhythm?: DayRhythm | null;
  lodgingStyle?: LodgingStyle | null;
  dietaryNotes?: string | null;
  accessibilityNotes?: string | null;
};

type TripFieldValues = {
  budgetComfort?: BudgetTier | null;
  mustDo?: string | null;
  dealBreakers?: string | null;
  preferredRegion?: TravelRegion | null;
  preferredClimate?: Climate | null;
  maxTravelHours?: number | null;
};

type ParsedAnswers = {
  profileFields: ProfileFieldValues;
  tripFields: TripFieldValues;
  /** Durable weights, written by the account deck only. */
  interests: InterestWeight[];
  /** Per-trip overrides, written by the trip deck only. */
  tripInterests: InterestWeight[];
};

/** Writes a validated answer into a field bag. See the note above. */
function assign<T extends object, K extends string>(
  fields: T,
  field: K,
  value: string | number | null,
): void {
  (fields as Record<string, string | number | null>)[field] = value;
}

/**
 * Validates a deck run against the questions the trip actually asks and folds
 * it into database-ready values.
 *
 * An unknown question id is ignored rather than rejected: a client running a
 * stale bundle after the banks change shouldn't lose the user's whole run. A
 * known id with the wrong value type is a real client bug, so it fails loudly.
 */
function parseAnswers(
  deck: readonly PreferenceQuestion[],
  answers: PreferenceAnswers,
  currentInterests: InterestWeight[],
): ParsedAnswers | { error: string } {
  const parsed: ParsedAnswers = {
    profileFields: {},
    tripFields: {},
    interests: currentInterests,
    tripInterests: [],
  };

  for (const question of deck) {
    if (!(question.id in answers)) continue;
    const answer = answers[question.id];

    if (question.kind === "multi-select") {
      if (!Array.isArray(answer)) {
        return { error: `Invalid answer for "${question.prompt}".` };
      }
      const allowed = new Set(question.options?.map((o) => o.value) ?? []);
      const tags = [...new Set(answer)];
      if (tags.some((tag) => !allowed.has(tag))) {
        return { error: `Invalid answer for "${question.prompt}".` };
      }
      // Durable and per-trip weights are kept strictly apart: the account deck
      // only ever writes the former, the trip deck only ever the latter.
      if (question.target.kind === "interests") {
        parsed.interests = applyInterestAnswer(parsed.interests, {
          tags: tags as InterestTag[],
          weight: question.target.weight,
        });
      } else if (question.target.kind === "tripInterests") {
        parsed.tripInterests = applyInterestAnswer(parsed.tripInterests, {
          tags: tags as InterestTag[],
          weight: question.target.weight,
        });
      }
      continue;
    }

    if (typeof answer !== "string") {
      return { error: `Invalid answer for "${question.prompt}".` };
    }

    if (question.kind === "text") {
      const note = answer.trim() || null;
      const max = question.maxLength ?? MAX_NOTE_LENGTH;
      if (note && note.length > max) {
        return { error: `Answers must be ${max} characters or fewer.` };
      }
      if (question.target.kind === "profileField") {
        assign(parsed.profileFields, question.target.field, note);
      } else if (question.target.kind === "tripField") {
        assign(parsed.tripFields, question.target.field, note);
      }
      continue;
    }

    // single-select: the value must be one the question offers.
    const allowed = question.options?.map((o) => o.value) ?? [];
    if (!allowed.includes(answer)) {
      return { error: `Invalid answer for "${question.prompt}".` };
    }

    if (question.target.kind === "profileField") {
      assign(parsed.profileFields, question.target.field, answer);
    } else if (question.target.kind === "tripField") {
      const field = question.target.field;
      assign(
        parsed.tripFields,
        field,
        NUMERIC_TRIP_FIELDS.includes(field) ? Number(answer) : answer,
      );
    }
  }

  return parsed;
}

/** Checks the caller is a member of a trip, any role. Non-members and missing
 * trips get the same answer: no existence leaks. */
async function tripMemberGate(
  tripId: string,
  userId: string,
): Promise<Record<string, never> | { error: string }> {
  const member = await prisma.tripMember.findUnique({
    where: { userId_tripId: { userId, tripId } },
    select: { id: true },
  });
  if (!member) return { error: "Trip not found." };
  return {};
}

/* Convert Prisma records (Date) into the JSON-safe shapes from types/index.ts
   — server actions may only return serializable values. */

function serializeProfile(
  profile: DbTravelProfile & {
    interests: Pick<DbTravelInterest, "tag" | "weight">[];
  },
): TravelProfileSummary {
  return {
    userId: profile.userId,
    pace: profile.pace,
    budgetTier: profile.budgetTier,
    dayRhythm: profile.dayRhythm,
    lodgingStyle: profile.lodgingStyle,
    dietaryNotes: profile.dietaryNotes,
    accessibilityNotes: profile.accessibilityNotes,
    interests: profile.interests.filter((interest) => interest.weight !== 0),
    answeredAt: profile.updatedAt.toISOString(),
  };
}

function serializeTripPreference(
  pref: DbTripPreference & {
    interests: Pick<DbTripInterest, "tag" | "weight">[];
  },
): TripPreferenceSummary {
  return {
    userId: pref.userId,
    budgetComfort: pref.budgetComfort,
    interests: pref.interests.filter((interest) => interest.weight !== 0),
    mustDo: pref.mustDo,
    dealBreakers: pref.dealBreakers,
    preferredRegion: pref.preferredRegion,
    preferredClimate: pref.preferredClimate,
    maxTravelHours: pref.maxTravelHours,
    answeredAt: pref.updatedAt.toISOString(),
  };
}
