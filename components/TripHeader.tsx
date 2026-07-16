import Link from "next/link";
import { CalendarDays, MapPin, Sun } from "lucide-react";

import { ShareTripButton } from "@/components/ShareTripButton";
import { formatCurrency, formatDateRange, formatDayDate } from "@/lib/format";
import { tripStatus } from "@/lib/trip-status";
import type { TripRole, TripWithDays } from "@/types";

const MS_PER_DAY = 86_400_000;

export type TripTab = "itinerary" | "ideas" | "expenses" | "packing";

/**
 * Shared top section of every trip page: breadcrumb, hero, stat cards, and
 * the tab navigation between the itinerary and expenses views.
 */
export function TripHeader({
  trip,
  currentUserRole = null,
  activeTab = "itinerary",
  showTabs = true,
  respondedCount = null,
}: {
  trip: TripWithDays;
  currentUserRole?: TripRole | null;
  activeTab?: TripTab;
  showTabs?: boolean;
  /** Members who marked availability; only shown while the trip is unscheduled. */
  respondedCount?: number | null;
}) {
  const activities = trip.days.flatMap((day) => day.activities);
  const plannedCost = activities.reduce((sum, a) => sum + (a.cost ?? 0), 0);
  const daysWithPlans = trip.days.filter((d) => d.activities.length > 0).length;
  const openDays = trip.days.length - daysWithPlans;
  const plannedPct =
    trip.days.length > 0
      ? Math.round((daysWithPlans / trip.days.length) * 100)
      : 0;

  const status = tripStatus(trip.startDate, trip.endDate);
  const scheduled = status !== "planning";
  const now = Date.now();
  const start = scheduled ? Date.parse(trip.startDate!) : Number.NaN;
  const daysToGo = scheduled
    ? Math.max(0, Math.ceil((start - now) / MS_PER_DAY))
    : 0;
  const currentDayNumber =
    status === "ongoing" ? Math.floor((now - start) / MS_PER_DAY) + 1 : null;

  const statusChip =
    status === "planning"
      ? "Planning · picking dates"
      : status === "upcoming"
        ? `Upcoming · in ${daysToGo} ${daysToGo === 1 ? "day" : "days"}`
        : status === "ongoing"
          ? `Happening now · day ${currentDayNumber} of ${trip.days.length}`
          : "Past trip";

  const budgetPct =
    trip.totalBudget && trip.totalBudget > 0
      ? Math.round((plannedCost / trip.totalBudget) * 100)
      : null;

  return (
    <>
      <nav className="mb-4 text-sm text-stone-500">
        <Link href="/trips" className="transition-colors hover:text-pine">
          Trips
        </Link>
        <span className="mx-2 text-stone-300">/</span>
        <span className="text-stone-700">{trip.title}</span>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#e29a5b_0%,#c06b5e_45%,#54314e_100%)] px-6 py-8 text-white sm:px-10 sm:py-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <span className="rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] backdrop-blur">
            {statusChip}
          </span>
          <span className="flex items-center gap-2">
            {trip.totalBudget !== null && (
              <span className="rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-xs font-medium backdrop-blur">
                Budget · {formatCurrency(trip.totalBudget, trip.currency)}
              </span>
            )}
            {currentUserRole === "OWNER" && (
              <ShareTripButton tripId={trip.id} />
            )}
          </span>
        </div>

        <div className="mt-14 flex flex-wrap items-end justify-between gap-6 sm:mt-20">
          <div>
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
              {trip.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/90">
              <span className="flex items-center gap-1.5">
                <MapPin size={15} className="text-white/70" />
                {trip.destination}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarDays size={15} className="text-white/70" />
                {scheduled
                  ? formatDateRange(trip.startDate!, trip.endDate!)
                  : trip.windowStart && trip.windowEnd
                    ? `Sometime ${formatDateRange(trip.windowStart, trip.windowEnd)}`
                    : "Dates TBD"}
              </span>
              <span className="flex items-center gap-1.5">
                <Sun size={15} className="text-white/70" />
                {scheduled
                  ? `${trip.days.length} ${trip.days.length === 1 ? "day" : "days"}`
                  : `~${trip.durationDays ?? "?"} days`}
              </span>
            </div>
          </div>

          <div className="w-full max-w-[220px]">
            {scheduled ? (
              <>
                <p className="mb-2 text-right text-xs font-medium text-white/85">
                  Trip {plannedPct}% planned
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full bg-white"
                    style={{ width: `${plannedPct}%` }}
                  />
                </div>
              </>
            ) : (
              respondedCount !== null && (
                <p className="text-right text-xs font-medium text-white/85">
                  {respondedCount} of {trip.members.length} marked availability
                </p>
              )
            )}
          </div>
        </div>
      </section>

      {/* Stat cards */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Countdown">
          {status === "planning" ? (
            <>
              <p className="font-display text-4xl">TBD</p>
              <p className="mt-2 text-sm text-stone-500">
                Dates get picked from everyone's availability
              </p>
            </>
          ) : status === "upcoming" ? (
            <>
              <p className="font-display text-4xl">
                {daysToGo}
                <span className="ml-2 font-sans text-sm font-normal text-stone-500">
                  days to {trip.destination.split(",")[0]}
                </span>
              </p>
              <p className="mt-2 text-sm text-stone-500">
                Departs {formatDayDate(trip.startDate!)}
              </p>
            </>
          ) : status === "ongoing" ? (
            <>
              <p className="font-display text-4xl">Day {currentDayNumber}</p>
              <p className="mt-2 text-sm text-stone-500">
                of {trip.days.length} — enjoy {trip.destination.split(",")[0]}!
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-4xl">
                {trip.days.length}
                <span className="ml-2 font-sans text-sm font-normal text-stone-500">
                  days traveled
                </span>
              </p>
              <p className="mt-2 text-sm text-stone-500">
                Ended {formatDayDate(trip.endDate!)}
              </p>
            </>
          )}
        </StatCard>

        <StatCard label="Trip budget">
          <p className="font-display text-4xl">
            {formatCurrency(plannedCost, trip.currency)}
            {trip.totalBudget !== null && (
              <span className="ml-2 font-sans text-sm font-normal text-stone-500">
                of {formatCurrency(trip.totalBudget, trip.currency)}
              </span>
            )}
          </p>
          {budgetPct !== null ? (
            <>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-200">
                <div
                  className={`h-full rounded-full ${
                    budgetPct > 100 ? "bg-red-500" : "bg-pine"
                  }`}
                  style={{ width: `${Math.min(budgetPct, 100)}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-stone-500">
                {budgetPct > 100
                  ? `${budgetPct - 100}% over budget`
                  : `${budgetPct}% of budget planned`}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-stone-500">
              planned so far · no budget set
            </p>
          )}
        </StatCard>

        <StatCard label="Itinerary">
          <p className="font-display text-4xl">
            {activities.length}
            <span className="ml-2 font-sans text-sm font-normal text-stone-500">
              activities
            </span>
          </p>
          <p className="mt-2 text-sm text-stone-500">
            {status === "planning"
              ? "Unlocks once trip dates are set"
              : openDays > 0
                ? `${openDays} ${openDays === 1 ? "day" : "days"} still open`
                : "Every day has plans"}
          </p>
        </StatCard>
      </section>

      {showTabs && (
        <nav className="mt-8 flex gap-2" aria-label="Trip sections">
          <TabLink href={`/trips/${trip.id}`} active={activeTab === "itinerary"}>
            Itinerary
          </TabLink>
          <TabLink
            href={`/trips/${trip.id}/ideas`}
            active={activeTab === "ideas"}
          >
            Ideas
          </TabLink>
          <TabLink
            href={`/trips/${trip.id}/expenses`}
            active={activeTab === "expenses"}
          >
            Expenses
          </TabLink>
          <TabLink
            href={`/trips/${trip.id}/packing`}
            active={activeTab === "packing"}
          >
            Packing
          </TabLink>
        </nav>
      )}
    </>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-pine text-white"
          : "border border-stone-200 bg-white text-stone-600 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

function StatCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        {label}
      </p>
      {children}
    </div>
  );
}
