"use server";

import { Prisma } from "@prisma/client";
import type {
  Activity as DbActivity,
  Trip as DbTrip,
  TripDay as DbTripDay,
  TripMember as DbTripMember,
  User as DbUser,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

import { fail, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/session";
import type {
  Activity,
  ActivityInput,
  TripDayWithActivities,
  TripInput,
  TripMemberWithUser,
  TripWithDays,
} from "@/types";

export type { ActionResult };

/** `tripDayId` comes from the first argument of addActivityToDay. */
export type AddActivityInput = Omit<ActivityInput, "tripDayId">;

/** Safety cap so a bad date range can't create thousands of TripDay rows. */
const MAX_TRIP_DAYS = 366;

const TRIP_INCLUDE = {
  days: {
    orderBy: { date: "asc" },
    include: {
      activities: {
        orderBy: { time: { sort: "asc", nulls: "last" } },
      },
    },
  },
  members: { include: { user: true } },
} satisfies Prisma.TripInclude;

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

/**
 * Creates a trip owned by the signed-in user (as an OWNER TripMember) and
 * pre-generates one TripDay per calendar day in [startDate, endDate].
 */
export async function createTrip(
  data: TripInput,
): Promise<ActionResult<TripWithDays>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to create a trip.");

  const title = data.title?.trim();
  const destination = data.destination?.trim();
  if (!title) return fail("Title is required.");
  if (!destination) return fail("Destination is required.");

  const startDate = parseUtcDate(data.startDate);
  const endDate = parseUtcDate(data.endDate);
  if (!startDate || !endDate) {
    return fail("Start and end dates must be valid ISO dates (YYYY-MM-DD).");
  }
  if (endDate < startDate) {
    return fail("End date must be on or after the start date.");
  }

  if (
    data.totalBudget != null &&
    (!Number.isFinite(data.totalBudget) || data.totalBudget < 0)
  ) {
    return fail("Total budget must be a non-negative number.");
  }

  const dayDates: Date[] = [];
  for (
    let d = new Date(startDate);
    d <= endDate;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    dayDates.push(new Date(d));
  }
  if (dayDates.length > MAX_TRIP_DAYS) {
    return fail(`Trips are limited to ${MAX_TRIP_DAYS} days.`);
  }

  try {
    const trip = await prisma.trip.create({
      data: {
        title,
        destination,
        startDate,
        endDate,
        totalBudget: data.totalBudget,
        members: { create: { userId, role: "OWNER" } },
        days: { create: dayDates.map((date) => ({ date })) },
      },
      include: TRIP_INCLUDE,
    });

    revalidatePath("/trips");
    return { success: true, data: serializeTrip(trip) };
  } catch (error) {
    console.error("createTrip failed:", error);
    return fail("Failed to create trip. Please try again.");
  }
}

/**
 * Fetches a trip with its days, activities, and members. Only members of the
 * trip can fetch it; for everyone else the trip is reported as not found so
 * trip ids don't leak information.
 */
export async function getTripById(
  id: string,
): Promise<ActionResult<TripWithDays>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view this trip.");

  if (!id) return fail("Trip id is required.");

  try {
    const trip = await prisma.trip.findFirst({
      where: { id, members: { some: { userId } } },
      include: TRIP_INCLUDE,
    });

    if (!trip) return fail("Trip not found.");
    return { success: true, data: serializeTrip(trip) };
  } catch (error) {
    console.error("getTripById failed:", error);
    return fail("Failed to load trip. Please try again.");
  }
}

/**
 * Adds an activity to a trip day. Requires OWNER or EDITOR membership on the
 * day's trip; VIEWERs are read-only.
 */
export async function addActivityToDay(
  tripDayId: string,
  data: AddActivityInput,
): Promise<ActionResult<Activity>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit this trip.");

  if (!tripDayId) return fail("Trip day id is required.");

  const title = data.title?.trim();
  if (!title) return fail("Activity title is required.");

  let time: Date | null = null;
  if (data.time != null) {
    time = parseDateTime(data.time);
    if (!time) return fail("Time must be a valid ISO datetime string.");
  }

  const hasLatitude = data.latitude != null;
  const hasLongitude = data.longitude != null;
  if (hasLatitude !== hasLongitude) {
    return fail("Latitude and longitude must be provided together.");
  }
  if (hasLatitude && (data.latitude! < -90 || data.latitude! > 90)) {
    return fail("Latitude must be between -90 and 90.");
  }
  if (hasLongitude && (data.longitude! < -180 || data.longitude! > 180)) {
    return fail("Longitude must be between -180 and 180.");
  }

  if (data.cost != null && (!Number.isFinite(data.cost) || data.cost < 0)) {
    return fail("Cost must be a non-negative number.");
  }

  try {
    const tripDay = await prisma.tripDay.findUnique({
      where: { id: tripDayId },
      select: {
        tripId: true,
        trip: {
          select: {
            members: { where: { userId }, select: { role: true } },
          },
        },
      },
    });

    // Non-members get the same answer as a missing day: no existence leaks.
    const membership = tripDay?.trip.members[0];
    if (!tripDay || !membership) return fail("Trip day not found.");
    if (membership.role === "VIEWER") {
      return fail("You don't have permission to edit this trip.");
    }

    const activity = await prisma.activity.create({
      data: {
        title,
        description: data.description,
        time,
        locationName: data.locationName,
        latitude: data.latitude,
        longitude: data.longitude,
        cost: data.cost,
        tripDayId,
      },
    });

    revalidatePath(`/trips/${tripDay.tripId}`);
    return { success: true, data: serializeActivity(activity) };
  } catch (error) {
    console.error("addActivityToDay failed:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      // The day was deleted between the membership check and the insert.
      return fail("Trip day not found.");
    }
    return fail("Failed to add activity. Please try again.");
  }
}

/* ------------------------------------------------------------------ */
/* Helpers (module-private: "use server" files may only export          */
/* async functions and types)                                           */
/* ------------------------------------------------------------------ */

/** Parses the date part of an ISO string as UTC midnight (for @db.Date columns). */
function parseUtcDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateTime(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* Convert Prisma records (Date, Decimal) into the JSON-safe shapes from
   types/index.ts — server actions may only return serializable values. */

type DbTripWithRelations = DbTrip & {
  days: (DbTripDay & { activities: DbActivity[] })[];
  members: (DbTripMember & { user: DbUser })[];
};

function serializeActivity(activity: DbActivity): Activity {
  return {
    id: activity.id,
    title: activity.title,
    description: activity.description,
    time: activity.time?.toISOString() ?? null,
    locationName: activity.locationName,
    latitude: activity.latitude,
    longitude: activity.longitude,
    cost: activity.cost?.toNumber() ?? null,
    tripDayId: activity.tripDayId,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  };
}

function serializeDay(
  day: DbTripDay & { activities: DbActivity[] },
): TripDayWithActivities {
  return {
    id: day.id,
    date: day.date.toISOString(),
    tripId: day.tripId,
    createdAt: day.createdAt.toISOString(),
    updatedAt: day.updatedAt.toISOString(),
    activities: day.activities.map(serializeActivity),
  };
}

function serializeMember(
  member: DbTripMember & { user: DbUser },
): TripMemberWithUser {
  return {
    id: member.id,
    role: member.role,
    userId: member.userId,
    tripId: member.tripId,
    user: {
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      image: member.user.image,
    },
  };
}

function serializeTrip(trip: DbTripWithRelations): TripWithDays {
  return {
    id: trip.id,
    title: trip.title,
    destination: trip.destination,
    startDate: trip.startDate.toISOString(),
    endDate: trip.endDate.toISOString(),
    totalBudget: trip.totalBudget?.toNumber() ?? null,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
    days: trip.days.map(serializeDay),
    members: trip.members.map(serializeMember),
  };
}
