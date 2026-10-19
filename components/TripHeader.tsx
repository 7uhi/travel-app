import Link from "next/link";
import { CalendarDays, EyeOff, MapPin, Sun, Users } from "lucide-react";

import { EditBudgetButton } from "@/components/EditBudgetButton";
import { ShareTripButton } from "@/components/ShareTripButton";
import { MembersButton } from "@/components/trip/MembersButton";
import { SetDestinationButton } from "@/components/trip/SetDestinationButton";
import { TripActionsMenu } from "@/components/trip/TripActionsMenu";
import { formatCurrency, formatDateRange, formatDayDate } from "@/lib/format";
import { canCreateInvite, canEditTripDetails } from "@/lib/permissions";
import { tripStatus } from "@/lib/trip-status";
import type { TripHeaderData } from "@/types";

const MS_PER_DAY = 86_400_000;

export type TripTab =
  | "itinerary"
  | "ideas"
  | "expenses"
  | "packing"
  | "preferences";

/**
 * Shared top section of every trip page: breadcrumb, hero, stat cards, and
 * the tab navigation between sections. Renders only from TripHeaderData
 * (getTripHeader), so every tab shows the same figures for the same trip.
 *
 * Only the Itinerary tab is the overview. Below the sm breakpoint the other
 * tabs get a compact header — title, destination and dates, the trip's
 * controls, then the tabs — because the full one pushed each task a whole
 * phone screen down. It's the same markup with static parts hidden rather
 * than a second header: every control (and the dialog it owns) stays
 * mounted, so turning a phone sideways never hides an open dialog.
 */
export function TripHeader({
  trip,
  activeTab = "itinerary",
  showTabs = true,
  respondedCount = null,
  readOnly = false,
}: {
  trip: TripHeaderData;
  activeTab?: TripTab;
  showTabs?: boolean;
  /**
   * Leaves out the membership controls (trip actions menu, members dialog),
   * for the /preview sample, which has no real trip behind it.
   */
  readOnly?: boolean;
  /** Members who marked availability; only shown while the trip is unscheduled. */
  respondedCount?: number | null;
}) {
  const openDays = trip.dayCount - trip.plannedDayCount;
  const plannedPct =
    trip.dayCount > 0
      ? Math.round((trip.plannedDayCount / trip.dayCount) * 100)
      : 0;
  const canEditDetails = canEditTripDetails(trip.role);
  const compact = activeTab !== "itinerary";
  /** Mobile classes for the compact header; both must agree from sm up. */
  const layout = (compactClass: string, fullClass: string) =>
    compact ? compactClass : fullClass;

  // "Lisbon, Portugal" → "Lisbon"; null while the destination is undecided.
  const destinationShort = trip.destination?.split(",")[0].trim() ?? null;

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
          ? `Happening now · day ${currentDayNumber} of ${trip.dayCount}`
          : "Past trip";

  // The budget card leads with the plan before the trip and with actual
  // spending once it's underway; the other figure becomes the secondary line.
  // Exception: with no costs planned, a "$0 planned" headline would bury real
  // spending, so spending leads whenever it's the only signal.
  const plannedCost = trip.plannedCost;
  const spent = trip.spentCents !== null ? trip.spentCents / 100 : null;
  const primaryIsSpent =
    spent !== null &&
    (status === "ongoing" ||
      status === "past" ||
      (spent > 0 && plannedCost === 0));
  const primaryAmount = primaryIsSpent ? spent : plannedCost;
  const primaryVerb = primaryIsSpent ? "spent" : "planned";
  const secondaryText = primaryIsSpent
    ? plannedCost > 0
      ? `${formatCurrency(plannedCost, trip.currency)} planned`
      : null
    : spent !== null && spent > 0
      ? `${formatCurrency(spent, trip.currency)} spent so far`
      : null;

  const budgetPct =
    trip.totalBudget && trip.totalBudget > 0
      ? Math.round((primaryAmount / trip.totalBudget) * 100)
      : null;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-stone-600">
        <Link href="/trips" className="transition-colors hover:text-pine">
          Trips
        </Link>
        <span aria-hidden className="mx-2 text-stone-400">
          /
        </span>
        <span className="text-stone-700">{trip.title}</span>
      </nav>

      {/* Hero. No overflow clipping: the trip options menu opens below it. */}
      <section
        className={`relative bg-[linear-gradient(to_top,rgb(28_25_23/0.42)_0%,rgb(28_25_23/0.2)_50%,rgb(28_25_23/0)_85%),linear-gradient(135deg,#e29a5b_0%,#c06b5e_45%,#54314e_100%)] text-white sm:rounded-3xl sm:px-10 sm:py-12 ${layout(
          "rounded-2xl px-4 py-4",
          "rounded-3xl px-6 py-8",
        )}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border border-white/30 bg-black/35 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] backdrop-blur ${layout("hidden sm:block", "")}`}
            >
              {statusChip}
            </span>
            {trip.archivedAt && (
              <span className="flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-xs font-medium">
                <EyeOff size={12} aria-hidden />
                Hidden from your trips
              </span>
            )}
          </span>
          {/* ml-auto keeps the actions (and the menu anchored to them) on the
              right edge even when they wrap below the status chip. */}
          <span className="ml-auto flex items-center gap-2">
            {trip.role === "OWNER" ? (
              <EditBudgetButton
                tripId={trip.id}
                totalBudget={trip.totalBudget}
                currency={trip.currency}
              />
            ) : (
              trip.totalBudget !== null && (
                <span className="rounded-full border border-white/30 bg-black/35 px-3.5 py-1.5 text-xs font-medium backdrop-blur">
                  Budget · {formatCurrency(trip.totalBudget, trip.currency)}
                </span>
              )
            )}
            {canCreateInvite(trip.role) && <ShareTripButton tripId={trip.id} />}
            {!readOnly && <TripActionsMenu trip={trip} />}
          </span>
        </div>

        <div
          className={`flex flex-wrap items-end justify-between gap-6 sm:mt-20 ${layout("mt-3", "mt-14")}`}
        >
          <div>
            <h1
              className={`font-display tracking-tight sm:text-5xl ${layout("text-3xl", "text-4xl")}`}
            >
              {trip.title}
            </h1>
            <div
              className={`flex flex-wrap items-center text-sm text-white sm:mt-4 sm:gap-x-5 sm:gap-y-2 ${layout(
                "mt-2 gap-x-4 gap-y-1",
                "mt-4 gap-x-5 gap-y-2",
              )}`}
            >
              <span className="flex items-center gap-1.5">
                <MapPin size={15} className="text-white/70" />
                {trip.destination ?? "Destination TBD"}
                {trip.destination === null && canEditDetails && (
                  <SetDestinationButton
                    tripId={trip.id}
                    title={trip.title}
                    tone="hero"
                  />
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarDays size={15} className="text-white/70" />
                {scheduled
                  ? formatDateRange(trip.startDate!, trip.endDate!)
                  : trip.windowStart && trip.windowEnd
                    ? `Sometime ${formatDateRange(trip.windowStart, trip.windowEnd)}`
                    : "Dates TBD"}
              </span>
              <span
                className={`items-center gap-1.5 ${layout("hidden sm:flex", "flex")}`}
              >
                <Sun size={15} className="text-white/70" />
                {scheduled
                  ? `${trip.dayCount} ${trip.dayCount === 1 ? "day" : "days"}`
                  : `~${trip.durationDays ?? "?"} days`}
              </span>
              {readOnly ? (
                <span className="flex items-center gap-1.5">
                  <Users size={15} className="text-white/70" aria-hidden />
                  {trip.memberCount} {trip.memberCount === 1 ? "member" : "members"}
                </span>
              ) : (
                <MembersButton trip={trip} />
              )}
            </div>
          </div>

          <div
            className={`w-full max-w-[220px] ${layout("hidden sm:block", "")}`}
          >
            {scheduled ? (
              <>
                <p className="mb-2 text-right text-xs font-medium text-white">
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
                <p className="text-right text-xs font-medium text-white">
                  {respondedCount} of {trip.memberCount} marked availability
                </p>
              )
            )}
          </div>
        </div>
      </section>

      {/* Stat cards */}
      <section
        className={`mt-6 gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-3 ${layout("hidden", "grid")}`}
      >
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
                  days to {destinationShort ?? "your trip"}
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
                of {trip.dayCount} — enjoy {destinationShort ?? "the trip"}!
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-4xl">
                {trip.dayCount}
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
            {formatCurrency(primaryAmount, trip.currency)}
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
                  ? `${budgetPct - 100}% over budget ${primaryVerb}`
                  : `${budgetPct}% of budget ${primaryVerb}`}
                {secondaryText && ` · ${secondaryText}`}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-stone-500">
              {primaryVerb} so far · no budget set
              {secondaryText && ` · ${secondaryText}`}
            </p>
          )}
          {trip.memberCount > 1 && (
            <p className="mt-1 text-xs text-stone-500">
              ≈ {formatCurrency(primaryAmount / trip.memberCount, trip.currency)}{" "}
              per person
              {trip.totalBudget !== null &&
                ` · ${formatCurrency(trip.totalBudget / trip.memberCount, trip.currency)} budgeted`}
            </p>
          )}
        </StatCard>

        <StatCard label="Itinerary">
          <p className="font-display text-4xl">
            {trip.activityCount}
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
        <nav
          className={`flex flex-wrap gap-2 sm:mt-8 ${layout("mt-4", "mt-8")}`}
          aria-label="Trip sections"
        >
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
          <TabLink
            href={`/trips/${trip.id}/preferences`}
            active={activeTab === "preferences"}
          >
            Preferences
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
