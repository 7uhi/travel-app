import { describe, expect, it } from "vitest";

import { parseAnswers, type ParsedAnswers } from "@/lib/preference-answers";
import {
  DESTINATION_QUESTIONS,
  PROFILE_QUESTIONS,
} from "@/lib/preference-questions";

/** Narrows a parse result, failing the test on a validation error. */
function ok(result: ParsedAnswers | { error: string }): ParsedAnswers {
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("parseAnswers", () => {
  it("folds a run into field values and interest weights", () => {
    const parsed = ok(
      parseAnswers(PROFILE_QUESTIONS, {
        pace: "RELAXED",
        dietary: "  vegetarian ",
        "interests-love": ["FOOD", "HIKING"],
        "interests-skip": ["NIGHTLIFE"],
      }),
    );
    expect(parsed.profileFields).toEqual({
      pace: "RELAXED",
      dietaryNotes: "vegetarian",
    });
    expect(parsed.interests).toEqual([
      { tag: "FOOD", weight: 2 },
      { tag: "HIKING", weight: 2 },
      { tag: "NIGHTLIFE", weight: -2 },
    ]);
    expect(parsed.tripFields).toEqual({});
    expect(parsed.tripInterests).toEqual([]);
  });

  it("leaves stored values alone for question ids that are absent", () => {
    // Absent means "no opinion expressed this run", so nothing is written —
    // the upsert then leaves the stored value untouched.
    const parsed = ok(parseAnswers(PROFILE_QUESTIONS, {}));
    expect(parsed.profileFields).toEqual({});
  });

  it("clears a single-select on an explicit empty answer", () => {
    // "" is what the deck submits for a skipped question. It must write an
    // explicit null — a skip while editing un-answers the question.
    const parsed = ok(parseAnswers(PROFILE_QUESTIONS, { pace: "" }));
    expect(parsed.profileFields).toEqual({ pace: null });
  });

  it("clears a text answer that is empty or only whitespace", () => {
    const parsed = ok(parseAnswers(PROFILE_QUESTIONS, { dietary: "   " }));
    expect(parsed.profileFields).toEqual({ dietaryNotes: null });
  });

  it("writes no weights for a deselected multi-select", () => {
    const parsed = ok(
      parseAnswers(PROFILE_QUESTIONS, { "interests-love": [] }),
    );
    expect(parsed.interests).toEqual([]);
  });

  it("clears a skipped trip-level single-select to null", () => {
    // On a trip question null means "same as my usual" — skipping an
    // override question reverts it to inheriting the profile.
    const parsed = ok(
      parseAnswers(DESTINATION_QUESTIONS, { "trip-budget-comfort": "" }),
    );
    expect(parsed.tripFields).toEqual({ budgetComfort: null });
  });

  it("routes trip interests to tripInterests, never the durable set", () => {
    const parsed = ok(
      parseAnswers(DESTINATION_QUESTIONS, { "trip-interests-up": ["FOOD"] }),
    );
    expect(parsed.tripInterests).toEqual([{ tag: "FOOD", weight: 2 }]);
    expect(parsed.interests).toEqual([]);
  });

  it("parses numeric trip fields into numbers", () => {
    const parsed = ok(
      parseAnswers(DESTINATION_QUESTIONS, { "dest-max-travel": "6" }),
    );
    expect(parsed.tripFields).toEqual({ maxTravelHours: 6 });
  });

  it("ignores unknown question ids rather than rejecting the run", () => {
    // A client on a stale bundle shouldn't lose the user's whole run.
    const parsed = ok(
      parseAnswers(PROFILE_QUESTIONS, { "removed-question": "x" }),
    );
    expect(parsed.profileFields).toEqual({});
    expect(parsed.tripFields).toEqual({});
  });

  it("rejects a value the question does not offer", () => {
    const result = parseAnswers(PROFILE_QUESTIONS, { pace: "TURBO" });
    expect(result).toHaveProperty("error");
  });

  it("rejects answers of the wrong shape", () => {
    expect(
      parseAnswers(PROFILE_QUESTIONS, { pace: ["RELAXED"] }),
    ).toHaveProperty("error");
    expect(
      parseAnswers(PROFILE_QUESTIONS, { "interests-love": "FOOD" }),
    ).toHaveProperty("error");
  });

  it("rejects notes over the question's length limit", () => {
    const result = parseAnswers(PROFILE_QUESTIONS, {
      dietary: "x".repeat(201), // the dietary question caps at 200
    });
    expect(result).toHaveProperty("error");
  });
});
