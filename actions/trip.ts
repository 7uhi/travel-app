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
import { redirect } from "next/navigation";

import { fail, type ActionResult } from "@/lib/action-result";
import {
  isSupportedCurrency,
  isWholeUnit,
  isZeroDecimal,
  summarizeTripAmounts,
  wholeUnitsMessage,
  zeroDecimalRefusal,
} from "@/lib/currencies";
import {
  dayDatesBetween,
  inclusiveDayCount,
  MAX_TRIP_DAYS,
  parseIsoDateTime,
  parseUtcDate,
} from "@/lib/dates";
import { canEditTripDetails } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { describeBlockedDays, planReschedule } from "@/lib/reschedule";
import {
  activityInputSchema,
  archivedFlagSchema,
  deleteTripConfirmationSchema,
  idSchema,
  INVALID_INPUT,
  parseInput,
  rescheduleInputSchema,
  tripDetailsInputSchema,
  tripInputSchema,
} from "@/lib/schemas";
import { currentUserId } from "@/lib/session";
import { itineraryTotals } from "@/lib/trip-header";
import type {
  Activity,
  ActivityInput,
  CurrencyChangeOptions,
  MyTripSummary,
  RescheduleInput,
  RescheduleResult,
  TripDay,
  TripDayWithActivities,
  TripDetailsInput,
  TripHeaderData,
  TripInput,
  TripMemberWithUser,
  TripWithDays,
} from "@/types";

export type { ActionResult };

/** `tripDayId` comes from the first argument of addActivityToDay. */
export type AddActivityInput = Omit<ActivityInput, "tripDayId">;

/** Availability-poll windows are capped to keep the calendar UI manageable. */
const MAX_WINDOW_DAYS = 180;
/** Text longer than these limits is almost certainly a paste mistake. */
const MAX_DESTINATION_LENGTH = 80;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_LOCATION_LENGTH = 200;

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
 * via setTripDates). The currency (USD unless chosen) is fixed up front so
 * the budget is entered in it — whole numbers for zero-decimal currencies.
 */
export async function createTrip(
  input: TripInput,
): Promise<ActionResult<TripWithDays>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to create a trip.");

  const data = parseInput(tripInputSchema, input);
  if (!data) return fail(INVALID_INPUT);

  const title = data.title.trim();
  // Null = the group hasn't picked a place yet; the preferences deck then asks
  // the destination-finding questions instead of the itinerary ones.
  const destination = data.destination?.trim() || null;
  if (!title) return fail("Title is required.");
  if (title.length > MAX_TITLE_LENGTH) {
    return fail(`Title must be ${MAX_TITLE_LENGTH} characters or fewer.`);
  }
  if (destination && destination.length > MAX_DESTINATION_LENGTH) {
    return fail(
      `Destination must be ${MAX_DESTINATION_LENGTH} characters or fewer.`,
    );
  }

  const currency = data.currency ?? "USD";
  if (!isSupportedCurrency(currency)) return fail("Unsupported currency code.");

  const budget = parseBudget(data.totalBudget);
  if (typeof budget === "object" && budget !== null) return fail(budget.error);
  if (budget !== null && !isWholeUnit(Math.round(budget * 100), currency)) {
    return fail(wholeUnitsMessage("The total budget", currency));
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
    if (inclusiveDayCount(startDate, endDate) > MAX_TRIP_DAYS) {
      return fail(`Trips are limited to ${MAX_TRIP_DAYS} days.`);
    }
    const dayDates = dayDatesBetween(startDate, endDate);
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
        currency,
        totalBudget: budget,
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
 * dates first (they need attention), then newest start date first. Trips the
 * user hid from their list come back too, with archivedAt set, so the page
 * can file them under "Archived" instead of losing them.
 */
export async function getMyTrips(): Promise<ActionResult<MyTripSummary[]>> {
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
        archivedAt: m.archivedAt?.toISOString() ?? null,
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
 *
 * This is the full itinerary — only the itinerary tab needs it. Every other
 * section renders its header from getTripHeader.
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
 * Changes the trip's currency. OWNER only. Nothing is converted: every stored
 * amount (expenses, shares, repayments, the budget, planned costs) keeps its
 * number under the new code, which keeps the single-currency ledger coherent
 * but changes what the numbers mean. So it only happens silently while the
 * trip holds no amounts; after that the caller must pass `relabel: true`,
 * which the UI sends once the owner has confirmed an example of the relabel.
 *
 * Switching to a zero-decimal currency is refused while any expense, share,
 * repayment, or budget amount has cents: $45.50 can't become ¥45.50. The trip
 * row is locked across the check and the write, and expense writes lock it
 * too (lockTripCurrency in actions/expense.ts), so an amount saved at the
 * same moment can't slip past the check.
 */
export async function updateTripCurrency(
  tripId: string,
  currency: string,
  options: CurrencyChangeOptions = {},
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

    const refusal = await prisma.$transaction(async (tx): Promise<string | null> => {
      await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`;
      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        select: {
          currency: true,
          totalBudget: true,
          expenses: {
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            select: {
              description: true,
              amountCents: true,
              splits: { select: { amountCents: true } },
            },
          },
          settlements: { select: { amountCents: true } },
          days: {
            select: {
              activities: {
                where: { cost: { gt: 0 } },
                select: { cost: true },
              },
            },
          },
        },
      });
      if (!trip) return "Trip not found.";
      if (trip.currency === currency) return null;

      const { example, fractional } = summarizeTripAmounts({
        totalBudget: trip.totalBudget?.toNumber() ?? null,
        expenses: trip.expenses,
        settlementCents: trip.settlements.map((s) => s.amountCents),
        plannedCost: trip.days
          .flatMap((d) => d.activities)
          .reduce((sum, a) => sum + (a.cost?.toNumber() ?? 0), 0),
      });
      if (example && options?.relabel !== true) {
        return `This trip already has amounts in ${trip.currency}. Switching to ${currency} relabels them without converting, so it has to be confirmed first.`;
      }
      if (fractional && isZeroDecimal(currency)) {
        return zeroDecimalRefusal(currency, trip.currency, fractional);
      }

      await tx.trip.update({ where: { id: tripId }, data: { currency } });
      await tx.expense.updateMany({ where: { tripId }, data: { currency } });
      return null;
    });
    if (refusal) return fail(refusal);

    revalidatePath(`/trips/${tripId}`);
    revalidatePath(`/trips/${tripId}/expenses`);
    return { success: true, data: { currency } };
  } catch (error) {
    console.error("updateTripCurrency failed:", error);
    return fail("Failed to change the currency. Please try again.");
  }
}

/**
 * Sets or clears (null) the trip's total budget, in the trip's currency:
 * whole numbers when it has no decimal places. OWNER only.
 */
export async function updateTripBudget(
  tripId: string,
  totalBudget: number | null,
): Promise<ActionResult<{ totalBudget: number | null }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to change the budget.");
  if (!tripId) return fail("Trip id is required.");

  const budget = parseBudget(totalBudget);
  if (typeof budget === "object" && budget !== null) return fail(budget.error);

  try {
    const membership = await prisma.tripMember.findUnique({
      where: { userId_tripId: { userId, tripId } },
      select: { role: true },
    });
    if (!membership) return fail("Trip not found.");
    if (membership.role !== "OWNER") {
      return fail("Only the trip owner can change the budget.");
    }

    const refusal = await prisma.$transaction(async (tx): Promise<string | null> => {
      // Locked like updateTripCurrency, so the currency this budget is
      // checked against is still the trip's currency when it's written.
      const [trip] = await tx.$queryRaw<{ currency: string }[]>`
        SELECT currency FROM "Trip" WHERE id = ${tripId} FOR UPDATE`;
      if (!trip) return "Trip not found.";
      if (budget !== null && !isWholeUnit(Math.round(budget * 100), trip.currency)) {
        return wholeUnitsMessage("The total budget", trip.currency);
      }
      await tx.trip.update({
        where: { id: tripId },
        data: { totalBudget: budget },
      });
      return null;
    });
    if (refusal) return fail(refusal);

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
/* Trip header, details, dates, and lifecycle                           */
/* ------------------------------------------------------------------ */

/**
 * The trip header's data contract: trip metadata, the viewer's role and
 * hidden state, member count, itinerary totals, and logged spending. Every
 * trip section renders its header from this one query, so the budget card
 * means the same thing on every tab; only the itinerary tab also loads the
 * full day plan (getTripById). Members only — everyone else gets "not found".
 */
export async function getTripHeader(
  tripId: string,
): Promise<ActionResult<TripHeaderData>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view this trip.");
  if (!parseInput(idSchema, tripId)) return fail("Trip not found.");

  try {
    const [trip, spent] = await Promise.all([
      prisma.trip.findFirst({
        where: { id: tripId, members: { some: { userId } } },
        select: {
          id: true,
          title: true,
          destination: true,
          startDate: true,
          endDate: true,
          windowStart: true,
          windowEnd: true,
          durationDays: true,
          totalBudget: true,
          currency: true,
          members: {
            select: {
              userId: true,
              role: true,
              archivedAt: true,
              user: { select: { name: true } },
            },
          },
          // Costs only: the header needs totals, not the plan itself.
          days: { select: { activities: { select: { cost: true } } } },
        },
      }),
      prisma.expense.aggregate({
        where: { tripId },
        _sum: { amountCents: true },
      }),
    ]);

    const mine = trip?.members.find((m) => m.userId === userId);
    if (!trip || !mine) return fail("Trip not found.");

    const totals = itineraryTotals(
      trip.days.map((day) => ({
        activities: day.activities.map((a) => ({
          cost: a.cost?.toNumber() ?? null,
        })),
      })),
    );

    return {
      success: true,
      data: {
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
        role: mine.role,
        archivedAt: mine.archivedAt?.toISOString() ?? null,
        memberCount: trip.members.length,
        ownerName:
          trip.members.find((m) => m.role === "OWNER")?.user.name ?? null,
        ...totals,
        spentCents: spent._sum.amountCents ?? 0,
      },
    };
  } catch (error) {
    console.error("getTripHeader failed:", error);
    return fail("Failed to load trip. Please try again.");
  }
}

/**
 * The trip's days without their activities, for pickers such as "add this
 * idea to day…". Members only.
 */
export async function getTripDays(
  tripId: string,
): Promise<ActionResult<TripDay[]>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view this trip.");
  if (!parseInput(idSchema, tripId)) return fail("Trip not found.");

  try {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, members: { some: { userId } } },
      select: { days: { orderBy: { date: "asc" } } },
    });
    if (!trip) return fail("Trip not found.");

    return {
      success: true,
      data: trip.days.map((day) => ({
        id: day.id,
        date: day.date.toISOString(),
        tripId: day.tripId,
        createdAt: day.createdAt.toISOString(),
        updatedAt: day.updatedAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("getTripDays failed:", error);
    return fail("Failed to load the trip's days. Please try again.");
  }
}

/**
 * Renames the trip and sets, changes, or clears its destination. OWNER or
 * EDITOR. Clearing the destination puts the trip back to "not decided", which
 * switches the preference deck back to its destination-finding questions.
 */
export async function updateTripDetails(
  tripId: string,
  input: TripDetailsInput,
): Promise<ActionResult<{ title: string; destination: string | null }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit this trip.");
  const data = parseInput(tripDetailsInputSchema, input);
  if (!parseInput(idSchema, tripId) || !data) return fail(INVALID_INPUT);

  const title = data.title.trim();
  const destination = data.destination?.trim() || null;
  if (!title) return fail("Title is required.");
  if (title.length > MAX_TITLE_LENGTH) {
    return fail(`Title must be ${MAX_TITLE_LENGTH} characters or fewer.`);
  }
  if (destination && destination.length > MAX_DESTINATION_LENGTH) {
    return fail(
      `Destination must be ${MAX_DESTINATION_LENGTH} characters or fewer.`,
    );
  }

  try {
    const membership = await prisma.tripMember.findUnique({
      where: { userId_tripId: { userId, tripId } },
      select: { role: true },
    });
    if (!membership) return fail("Trip not found.");
    if (!canEditTripDetails(membership.role)) {
      return fail("Viewers can't edit the trip details.");
    }

    await prisma.trip.update({
      where: { id: tripId },
      data: { title, destination },
    });

    revalidateTrip(tripId);
    return { success: true, data: { title, destination } };
  } catch (error) {
    console.error("updateTripDetails failed:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return fail("Trip not found.");
    }
    return fail("Failed to save the trip details. Please try again.");
  }
}

/**
 * Kept days move to their new dates in two steps because (tripId, date) is
 * unique and Postgres checks unique indexes row by row: shifting Sep 12–14 a
 * day later would otherwise collide with Sep 13 on the first row. The parking
 * offset lands far past any real trip (parseUtcDate stops at year 2999).
 */
const PARKING_OFFSET_DAYS = 1_000_000;

/**
 * Moves a trip whose dates are already confirmed to a new range. OWNER only.
 * Day N of the old range becomes day N of the new one and every activity
 * time moves by the same number of days, so the plan keeps its shape.
 * Lengthening adds empty days at the end; shortening drops days from the end
 * and is refused while any of them still has activities. Expenses keep their
 * dates — they record when money was spent, not where it sits in the plan.
 *
 * Runs in one transaction with the trip row locked, so a concurrent
 * reschedule or repayment can't interleave with the day moves.
 */
export async function rescheduleTrip(
  tripId: string,
  input: RescheduleInput,
): Promise<ActionResult<RescheduleResult>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to change the trip dates.");
  const data = parseInput(rescheduleInputSchema, input);
  if (!parseInput(idSchema, tripId) || !data) return fail(INVALID_INPUT);

  const startDate = parseUtcDate(data.startDate);
  const endDate = parseUtcDate(data.endDate);
  if (!startDate || !endDate) {
    return fail("Start and end dates must be valid ISO dates (YYYY-MM-DD).");
  }
  if (endDate < startDate) {
    return fail("End date must be on or after the start date.");
  }
  if (inclusiveDayCount(startDate, endDate) > MAX_TRIP_DAYS) {
    return fail(`Trips are limited to ${MAX_TRIP_DAYS} days.`);
  }

  try {
    const outcome = await prisma.$transaction(async (tx): Promise<
      { error: string } | { result: RescheduleResult }
    > => {
      await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`;

      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        select: {
          startDate: true,
          members: { where: { userId }, select: { role: true } },
          days: {
            select: {
              id: true,
              date: true,
              _count: { select: { activities: true } },
            },
          },
        },
      });
      const membership = trip?.members[0];
      if (!trip || !membership) return { error: "Trip not found." };
      if (membership.role !== "OWNER") {
        return { error: "Only the trip owner can change the trip dates." };
      }
      if (!trip.startDate) {
        return {
          error:
            "This trip's dates haven't been picked yet — confirm them from the availability poll first.",
        };
      }

      const plan = planReschedule(
        trip.startDate,
        trip.days.map((day) => ({
          id: day.id,
          date: day.date,
          activityCount: day._count.activities,
        })),
        startDate,
        endDate,
      );
      if (plan.blockedDays.length > 0) {
        return { error: describeBlockedDays(plan.blockedDays) };
      }

      if (plan.droppedDays.length > 0) {
        await tx.tripDay.deleteMany({
          where: { id: { in: plan.droppedDays.map((day) => day.id) } },
        });
      }
      if (plan.shiftDays !== 0) {
        await tx.$executeRaw`
          UPDATE "TripDay"
          SET "date" = "date" + ${PARKING_OFFSET_DAYS}::int
          WHERE "tripId" = ${tripId}`;
        await tx.$executeRaw`
          UPDATE "TripDay"
          SET "date" = "date" - ${PARKING_OFFSET_DAYS - plan.shiftDays}::int,
              "updatedAt" = NOW() AT TIME ZONE 'UTC'
          WHERE "tripId" = ${tripId}`;
        await tx.$executeRaw`
          UPDATE "Activity"
          SET "time" = "time" + make_interval(days => ${plan.shiftDays}::int),
              "updatedAt" = NOW() AT TIME ZONE 'UTC'
          WHERE "time" IS NOT NULL
            AND "tripDayId" IN (SELECT id FROM "TripDay" WHERE "tripId" = ${tripId})`;
      }
      if (plan.newDates.length > 0) {
        await tx.tripDay.createMany({
          data: plan.newDates.map((date) => ({ tripId, date })),
        });
      }
      await tx.trip.update({
        where: { id: tripId },
        data: { startDate, endDate },
      });

      return {
        result: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          shiftDays: plan.shiftDays,
          addedDays: plan.newDates.length,
          removedDays: plan.droppedDays.length,
        },
      };
    });
    if ("error" in outcome) return fail(outcome.error);

    revalidateTrip(tripId);
    return { success: true, data: outcome.result };
  } catch (error) {
    console.error("rescheduleTrip failed:", error);
    return fail("Failed to change the trip dates. Please try again.");
  }
}

/**
 * Permanently deletes a trip and everything on it (the schema cascades days,
 * activities, expenses, repayments, invites, and memberships). OWNER only,
 * and only when `confirmTitle` matches the trip's title, so a stray click or
 * a replayed request can't do it. On success it redirects to /trips — the
 * page it was called from no longer exists — so it only ever returns failures.
 */
export async function deleteTrip(
  tripId: string,
  confirmTitle: string,
): Promise<ActionResult<never>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to delete this trip.");
  const confirmation = parseInput(deleteTripConfirmationSchema, confirmTitle);
  if (!parseInput(idSchema, tripId) || confirmation === null) {
    return fail(INVALID_INPUT);
  }

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        title: true,
        members: { where: { userId }, select: { role: true } },
      },
    });
    const membership = trip?.members[0];
    if (!trip || !membership) return fail("Trip not found.");
    if (membership.role !== "OWNER") {
      return fail("Only the trip owner can delete this trip.");
    }
    if (confirmation.trim() !== trip.title.trim()) {
      return fail("Type the trip's title exactly to confirm.");
    }

    await prisma.trip.delete({ where: { id: tripId } });
  } catch (error) {
    console.error("deleteTrip failed:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return fail("Trip not found.");
    }
    return fail("Failed to delete the trip. Please try again.");
  }

  revalidatePath("/trips");
  redirect("/trips");
}

/**
 * Hides the trip from (or restores it to) the signed-in member's own trip
 * list. Any member, any role. Purely personal: nobody else's list, role, or
 * access changes, and the trip stays fully usable from its URL.
 */
export async function setTripArchived(
  tripId: string,
  archived: boolean,
): Promise<ActionResult<{ archivedAt: string | null }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to organize your trips.");
  const flag = parseInput(archivedFlagSchema, archived);
  if (!parseInput(idSchema, tripId) || flag === null) return fail(INVALID_INPUT);

  try {
    const membership = await prisma.tripMember.findUnique({
      where: { userId_tripId: { userId, tripId } },
      select: { archivedAt: true },
    });
    if (!membership) return fail("Trip not found.");

    // Re-archiving keeps the original date rather than bumping it.
    const archivedAt = flag ? (membership.archivedAt ?? new Date()) : null;
    await prisma.tripMember.update({
      where: { userId_tripId: { userId, tripId } },
      data: { archivedAt },
    });

    revalidateTrip(tripId);
    return {
      success: true,
      data: { archivedAt: archivedAt?.toISOString() ?? null },
    };
  } catch (error) {
    console.error("setTripArchived failed:", error);
    return fail("Failed to update your trip list. Please try again.");
  }
}

/* ------------------------------------------------------------------ */
/* Helpers (module-private: "use server" files may only export          */
/* async functions and types)                                           */
/* ------------------------------------------------------------------ */

const TRIP_SECTIONS = [
  "",
  "/ideas",
  "/expenses",
  "/packing",
  "/preferences",
  "/preferences/onboarding",
] as const;

/**
 * Trip metadata shows in every section's header and on the trip list, so a
 * change to it refreshes all of them.
 */
function revalidateTrip(tripId: string): void {
  revalidatePath("/trips");
  for (const section of TRIP_SECTIONS) {
    revalidatePath(`/trips/${tripId}${section}`);
  }
}

/**
 * Validates a budget for the Decimal(12,2) column: non-negative, rounded to
 * cents, and within range. Null clears it.
 */
function parseBudget(value: unknown): number | null | { error: string } {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return { error: "Total budget must be a non-negative number." };
  }
  const budget = Math.round(value * 100) / 100;
  if (budget >= 1e10) return { error: "Total budget is too large." };
  return budget;
}

/** Validates AddActivityInput and normalizes it for Prisma writes. */
function parseActivityFields(input: unknown):
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
  const data = parseInput(activityInputSchema, input);
  if (!data) return { error: INVALID_INPUT };

  const title = data.title.trim();
  if (!title) return { error: "Activity title is required." };
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

  let time: Date | null = null;
  if (data.time != null) {
    time = parseIsoDateTime(data.time);
    if (!time) return { error: "Time must be a valid ISO datetime string." };
  }

  const latitude = data.latitude ?? null;
  const longitude = data.longitude ?? null;
  if ((latitude === null) !== (longitude === null)) {
    return { error: "Latitude and longitude must be provided together." };
  }
  if (latitude !== null && !(latitude >= -90 && latitude <= 90)) {
    return { error: "Latitude must be between -90 and 90." };
  }
  if (longitude !== null && !(longitude >= -180 && longitude <= 180)) {
    return { error: "Longitude must be between -180 and 180." };
  }

  const cost = parseBudget(data.cost);
  if (typeof cost === "object" && cost !== null) {
    return { error: "Cost must be a non-negative number." };
  }

  return { title, description, time, locationName, latitude, longitude, cost };
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
