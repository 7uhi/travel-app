import { AvailabilityPlanner } from "@/components/availability/AvailabilityPlanner";
import { ItineraryList } from "@/components/ItineraryList";
import { TripHeader } from "@/components/TripHeader";
import { formatCurrency, formatDateRange } from "@/lib/format";
import type { TripAvailability, TripRole, TripWithDays } from "@/types";

/**
 * The Itinerary tab: shared trip header plus the day-by-day plan — or, while
 * the group is still picking dates, the availability poll in its place.
 */
export function TripDashboard({
  trip,
  currentUserRole = null,
  showTabs = true,
  availability = null,
  currentUserId = null,
}: {
  trip: TripWithDays;
  /** The viewer's membership role; controls owner-only UI like sharing. */
  currentUserRole?: TripRole | null;
  showTabs?: boolean;
  /** The date poll; only provided (and shown) while the trip has no dates. */
  availability?: TripAvailability | null;
  currentUserId?: string | null;
}) {
  const scheduled = trip.startDate !== null;
  const respondedCount = availability
    ? new Set(availability.entries.map((e) => e.userId)).size
    : null;
  const activityCount = trip.days.reduce(
    (n, day) => n + day.activities.length,
    0,
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TripHeader
        trip={trip}
        currentUserRole={currentUserRole}
        activeTab="itinerary"
        showTabs={showTabs}
        respondedCount={scheduled ? null : respondedCount}
      />

      <section className="mt-10 grid items-start gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {scheduled ? (
            <>
              <h2 className="mb-4 font-display text-2xl">Itinerary</h2>
              <ItineraryList
                days={trip.days}
                currency={trip.currency}
                canEdit={
                  currentUserRole === "OWNER" || currentUserRole === "EDITOR"
                }
              />
            </>
          ) : (
            <>
              <h2 className="mb-4 font-display text-2xl">Find dates</h2>
              {availability ? (
                <AvailabilityPlanner
                  tripId={trip.id}
                  availability={availability}
                  members={trip.members}
                  currentUserId={currentUserId}
                  isOwner={currentUserRole === "OWNER"}
                />
              ) : (
                <p className="rounded-2xl border border-stone-200/80 bg-white p-5 text-sm text-stone-500">
                  The availability poll couldn't be loaded. Refresh to try
                  again.
                </p>
              )}
            </>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-8">
          {scheduled && <SpendingByDay trip={trip} />}
          <TripFacts trip={trip} activityCount={activityCount} />
        </aside>
      </section>
    </main>
  );
}

function SpendingByDay({ trip }: { trip: TripWithDays }) {
  const rows = trip.days
    .map((day, index) => ({
      id: day.id,
      label: `Day ${index + 1}`,
      cost: day.activities.reduce((sum, a) => sum + (a.cost ?? 0), 0),
    }))
    .filter((row) => row.cost > 0);
  const maxCost = Math.max(...rows.map((row) => row.cost), 1);

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        Spending by day
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-500">No costs added yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 text-sm">
              <span className="w-12 shrink-0 text-stone-500">{row.label}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                <span
                  className="block h-full rounded-full bg-pine/80"
                  style={{ width: `${(row.cost / maxCost) * 100}%` }}
                />
              </span>
              <span className="w-16 shrink-0 text-right font-medium tabular-nums">
                {formatCurrency(row.cost, trip.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TripFacts({
  trip,
  activityCount,
}: {
  trip: TripWithDays;
  activityCount: number;
}) {
  const owner = trip.members.find((m) => m.role === "OWNER");
  const facts: [string, string][] = [
    ["Destination", trip.destination],
    [
      "Dates",
      trip.startDate && trip.endDate
        ? formatDateRange(trip.startDate, trip.endDate)
        : "TBD",
    ],
    [
      "Duration",
      trip.startDate
        ? `${trip.days.length} ${trip.days.length === 1 ? "day" : "days"}`
        : trip.durationDays
          ? `~${trip.durationDays} days`
          : "TBD",
    ],
    ["Activities", String(activityCount)],
    [
      "Members",
      `${trip.members.length}${owner?.user.name ? ` · ${owner.user.name} owns` : ""}`,
    ],
  ];

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        Trip facts
      </p>
      <dl className="space-y-2.5 text-sm">
        {facts.map(([term, value]) => (
          <div key={term} className="flex justify-between gap-4">
            <dt className="text-stone-500">{term}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
