import { notFound } from "next/navigation";

import { getTripAvailability } from "@/actions/availability";
import { getMyPreferenceStatus } from "@/actions/preferences";
import { getTripById, getTripHeader } from "@/actions/trip";
import { auth } from "@/auth";
import { LoadError } from "@/components/LoadError";
import { TripDashboard } from "@/components/TripDashboard";

export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The itinerary tab is the one section that shows the full day plan.
  const [headerRes, result] = await Promise.all([
    getTripHeader(id),
    getTripById(id),
  ]);

  if (!headerRes.success) {
    if (headerRes.error === "Trip not found.") notFound();
    return <LoadError message={headerRes.error} />;
  }
  if (!result.success) {
    if (result.error === "Trip not found.") notFound();
    return <LoadError message={result.error} />;
  }

  const session = await auth();
  const currentUserId = session?.user?.id ?? null;

  // The date poll only matters while the trip has no dates yet.
  let availability = null;
  if (result.data.startDate === null) {
    const availabilityResult = await getTripAvailability(id);
    if (availabilityResult.success) availability = availabilityResult.data;
  }

  /*
   * The nudge only matters until the viewer has answered, and it points at
   * whichever deck is missing: the account-level profile comes first because
   * the trip deck's defaults are drawn from it.
   */
  const statusRes = await getMyPreferenceStatus(id);
  const preferencesNudge = !statusRes.success
    ? null
    : !statusRes.data.hasProfile
      ? "profile"
      : !statusRes.data.hasTripPreference
        ? "trip"
        : null;

  return (
    <TripDashboard
      trip={result.data}
      header={headerRes.data}
      availability={availability}
      currentUserId={currentUserId}
      preferencesNudge={preferencesNudge}
    />
  );
}
