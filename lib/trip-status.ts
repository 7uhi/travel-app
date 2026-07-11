export type TripStatus = "upcoming" | "ongoing" | "past";

const MS_PER_DAY = 86_400_000;

/** Where a trip sits relative to now; endDate is inclusive. */
export function tripStatus(
  startIso: string,
  endIso: string,
  now: number = Date.now(),
): TripStatus {
  const start = Date.parse(startIso);
  const endExclusive = Date.parse(endIso) + MS_PER_DAY;
  if (now < start) return "upcoming";
  if (now < endExclusive) return "ongoing";
  return "past";
}
