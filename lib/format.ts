/**
 * Display formatters shared by server and client components.
 *
 * All date/time formatting is pinned to UTC: TripDay dates are stored at UTC
 * midnight and activity times are compared as entered, so UTC keeps the text
 * identical between server render and client hydration regardless of the
 * viewer's timezone.
 */

export function formatCurrency(amount: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

/** Integer cents → "€45.00". Intl handles 0-decimal currencies like JPY. */
export function formatCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(
    cents / 100,
  );
}

/** "Sat, Sep 12" */
export function formatDayDate(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/** "Sep 12 – 18, 2026" (collapses shared month/year) */
export function formatDateRange(startIso: string, endIso: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).formatRange(new Date(startIso), new Date(endIso));
}

/** "09:40" */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(new Date(iso));
}
