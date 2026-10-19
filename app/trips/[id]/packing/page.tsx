import { notFound } from "next/navigation";

import { getTripMembers } from "@/actions/members";
import { getPackingItems, getPersonalPackingItems } from "@/actions/packing";
import { getPackingTemplates } from "@/actions/packing-templates";
import { getTripHeader } from "@/actions/trip";
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
  const [tripRes, sharedRes, personalRes, templatesRes, membersRes] =
    await Promise.all([
      getTripHeader(id),
      getPackingItems(id),
      getPersonalPackingItems(id),
      getPackingTemplates(id),
      getTripMembers(id),
    ]);

  if (!tripRes.success) {
    if (tripRes.error === "Trip not found.") notFound();
    return <LoadError message={tripRes.error} />;
  }
  if (!sharedRes.success) return <LoadError message={sharedRes.error} />;
  if (!personalRes.success) return <LoadError message={personalRes.error} />;
  if (!templatesRes.success) return <LoadError message={templatesRes.error} />;
  if (!membersRes.success) return <LoadError message={membersRes.error} />;

  const trip = tripRes.data;
  const session = await auth();
  const currentUserId = session?.user?.id ?? null;
  const canEdit = trip.role === "OWNER" || trip.role === "EDITOR";

  const members = membersRes.data.map((m) => ({
    id: m.userId,
    name: m.name ?? m.email,
  }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TripHeader trip={trip} activeTab="packing" />

      <section className="mt-10">
        <h2 className="mb-4 font-display text-2xl">Packing</h2>
        <PackingTabs
          tripId={trip.id}
          personalItems={personalRes.data}
          sharedItems={sharedRes.data}
          templates={templatesRes.data}
          members={members}
          canEditShared={canEdit}
          currentUserId={currentUserId}
        />
      </section>
    </main>
  );
}
