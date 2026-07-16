import type { ActivityIdeaWithVotes } from "@/types";

/**
 * Orders ideas by vote count (most popular first); ties go to the older
 * idea. ISO datetime strings compare lexicographically = chronologically.
 * Returns a new array — the input is not mutated.
 */
export function sortIdeasByVotes(
  ideas: ActivityIdeaWithVotes[],
): ActivityIdeaWithVotes[] {
  return [...ideas].sort(
    (a, b) =>
      b.votes.length - a.votes.length || a.createdAt.localeCompare(b.createdAt),
  );
}

/** Whether the given user has a vote on the idea. False for signed-out users. */
export function hasVoted(
  idea: Pick<ActivityIdeaWithVotes, "votes">,
  userId: string | null,
): boolean {
  return userId !== null && idea.votes.some((vote) => vote.userId === userId);
}
