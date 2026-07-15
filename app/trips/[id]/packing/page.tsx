import { notFound } from "next/navigation";

import { getPackingItems, getPersonalPackingItems } from "@/actions/packing";
import { getTripById } from "@/actions/trip";
import { auth } from "@/auth";
import { LoadError } from "@/components/LoadError";
import { TripHeader } from "@/components/TripHeader";
import { PackingTabs } from "@/components/packing/PackingTabs";

export default async function TripPackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tripRes, sharedRes, personalRes] = await Promise.all([
    getTripById(id),
    getPackingItems(id),
    getPersonalPackingItems(id),
  ]);

  if (!tripRes.success) {
    if (tripRes.error === "Trip not found.") notFound();
    return <LoadError message={tripRes.error} />;
  }
  if (!sharedRes.success) return <LoadError message={sharedRes.error} />;
  if (!personalRes.success) return <LoadError message={personalRes.error} />;

  const trip = tripRes.data;
  const session = await auth();
  const currentUserId = session?.user?.id ?? null;
  const role =
    trip.members.find((m) => m.userId === currentUserId)?.role ?? null;
  const canEdit = role === "OWNER" || role === "EDITOR";

  const members = trip.members.map((m) => ({
    id: m.userId,
    name: m.user.name ?? m.user.email,
  }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TripHeader trip={trip} currentUserRole={role} activeTab="packing" />

      <section className="mt-10">
        <h2 className="mb-4 font-display text-2xl">Packing</h2>
        <PackingTabs
          tripId={trip.id}
          personalItems={personalRes.data}
          sharedItems={sharedRes.data}
          members={members}
          canEditShared={canEdit}
        />
      </section>
    </main>
  );
}
