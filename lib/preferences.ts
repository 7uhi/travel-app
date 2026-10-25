/**
 * Pure preference math: folding deck answers into interest weights, reducing a
 * group's profiles to one consensus, and rendering that consensus as prompt
 * context. No I/O; deterministic — given the same input, output is stable
 * regardless of member order.
 *
 * This is the seam every AI feature is meant to call, so that destination
 * recommendation, itinerary generation and replanning all reason about the
 * group the same way instead of each re-deriving it.
 */

import type {
  BudgetTier,
  Climate,
  DayRhythm,
  InterestTag,
  InterestWeight,
  LodgingStyle,
  TravelPace,
  TravelProfileSummary,
  TravelRegion,
  TripPreferenceSummary,
} from "@/types";

export const MIN_INTEREST_WEIGHT = -2;
export const MAX_INTEREST_WEIGHT = 2;

/** Clamps a weight into [MIN_INTEREST_WEIGHT, MAX_INTEREST_WEIGHT]. */
export function clampInterestWeight(weight: number): number {
  if (weight < MIN_INTEREST_WEIGHT) return MIN_INTEREST_WEIGHT;
  if (weight > MAX_INTEREST_WEIGHT) return MAX_INTEREST_WEIGHT;
  return weight;
}

/**
 * Folds one interest answer into a weight set. Returns a new array sorted by
 * tag with weight-0 entries dropped; the input is not mutated.
 *
 * Picked tags are set to `weight`, and any tag NOT picked whose current weight
 * is exactly `weight` is cleared. Clearing only at the answer's own weight is
 * what lets the +2 "love" and -2 "skip" questions both run over the same
 * option set without the second wiping out the first.
 *
 * Every answer is absolute — there is no delta mode. A trip answer writes its
 * own TripInterest set rather than nudging the durable one, so a member's
 * general taste is only ever changed by the account-level deck.
 */
export function applyInterestAnswer(
  current: InterestWeight[],
  answer: { tags: InterestTag[]; weight: number },
): InterestWeight[] {
  const weights = new Map<InterestTag, number>(
    current.map((entry) => [entry.tag, entry.weight]),
  );
  const picked = new Set(answer.tags);

  for (const [tag, weight] of weights) {
    // Only this answer's own weight is under its control.
    if (!picked.has(tag) && weight === answer.weight) weights.delete(tag);
  }
  for (const tag of picked) {
    weights.set(tag, clampInterestWeight(answer.weight));
  }

  return [...weights.entries()]
    .filter(([, weight]) => weight !== 0)
    .map(([tag, weight]) => ({ tag, weight }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * Merges a member's durable profile with their overrides for one trip, giving
 * the profile that actually applies here. This is the function every consumer
 * — the Preferences tab, group consensus, and any AI feature — should call:
 * reading either layer alone gives the wrong answer whenever a member has said
 * "this trip is different".
 *
 * Either layer may be missing. A member with trip answers but no durable
 * profile — the normal state for someone who followed an invite link straight
 * into the trip deck — counts as what they said here, laid over an empty
 * profile. Null comes back only when the member has answered nothing at all.
 *
 * A null override means "same as usual". Interests replace wholesale rather
 * than merging per tag, because an absent tag is otherwise ambiguous — it
 * can't mean both "not interested" and "defer to my usual".
 */
export function resolveEffectiveProfile(
  profile: TravelProfileSummary,
  trip: TripPreferenceSummary | null,
): TravelProfileSummary;
export function resolveEffectiveProfile(
  profile: TravelProfileSummary | null,
  trip: TripPreferenceSummary,
): TravelProfileSummary;
export function resolveEffectiveProfile(
  profile: TravelProfileSummary | null,
  trip: TripPreferenceSummary | null,
): TravelProfileSummary | null;
export function resolveEffectiveProfile(
  profile: TravelProfileSummary | null,
  trip: TripPreferenceSummary | null,
): TravelProfileSummary | null {
  if (!trip) return profile;
  const base = profile ?? emptyProfileFor(trip);

  return {
    ...base,
    budgetTier: trip.budgetComfort ?? base.budgetTier,
    interests: trip.interests.length > 0 ? trip.interests : base.interests,
  };
}

/** What a member who never ran the account deck implicitly has: no answers. */
function emptyProfileFor(trip: TripPreferenceSummary): TravelProfileSummary {
  return {
    userId: trip.userId,
    pace: null,
    budgetTier: null,
    dayRhythm: null,
    lodgingStyle: null,
    dietaryNotes: null,
    accessibilityNotes: null,
    interests: [],
    answeredAt: trip.answeredAt,
  };
}

/* ------------------------------------------------------------------ */
/* Group consensus                                                      */
/* ------------------------------------------------------------------ */

export interface GroupInterest {
  tag: InterestTag;
  /** Mean weight across the members who expressed one. */
  mean: number;
  /** Lowest weight any member gave it — the veto signal. */
  min: number;
  /** (mean + min) / 2 — the ranking key. */
  score: number;
  voterCount: number;
  /** How many members sit at MIN_INTEREST_WEIGHT. */
  vetoCount: number;
  /** True when some member sits at MIN_INTEREST_WEIGHT. */
  vetoed: boolean;
}

export interface GroupProfile {
  answeredCount: number;
  /** Sorted by score desc, then tag. Vetoed tags are included, flagged. */
  interests: GroupInterest[];
  pace: TravelPace | null;
  budgetTier: BudgetTier | null;
  dayRhythm: DayRhythm | null;
  lodgingStyle: LodgingStyle | null;
  /** Unioned, never averaged — these are hard filters. Sorted by userId. */
  dietary: { userId: string; note: string }[];
  accessibility: { userId: string; note: string }[];
}

/**
 * Reduces the group's durable profiles to one consensus.
 *
 * Interests are ranked by `(mean + min) / 2` rather than mean alone: on a group
 * trip a single hard "no" costs more than several mild "yes"es, so a day
 * everyone tolerates beats a day two people love and one hates. Both
 * components stay on the returned object so the UI can say "3 of 4 love this,
 * 1 would skip it" instead of showing one opaque number.
 *
 * Budget is the *lowest* tier anyone chose, not the mode: it's a constraint,
 * not a taste. If one member is on a shoestring, a plan above that excludes
 * them. Pace, rhythm and lodging are the mode, with ties broken toward the
 * more accommodating option — a relaxed plan absorbs an eager traveller, a
 * packed one excludes a tired traveller.
 */
export function aggregateGroupProfile(
  profiles: TravelProfileSummary[],
): GroupProfile {
  const byTag = new Map<InterestTag, number[]>();
  for (const profile of profiles) {
    for (const { tag, weight } of profile.interests) {
      const weights = byTag.get(tag);
      if (weights) weights.push(weight);
      else byTag.set(tag, [weight]);
    }
  }

  const interests: GroupInterest[] = [...byTag.entries()]
    .map(([tag, weights]) => {
      const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length;
      const min = Math.min(...weights);
      return {
        tag,
        mean,
        min,
        score: (mean + min) / 2,
        voterCount: weights.length,
        vetoCount: weights.filter((w) => w <= MIN_INTEREST_WEIGHT).length,
        vetoed: min <= MIN_INTEREST_WEIGHT,
      };
    })
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));

  return {
    answeredCount: profiles.length,
    interests,
    pace: mode(
      profiles.map((p) => p.pace),
      PACE_ACCOMMODATION,
    ),
    // Constraint, not taste: the lowest tier anyone chose.
    budgetTier: minBy(
      profiles.map((p) => p.budgetTier),
      BUDGET_ORDER,
    ),
    dayRhythm: mode(
      profiles.map((p) => p.dayRhythm),
      RHYTHM_ACCOMMODATION,
    ),
    lodgingStyle: mode(profiles.map((p) => p.lodgingStyle), LODGING_ORDER),
    dietary: collectNotes(profiles, (p) => p.dietaryNotes),
    accessibility: collectNotes(profiles, (p) => p.accessibilityNotes),
  };
}

export interface GroupTripPreference {
  answeredCount: number;
  budgetComfort: BudgetTier | null;
  /**
   * Intersection across the members who answered, with ANYWHERE as the
   * identity element. Empty means no single region works for everyone — which
   * is itself the answer the UI should show.
   */
  regions: TravelRegion[];
  /** Intersection, with NO_PREFERENCE as the identity element. */
  climates: Climate[];
  /** The strictest limit anyone set. */
  maxTravelHours: number | null;
  mustDos: { userId: string; note: string }[];
  dealBreakers: { userId: string; note: string }[];
}

/**
 * Reduces the group's per-trip answers. Region and climate intersect rather
 * than vote, because the group has to land on one destination that works for
 * everybody; travel time and budget take the strictest answer for the same
 * reason.
 */
export function aggregateTripPreferences(
  prefs: TripPreferenceSummary[],
): GroupTripPreference {
  const travelHours = prefs
    .map((p) => p.maxTravelHours)
    .filter((h): h is number => h !== null);

  return {
    answeredCount: prefs.length,
    budgetComfort: minBy(
      prefs.map((p) => p.budgetComfort),
      BUDGET_ORDER,
    ),
    regions: intersect(
      prefs.map((p) => p.preferredRegion),
      REGION_ORDER,
      "ANYWHERE",
    ),
    climates: intersect(
      prefs.map((p) => p.preferredClimate),
      CLIMATE_ORDER,
      "NO_PREFERENCE",
    ),
    maxTravelHours: travelHours.length > 0 ? Math.min(...travelHours) : null,
    mustDos: collectNotes(prefs, (p) => p.mustDo),
    dealBreakers: collectNotes(prefs, (p) => p.dealBreakers),
  };
}

/* ------------------------------------------------------------------ */
/* Conflicts                                                            */
/* ------------------------------------------------------------------ */

export interface PreferenceConflict {
  kind: "interest" | "pace" | "budget" | "dayRhythm" | "region" | "climate";
  /** Set only for kind "interest". */
  tag: InterestTag | null;
  /** Display-ready one-liner, e.g. "2 keen, 1 would skip". */
  summary: string;
  forUserIds: string[];
  againstUserIds: string[];
  /** 1 = worth knowing, 2 = plan around it. */
  severity: 1 | 2;
}

/**
 * Finds the places the group genuinely disagrees, so they can be surfaced
 * before the trip rather than discovered on day three. Sorted most severe
 * first; deterministic for any input order.
 */
export function findPreferenceConflicts(
  profiles: TravelProfileSummary[],
): PreferenceConflict[] {
  const conflicts: PreferenceConflict[] = [];

  const byTag = new Map<InterestTag, { userId: string; weight: number }[]>();
  for (const profile of profiles) {
    for (const { tag, weight } of profile.interests) {
      const entries = byTag.get(tag);
      if (entries) entries.push({ userId: profile.userId, weight });
      else byTag.set(tag, [{ userId: profile.userId, weight }]);
    }
  }

  for (const [tag, entries] of byTag) {
    const keen = entries.filter((e) => e.weight >= 1);
    const against = entries.filter((e) => e.weight <= -1);
    if (keen.length === 0 || against.length === 0) continue;

    const extreme =
      keen.some((e) => e.weight >= MAX_INTEREST_WEIGHT) &&
      against.some((e) => e.weight <= MIN_INTEREST_WEIGHT);

    conflicts.push({
      kind: "interest",
      tag,
      summary: `${keen.length} keen, ${against.length} would skip`,
      forUserIds: keen.map((e) => e.userId).sort(),
      againstUserIds: against.map((e) => e.userId).sort(),
      severity: extreme ? 2 : 1,
    });
  }

  // BALANCED sits between the two and never conflicts with either.
  const relaxed = usersWith(profiles, (p) => p.pace === "RELAXED");
  const packed = usersWith(profiles, (p) => p.pace === "PACKED");
  if (relaxed.length > 0 && packed.length > 0) {
    conflicts.push({
      kind: "pace",
      tag: null,
      summary: `${relaxed.length} want it slow, ${packed.length} want it packed`,
      forUserIds: packed,
      againstUserIds: relaxed,
      severity: 2,
    });
  }

  // Adjacent tiers never conflict — only a shoestring against the top end.
  const shoestring = usersWith(profiles, (p) => p.budgetTier === "SHOESTRING");
  const bigSpend = usersWith(
    profiles,
    (p) => p.budgetTier === "COMFORT" || p.budgetTier === "LUXURY",
  );
  if (shoestring.length > 0 && bigSpend.length > 0) {
    conflicts.push({
      kind: "budget",
      tag: null,
      summary: `${shoestring.length} on a shoestring, ${bigSpend.length} ready to spend`,
      forUserIds: bigSpend,
      againstUserIds: shoestring,
      severity: 2,
    });
  }

  const early = usersWith(profiles, (p) => p.dayRhythm === "EARLY_BIRD");
  const late = usersWith(profiles, (p) => p.dayRhythm === "NIGHT_OWL");
  if (early.length > 0 && late.length > 0) {
    conflicts.push({
      kind: "dayRhythm",
      tag: null,
      // Schedulable around, so this is worth knowing rather than a blocker.
      summary: `${early.length} up at dawn, ${late.length} out late`,
      forUserIds: late,
      againstUserIds: early,
      severity: 1,
    });
  }

  return conflicts.sort(
    (a, b) =>
      b.severity - a.severity ||
      a.kind.localeCompare(b.kind) ||
      (a.tag ?? "").localeCompare(b.tag ?? ""),
  );
}

/* ------------------------------------------------------------------ */
/* Trip-dimension conflicts                                               */
/* ------------------------------------------------------------------ */

/**
 * Where the group wants incompatible things for this trip: region or climate
 * answers with no single option that works for everyone.
 *
 * Unlike `aggregateTripPreferences` — which collapses disagreement to an
 * empty array that is indistinguishable from "nobody answered" — each entry
 * here names the dimension and the distinct answers given, most-voted first
 * (ties alphabetical), so the UI and the AI context can say "no compatible
 * option" instead of silently dropping the question. Deterministic for any
 * input order.
 */
export function findTripConflicts(
  prefs: TripPreferenceSummary[],
): PreferenceConflict[] {
  const conflicts: PreferenceConflict[] = [];
  const region = disagreeingCamps(prefs, (p) => p.preferredRegion, "ANYWHERE");
  if (region) {
    conflicts.push({
      kind: "region",
      tag: null,
      summary: `want different regions: ${region.summary}`,
      forUserIds: region.forUserIds,
      againstUserIds: region.againstUserIds,
      severity: 2,
    });
  }
  const climate = disagreeingCamps(
    prefs,
    (p) => p.preferredClimate,
    "NO_PREFERENCE",
  );
  if (climate) {
    conflicts.push({
      kind: "climate",
      tag: null,
      summary: `want different weather: ${climate.summary}`,
      forUserIds: climate.forUserIds,
      againstUserIds: climate.againstUserIds,
      severity: 2,
    });
  }
  return conflicts.sort(
    (a, b) => b.severity - a.severity || a.kind.localeCompare(b.kind),
  );
}

/**
 * The distinct specific answers for one trip dimension, or null when there
 * is no disagreement: nobody answered specifically, everyone agrees, or the
 * only answers are "don't care". `forUserIds` holds the largest camp
 * (ties: the alphabetically-first value); `againstUserIds` holds everyone
 * else who answered specifically. All ids sorted.
 */
function disagreeingCamps<T extends string>(
  prefs: TripPreferenceSummary[],
  pick: (pref: TripPreferenceSummary) => T | null,
  identity: T,
): { summary: string; forUserIds: string[]; againstUserIds: string[] } | null {
  const byValue = new Map<T, string[]>();
  for (const pref of prefs) {
    const value = pick(pref);
    if (value === null || value === identity) continue;
    const ids = byValue.get(value);
    if (ids) ids.push(pref.userId);
    else byValue.set(value, [pref.userId]);
  }
  if (byValue.size < 2) return null;
  const camps = [...byValue.entries()]
    .map(([value, userIds]) => ({ value, userIds: [...userIds].sort() }))
    .sort(
      (a, b) => b.userIds.length - a.userIds.length || a.value.localeCompare(b.value),
    );
  return {
    summary: camps.map((camp) => camp.value).join(" vs "),
    forUserIds: camps[0].userIds,
    againstUserIds: camps
      .slice(1)
      .flatMap((camp) => camp.userIds)
      .sort(),
  };
}

/* ------------------------------------------------------------------ */
/* Prompt context                                                       */
/* ------------------------------------------------------------------ */

/**
 * Renders the group's preferences as a compact text block for LLM prompting.
 * Centralized so every AI feature describes the group identically.
 *
 * Determinism rules, which are the whole point of keeping this in one place:
 * fixed section order; tags sorted by score then name; numbers via toFixed(1);
 * notes sorted by userId; dates as ISO YYYY-MM-DD; no Intl (its output varies
 * with the runtime's ICU version, which would break both snapshot tests and
 * any future prompt caching); no Date.now(). Empty sections are omitted
 * entirely rather than emitted with a placeholder — except an incompatible
 * region/climate intersection, which is stated explicitly ("no compatible
 * option") so a reader can tell "nobody answered" apart from "members
 * disagree".
 *
 * Pass the durable profiles: per-trip overrides are applied here, so a caller
 * can't accidentally describe the group by their usual preferences when
 * someone has said this trip is different. Members present only in
 * tripPreferences count too, over an empty profile — a member who joined via
 * invite and answered only the trip deck is still part of the group.
 */
export function profileToPromptContext(input: {
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  currency: string;
  totalBudget: number | null;
  profiles: TravelProfileSummary[];
  tripPreferences: TripPreferenceSummary[];
}): string {
  const overrides = new Map(
    input.tripPreferences.map((pref) => [pref.userId, pref]),
  );
  const withProfile = new Set(input.profiles.map((profile) => profile.userId));
  const effective = [
    ...input.profiles.map((profile) =>
      resolveEffectiveProfile(profile, overrides.get(profile.userId) ?? null),
    ),
    ...input.tripPreferences
      .filter((pref) => !withProfile.has(pref.userId))
      .map((pref) => resolveEffectiveProfile(null, pref)),
  ];

  const group = aggregateGroupProfile(effective);
  const groupTrip = aggregateTripPreferences(input.tripPreferences);
  const tripConflicts = findTripConflicts(input.tripPreferences);
  const tripConflictByKind = new Map(tripConflicts.map((c) => [c.kind, c]));
  const conflicts = [...findPreferenceConflicts(effective), ...tripConflicts].sort(
    (a, b) =>
      b.severity - a.severity ||
      a.kind.localeCompare(b.kind) ||
      (a.tag ?? "").localeCompare(b.tag ?? ""),
  );
  const lines: string[] = [];

  lines.push("TRIP");
  lines.push(`  Destination: ${input.destination ?? "undecided"}`);
  if (input.startDate && input.endDate) {
    const days = input.durationDays;
    lines.push(
      `  Dates: ${isoDay(input.startDate)} to ${isoDay(input.endDate)}` +
        (days ? ` (${days} days)` : ""),
    );
  } else if (input.durationDays) {
    lines.push(`  Dates: undecided (${input.durationDays} days)`);
  }
  if (input.totalBudget !== null) {
    lines.push(`  Budget: ${input.totalBudget} ${input.currency} total`);
  }

  lines.push(`GROUP (${group.answeredCount} answered)`);
  if (group.pace) lines.push(`  Pace: ${group.pace}`);
  if (group.budgetTier) {
    lines.push(
      `  Budget ceiling: ${group.budgetTier} (lowest of ${group.answeredCount} answers)`,
    );
  }
  if (group.dayRhythm) lines.push(`  Day rhythm: ${group.dayRhythm}`);
  if (group.lodgingStyle) lines.push(`  Lodging: ${group.lodgingStyle}`);

  const liked = group.interests.filter((i) => !i.vetoed && i.score > 0);
  if (liked.length > 0) {
    lines.push(
      `  Interests: ${liked
        .map((i) => `${i.tag} (${signed(i.mean)})`)
        .join(", ")}`,
    );
  }
  const avoid = group.interests.filter((i) => i.vetoed);
  if (avoid.length > 0) {
    lines.push(
      `  Avoid: ${avoid
        .map((i) => `${i.tag} (vetoed by ${i.vetoCount})`)
        .join(", ")}`,
    );
  }

  if (group.dietary.length > 0 || group.accessibility.length > 0) {
    lines.push("HARD CONSTRAINTS (must be respected)");
    if (group.dietary.length > 0) {
      lines.push(`  Dietary: ${group.dietary.map((n) => n.note).join("; ")}`);
    }
    if (group.accessibility.length > 0) {
      lines.push(
        `  Accessibility: ${group.accessibility.map((n) => n.note).join("; ")}`,
      );
    }
  }

  const tripLines: string[] = [];
  const where: string[] = [];
  if (groupTrip.regions.length > 0) {
    where.push(`Region: ${groupTrip.regions.join("/")}`);
  } else {
    // An empty intersection is ambiguous on its own: "nobody answered" and
    // "no single option works for everyone" both collapse to []. Only the
    // second is stated, so "unanswered" stays silent and "disagree" is loud.
    const regionConflict = tripConflictByKind.get("region");
    if (regionConflict) {
      where.push(`Region: no compatible option (${regionConflict.summary})`);
    }
  }
  if (groupTrip.climates.length > 0) {
    where.push(`climate: ${groupTrip.climates.join("/")}`);
  } else {
    const climateConflict = tripConflictByKind.get("climate");
    if (climateConflict) {
      where.push(`climate: no compatible option (${climateConflict.summary})`);
    }
  }
  if (groupTrip.maxTravelHours !== null) {
    where.push(`max travel: ${groupTrip.maxTravelHours}h`);
  }
  if (where.length > 0) tripLines.push(`  ${where.join("; ")}`);
  if (groupTrip.mustDos.length > 0) {
    tripLines.push(`  Must-do: ${groupTrip.mustDos.map((n) => n.note).join("; ")}`);
  }
  if (groupTrip.dealBreakers.length > 0) {
    tripLines.push(
      `  Deal-breakers: ${groupTrip.dealBreakers.map((n) => n.note).join("; ")}`,
    );
  }
  if (tripLines.length > 0) {
    lines.push("THIS TRIP");
    lines.push(...tripLines);
  }

  if (conflicts.length > 0) {
    lines.push("CONFLICTS");
    for (const conflict of conflicts) {
      lines.push(`  ${conflict.tag ?? conflict.kind}: ${conflict.summary}`);
    }
  }

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Ordered least- to most-expensive; index doubles as the comparison key. */
const BUDGET_ORDER: readonly BudgetTier[] = [
  "SHOESTRING",
  "MODERATE",
  "COMFORT",
  "LUXURY",
];

/** Mode tie-break order: the most accommodating option wins. */
const PACE_ACCOMMODATION: readonly TravelPace[] = [
  "RELAXED",
  "BALANCED",
  "PACKED",
];
const RHYTHM_ACCOMMODATION: readonly DayRhythm[] = [
  "FLEXIBLE",
  "EARLY_BIRD",
  "NIGHT_OWL",
];
const LODGING_ORDER: readonly LodgingStyle[] = [
  "HOSTEL",
  "RENTAL",
  "HOTEL",
  "BOUTIQUE",
  "CAMPING",
];
const REGION_ORDER: readonly TravelRegion[] = [
  "ANYWHERE",
  "DOMESTIC",
  "EUROPE",
  "ASIA",
  "AFRICA",
  "NORTH_AMERICA",
  "SOUTH_AMERICA",
  "OCEANIA",
];
const CLIMATE_ORDER: readonly Climate[] = [
  "WARM",
  "MILD",
  "COLD",
  "NO_PREFERENCE",
];

/**
 * Most common non-null value. Ties go to whichever candidate comes first in
 * `tieBreak`, so the result never depends on member order.
 */
function mode<T extends string>(
  values: (T | null)[],
  tieBreak: readonly T[],
): T | null {
  const counts = new Map<T, number>();
  for (const value of values) {
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  let best: T | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount &&
        best !== null &&
        tieBreak.indexOf(value) < tieBreak.indexOf(best))
    ) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** The answered value earliest in `order` — i.e. the strictest. */
function minBy<T extends string>(
  values: (T | null)[],
  order: readonly T[],
): T | null {
  let best: T | null = null;
  for (const value of values) {
    if (value === null) continue;
    if (best === null || order.indexOf(value) < order.indexOf(best)) {
      best = value;
    }
  }
  return best;
}

/**
 * Intersects each member's single choice, treating `identity` as compatible
 * with everything. Members who didn't answer are ignored entirely.
 */
function intersect<T extends string>(
  values: (T | null)[],
  order: readonly T[],
  identity: T,
): T[] {
  const answered = values.filter((v): v is T => v !== null);
  if (answered.length === 0) return [];

  const specific = new Set(answered.filter((v) => v !== identity));
  // Everyone said "don't care": every option is still on the table.
  if (specific.size === 0) return [identity];
  // More than one specific answer means no single option satisfies everyone.
  if (specific.size > 1) return [];

  const [only] = specific;
  return order.filter((option) => option === only);
}

/** Non-empty notes with their author, sorted by userId for determinism. */
function collectNotes<T extends { userId: string }>(
  rows: T[],
  pick: (row: T) => string | null,
): { userId: string; note: string }[] {
  return rows
    .map((row) => ({ userId: row.userId, note: pick(row)?.trim() ?? "" }))
    .filter((entry) => entry.note !== "")
    .sort((a, b) => a.userId.localeCompare(b.userId));
}

/** Ids of the members matching a predicate, sorted for determinism. */
function usersWith(
  profiles: TravelProfileSummary[],
  predicate: (profile: TravelProfileSummary) => boolean,
): string[] {
  return profiles.filter(predicate).map((p) => p.userId).sort();
}

/** "+2.0" / "-1.5" — fixed precision, no Intl. */
function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

/** ISO datetime or date string → "YYYY-MM-DD". */
function isoDay(iso: string): string {
  return iso.slice(0, 10);
}
