"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";

/**
 * Nudges a member who hasn't answered the preference deck yet. Covers the
 * cases the post-invite redirect can't: trip creators (who never accept an
 * invite), members who skipped, and anyone who joined before the feature
 * existed.
 *
 * Dismissal lives in localStorage rather than the database — it's a nudge, not
 * state worth a column — which makes it per-device by design.
 */
export function PreferencesBanner({
  tripId,
  kind,
}: {
  tripId: string;
  /** Which deck is still missing — decides the copy and where it links. */
  kind: "profile" | "trip";
}) {
  // Hidden until mount decides: localStorage can't be read during render
  // (the server has none, and doing so guarantees a hydration mismatch).
  const [dismissed, setDismissed] = useState(true);
  const key = `roam.prefs-nudge-dismissed.${kind}.${tripId}`;

  useEffect(() => {
    setDismissed(localStorage.getItem(key) === "1");
  }, [key]);

  if (dismissed) return null;

  return (
    <div className="mt-8 flex items-start gap-3 rounded-2xl border border-pine/20 bg-pine-soft px-4 py-3.5">
      <span className="mt-0.5 shrink-0 text-pine">
        <Sparkles size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          {kind === "profile"
            ? "Set up your travel profile"
            : "Tell the group what you're after"}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
          {kind === "profile"
            ? "A minute of questions, once — every trip you join starts from it."
            : "A few quick questions helps everyone plan days the whole group actually wants."}
        </p>
        <Link
          href={
            kind === "profile"
              ? `/onboarding?next=/trips/${tripId}`
              : `/trips/${tripId}/preferences/onboarding`
          }
          className="mt-2.5 inline-block rounded-full bg-pine px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-pine-dark"
        >
          Answer a few questions
        </Link>
      </div>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(key, "1");
          setDismissed(true);
        }}
        aria-label="Dismiss"
        className="shrink-0 rounded-full p-1.5 text-stone-600 transition-colors hover:bg-white/60 hover:text-ink"
      >
        <X size={16} />
      </button>
    </div>
  );
}
