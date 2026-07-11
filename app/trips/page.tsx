import Link from "next/link";
import { CalendarDays, MapPin, Users } from "lucide-react";

import { getMyTrips } from "@/actions/trip";
import { NewTripButton } from "@/components/NewTripButton";
import { formatDateRange } from "@/lib/format";
import { tripStatus, type TripStatus } from "@/lib/trip-status";
import type { TripSummary } from "@/types";

const COVER_GRADIENTS: Record<TripStatus, string> = {
  upcoming: "bg-[linear-gradient(135deg,#e29a5b_0%,#c06b5e_55%,#54314e_100%)]",
  ongoing: "bg-[linear-gradient(135deg,#7fb069_0%,#3d7a5c_55%,#0a4433_100%)]",
  past: "bg-[linear-gradient(135deg,#a8b8c8_0%,#7d94ab_55%,#4a5d73_100%)]",
};

const STATUS_LABELS: Record<TripStatus, string> = {
  upcoming: "Upcoming",
  ongoing: "Happening now",
  past: "Past",
};

export default async function TripsPage() {
  const result = await getMyTrips();

  if (!result.success) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-3xl">Something went wrong</h1>
        <p className="mt-3 text-sm text-stone-500">{result.error}</p>
      </main>
    );
  }

  const trips = result.data;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl tracking-tight">Your trips</h1>
        <NewTripButton />
      </div>

      {trips.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-stone-300 bg-white/60 p-12 text-center">
          <p className="font-display text-2xl">No trips yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-stone-500">
            Create your first trip and Roam will lay out a day-by-day itinerary
            you can share with friends.
          </p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </ul>
      )}
    </main>
  );
}

function TripCard({ trip }: { trip: TripSummary }) {
  const status = tripStatus(trip.startDate, trip.endDate);

  return (
    <li>
      <Link
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
              {trip.destination}
            </p>
            <p className="flex items-center gap-1.5">
              <CalendarDays size={12} className="shrink-0 text-stone-400" />
              {formatDateRange(trip.startDate, trip.endDate)}
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
