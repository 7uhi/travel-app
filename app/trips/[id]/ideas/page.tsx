import { notFound } from "next/navigation";

import { getIdeas } from "@/actions/activity-ideas";
import { getTripAiSetting } from "@/actions/ai-settings";
import { getTripDays, getTripHeader } from "@/actions/trip";
import { auth } from "@/auth";
import { LoadError } from "@/components/LoadError";
import { TripHeader } from "@/components/TripHeader";
import { AddIdeaButton } from "@/components/ideas/AddIdeaButton";
import { AiSuggestions } from "@/components/ideas/AiSuggestions";
import { IdeaCard } from "@/components/ideas/IdeaCard";
import { isAiSuggestionsEnabled } from "@/lib/ai/config";

export default async function TripIdeasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tripRes, ideasRes, daysRes] = await Promise.all([
    getTripHeader(id),
    getIdeas(id),
    getTripDays(id),
  ]);

  if (!tripRes.success) {
    if (tripRes.error === "Trip not found.") notFound();
    return <LoadError message={tripRes.error} />;
  }
  if (!ideasRes.success) return <LoadError message={ideasRes.error} />;
  if (!daysRes.success) return <LoadError message={daysRes.error} />;

  const trip = tripRes.data;
  const ideas = ideasRes.data;
  const aiSetting = isAiSuggestionsEnabled()
    ? await getTripAiSetting(id)
    : null;
  const aiEnabled =
    aiSetting?.success === true && aiSetting.data.suggestionsEnabled;
  const session = await auth();
  const currentUserId = session?.user?.id ?? null;
  const canEdit = trip.role === "OWNER" || trip.role === "EDITOR";

  const days = daysRes.data.map((d) => ({ id: d.id, date: d.date }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TripHeader trip={trip} activeTab="ideas" />

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl">Activity ideas</h2>
          {canEdit && <AddIdeaButton tripId={trip.id} />}
        </div>

        {aiEnabled ? (
          <div className="mb-4">
            <AiSuggestions tripId={trip.id} canApply={canEdit} />
          </div>
        ) : (
          isAiSuggestionsEnabled() &&
          trip.role === "OWNER" && (
            <p className="mb-4 rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
              AI suggestions are off for this trip. The owner can turn them
              on from Preferences after reviewing what would be shared.
            </p>
          )
        )}

        {ideas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-8 text-center text-sm text-stone-500">
            {canEdit
              ? "No ideas yet — propose something fun to do and let the group vote."
              : "No ideas yet. Once someone proposes an activity, you can vote on it here."}
          </div>
        ) : (
          <ul className="space-y-3">
            {ideas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                currentUserId={currentUserId}
                canEdit={canEdit}
                currency={trip.currency}
                days={days}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
