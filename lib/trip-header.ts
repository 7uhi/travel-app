/**
 * Itinerary figures for the trip header, summed the same way wherever they're
 * computed. Costs are added in whole cents so a long list of decimal activity
 * costs can't drift (0.1 + 0.2), and getTripHeader's cost-only query and a
 * fully loaded itinerary always agree.
 */

export interface ItineraryTotals {
  dayCount: number;
  /** Days with at least one activity. */
  plannedDayCount: number;
  activityCount: number;
  /** Sum of activity costs, in currency units. */
  plannedCost: number;
}

export function itineraryTotals(
  days: { activities: { cost: number | null }[] }[],
): ItineraryTotals {
  let plannedDayCount = 0;
  let activityCount = 0;
  let plannedCents = 0;
  for (const day of days) {
    if (day.activities.length > 0) plannedDayCount += 1;
    activityCount += day.activities.length;
    for (const activity of day.activities) {
      plannedCents += Math.round((activity.cost ?? 0) * 100);
    }
  }
  return {
    dayCount: days.length,
    plannedDayCount,
    activityCount,
    plannedCost: plannedCents / 100,
  };
}
