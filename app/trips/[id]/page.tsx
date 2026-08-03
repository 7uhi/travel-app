import { notFound } from "next/navigation";

import { getTripAvailability } from "@/actions/availability";
import { getTripSpentCents } from "@/actions/expense";
import { getMyPreferenceStatus } from "@/actions/preferences";
import { getTripById } from "@/actions/trip";
import { auth } from "@/auth";
import { LoadError } from "@/components/LoadError";
import { TripDashboard } from "@/components/TripDashboard";

export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, spentRes] = await Promise.all([
    getTripById(id),
    getTripSpentCents(id),
  ]);

  if (!result.success) {
    if (result.error === "Trip not found.") notFound();
    return <LoadError message={result.error} />;
  }

  const session = await auth();
  const currentUserId = session?.user?.id ?? null;
  const currentUserRole =
    result.data.members.find((m) => m.userId === currentUserId)?.role ?? null;

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
      currentUserRole={currentUserRole}
      availability={availability}
      currentUserId={currentUserId}
      spentCents={spentRes.success ? spentRes.data : null}
      preferencesNudge={preferencesNudge}
    />
  );
}
