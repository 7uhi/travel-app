import { describe, expect, it } from "vitest";

import { hasVoted, sortIdeasByVotes } from "@/lib/ideas";
import type { ActivityIdeaWithVotes } from "@/types";

/** Minimal idea with one vote row per voter id. */
const idea = (
  id: string,
  voterIds: string[],
  createdAt = "2026-07-01T00:00:00.000Z",
): ActivityIdeaWithVotes => ({
  id,
  tripId: "t1",
  title: id,
  description: null,
  locationName: null,
  link: null,
  estimatedCost: null,
  promotedAt: null,
  createdById: null,
  createdBy: null,
  createdAt,
  updatedAt: createdAt,
  votes: voterIds.map((userId) => ({
    userId,
    user: { id: userId, name: userId, image: null },
  })),
});

describe("sortIdeasByVotes", () => {
  it("puts ideas with more votes first", () => {
    const sorted = sortIdeasByVotes([
      idea("one", ["u1"]),
      idea("three", ["u1", "u2", "u3"]),
      idea("two", ["u1", "u2"]),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["three", "two", "one"]);
  });

  it("breaks vote ties by older createdAt first", () => {
    const sorted = sortIdeasByVotes([
      idea("newer", ["u1"], "2026-07-02T00:00:00.000Z"),
      idea("older", ["u2"], "2026-07-01T00:00:00.000Z"),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["older", "newer"]);
  });

  it("does not mutate the input array", () => {
    const input = [idea("one", []), idea("two", ["u1"])];
    sortIdeasByVotes(input);
    expect(input.map((i) => i.id)).toEqual(["one", "two"]);
  });

  it("returns an empty array for no ideas", () => {
    expect(sortIdeasByVotes([])).toEqual([]);
  });
});

describe("hasVoted", () => {
  it("is true when the user has a vote row", () => {
    expect(hasVoted(idea("a", ["u1", "u2"]), "u2")).toBe(true);
  });

  it("is false when the user has no vote row", () => {
    expect(hasVoted(idea("a", ["u1"]), "u2")).toBe(false);
  });

  it("is false for a null user (signed out)", () => {
    expect(hasVoted(idea("a", ["u1"]), null)).toBe(false);
  });
});
