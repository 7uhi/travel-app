import { notFound } from "next/navigation";

import { getTripAvailability } from "@/actions/availability";
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
  const result = await getTripById(id);

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

  return (
    <TripDashboard
      trip={result.data}
      currentUserRole={currentUserRole}
      availability={availability}
      currentUserId={currentUserId}
    />
  );
}
