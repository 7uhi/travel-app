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
import { isSupportedCurrency } from "@/lib/currencies";
import {
  dayDatesBetween,
  inclusiveDayCount,
  MAX_TRIP_DAYS,
  parseUtcDate,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/session";
import type {
  Activity,
  ActivityInput,
  TripDayWithActivities,
  TripInput,
  TripMemberWithUser,
  TripSummary,
  TripWithDays,
} from "@/types";

export type { ActionResult };

/** `tripDayId` comes from the first argument of addActivityToDay. */
export type AddActivityInput = Omit<ActivityInput, "tripDayId">;

/** Availability-poll windows are capped to keep the calendar UI manageable. */
const MAX_WINDOW_DAYS = 180;

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
 * Creates a trip owned by the signed-in user (as an OWNER TripMember), in one
 * of two modes: with fixed dates (pre-generates one TripDay per calendar day)
 * or with an availability-poll window (no days until the owner confirms dates
 * via setTripDates).
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

  if (
    data.totalBudget != null &&
    (!Number.isFinite(data.totalBudget) || data.totalBudget < 0)
  ) {
    return fail("Total budget must be a non-negative number.");
  }

  const hasDates = Boolean(data.startDate?.trim() || data.endDate?.trim());
  const hasWindow = Boolean(
    data.windowStart?.trim() || data.windowEnd?.trim() || data.durationDays != null,
  );
  if (hasDates && hasWindow) {
    return fail("Set either trip dates or an availability window, not both.");
  }

  let tripDates: Prisma.TripCreateInput;
  if (hasDates) {
    const startDate = parseUtcDate(data.startDate ?? "");
    const endDate = parseUtcDate(data.endDate ?? "");
    if (!startDate || !endDate) {
      return fail("Start and end dates must be valid ISO dates (YYYY-MM-DD).");
    }
    if (endDate < startDate) {
      return fail("End date must be on or after the start date.");
    }
    const dayDates = dayDatesBetween(startDate, endDate);
    if (dayDates.length > MAX_TRIP_DAYS) {
      return fail(`Trips are limited to ${MAX_TRIP_DAYS} days.`);
    }
    tripDates = {
      title,
      destination,
      startDate,
      endDate,
      days: { create: dayDates.map((date) => ({ date })) },
    };
  } else if (hasWindow) {
    const windowStart = parseUtcDate(data.windowStart ?? "");
    const windowEnd = parseUtcDate(data.windowEnd ?? "");
    if (!windowStart || !windowEnd) {
      return fail("Window dates must be valid ISO dates (YYYY-MM-DD).");
    }
    if (windowEnd < windowStart) {
      return fail("The window must end on or after it starts.");
    }
    const windowLen = inclusiveDayCount(windowStart, windowEnd);
    if (windowLen > MAX_WINDOW_DAYS) {
      return fail(`Availability windows are limited to ${MAX_WINDOW_DAYS} days.`);
    }
    const durationDays = data.durationDays;
    if (!Number.isInteger(durationDays) || durationDays! < 1) {
      return fail("Trip length must be a whole number of days, at least 1.");
    }
    if (durationDays! > windowLen) {
      return fail("Trip length can't be longer than the availability window.");
    }
    tripDates = { title, destination, windowStart, windowEnd, durationDays };
  } else {
    return fail("Choose trip dates or set an availability window.");
  }

  try {
    const trip = await prisma.trip.create({
      data: {
        ...tripDates,
        totalBudget: data.totalBudget,
        members: { create: { userId, role: "OWNER" } },
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
 * Lists the signed-in user's trips (via membership): trips still picking
 * dates first (they need attention), then newest start date first.
 */
export async function getMyTrips(): Promise<ActionResult<TripSummary[]>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view your trips.");

  try {
    const memberships = await prisma.tripMember.findMany({
      where: { userId },
      include: {
        trip: {
          include: { _count: { select: { members: true, days: true } } },
        },
      },
      orderBy: { trip: { startDate: { sort: "desc", nulls: "first" } } },
    });

    return {
      success: true,
      data: memberships.map((m) => ({
        id: m.trip.id,
        title: m.trip.title,
        destination: m.trip.destination,
        startDate: m.trip.startDate?.toISOString() ?? null,
        endDate: m.trip.endDate?.toISOString() ?? null,
        role: m.role,
        memberCount: m.trip._count.members,
        dayCount: m.trip._count.days,
      })),
    };
  } catch (error) {
    console.error("getMyTrips failed:", error);
    return fail("Failed to load your trips. Please try again.");
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
 * Changes the trip's currency. OWNER only. Existing expenses are relabeled to
 * the new currency (amounts are not converted — the trip is single-currency,
 * so balances and totals stay coherent).
 */
export async function updateTripCurrency(
  tripId: string,
  currency: string,
): Promise<ActionResult<{ currency: string }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to change the currency.");
  if (!tripId) return fail("Trip id is required.");

  if (!isSupportedCurrency(currency)) {
    return fail("Unsupported currency code.");
  }

  try {
    const membership = await prisma.tripMember.findUnique({
      where: { userId_tripId: { userId, tripId } },
      select: { role: true },
    });
    if (!membership) return fail("Trip not found.");
    if (membership.role !== "OWNER") {
      return fail("Only the trip owner can change the currency.");
    }

    await prisma.$transaction([
      prisma.trip.update({ where: { id: tripId }, data: { currency } }),
      prisma.expense.updateMany({ where: { tripId }, data: { currency } }),
    ]);

    revalidatePath(`/trips/${tripId}`);
    revalidatePath(`/trips/${tripId}/expenses`);
    return { success: true, data: { currency } };
  } catch (error) {
    console.error("updateTripCurrency failed:", error);
    return fail("Failed to change the currency. Please try again.");
  }
}

/** Sets or clears (null) the trip's total budget. OWNER only. */
export async function updateTripBudget(
  tripId: string,
  totalBudget: number | null,
): Promise<ActionResult<{ totalBudget: number | null }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to change the budget.");
  if (!tripId) return fail("Trip id is required.");

  if (
    totalBudget != null &&
    (!Number.isFinite(totalBudget) || totalBudget < 0)
  ) {
    return fail("Total budget must be a non-negative number.");
  }
  // Decimal(12,2) column: keep cents precision and stay within range.
  const budget =
    totalBudget == null ? null : Math.round(totalBudget * 100) / 100;
  if (budget != null && budget >= 1e10) {
    return fail("Total budget is too large.");
  }

  try {
    const membership = await prisma.tripMember.findUnique({
      where: { userId_tripId: { userId, tripId } },
      select: { role: true },
    });
    if (!membership) return fail("Trip not found.");
    if (membership.role !== "OWNER") {
      return fail("Only the trip owner can change the budget.");
    }

    await prisma.trip.update({
      where: { id: tripId },
      data: { totalBudget: budget },
    });

    revalidatePath(`/trips/${tripId}`);
    revalidatePath(`/trips/${tripId}/expenses`);
    revalidatePath(`/trips/${tripId}/packing`);
    return { success: true, data: { totalBudget: budget } };
  } catch (error) {
    console.error("updateTripBudget failed:", error);
    return fail("Failed to change the budget. Please try again.");
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

  const parsed = parseActivityFields(data);
  if ("error" in parsed) return fail(parsed.error);

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
      data: { ...parsed, tripDayId },
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

/**
 * Updates an activity's fields. Requires OWNER or EDITOR membership on the
 * activity's trip — the itinerary is collaborative, so any editor may change
 * any activity (activities deliberately have no creator column).
 */
export async function updateActivity(
  activityId: string,
  data: AddActivityInput,
): Promise<ActionResult<Activity>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit this trip.");

  if (!activityId) return fail("Activity id is required.");

  const parsed = parseActivityFields(data);
  if ("error" in parsed) return fail(parsed.error);

  try {
    const gate = await activityEditGate(activityId, userId);
    if ("error" in gate) return fail(gate.error);

    const activity = await prisma.activity.update({
      where: { id: activityId },
      data: parsed,
    });

    revalidatePath(`/trips/${gate.tripId}`);
    return { success: true, data: serializeActivity(activity) };
  } catch (error) {
    console.error("updateActivity failed:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      // Deleted between the gate check and the update.
      return fail("Activity not found.");
    }
    return fail("Failed to update activity. Please try again.");
  }
}

/** Deletes an activity. Requires OWNER or EDITOR membership on its trip. */
export async function deleteActivity(
  activityId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit this trip.");

  if (!activityId) return fail("Activity id is required.");

  try {
    const gate = await activityEditGate(activityId, userId);
    if ("error" in gate) return fail(gate.error);

    await prisma.activity.delete({ where: { id: activityId } });

    revalidatePath(`/trips/${gate.tripId}`);
    return { success: true, data: { id: activityId } };
  } catch (error) {
    console.error("deleteActivity failed:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return fail("Activity not found.");
    }
    return fail("Failed to delete activity. Please try again.");
  }
}

/* ------------------------------------------------------------------ */
/* Helpers (module-private: "use server" files may only export          */
/* async functions and types)                                           */
/* ------------------------------------------------------------------ */

/** Validates AddActivityInput and normalizes it for Prisma writes. */
function parseActivityFields(data: AddActivityInput):
  | {
      title: string;
      description: string | null;
      time: Date | null;
      locationName: string | null;
      latitude: number | null;
      longitude: number | null;
      cost: number | null;
    }
  | { error: string } {
  const title = data.title?.trim();
  if (!title) return { error: "Activity title is required." };

  let time: Date | null = null;
  if (data.time != null) {
    time = parseDateTime(data.time);
    if (!time) return { error: "Time must be a valid ISO datetime string." };
  }

  const hasLatitude = data.latitude != null;
  const hasLongitude = data.longitude != null;
  if (hasLatitude !== hasLongitude) {
    return { error: "Latitude and longitude must be provided together." };
  }
  if (hasLatitude && (data.latitude! < -90 || data.latitude! > 90)) {
    return { error: "Latitude must be between -90 and 90." };
  }
  if (hasLongitude && (data.longitude! < -180 || data.longitude! > 180)) {
    return { error: "Longitude must be between -180 and 180." };
  }

  if (data.cost != null && (!Number.isFinite(data.cost) || data.cost < 0)) {
    return { error: "Cost must be a non-negative number." };
  }

  return {
    title,
    description: data.description?.trim() || null,
    time,
    locationName: data.locationName?.trim() || null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    cost: data.cost ?? null,
  };
}

/**
 * Resolves an activity to its trip and checks the caller may edit it.
 * Non-members and missing activities get the same answer: no existence leaks.
 */
async function activityEditGate(
  activityId: string,
  userId: string,
): Promise<{ tripId: string } | { error: string }> {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: {
      tripDay: {
        select: {
          tripId: true,
          trip: {
            select: {
              members: { where: { userId }, select: { role: true } },
            },
          },
        },
      },
    },
  });

  const membership = activity?.tripDay.trip.members[0];
  if (!activity || !membership) return { error: "Activity not found." };
  if (membership.role === "VIEWER") {
    return { error: "You don't have permission to edit this trip." };
  }
  return { tripId: activity.tripDay.tripId };
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
    startDate: trip.startDate?.toISOString() ?? null,
    endDate: trip.endDate?.toISOString() ?? null,
    windowStart: trip.windowStart?.toISOString() ?? null,
    windowEnd: trip.windowEnd?.toISOString() ?? null,
    durationDays: trip.durationDays,
    totalBudget: trip.totalBudget?.toNumber() ?? null,
    currency: trip.currency,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
    days: trip.days.map(serializeDay),
    members: trip.members.map(serializeMember),
  };
}
