"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ExternalLink, Heart, MapPin, Pencil } from "lucide-react";

import { toggleVote } from "@/actions/activity-ideas";
import { Avatar } from "@/components/Avatar";
import { AddToItineraryDialog } from "@/components/ideas/AddToItineraryDialog";
import { IdeaDialog } from "@/components/ideas/IdeaDialog";
import { formatCurrency } from "@/lib/format";
import { hasVoted } from "@/lib/ideas";
import type { ActivityIdeaWithVotes } from "@/types";

const MAX_VISIBLE_VOTERS = 6;

/** "https://www.getyourguide.com/x/y" → "getyourguide.com" */
function linkLabel(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

/**
 * One idea in the voting pool: interest toggle + voter avatars for every
 * member, edit/promote controls for OWNER/EDITOR.
 */
export function IdeaCard({
  idea,
  currentUserId,
  canEdit,
  currency,
  days,
}: {
  idea: ActivityIdeaWithVotes;
  currentUserId: string | null;
  canEdit: boolean;
  currency: string;
  days: { id: string; date: string }[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const voted = hasVoted(idea, currentUserId);

  function vote() {
    startTransition(async () => {
      const result = await toggleVote(idea.id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <li className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{idea.title}</h3>
            {idea.promotedAt && (
              <span className="rounded-full bg-pine-soft px-2 py-0.5 text-[11px] font-medium text-pine">
                On itinerary
              </span>
            )}
          </div>
          {idea.description && (
            <p className="mt-1 text-sm text-stone-500">{idea.description}</p>
          )}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
            {idea.locationName && (
              <span className="flex items-center gap-1">
                <MapPin size={12} />
                {idea.locationName}
              </span>
            )}
            {idea.estimatedCost != null && (
              <span className="tabular-nums">
                {formatCurrency(idea.estimatedCost, currency)}
              </span>
            )}
            {idea.link && (
              <a
                href={idea.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-pine underline-offset-2 transition-colors hover:underline"
              >
                <ExternalLink size={12} />
                {linkLabel(idea.link)}
              </a>
            )}
            {idea.createdBy && (
              <span>Suggested by {idea.createdBy.name ?? "a member"}</span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={vote}
          disabled={pending}
          aria-pressed={voted}
          aria-label={voted ? "Remove your vote" : "Vote for this idea"}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
            voted
              ? "bg-pine text-white hover:bg-pine-dark"
              : "border border-stone-200 bg-white text-stone-600 hover:text-ink"
          }`}
        >
          <Heart size={14} className={voted ? "fill-current" : undefined} />
          <span className="tabular-nums">{idea.votes.length}</span>
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3 flex items-center justify-between gap-4">
        {idea.votes.length > 0 ? (
          <div className="flex items-center">
            <div className="flex -space-x-2">
              {idea.votes.slice(0, MAX_VISIBLE_VOTERS).map((vote) => (
                <span key={vote.userId} className="rounded-full ring-2 ring-white">
                  <Avatar name={vote.user.name} image={vote.user.image} size={24} />
                </span>
              ))}
            </div>
            {idea.votes.length > MAX_VISIBLE_VOTERS && (
              <span className="ml-2 text-xs text-stone-500">
                +{idea.votes.length - MAX_VISIBLE_VOTERS}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-stone-400">No votes yet</span>
        )}

        {canEdit && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              aria-label="Edit idea"
              className="rounded-full p-1.5 text-stone-300 transition-colors hover:bg-stone-100 hover:text-ink"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => setPromoteOpen(true)}
              disabled={days.length === 0}
              title={days.length === 0 ? "Set trip dates first" : undefined}
              className="flex items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CalendarPlus size={13} />
              Add to itinerary
            </button>
          </div>
        )}
      </div>

      {editOpen && (
        <IdeaDialog
          tripId={idea.tripId}
          idea={idea}
          onClose={() => setEditOpen(false)}
        />
      )}
      {promoteOpen && (
        <AddToItineraryDialog
          idea={idea}
          days={days}
          onClose={() => setPromoteOpen(false)}
        />
      )}
    </li>
  );
}
