"use server";

import { Prisma, type ActivityIdea as DbActivityIdea } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { fail, type ActionResult } from "@/lib/action-result";
import { sortIdeasByVotes } from "@/lib/ideas";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/session";
import type { ActivityIdeaInput, ActivityIdeaWithVotes } from "@/types";

export type { ActivityIdeaInput };

/** Titles longer than this are almost certainly a paste mistake. */
const MAX_TITLE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_LOCATION_LENGTH = 80;
const MAX_LINK_LENGTH = 500;

const IDEA_INCLUDE = {
  createdBy: { select: { id: true, name: true, image: true } },
  votes: {
    select: {
      userId: true,
      user: { select: { id: true, name: true, image: true } },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.ActivityIdeaInclude;

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

/**
 * Lists a trip's activity ideas, most-voted first. Requires membership on
 * the trip (any role — voting is open to the whole group).
 */
export async function getIdeas(
  tripId: string,
): Promise<ActionResult<ActivityIdeaWithVotes[]>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view this trip.");
  if (!tripId) return fail("Trip id is required.");

  try {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, members: { some: { userId } } },
      select: { id: true },
    });
    if (!trip) return fail("Trip not found.");

    const ideas = await prisma.activityIdea.findMany({
      where: { tripId },
      include: IDEA_INCLUDE,
      orderBy: { createdAt: "asc" },
    });

    return { success: true, data: sortIdeasByVotes(ideas.map(serializeIdea)) };
  } catch (error) {
    console.error("getIdeas failed:", error);
    return fail("Failed to load ideas. Please try again.");
  }
}

/** Proposes an activity idea. Requires OWNER or EDITOR membership. */
export async function addIdea(
  tripId: string,
  data: ActivityIdeaInput,
): Promise<ActionResult<ActivityIdeaWithVotes>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit this trip.");
  if (!tripId) return fail("Trip id is required.");

  const parsed = parseIdeaFields(data);
  if ("error" in parsed) return fail(parsed.error);

  try {
    const gate = await tripEditGate(tripId, userId);
    if ("error" in gate) return fail(gate.error);

    const idea = await prisma.activityIdea.create({
      data: { ...parsed, tripId, createdById: userId },
      include: IDEA_INCLUDE,
    });

    revalidatePath(`/trips/${tripId}/ideas`);
    return { success: true, data: serializeIdea(idea) };
  } catch (error) {
    console.error("addIdea failed:", error);
    return fail("Failed to add the idea. Please try again.");
  }
}

/**
 * Updates an idea's fields. Requires OWNER or EDITOR membership on the
 * idea's trip — ideas are collaborative, so any editor may change any idea.
 */
export async function updateIdea(
  ideaId: string,
  data: ActivityIdeaInput,
): Promise<ActionResult<ActivityIdeaWithVotes>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit this trip.");
  if (!ideaId) return fail("Idea id is required.");

  const parsed = parseIdeaFields(data);
  if ("error" in parsed) return fail(parsed.error);

  try {
    const gate = await ideaEditGate(ideaId, userId);
    if ("error" in gate) return fail(gate.error);

    const idea = await prisma.activityIdea.update({
      where: { id: ideaId },
      data: parsed,
      include: IDEA_INCLUDE,
    });

    revalidatePath(`/trips/${gate.tripId}/ideas`);
    return { success: true, data: serializeIdea(idea) };
  } catch (error) {
    console.error("updateIdea failed:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      // Deleted between the gate check and the update.
      return fail("Idea not found.");
    }
    return fail("Failed to update the idea. Please try again.");
  }
}

/** Deletes an idea (votes cascade). Requires OWNER or EDITOR membership. */
export async function deleteIdea(
  ideaId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit this trip.");
  if (!ideaId) return fail("Idea id is required.");

  try {
    const gate = await ideaEditGate(ideaId, userId);
    if ("error" in gate) return fail(gate.error);

    await prisma.activityIdea.delete({ where: { id: ideaId } });

    revalidatePath(`/trips/${gate.tripId}/ideas`);
    return { success: true, data: { id: ideaId } };
  } catch (error) {
    console.error("deleteIdea failed:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return fail("Idea not found.");
    }
    return fail("Failed to delete the idea. Please try again.");
  }
}

/**
 * Toggles the caller's interest vote on an idea: removes the vote if one
 * exists, otherwise casts it. Open to every trip member, including viewers —
 * gauging the whole group is the point.
 */
export async function toggleVote(
  ideaId: string,
): Promise<ActionResult<{ voted: boolean }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to vote.");
  if (!ideaId) return fail("Idea id is required.");

  try {
    // Non-members get the same answer as a missing idea: no existence leaks.
    const idea = await prisma.activityIdea.findUnique({
      where: { id: ideaId },
      select: {
        tripId: true,
        trip: {
          select: { members: { where: { userId }, select: { id: true } } },
        },
      },
    });
    if (!idea || idea.trip.members.length === 0) {
      return fail("Idea not found.");
    }

    const removed = await prisma.activityVote.deleteMany({
      where: { ideaId, userId },
    });

    let voted = false;
    if (removed.count === 0) {
      try {
        await prisma.activityVote.create({ data: { ideaId, userId } });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2003"
        ) {
          // The idea was deleted between the membership check and the insert.
          return fail("Idea not found.");
        }
        // P2002: a concurrent toggle already cast the vote — same outcome.
        if (
          !(
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          )
        ) {
          throw error;
        }
      }
      voted = true;
    }

    revalidatePath(`/trips/${idea.tripId}/ideas`);
    return { success: true, data: { voted } };
  } catch (error) {
    console.error("toggleVote failed:", error);
    return fail("Failed to save your vote. Please try again.");
  }
}

/**
 * Adds an idea to the itinerary: creates an Activity on the given day with
 * the idea's description/location/cost carried over, and stamps the idea's
 * promotedAt. Requires OWNER or EDITOR membership; the day must belong to
 * the idea's trip.
 */
export async function promoteIdea(
  ideaId: string,
  tripDayId: string,
  data: { title: string; time?: string | null },
): Promise<ActionResult<{ activityId: string }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit this trip.");
  if (!ideaId) return fail("Idea id is required.");
  if (!tripDayId) return fail("Trip day id is required.");

  const title = data.title?.trim();
  if (!title) return fail("Activity title is required.");

  let time: Date | null = null;
  if (data.time) {
    time = new Date(data.time);
    if (Number.isNaN(time.getTime())) {
      return fail("Time must be a valid ISO datetime string.");
    }
  }

  try {
    const idea = await prisma.activityIdea.findUnique({
      where: { id: ideaId },
      select: {
        tripId: true,
        description: true,
        locationName: true,
        estimatedCost: true,
        trip: {
          select: { members: { where: { userId }, select: { role: true } } },
        },
      },
    });

    const membership = idea?.trip.members[0];
    if (!idea || !membership) return fail("Idea not found.");
    if (membership.role === "VIEWER") {
      return fail("You don't have permission to edit this trip.");
    }

    const tripDay = await prisma.tripDay.findUnique({
      where: { id: tripDayId },
      select: { tripId: true },
    });
    if (!tripDay || tripDay.tripId !== idea.tripId) {
      return fail("Trip day not found.");
    }

    const [activity] = await prisma.$transaction([
      prisma.activity.create({
        data: {
          title,
          time,
          description: idea.description,
          locationName: idea.locationName,
          cost: idea.estimatedCost,
          tripDayId,
        },
      }),
      prisma.activityIdea.update({
        where: { id: ideaId },
        data: { promotedAt: new Date() },
      }),
    ]);

    revalidatePath(`/trips/${idea.tripId}`);
    revalidatePath(`/trips/${idea.tripId}/ideas`);
    return { success: true, data: { activityId: activity.id } };
  } catch (error) {
    console.error("promoteIdea failed:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2025")
    ) {
      // The day or idea was deleted between the checks and the transaction.
      return fail("Trip day not found.");
    }
    return fail("Failed to add the activity. Please try again.");
  }
}

/* ------------------------------------------------------------------ */
/* Helpers (module-private: "use server" files may only export          */
/* async functions and types)                                           */
/* ------------------------------------------------------------------ */

/** Validates ActivityIdeaInput and normalizes it for Prisma writes. */
function parseIdeaFields(data: ActivityIdeaInput):
  | {
      title: string;
      description: string | null;
      locationName: string | null;
      link: string | null;
      estimatedCost: number | null;
    }
  | { error: string } {
  const title = data.title?.trim();
  if (!title) return { error: "Idea title is required." };
  if (title.length > MAX_TITLE_LENGTH) {
    return { error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer.` };
  }

  const description = data.description?.trim() || null;
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return {
      error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`,
    };
  }

  const locationName = data.locationName?.trim() || null;
  if (locationName && locationName.length > MAX_LOCATION_LENGTH) {
    return {
      error: `Location must be ${MAX_LOCATION_LENGTH} characters or fewer.`,
    };
  }

  // Bare domains are fine ("getyourguide.com"); everything is stored with a
  // scheme so the card can render it as a safe href.
  let link = data.link?.trim() || null;
  if (link) {
    if (!/^https?:\/\//i.test(link)) link = `https://${link}`;
    if (link.length > MAX_LINK_LENGTH) {
      return { error: `Link must be ${MAX_LINK_LENGTH} characters or fewer.` };
    }
    try {
      new URL(link);
    } catch {
      return { error: "Link must be a valid URL." };
    }
  }

  if (
    data.estimatedCost != null &&
    (!Number.isFinite(data.estimatedCost) || data.estimatedCost < 0)
  ) {
    return { error: "Estimated cost must be a non-negative number." };
  }

  return {
    title,
    description,
    locationName,
    link,
    estimatedCost: data.estimatedCost ?? null,
  };
}

/** Checks the caller may edit a trip. Non-members and missing trips get the
 * same answer: no existence leaks. */
async function tripEditGate(
  tripId: string,
  userId: string,
): Promise<Record<string, never> | { error: string }> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { members: { where: { userId }, select: { role: true } } },
  });

  const membership = trip?.members[0];
  if (!trip || !membership) return { error: "Trip not found." };
  if (membership.role === "VIEWER") {
    return { error: "You don't have permission to edit this trip." };
  }
  return {};
}

/**
 * Resolves an idea to its trip and checks the caller may edit it.
 * Non-members and missing ideas get the same answer: no existence leaks.
 */
async function ideaEditGate(
  ideaId: string,
  userId: string,
): Promise<{ tripId: string } | { error: string }> {
  const idea = await prisma.activityIdea.findUnique({
    where: { id: ideaId },
    select: {
      tripId: true,
      trip: {
        select: { members: { where: { userId }, select: { role: true } } },
      },
    },
  });

  const membership = idea?.trip.members[0];
  if (!idea || !membership) return { error: "Idea not found." };
  if (membership.role === "VIEWER") {
    return { error: "You don't have permission to edit this trip." };
  }
  return { tripId: idea.tripId };
}

/* Convert Prisma records (Date, Decimal) into the JSON-safe shapes from
   types/index.ts — server actions may only return serializable values. */

type DbIdeaWithVotes = DbActivityIdea & {
  createdBy: { id: string; name: string | null; image: string | null } | null;
  votes: {
    userId: string;
    user: { id: string; name: string | null; image: string | null };
  }[];
};

function serializeIdea(idea: DbIdeaWithVotes): ActivityIdeaWithVotes {
  return {
    id: idea.id,
    tripId: idea.tripId,
    title: idea.title,
    description: idea.description,
    locationName: idea.locationName,
    link: idea.link,
    estimatedCost: idea.estimatedCost?.toNumber() ?? null,
    promotedAt: idea.promotedAt?.toISOString() ?? null,
    createdById: idea.createdById,
    createdBy: idea.createdBy,
    createdAt: idea.createdAt.toISOString(),
    updatedAt: idea.updatedAt.toISOString(),
    votes: idea.votes,
  };
}
