/**
 * Display formatters shared by server and client components.
 *
 * All date/time formatting is pinned to UTC: TripDay dates are stored at UTC
 * midnight and activity times are compared as entered, so UTC keeps the text
 * identical between server render and client hydration regardless of the
 * viewer's timezone.
 */

/**
 * Major units → "$2,000", "$110.50" (never "$110.5"), "¥4,500". Whole
 * amounts drop the decimals; anything else gets the currency's own precision,
 * so an estimate such as a per-person share reads "≈ ¥1,767", not "¥1,766.67".
 */
export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    ...(Number.isInteger(amount) && {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }),
  }).format(amount);
}

/**
 * Integer hundredths → "$45.00", "¥4,500". Intl drops the decimals of
 * zero-decimal currencies like JPY, which would round an amount stored with
 * cents (from before whole units were enforced) out of sight — so anything
 * with cents always shows them: "¥333.33", never "¥333".
 */
export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    ...(cents % 100 !== 0 && {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  }).format(cents / 100);
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
