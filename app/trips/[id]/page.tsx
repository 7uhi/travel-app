import { notFound } from "next/navigation";

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
  const currentUserRole =
    result.data.members.find((m) => m.userId === session?.user?.id)?.role ??
    null;

  return (
    <TripDashboard trip={result.data} currentUserRole={currentUserRole} />
  );
}
