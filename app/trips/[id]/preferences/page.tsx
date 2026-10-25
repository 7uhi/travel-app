import Link from "next/link";
import { notFound } from "next/navigation";

import { getTripPreferences } from "@/actions/preferences";
import { getTripHeader } from "@/actions/trip";
import { auth } from "@/auth";
import { LoadError } from "@/components/LoadError";
import { TripHeader } from "@/components/TripHeader";
import { ConflictList } from "@/components/preferences/ConflictList";
import { GroupConsensusPanel } from "@/components/preferences/GroupConsensusPanel";
import { MemberPreferenceCard } from "@/components/preferences/MemberPreferenceCard";
import { ResetTripPreferencesButton } from "@/components/preferences/ResetTripPreferencesButton";
import { canEditTripDetails } from "@/lib/permissions";
import {
  aggregateGroupProfile,
  aggregateTripPreferences,
  findPreferenceConflicts,
  findTripConflicts,
  resolveEffectiveProfile,
} from "@/lib/preferences";

export default async function TripPreferencesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tripRes, prefsRes] = await Promise.all([
    getTripHeader(id),
    getTripPreferences(id),
  ]);

  if (!tripRes.success) {
    if (tripRes.error === "Trip not found.") notFound();
    return <LoadError message={tripRes.error} />;
  }
  if (!prefsRes.success) return <LoadError message={prefsRes.error} />;

  const trip = tripRes.data;
  const members = prefsRes.data;
  const session = await auth();
  const currentUserId = session?.user?.id ?? null;

  /*
   * Aggregation runs on the server: no member data or math ships to the client.
   * Consensus is computed from *effective* profiles — a member who said this
   * trip is different should count as what they said here, not as their usual,
   * and a member who only answered the trip deck (the normal state after
   * joining by invite link) still counts as what they said for this trip.
   */
  const effective = members
    .map((m) => resolveEffectiveProfile(m.profile, m.trip))
    .filter((p) => p !== null);
  const group = aggregateGroupProfile(effective);
  const groupTrip = aggregateTripPreferences(
    members.map((m) => m.trip).filter((t) => t !== null),
  );
  const tripConflicts = findTripConflicts(
    members.map((m) => m.trip).filter((t) => t !== null),
  );
  const conflicts = [...findPreferenceConflicts(effective), ...tripConflicts].sort(
    (a, b) =>
      b.severity - a.severity ||
      a.kind.localeCompare(b.kind) ||
      (a.tag ?? "").localeCompare(b.tag ?? ""),
  );

  const names = new Map(
    members.map((m) => [m.userId, m.name ?? "Member"] as const),
  );
  const mine = members.find((m) => m.userId === currentUserId);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TripHeader trip={trip} activeTab="preferences" />

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl">Preferences</h2>
          {/* Everything the viewer can change about themselves here: this
              trip's answers, the profile they're inherited from, and the way
              back to inheriting them again. */}
          <div className="flex flex-wrap items-center gap-1">
            {mine?.trip && currentUserId && (
              <ResetTripPreferencesButton
                tripId={trip.id}
                userId={currentUserId}
              />
            )}
            <Link
              href={`/onboarding?next=/trips/${trip.id}/preferences`}
              className="rounded-full px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:text-ink"
            >
              Travel profile
            </Link>
            <Link
              href={`/trips/${trip.id}/preferences/onboarding`}
              className="rounded-full bg-pine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pine-dark"
            >
              {mine?.trip ? "Edit my answers" : "Answer for this trip"}
            </Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          {/* items-start/content-start: the aside is far taller than a member
              card, and stretched cards (or rows) are mostly empty white. */}
          <div className="grid content-start items-start gap-4 sm:grid-cols-2">
            {members.map((member) => (
              <MemberPreferenceCard
                key={member.userId}
                member={member}
                isYou={member.userId === currentUserId}
                tripId={trip.id}
              />
            ))}
          </div>

          <aside className="space-y-4">
            <GroupConsensusPanel
              group={group}
              groupTrip={groupTrip}
              tripConflicts={tripConflicts}
              memberCount={members.length}
              destinationUndecided={trip.destination === null}
              setDestinationFor={
                canEditTripDetails(trip.role)
                  ? { tripId: trip.id, title: trip.title }
                  : null
              }
            />
            <ConflictList conflicts={conflicts} names={names} />
          </aside>
        </div>
      </section>
    </main>
  );
}
