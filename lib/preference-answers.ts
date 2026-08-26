import {
  NUMERIC_TRIP_FIELDS,
  type PreferenceQuestion,
} from "@/lib/preference-questions";
import { applyInterestAnswer } from "@/lib/preferences";
import type {
  BudgetTier,
  Climate,
  DayRhythm,
  InterestTag,
  InterestWeight,
  LodgingStyle,
  PreferenceAnswers,
  TravelPace,
  TravelRegion,
} from "@/types";

/**
 * Pure validation of a submitted deck run: folds raw answers into
 * database-ready field values. Lives here rather than in actions/preferences.ts
 * (its only caller) because "use server" modules may only export async
 * functions, which would leave this logic untestable.
 */

/** Free-text answers longer than this are almost certainly a paste mistake. */
const MAX_NOTE_LENGTH = 300;

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

export type ParsedAnswers = {
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
 *
 * An *empty* answer — "" for single-select and text, [] for multi-select — is
 * an explicit skip and clears the stored value, which is different from an
 * absent id (no opinion expressed; the stored value is left alone). The deck
 * submits the empty form when a question is skipped, so skipping while
 * editing un-answers the question rather than silently keeping the old value.
 */
export function parseAnswers(
  deck: readonly PreferenceQuestion[],
  answers: PreferenceAnswers,
): ParsedAnswers | { error: string } {
  const parsed: ParsedAnswers = {
    profileFields: {},
    tripFields: {},
    interests: [],
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

    // single-select: "" is an explicit skip and clears the stored answer;
    // anything else must be a value the question offers.
    if (answer === "") {
      if (question.target.kind === "profileField") {
        assign(parsed.profileFields, question.target.field, null);
      } else if (question.target.kind === "tripField") {
        assign(parsed.tripFields, question.target.field, null);
      }
      continue;
    }

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
