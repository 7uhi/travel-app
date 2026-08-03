import { notFound } from "next/navigation";

import { getMyPreferences } from "@/actions/preferences";
import { getTripById } from "@/actions/trip";
import { LoadError } from "@/components/LoadError";
import { PreferenceDeck } from "@/components/preferences/PreferenceDeck";

/**
 * The trip deck: what this member wants out of this trip specifically.
 * Questions that also exist on their travel profile open pre-filled with their
 * usual answer, so accepting is a tap and overriding is deliberate.
 *
 * Deliberately renders without TripHeader: it's a focused full-page flow a
 * member lands on right after joining, and every question is skippable.
 */
export default async function PreferenceOnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tripRes, mineRes] = await Promise.all([
    getTripById(id),
    getMyPreferences(id),
  ]);

  if (!tripRes.success) {
    if (tripRes.error === "Trip not found.") notFound();
    return <LoadError message={tripRes.error} />;
  }
  if (!mineRes.success) return <LoadError message={mineRes.error} />;

  const trip = tripRes.data;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        {trip.title}
      </p>
      <PreferenceDeck
        mode="trip"
        tripId={trip.id}
        destination={trip.destination}
        profile={mineRes.data.profile}
        tripPreference={mineRes.data.trip}
        returnTo={`/trips/${trip.id}/preferences`}
      />
    </main>
  );
}
