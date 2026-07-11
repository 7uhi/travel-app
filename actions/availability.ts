"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { fail, type ActionResult } from "@/lib/action-result";
import { suggestWindows } from "@/lib/availability";
import { dayDatesBetween, MAX_TRIP_DAYS, parseUtcDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/session";
import type { TripAvailability } from "@/types";

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

/**
 * Replaces the signed-in member's available days for a trip. Any member may
 * mark their own availability (it's personal data, so VIEWERs included), but
 * only while the trip's dates are still undecided.
 */
export async function setMyAvailability(
  tripId: string,
  dates: string[],
): Promise<ActionResult<{ dates: string[] }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to mark availability.");
  if (!tripId) return fail("Trip id is required.");

  if (!Array.isArray(dates)) return fail("Dates must be a list.");

  try {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, members: { some: { userId } } },
      select: { startDate: true, windowStart: true, windowEnd: true },
    });

    // Non-members get the same answer as a missing trip: no existence leaks.
    if (!trip) return fail("Trip not found.");
    if (trip.startDate) return fail("This trip's dates are already set.");
    if (!trip.windowStart || !trip.windowEnd) {
      return fail("This trip doesn't have an availability window.");
    }

    const parsed = new Map<number, Date>();
    for (const value of dates) {
      const date = parseUtcDate(value);
      if (!date) return fail("Days must be valid ISO dates (YYYY-MM-DD).");
      if (date < trip.windowStart || date > trip.windowEnd) {
        return fail("All days must fall inside the availability window.");
      }
      parsed.set(date.getTime(), date);
    }
    const days = [...parsed.values()].sort((a, b) => a.getTime() - b.getTime());

    await prisma.$transaction([
      prisma.availabilityDay.deleteMany({ where: { tripId, userId } }),
      prisma.availabilityDay.createMany({
        data: days.map((date) => ({ tripId, userId, date })),
      }),
    ]);

    revalidatePath(`/trips/${tripId}`);
    return {
      success: true,
      data: { dates: days.map((d) => d.toISOString()) },
    };
  } catch (error) {
    console.error("setMyAvailability failed:", error);
    return fail("Failed to save your availability. Please try again.");
  }
}

/**
 * The trip's availability poll: candidate window, every member's marked days,
 * and ranked date suggestions. Members only.
 */
export async function getTripAvailability(
  tripId: string,
): Promise<ActionResult<TripAvailability>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view availability.");
  if (!tripId) return fail("Trip id is required.");

  try {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, members: { some: { userId } } },
      select: {
        windowStart: true,
        windowEnd: true,
        durationDays: true,
        members: { select: { userId: true } },
        availability: {
          select: { userId: true, date: true },
          orderBy: [{ userId: "asc" }, { date: "asc" }],
        },
      },
    });

    if (!trip) return fail("Trip not found.");

    const entries = trip.availability.map((a) => ({
      userId: a.userId,
      date: a.date.toISOString(),
    }));

    const suggestions =
      trip.windowStart && trip.windowEnd && trip.durationDays
        ? suggestWindows({
            windowStart: trip.windowStart.toISOString(),
            windowEnd: trip.windowEnd.toISOString(),
            durationDays: trip.durationDays,
            memberIds: trip.members.map((m) => m.userId),
            entries,
          })
        : [];

    return {
      success: true,
      data: {
        windowStart: trip.windowStart?.toISOString() ?? null,
        windowEnd: trip.windowEnd?.toISOString() ?? null,
        durationDays: trip.durationDays,
        entries,
        suggestions,
      },
    };
  } catch (error) {
    console.error("getTripAvailability failed:", error);
    return fail("Failed to load availability. Please try again.");
  }
}

/**
 * Confirms a dateless trip's dates and generates its TripDay rows. Only the
 * trip's OWNER, and only once — changing dates after they're set (and days or
 * activities exist) is deliberately unsupported for now.
 */
export async function setTripDates(
  tripId: string,
  startDateInput: string,
  endDateInput: string,
): Promise<ActionResult<{ id: string; startDate: string; endDate: string }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to set trip dates.");
  if (!tripId) return fail("Trip id is required.");

  const startDate = parseUtcDate(startDateInput ?? "");
  const endDate = parseUtcDate(endDateInput ?? "");
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

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        startDate: true,
        members: { where: { userId }, select: { role: true } },
      },
    });

    const membership = trip?.members[0];
    if (!trip || !membership) return fail("Trip not found.");
    if (membership.role !== "OWNER") {
      return fail("Only the trip owner can set the trip dates.");
    }
    if (trip.startDate) return fail("This trip's dates are already set.");

    const updated = await prisma.trip.update({
      where: { id: tripId },
      data: {
        startDate,
        endDate,
        days: { create: dayDates.map((date) => ({ date })) },
      },
      select: { id: true, startDate: true, endDate: true },
    });

    revalidatePath(`/trips/${tripId}`);
    revalidatePath("/trips");
    return {
      success: true,
      data: {
        id: updated.id,
        startDate: updated.startDate!.toISOString(),
        endDate: updated.endDate!.toISOString(),
      },
    };
  } catch (error) {
    console.error("setTripDates failed:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Raced a concurrent confirm that already created the same TripDays.
      return fail("This trip's dates are already set.");
    }
    return fail("Failed to set trip dates. Please try again.");
  }
}
