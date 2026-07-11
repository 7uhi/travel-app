export type TripStatus = "planning" | "upcoming" | "ongoing" | "past";

const MS_PER_DAY = 86_400_000;

/**
 * Where a trip sits relative to now; endDate is inclusive. Trips whose dates
 * the group is still picking (null dates) are "planning".
 */
export function tripStatus(
  startIso: string | null,
  endIso: string | null,
  now: number = Date.now(),
): TripStatus {
  if (!startIso || !endIso) return "planning";
  const start = Date.parse(startIso);
  const endExclusive = Date.parse(endIso) + MS_PER_DAY;
  if (now < start) return "upcoming";
  if (now < endExclusive) return "ongoing";
  return "past";
}
