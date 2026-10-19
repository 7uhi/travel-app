import Link from "next/link";
import { Sparkles } from "lucide-react";

import {
  BUDGET_LABELS,
  INTEREST_EMOJI,
  INTEREST_LABELS,
  LODGING_LABELS,
  PACE_LABELS,
  RHYTHM_LABELS,
} from "@/lib/preference-questions";
import type { TravelProfileSummary } from "@/types";

/**
 * The account-level travel profile, read back on /trips with a way in to
 * change it. Without this the profile deck is only ever reachable from the
 * one-time redirect after sign-up and the trip banner, both of which go away
 * once answered — leaving durable answers no one could revise.
 *
 * Deliberately a summary rather than a form: editing runs the same deck used
 * everywhere else, which opens on its review step for anyone who's answered.
 */
export function TravelProfileCard({
  profile,
}: {
  profile: TravelProfileSummary | null;
}) {
  // Come back here after the deck saves, rather than dropping into /trips cold.
  const editHref = "/onboarding?next=/trips";

  if (profile === null) {
    return (
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-pine/20 bg-pine-soft px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-pine">
            <Sparkles size={16} />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">
              Set up your travel profile
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
              A minute of questions, once — every trip you join starts from it.
            </p>
          </div>
        </div>
        <Link
          href={editHref}
          className="rounded-full bg-pine px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-pine-dark"
        >
          Answer a few questions
        </Link>
      </div>
    );
  }

  const loved = profile.interests
    .filter((interest) => interest.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
  const avoided = profile.interests.filter((interest) => interest.weight < 0);
  const notes = [profile.dietaryNotes, profile.accessibilityNotes].filter(
    (note): note is string => Boolean(note),
  );

  return (
    <div className="mt-8 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
          Your travel profile
        </p>
        <Link
          href={editHref}
          className="rounded-full border border-stone-200 px-3.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-pine/40 hover:text-pine"
        >
          Edit preferences
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {profile.pace && <Chip>{PACE_LABELS[profile.pace]}</Chip>}
        {profile.budgetTier && <Chip>{BUDGET_LABELS[profile.budgetTier]}</Chip>}
        {profile.dayRhythm && <Chip>{RHYTHM_LABELS[profile.dayRhythm]}</Chip>}
        {profile.lodgingStyle && (
          <Chip>{LODGING_LABELS[profile.lodgingStyle]}</Chip>
        )}
      </div>

      {loved.length > 0 && (
        <p className="mt-3 text-sm text-stone-600">
          {loved
            .map(
              (interest) =>
                `${INTEREST_EMOJI[interest.tag]} ${INTEREST_LABELS[interest.tag]}`,
            )
            .join(" · ")}
        </p>
      )}
      {avoided.length > 0 && (
        <p className="mt-1.5 text-xs text-stone-500">
          Would skip: {avoided.map((i) => INTEREST_LABELS[i.tag]).join(", ")}
        </p>
      )}
      {notes.length > 0 && (
        <p className="mt-2 text-xs text-stone-500">
          {notes.join(" · ")}
          <span className="text-stone-500">
            {" "}
            — shared with everyone on your trips
          </span>
        </p>
      )}

      <p className="mt-3 text-xs text-stone-500">
        Used as the starting point on every trip. You can answer differently for
        a single trip from its Preferences tab.
      </p>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-pine-soft px-2.5 py-1 text-xs font-medium text-pine-dark">
      {children}
    </span>
  );
}
