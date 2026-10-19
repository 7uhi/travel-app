/**
 * UTC calendar-date helpers for @db.Date columns. All calendar dates in the
 * app are stored at UTC midnight so server render and client hydration agree
 * regardless of the viewer's timezone.
 */

const MS_PER_DAY = 86_400_000;

/** Safety cap so a bad date range can't create thousands of TripDay rows. */
export const MAX_TRIP_DAYS = 366;

/** Calendar dates outside this range are input mistakes, not trips. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2999;

const CALENDAR_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T00:00(?::00(?:\.0{1,3})?)?Z)?$/;

const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Parses a calendar date ("YYYY-MM-DD", or the same date at UTC midnight in
 * full ISO form) as UTC midnight. Impossible dates such as 2026-02-30 are
 * rejected rather than rolled forward into the next month.
 */
export function parseUtcDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = CALENDAR_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1, 4).map(Number);
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

/** Parses a full ISO 8601 date-time with an explicit offset. */
export function parseIsoDateTime(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_DATE_TIME.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return parseUtcDate(value.slice(0, 10)) ? date : null;
}

/** Whole days from start to end inclusive (1 when they are the same day). */
export function inclusiveDayCount(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
}

/**
 * Every UTC-midnight date from start to end, inclusive. Refuses ranges longer
 * than MAX_TRIP_DAYS before allocating anything, so callers can't be made to
 * build millions of dates from one request.
 */
export function dayDatesBetween(start: Date, end: Date): Date[] {
  const count = inclusiveDayCount(start, end);
  if (count > MAX_TRIP_DAYS) {
    throw new RangeError(`Date ranges are limited to ${MAX_TRIP_DAYS} days.`);
  }
  return Array.from(
    { length: Math.max(count, 0) },
    (_, i) => new Date(start.getTime() + i * MS_PER_DAY),
  );
}
