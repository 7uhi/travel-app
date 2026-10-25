import { describe, expect, it } from "vitest";

import {
  aggregateGroupProfile,
  aggregateTripPreferences,
  applyInterestAnswer,
  clampInterestWeight,
  findPreferenceConflicts,
  findTripConflicts,
  profileToPromptContext,
  resolveEffectiveProfile,
} from "@/lib/preferences";
import type {
  InterestTag,
  TravelProfileSummary,
  TripPreferenceSummary,
} from "@/types";

const profile = (
  userId: string,
  over: Partial<TravelProfileSummary> = {},
): TravelProfileSummary => ({
  userId,
  pace: null,
  budgetTier: null,
  dayRhythm: null,
  lodgingStyle: null,
  dietaryNotes: null,
  accessibilityNotes: null,
  interests: [],
  answeredAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

const tripPref = (
  userId: string,
  over: Partial<TripPreferenceSummary> = {},
): TripPreferenceSummary => ({
  userId,
  budgetComfort: null,
  interests: [],
  mustDo: null,
  dealBreakers: null,
  preferredRegion: null,
  preferredClimate: null,
  maxTravelHours: null,
  answeredAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

const w = (tag: InterestTag, weight: number) => ({ tag, weight });

describe("clampInterestWeight", () => {
  it("clamps both ends to the documented range", () => {
    expect(clampInterestWeight(5)).toBe(2);
    expect(clampInterestWeight(-5)).toBe(-2);
  });

  it("passes in-range values through unchanged", () => {
    expect(clampInterestWeight(1)).toBe(1);
    expect(clampInterestWeight(-2)).toBe(-2);
  });

  it("leaves zero alone", () => {
    expect(clampInterestWeight(0)).toBe(0);
  });
});

describe("applyInterestAnswer", () => {
  it("sets picked tags to the answer's weight, overwriting any prior value", () => {
    const result = applyInterestAnswer([w("FOOD", -2)], {
      tags: ["FOOD"],
      weight: 2,
    });
    expect(result).toEqual([w("FOOD", 2)]);
  });

  it("creates an absent tag at the answer's weight", () => {
    const result = applyInterestAnswer([], { tags: ["HIKING"], weight: 2 });
    expect(result).toEqual([w("HIKING", 2)]);
  });

  it("clamps a weight outside the documented range", () => {
    const result = applyInterestAnswer([], { tags: ["FOOD"], weight: 7 });
    expect(result).toEqual([w("FOOD", 2)]);
  });

  it("clears an unpicked tag sitting at exactly the answer's weight", () => {
    const result = applyInterestAnswer([w("FOOD", 2), w("BEACH", 2)], {
      tags: ["FOOD"],
      weight: 2,
    });
    expect(result).toEqual([w("FOOD", 2)]);
  });

  it("does not clear an unpicked tag at a different weight", () => {
    // The +2 "love" and -2 "skip" questions run over the same option set;
    // the second must not wipe out the first.
    const afterLove = applyInterestAnswer([], { tags: ["FOOD"], weight: 2 });
    const afterSkip = applyInterestAnswer(afterLove, {
      tags: ["NIGHTLIFE"],
      weight: -2,
    });
    expect(afterSkip).toEqual([w("FOOD", 2), w("NIGHTLIFE", -2)]);
  });

  it("is idempotent: re-answering the same way changes nothing", () => {
    // Absolute answers, so repeating a deck run can't drift the weights.
    const once = applyInterestAnswer([], { tags: ["FOOD"], weight: 2 });
    const twice = applyInterestAnswer(once, { tags: ["FOOD"], weight: 2 });
    expect(twice).toEqual(once);
  });

  it("sorts by tag, drops zero weights, and does not mutate the input", () => {
    const input = [w("NIGHTLIFE", 2), w("BEACH", 1)];
    const result = applyInterestAnswer(input, { tags: [], weight: 2 });
    expect(result).toEqual([w("BEACH", 1)]);
    expect(input).toEqual([w("NIGHTLIFE", 2), w("BEACH", 1)]);
  });
});

describe("resolveEffectiveProfile", () => {
  it("returns the durable profile when there are no trip answers", () => {
    const p = profile("a", { budgetTier: "MODERATE", interests: [w("FOOD", 2)] });
    expect(resolveEffectiveProfile(p, null)).toEqual(p);
  });

  it("lets a trip budget override the usual tier", () => {
    const p = profile("a", { budgetTier: "SHOESTRING" });
    const effective = resolveEffectiveProfile(
      p,
      tripPref("a", { budgetComfort: "LUXURY" }),
    );
    expect(effective.budgetTier).toBe("LUXURY");
  });

  it("keeps the usual tier when the trip answer is blank", () => {
    const p = profile("a", { budgetTier: "SHOESTRING" });
    const effective = resolveEffectiveProfile(p, tripPref("a"));
    expect(effective.budgetTier).toBe("SHOESTRING");
  });

  it("replaces interests wholesale when the trip has its own", () => {
    const p = profile("a", { interests: [w("FOOD", 2), w("HIKING", 2)] });
    const effective = resolveEffectiveProfile(
      p,
      tripPref("a", { interests: [w("NIGHTLIFE", 2)] }),
    );
    expect(effective.interests).toEqual([w("NIGHTLIFE", 2)]);
  });

  it("falls back to durable interests when the trip set is empty", () => {
    const p = profile("a", { interests: [w("FOOD", 2)] });
    const effective = resolveEffectiveProfile(p, tripPref("a"));
    expect(effective.interests).toEqual([w("FOOD", 2)]);
  });

  it("never lets a trip answer change durable-only fields", () => {
    const p = profile("a", { pace: "RELAXED", dietaryNotes: "vegetarian" });
    const effective = resolveEffectiveProfile(
      p,
      tripPref("a", { budgetComfort: "LUXURY" }),
    );
    expect(effective.pace).toBe("RELAXED");
    expect(effective.dietaryNotes).toBe("vegetarian");
  });

  it("builds an effective profile from trip answers alone", () => {
    // The default invite path: straight into the trip deck, no durable
    // profile. The member still counts as what they said for this trip.
    const effective = resolveEffectiveProfile(
      null,
      tripPref("a", {
        budgetComfort: "SHOESTRING",
        interests: [w("HIKING", 2)],
      }),
    );
    expect(effective.userId).toBe("a");
    expect(effective.budgetTier).toBe("SHOESTRING");
    expect(effective.interests).toEqual([w("HIKING", 2)]);
    expect(effective.pace).toBeNull();
    expect(effective.dietaryNotes).toBeNull();
  });

  it("returns null only when the member answered nothing at all", () => {
    expect(resolveEffectiveProfile(null, null)).toBeNull();
  });
});

describe("aggregateGroupProfile", () => {
  it("returns an empty consensus for no profiles", () => {
    const group = aggregateGroupProfile([]);
    expect(group.answeredCount).toBe(0);
    expect(group.interests).toEqual([]);
    expect(group.pace).toBeNull();
    expect(group.budgetTier).toBeNull();
    expect(group.dietary).toEqual([]);
  });

  it("computes interest stats over the members who expressed one", () => {
    const group = aggregateGroupProfile([
      profile("a", { interests: [w("FOOD", 2)] }),
      profile("b", { interests: [w("FOOD", 1)] }),
      profile("c"),
    ]);
    const food = group.interests.find((i) => i.tag === "FOOD")!;
    expect(food.voterCount).toBe(2);
    expect(food.mean).toBe(1.5);
    expect(food.min).toBe(1);
    expect(food.vetoed).toBe(false);
  });

  it("ranks a divisive tag below a mildly liked one", () => {
    // FOOD [+2,+2,-2] has the higher mean but someone will have a bad day.
    const group = aggregateGroupProfile([
      profile("a", { interests: [w("FOOD", 2), w("HIKING", 1)] }),
      profile("b", { interests: [w("FOOD", 2), w("HIKING", 1)] }),
      profile("c", { interests: [w("FOOD", -2), w("HIKING", 1)] }),
    ]);
    expect(group.interests.map((i) => i.tag)).toEqual(["HIKING", "FOOD"]);
  });

  it("flags vetoed tags but keeps them in the output", () => {
    const group = aggregateGroupProfile([
      profile("a", { interests: [w("NIGHTLIFE", 2)] }),
      profile("b", { interests: [w("NIGHTLIFE", -2)] }),
    ]);
    const nightlife = group.interests.find((i) => i.tag === "NIGHTLIFE")!;
    expect(nightlife.vetoed).toBe(true);
    expect(nightlife.vetoCount).toBe(1);
  });

  it("takes the mode for pace, breaking ties toward the relaxed option", () => {
    expect(
      aggregateGroupProfile([
        profile("a", { pace: "PACKED" }),
        profile("b", { pace: "PACKED" }),
        profile("c", { pace: "RELAXED" }),
      ]).pace,
    ).toBe("PACKED");

    expect(
      aggregateGroupProfile([
        profile("a", { pace: "PACKED" }),
        profile("b", { pace: "RELAXED" }),
      ]).pace,
    ).toBe("RELAXED");
  });

  it("takes the lowest budget tier, not the mode", () => {
    // Budget is a constraint: a plan above the lowest tier excludes someone.
    const group = aggregateGroupProfile([
      profile("a", { budgetTier: "LUXURY" }),
      profile("b", { budgetTier: "LUXURY" }),
      profile("c", { budgetTier: "SHOESTRING" }),
    ]);
    expect(group.budgetTier).toBe("SHOESTRING");
  });

  it("unions hard constraints by userId and drops blank notes", () => {
    const group = aggregateGroupProfile([
      profile("b", { dietaryNotes: "vegetarian" }),
      profile("a", { dietaryNotes: "no shellfish" }),
      profile("c", { dietaryNotes: "   " }),
    ]);
    expect(group.dietary).toEqual([
      { userId: "a", note: "no shellfish" },
      { userId: "b", note: "vegetarian" },
    ]);
  });

  it("excludes unanswered fields rather than counting them", () => {
    const group = aggregateGroupProfile([
      profile("a", { lodgingStyle: "HOTEL" }),
      profile("b"),
      profile("c"),
    ]);
    expect(group.lodgingStyle).toBe("HOTEL");
    expect(group.answeredCount).toBe(3);
  });
});

describe("aggregateTripPreferences", () => {
  it("intersects regions, treating ANYWHERE as compatible with everything", () => {
    const group = aggregateTripPreferences([
      tripPref("a", { preferredRegion: "EUROPE" }),
      tripPref("b", { preferredRegion: "ANYWHERE" }),
    ]);
    expect(group.regions).toEqual(["EUROPE"]);
  });

  it("returns no region when the answers are disjoint", () => {
    const group = aggregateTripPreferences([
      tripPref("a", { preferredRegion: "EUROPE" }),
      tripPref("b", { preferredRegion: "ASIA" }),
    ]);
    expect(group.regions).toEqual([]);
  });

  it("keeps every option open when everyone says they don't care", () => {
    const group = aggregateTripPreferences([
      tripPref("a", { preferredRegion: "ANYWHERE" }),
      tripPref("b", { preferredRegion: "ANYWHERE" }),
    ]);
    expect(group.regions).toEqual(["ANYWHERE"]);
  });

  it("intersects climates with NO_PREFERENCE as the identity", () => {
    const group = aggregateTripPreferences([
      tripPref("a", { preferredClimate: "WARM" }),
      tripPref("b", { preferredClimate: "NO_PREFERENCE" }),
    ]);
    expect(group.climates).toEqual(["WARM"]);
  });

  it("takes the strictest travel limit and ignores unanswered ones", () => {
    const group = aggregateTripPreferences([
      tripPref("a", { maxTravelHours: 12 }),
      tripPref("b", { maxTravelHours: 6 }),
      tripPref("c"),
    ]);
    expect(group.maxTravelHours).toBe(6);
  });

  it("takes the lowest per-trip budget and unions the notes", () => {
    const group = aggregateTripPreferences([
      tripPref("b", { budgetComfort: "COMFORT", mustDo: "night market" }),
      tripPref("a", { budgetComfort: "MODERATE", dealBreakers: "6am starts" }),
    ]);
    expect(group.budgetComfort).toBe("MODERATE");
    expect(group.mustDos).toEqual([{ userId: "b", note: "night market" }]);
    expect(group.dealBreakers).toEqual([{ userId: "a", note: "6am starts" }]);
  });
});

describe("findPreferenceConflicts", () => {
  it("reports a full-spread interest disagreement as severity 2", () => {
    const [conflict] = findPreferenceConflicts([
      profile("a", { interests: [w("NIGHTLIFE", 2)] }),
      profile("b", { interests: [w("NIGHTLIFE", -2)] }),
    ]);
    expect(conflict).toMatchObject({
      kind: "interest",
      tag: "NIGHTLIFE",
      severity: 2,
      forUserIds: ["a"],
      againstUserIds: ["b"],
    });
    expect(conflict.summary).toBe("1 keen, 1 would skip");
  });

  it("reports a mild interest disagreement as severity 1", () => {
    const [conflict] = findPreferenceConflicts([
      profile("a", { interests: [w("SHOPPING", 1)] }),
      profile("b", { interests: [w("SHOPPING", -1)] }),
    ]);
    expect(conflict.severity).toBe(1);
  });

  it("finds no conflict when everyone leans the same way", () => {
    expect(
      findPreferenceConflicts([
        profile("a", { interests: [w("FOOD", 2)] }),
        profile("b", { interests: [w("FOOD", 1)] }),
      ]),
    ).toEqual([]);
  });

  it("conflicts on pace only at the extremes", () => {
    expect(
      findPreferenceConflicts([
        profile("a", { pace: "RELAXED" }),
        profile("b", { pace: "PACKED" }),
      ]).map((c) => c.kind),
    ).toEqual(["pace"]);

    expect(
      findPreferenceConflicts([
        profile("a", { pace: "BALANCED" }),
        profile("b", { pace: "PACKED" }),
      ]),
    ).toEqual([]);
  });

  it("conflicts on budget only across non-adjacent tiers", () => {
    expect(
      findPreferenceConflicts([
        profile("a", { budgetTier: "SHOESTRING" }),
        profile("b", { budgetTier: "LUXURY" }),
      ]).map((c) => c.kind),
    ).toEqual(["budget"]);

    expect(
      findPreferenceConflicts([
        profile("a", { budgetTier: "MODERATE" }),
        profile("b", { budgetTier: "COMFORT" }),
      ]),
    ).toEqual([]);
  });

  it("sorts severity first and stays stable under input reordering", () => {
    const members = [
      profile("a", {
        dayRhythm: "EARLY_BIRD",
        interests: [w("NIGHTLIFE", 2)],
      }),
      profile("b", {
        dayRhythm: "NIGHT_OWL",
        interests: [w("NIGHTLIFE", -2)],
      }),
    ];
    const forward = findPreferenceConflicts(members);
    const reversed = findPreferenceConflicts([...members].reverse());
    expect(forward.map((c) => [c.kind, c.severity])).toEqual([
      ["interest", 2],
      ["dayRhythm", 1],
    ]);
    expect(reversed).toEqual(forward);
  });
});

describe("profileToPromptContext", () => {
  const baseInput = {
    destination: null as string | null,
    startDate: null as string | null,
    endDate: null as string | null,
    durationDays: null as number | null,
    currency: "USD",
    totalBudget: null as number | null,
    profiles: [] as TravelProfileSummary[],
    tripPreferences: [] as TripPreferenceSummary[],
  };

  it("is identical regardless of member order", () => {
    const profiles = [
      profile("a", { pace: "RELAXED", interests: [w("FOOD", 2)] }),
      profile("b", { pace: "RELAXED", interests: [w("FOOD", 1)] }),
    ];
    const forward = profileToPromptContext({ ...baseInput, profiles });
    const reversed = profileToPromptContext({
      ...baseInput,
      profiles: [...profiles].reverse(),
    });
    expect(reversed).toBe(forward);
  });

  it("renders an undecided destination explicitly", () => {
    expect(profileToPromptContext(baseInput)).toContain(
      "Destination: undecided",
    );
  });

  it("omits empty sections rather than emitting placeholders", () => {
    const block = profileToPromptContext(baseInput);
    expect(block).not.toContain("HARD CONSTRAINTS");
    expect(block).not.toContain("THIS TRIP");
    expect(block).not.toContain("CONFLICTS");
  });

  it("counts a member who only answered the trip deck", () => {
    // Their trip-level budget must reach the group ceiling even though they
    // have no durable profile — the ceiling exists to protect exactly them.
    const block = profileToPromptContext({
      ...baseInput,
      profiles: [profile("a", { budgetTier: "LUXURY" })],
      tripPreferences: [tripPref("b", { budgetComfort: "SHOESTRING" })],
    });
    expect(block).toContain("GROUP (2 answered)");
    expect(block).toContain(
      "Budget ceiling: SHOESTRING (lowest of 2 answers)",
    );
  });

  it("always includes hard constraints, even for one member", () => {
    const block = profileToPromptContext({
      ...baseInput,
      profiles: [profile("a", { dietaryNotes: "severe tree-nut allergy" })],
    });
    expect(block).toContain("HARD CONSTRAINTS (must be respected)");
    expect(block).toContain("Dietary: severe tree-nut allergy");
  });

  it("renders the whole block deterministically", () => {
    const block = profileToPromptContext({
      destination: null,
      startDate: "2026-09-12T00:00:00.000Z",
      endDate: "2026-09-18T00:00:00.000Z",
      durationDays: 7,
      currency: "USD",
      totalBudget: 2000,
      profiles: [
        profile("a", {
          pace: "RELAXED",
          budgetTier: "SHOESTRING",
          dayRhythm: "NIGHT_OWL",
          lodgingStyle: "RENTAL",
          dietaryNotes: "vegetarian, no shellfish",
          interests: [w("FOOD", 2), w("NIGHTLIFE", 2)],
        }),
        profile("b", {
          pace: "RELAXED",
          budgetTier: "COMFORT",
          dayRhythm: "NIGHT_OWL",
          lodgingStyle: "RENTAL",
          accessibilityNotes: "bad knee - no long stair climbs",
          interests: [w("FOOD", 2), w("NIGHTLIFE", -2)],
        }),
      ],
      tripPreferences: [
        tripPref("a", {
          preferredRegion: "EUROPE",
          preferredClimate: "WARM",
          maxTravelHours: 6,
          mustDo: "the night market",
          dealBreakers: "6am wake-ups",
        }),
      ],
    });

    expect(block).toBe(
      [
        "TRIP",
        "  Destination: undecided",
        "  Dates: 2026-09-12 to 2026-09-18 (7 days)",
        "  Budget: 2000 USD total",
        "GROUP (2 answered)",
        "  Pace: RELAXED",
        "  Budget ceiling: SHOESTRING (lowest of 2 answers)",
        "  Day rhythm: NIGHT_OWL",
        "  Lodging: RENTAL",
        "  Interests: FOOD (+2.0)",
        "  Avoid: NIGHTLIFE (vetoed by 1)",
        "HARD CONSTRAINTS (must be respected)",
        "  Dietary: vegetarian, no shellfish",
        "  Accessibility: bad knee - no long stair climbs",
        "THIS TRIP",
        "  Region: EUROPE; climate: WARM; max travel: 6h",
        "  Must-do: the night market",
        "  Deal-breakers: 6am wake-ups",
        "CONFLICTS",
        // Same severity, so the tie-break is kind: "budget" before "interest".
        "  budget: 1 on a shoestring, 1 ready to spend",
        "  NIGHTLIFE: 1 keen, 1 would skip",
      ].join("\n"),
    );
  });

  it("states incompatible regions explicitly instead of dropping them", () => {
    const block = profileToPromptContext({
      ...baseInput,
      tripPreferences: [
        tripPref("a", { preferredRegion: "EUROPE" }),
        tripPref("b", { preferredRegion: "ASIA" }),
      ],
    });
    expect(block).toContain(
      "Region: no compatible option (want different regions: ASIA vs EUROPE)",
    );
  });

  it("keeps an agreed climate visible when regions disagree", () => {
    const block = profileToPromptContext({
      ...baseInput,
      tripPreferences: [
        tripPref("a", { preferredRegion: "EUROPE", preferredClimate: "WARM" }),
        tripPref("b", {
          preferredRegion: "ASIA",
          preferredClimate: "NO_PREFERENCE",
        }),
      ],
    });
    expect(block).toContain("Region: no compatible option");
    expect(block).toContain("climate: WARM");
  });

  it("stays silent on region/climate when nobody answered them", () => {
    const block = profileToPromptContext({
      ...baseInput,
      tripPreferences: [tripPref("a", { mustDo: "night market" })],
    });
    expect(block).not.toContain("Region:");
    expect(block).not.toContain("climate:");
    expect(block).not.toContain("no compatible option");
  });

  it("lists trip-dimension disagreements under CONFLICTS", () => {
    const block = profileToPromptContext({
      ...baseInput,
      tripPreferences: [
        tripPref("a", { preferredClimate: "WARM" }),
        tripPref("b", { preferredClimate: "COLD" }),
      ],
    });
    expect(block).toContain("CONFLICTS");
    expect(block).toContain("climate: want different weather: COLD vs WARM");
  });
});

describe("findTripConflicts", () => {
  it("reports disjoint regions with the largest camp first", () => {
    const conflicts = findTripConflicts([
      tripPref("a", { preferredRegion: "EUROPE" }),
      tripPref("b", { preferredRegion: "ASIA" }),
      tripPref("c", { preferredRegion: "ASIA" }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: "region",
      tag: null,
      severity: 2,
      forUserIds: ["b", "c"],
      againstUserIds: ["a"],
    });
    expect(conflicts[0].summary).toBe(
      "want different regions: ASIA vs EUROPE",
    );
  });

  it("ignores ANYWHERE, NO_PREFERENCE, and unanswered dimensions", () => {
    expect(
      findTripConflicts([
        tripPref("a", { preferredRegion: "EUROPE" }),
        tripPref("b", { preferredRegion: "ANYWHERE" }),
        tripPref("c", {}),
      ]),
    ).toEqual([]);
    expect(
      findTripConflicts([
        tripPref("a", { preferredClimate: "WARM" }),
        tripPref("b", { preferredClimate: "NO_PREFERENCE" }),
      ]),
    ).toEqual([]);
  });

  it("reports no conflict when everyone agrees or nobody answered", () => {
    expect(
      findTripConflicts([
        tripPref("a", { preferredRegion: "EUROPE" }),
        tripPref("b", { preferredRegion: "EUROPE" }),
      ]),
    ).toEqual([]);
    expect(findTripConflicts([tripPref("a", {}), tripPref("b", {})])).toEqual(
      [],
    );
    expect(findTripConflicts([])).toEqual([]);
  });

  it("is stable under input reordering", () => {
    const prefs = [
      tripPref("a", { preferredRegion: "EUROPE" }),
      tripPref("b", { preferredRegion: "ASIA" }),
    ];
    expect(findTripConflicts([...prefs].reverse())).toEqual(
      findTripConflicts(prefs),
    );
  });
});
