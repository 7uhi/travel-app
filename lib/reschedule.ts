import { dayDatesBetween } from "@/lib/dates";
import { formatDayDate } from "@/lib/format";

const MS_PER_DAY = 86_400_000;
/** Blocked days named in a refusal before the rest are just counted. */
const MAX_NAMED_DAYS = 5;

export interface ExistingDay {
  id: string;
  /** UTC midnight */
  date: Date;
  activityCount: number;
}

export interface ReschedulePlan {
  /** Whole days every kept day and activity time moves by (negative = earlier). */
  shiftDays: number;
  /** Existing days that fall past the end of the new range. */
  droppedDays: ExistingDay[];
  /** Dropped days that still hold activities; the move is refused while any exist. */
  blockedDays: ExistingDay[];
  /** Dates in the new range that no existing day maps onto. */
  newDates: Date[];
}

/**
 * Maps a confirmed trip onto a new date range. Day N of the old range becomes
 * day N of the new one, so every day — and every activity time on it — moves
 * by the same number of days and the plan keeps its shape. A longer range
 * gains empty days at the end; a shorter one drops days from the end, which
 * the caller only allows when those days are empty.
 *
 * Days are placed by their date rather than their position in the list, so a
 * gap in the stored days becomes a fresh day instead of shifting the rest.
 * Throws a RangeError for ranges over MAX_TRIP_DAYS (via dayDatesBetween).
 */
export function planReschedule(
  oldStart: Date,
  days: ExistingDay[],
  newStart: Date,
  newEnd: Date,
): ReschedulePlan {
  const newRange = dayDatesBetween(newStart, newEnd);
  const covered = new Set<number>();
  const droppedDays: ExistingDay[] = [];
  for (const day of days) {
    const offset = Math.round(
      (day.date.getTime() - oldStart.getTime()) / MS_PER_DAY,
    );
    if (offset >= 0 && offset < newRange.length) covered.add(offset);
    else droppedDays.push(day);
  }
  return {
    shiftDays: Math.round(
      (newStart.getTime() - oldStart.getTime()) / MS_PER_DAY,
    ),
    droppedDays,
    blockedDays: droppedDays.filter((day) => day.activityCount > 0),
    newDates: newRange.filter((_, offset) => !covered.has(offset)),
  };
}

/**
 * Why a shorter range was refused, naming the days by their current dates:
 * "Shortening the trip would drop 2 days that still have activities: Sat,
 * Sep 19 (3 activities) and Sun, Sep 20 (1 activity). …"
 */
export function describeBlockedDays(blocked: ExistingDay[]): string {
  const sorted = [...blocked].sort((a, b) => a.date.getTime() - b.date.getTime());
  const named = sorted.slice(0, MAX_NAMED_DAYS).map((day) => {
    const noun = day.activityCount === 1 ? "activity" : "activities";
    return `${formatDayDate(day.date.toISOString())} (${day.activityCount} ${noun})`;
  });
  const rest = sorted.length - named.length;
  if (rest > 0) named.push(`${rest} more ${rest === 1 ? "day" : "days"}`);
  const list =
    named.length === 1
      ? named[0]
      : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  const lead =
    sorted.length === 1
      ? "a day that still has activities"
      : `${sorted.length} days that still have activities`;
  return `Shortening the trip would drop ${lead}: ${list}. Move or delete those activities first, or pick a longer range.`;
}
