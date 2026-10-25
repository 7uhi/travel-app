import type { SuggestionPromptInput } from "@/lib/ai/prompt";
import type {
  TravelProfileSummary,
  TripPreferenceSummary,
} from "@/types";

/**
 * Small evaluation fixtures for the activity-suggestion prompt (v1). Each
 * fixture pins the input and the invariant a reviewer checks in the output —
 * run them against the mock provider in lib/ai/generate.test.ts, and reuse
 * the same cases when qualifying a future real provider.
 */

export interface SuggestionFixture {
  name: string;
  input: SuggestionPromptInput;
  /**
   * Case-insensitive substrings that must NOT appear in any suggested title
   * (substring match, not exact-title equality).
   */
  mustAvoid: string[];
  /** Substrings that must appear somewhere in the request's userContent. */
  mustMention: string[];
  /** When true, generation must return zero suggestions. */
  expectEmpty?: boolean;
}

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

const base: SuggestionPromptInput = {
  destination: "Lisbon",
  startDate: "2026-09-12T00:00:00.000Z",
  endDate: "2026-09-18T00:00:00.000Z",
  durationDays: 7,
  currency: "USD",
  totalBudget: 2000,
  profiles: [],
  tripPreferences: [],
  existingIdeas: [],
  plannedActivities: [],
  includeSensitiveNotes: false,
};

export const SUGGESTION_FIXTURES: SuggestionFixture[] = [
  {
    name: "trip override beats durable taste",
    input: {
      ...base,
      profiles: [
        profile("a", {
          interests: [{ tag: "NIGHTLIFE", weight: 2 }],
        }),
      ],
      tripPreferences: [
        tripPref("a", { interests: [{ tag: "HIKING", weight: 2 }] }),
      ],
    },
    mustAvoid: ["Rooftop music night"],
    mustMention: ["HIKING"],
  },
  {
    name: "vetoed interest never surfaces",
    input: {
      ...base,
      profiles: [
        profile("a", { interests: [{ tag: "FOOD", weight: 2 }] }),
        profile("b", { interests: [{ tag: "NIGHTLIFE", weight: -2 }] }),
      ],
    },
    mustAvoid: ["Rooftop music night"],
    mustMention: ["Avoid: NIGHTLIFE"],
  },
  {
    name: "conflicting region/climate stays explicit",
    input: {
      ...base,
      destination: null,
      tripPreferences: [
        tripPref("a", { preferredRegion: "EUROPE", preferredClimate: "WARM" }),
        tripPref("b", { preferredRegion: "ASIA", preferredClimate: "COLD" }),
      ],
    },
    mustAvoid: [],
    mustMention: ["no compatible option"],
  },
  {
    name: "missing preferences omit rather than invent",
    input: { ...base, profiles: [], tripPreferences: [] },
    mustAvoid: [],
    mustMention: ["Destination: Lisbon"],
  },
  {
    name: "undecided dates and destination are stated",
    input: {
      ...base,
      destination: null,
      startDate: null,
      endDate: null,
      durationDays: null,
    },
    mustAvoid: [],
    mustMention: ["Destination: undecided"],
  },
  {
    name: "veto-only input still filters the fallback candidates",
    input: {
      ...base,
      profiles: [
        profile("a", { interests: [{ tag: "FOOD", weight: -2 }] }),
      ],
    },
    mustAvoid: ["food walk", "cooking class"],
    mustMention: ["Avoid: FOOD"],
  },
  {
    name: "all fallback candidates vetoed returns nothing",
    input: {
      ...base,
      profiles: [
        profile("a", {
          interests: [
            { tag: "FOOD", weight: -2 },
            { tag: "NATURE", weight: -2 },
            { tag: "LOCAL_LIFE", weight: -2 },
          ],
        }),
      ],
    },
    mustAvoid: ["food walk", "coffee crawl", "picnic"],
    mustMention: ["Avoid:"],
    expectEmpty: true,
  },
  {
    name: "existing ideas and planned activities are never repeated",
    input: {
      ...base,
      existingIdeas: [{ title: "Neighborhood food walk", votes: 3 }],
      plannedActivities: ["Neighborhood coffee crawl"],
    },
    mustAvoid: ["food walk", "coffee crawl"],
    mustMention: ["do not repeat"],
  },
];
