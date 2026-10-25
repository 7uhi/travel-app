import { prisma } from "@/lib/prisma";
import type {
  TravelProfileSummary,
  TripPreferenceSummary,
} from "@/types";

/**
 * Authorized context builder for the activity-suggestion feature.
 *
 * Loads only the requested trip's data and only the fields the feature
 * needs — trip facts, idea titles plus vote counts, planned activity titles,
 * and group preference summaries. Deliberately excluded: emails, auth data,
 * invite tokens, financial participant identities, packing lists, vote
 * authorship, and anything from other trips.
 *
 * Membership (any role) is re-checked here so the feature can never be
 * reached for a trip the caller can't see, even if a future caller forgets
 * its own gate. Missing and inaccessible trips produce the same error.
 */

export interface SuggestionContext {
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  currency: string;
  totalBudget: number | null;
  profiles: TravelProfileSummary[];
  tripPreferences: TripPreferenceSummary[];
  existingIdeas: { title: string; votes: number }[];
  plannedActivities: string[];
}

/** Bounds so one huge trip can't blow the model input. */
export const MAX_CONTEXT_IDEAS = 30;
export const MAX_CONTEXT_ACTIVITIES = 60;

export async function loadSuggestionContext(
  tripId: string,
  userId: string,
): Promise<SuggestionContext | null> {
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, members: { some: { userId } } },
    select: {
      destination: true,
      startDate: true,
      endDate: true,
      durationDays: true,
      currency: true,
      totalBudget: true,
      ideas: {
        select: { title: true, _count: { select: { votes: true } } },
        orderBy: { createdAt: "asc" },
        take: MAX_CONTEXT_IDEAS,
      },
      days: {
        select: {
          activities: { select: { title: true }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { date: "asc" },
      },
    },
  });
  if (!trip) return null;

  const [profiles, tripPreferences] = await Promise.all([
    prisma.travelProfile.findMany({
      where: { user: { memberships: { some: { tripId } } } },
      select: {
        userId: true,
        pace: true,
        budgetTier: true,
        dayRhythm: true,
        lodgingStyle: true,
        dietaryNotes: true,
        accessibilityNotes: true,
        updatedAt: true,
        interests: { select: { tag: true, weight: true }, orderBy: { tag: "asc" } },
      },
    }),
    prisma.tripPreference.findMany({
      where: { tripId },
      select: {
        userId: true,
        budgetComfort: true,
        mustDo: true,
        dealBreakers: true,
        preferredRegion: true,
        preferredClimate: true,
        maxTravelHours: true,
        updatedAt: true,
        interests: { select: { tag: true, weight: true }, orderBy: { tag: "asc" } },
      },
    }),
  ]);

  return {
    destination: trip.destination,
    startDate: trip.startDate?.toISOString() ?? null,
    endDate: trip.endDate?.toISOString() ?? null,
    durationDays: trip.durationDays,
    currency: trip.currency,
    totalBudget: trip.totalBudget?.toNumber() ?? null,
    profiles: profiles.map((profile) => ({
      userId: profile.userId,
      pace: profile.pace,
      budgetTier: profile.budgetTier,
      dayRhythm: profile.dayRhythm,
      lodgingStyle: profile.lodgingStyle,
      dietaryNotes: profile.dietaryNotes,
      accessibilityNotes: profile.accessibilityNotes,
      interests: profile.interests.filter(
        (interest) => interest.weight !== 0,
      ),
      answeredAt: profile.updatedAt.toISOString(),
    })),
    tripPreferences: tripPreferences.map((pref) => ({
      userId: pref.userId,
      budgetComfort: pref.budgetComfort,
      interests: pref.interests.filter((interest) => interest.weight !== 0),
      mustDo: pref.mustDo,
      dealBreakers: pref.dealBreakers,
      preferredRegion: pref.preferredRegion,
      preferredClimate: pref.preferredClimate,
      maxTravelHours: pref.maxTravelHours,
      answeredAt: pref.updatedAt.toISOString(),
    })),
    existingIdeas: trip.ideas.map((idea) => ({
      title: idea.title,
      votes: idea._count.votes,
    })),
    plannedActivities: trip.days
      .flatMap((day) => day.activities.map((activity) => activity.title))
      .slice(0, MAX_CONTEXT_ACTIVITIES),
  };
}
