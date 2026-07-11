/**
 * UTC calendar-date helpers for @db.Date columns. All calendar dates in the
 * app are stored at UTC midnight so server render and client hydration agree
 * regardless of the viewer's timezone.
 */

const MS_PER_DAY = 86_400_000;

/** Safety cap so a bad date range can't create thousands of TripDay rows. */
export const MAX_TRIP_DAYS = 366;

/** Parses the date part of an ISO string as UTC midnight (for @db.Date columns). */
export function parseUtcDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Every UTC-midnight date from start to end, inclusive. */
export function dayDatesBetween(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(new Date(d));
  }
  return dates;
}

/** Whole days from start to end inclusive (1 when they are the same day). */
export function inclusiveDayCount(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
}
