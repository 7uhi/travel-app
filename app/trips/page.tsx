import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Archive, CalendarDays, ChevronDown, MapPin, Users } from "lucide-react";

import { getMyProfile } from "@/actions/preferences";
import { getMyTrips } from "@/actions/trip";
import { PROFILE_ONBOARDING_SEEN } from "@/lib/onboarding";
import { NewTripButton } from "@/components/NewTripButton";
import { TravelProfileCard } from "@/components/preferences/TravelProfileCard";
import {
  ArchivedTrips,
  UnarchiveTripButton,
} from "@/components/trip/UnarchiveTripButton";
import { formatDateRange } from "@/lib/format";
import { tripStatus, type TripStatus } from "@/lib/trip-status";
import type { MyTripSummary } from "@/types";

const COVER_GRADIENTS: Record<TripStatus, string> = {
  planning: "bg-[linear-gradient(135deg,#9b8ec4_0%,#6b5b8e_55%,#3d2f52_100%)]",
  upcoming: "bg-[linear-gradient(135deg,#e29a5b_0%,#c06b5e_55%,#54314e_100%)]",
  ongoing: "bg-[linear-gradient(135deg,#7fb069_0%,#3d7a5c_55%,#0a4433_100%)]",
  past: "bg-[linear-gradient(135deg,#a8b8c8_0%,#7d94ab_55%,#4a5d73_100%)]",
};

const STATUS_LABELS: Record<TripStatus, string> = {
  planning: "Picking dates",
  upcoming: "Upcoming",
  ongoing: "Happening now",
  past: "Past",
};

export default async function TripsPage() {
  // First sign-in lands here; send them to the profile deck once, then never
  // again whether they finished it or skipped.
  const [profileRes, jar] = await Promise.all([getMyProfile(), cookies()]);
  if (
    profileRes.success &&
    profileRes.data === null &&
    !jar.has(PROFILE_ONBOARDING_SEEN)
  ) {
    redirect("/onboarding?next=/trips");
  }

  const result = await getMyTrips();

  if (!result.success) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-3xl">Something went wrong</h1>
        <p className="mt-3 text-sm text-stone-600">{result.error}</p>
      </main>
    );
  }

  // Hiding a trip only files it away for this member; it stays one click off.
  const trips = result.data.filter((trip) => trip.archivedAt === null);
  const archived = result.data.filter((trip) => trip.archivedAt !== null);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl tracking-tight">Your trips</h1>
        <NewTripButton />
      </div>

      {/* The only lasting way back into the profile deck: the sign-up redirect
          fires once and the trip banner disappears as soon as it's answered. */}
      {profileRes.success && <TravelProfileCard profile={profileRes.data} />}

      {trips.length === 0 && archived.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-stone-300 bg-white/60 p-12 text-center">
          <p className="font-display text-2xl">No trips yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-stone-600">
            Create your first trip and Roam will lay out a day-by-day itinerary
            you can share with friends.
          </p>
        </div>
      ) : trips.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-stone-300 bg-white/60 p-8 text-center text-sm text-stone-600">
          Every trip is archived. Unarchive one below, or start a new trip.
        </p>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </ul>
      )}

      <ArchivedTrips>
        {archived.length > 0 && (
          <details className="group mt-10">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-full px-1 py-1 text-sm font-medium text-stone-600 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
              <Archive size={15} aria-hidden />
              Archived ({archived.length})
              <ChevronDown
                size={15}
                aria-hidden
                className="transition-transform group-open:rotate-180"
              />
            </summary>
            <p className="mt-2 text-xs text-stone-600">
              Hidden from your list only — everyone else still sees these trips,
              and you can still open them.
            </p>
            <ul className="mt-3 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200/80 bg-white">
              {archived.map((trip) => (
                <ArchivedTripRow key={trip.id} trip={trip} />
              ))}
            </ul>
          </details>
        )}
      </ArchivedTrips>
    </main>
  );
}

function ArchivedTripRow({ trip }: { trip: MyTripSummary }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Link
        href={`/trips/${trip.id}`}
        className="min-w-0 flex-1 transition-colors hover:text-pine"
      >
        <p className="truncate font-medium">{trip.title}</p>
        <p className="truncate text-xs text-stone-500">
          {trip.destination ?? "Destination TBD"} ·{" "}
          {trip.startDate && trip.endDate
            ? formatDateRange(trip.startDate, trip.endDate)
            : "Dates TBD"}
        </p>
      </Link>
      <UnarchiveTripButton tripId={trip.id} title={trip.title} />
    </li>
  );
}

function TripCard({ trip }: { trip: MyTripSummary }) {
  const status = tripStatus(trip.startDate, trip.endDate);

  return (
    <li>
      <Link
        id={`trip-card-${trip.id}`}
        href={`/trips/${trip.id}`}
        className="block overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)] transition-shadow hover:shadow-md"
      >
        <div className={`relative h-28 ${COVER_GRADIENTS[status]}`}>
          <span className="absolute left-4 top-4 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink">
            {STATUS_LABELS[status]}
          </span>
        </div>
        <div className="p-4">
          <h2 className="font-display text-xl leading-snug">{trip.title}</h2>
          <div className="mt-2 space-y-1 text-xs text-stone-500">
            <p className="flex items-center gap-1.5">
              <MapPin size={12} className="shrink-0 text-stone-400" />
              {trip.destination ?? "Destination TBD"}
            </p>
            <p className="flex items-center gap-1.5">
              <CalendarDays size={12} className="shrink-0 text-stone-400" />
              {trip.startDate && trip.endDate
                ? formatDateRange(trip.startDate, trip.endDate)
                : "Dates TBD"}
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-stone-500">
              <Users size={12} className="text-stone-400" />
              {trip.memberCount}{" "}
              {trip.memberCount === 1 ? "member" : "members"}
            </span>
            <span className="rounded-full bg-pine-soft px-2 py-0.5 font-medium text-pine">
              {trip.role.toLowerCase()}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
