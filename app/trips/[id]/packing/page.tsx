import { notFound } from "next/navigation";

import { getPackingItems } from "@/actions/packing";
import { getTripById } from "@/actions/trip";
import { auth } from "@/auth";
import { LoadError } from "@/components/LoadError";
import { TripHeader } from "@/components/TripHeader";
import { AddPackingItemButton } from "@/components/packing/AddPackingItemButton";
import { PackingList } from "@/components/packing/PackingList";

export default async function TripPackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tripRes, itemsRes] = await Promise.all([
    getTripById(id),
    getPackingItems(id),
  ]);

  if (!tripRes.success) {
    if (tripRes.error === "Trip not found.") notFound();
    return <LoadError message={tripRes.error} />;
  }
  if (!itemsRes.success) return <LoadError message={itemsRes.error} />;

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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl">Packing</h2>
          {canEdit && (
            <AddPackingItemButton tripId={trip.id} members={members} />
          )}
        </div>
        <PackingList
          items={itemsRes.data}
          members={members}
          canEdit={canEdit}
        />
      </section>
    </main>
  );
}
