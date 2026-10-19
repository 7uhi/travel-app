"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { clearMyTripPreferences } from "@/actions/preferences";
import { preferenceDraftKey } from "@/lib/preference-drafts";

/**
 * Drops the viewer's trip-specific answers so this trip falls back to their
 * durable travel profile again. The other half of changing your mind: without
 * it, overriding a preference for one trip is a one-way door — re-running the
 * deck can only replace an override with another override, since every
 * question opens pre-filled.
 *
 * Confirms inline rather than with window.confirm, matching AvailabilityPlanner
 * and keeping the flow non-blocking. Each side replaces the other, so focus is
 * handed across explicitly: to Cancel (the safe choice) when the question
 * appears, and back to the button when it's dismissed.
 */
export function ResetTripPreferencesButton({
  tripId,
  userId,
}: {
  tripId: string;
  userId: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const promptId = useId();
  const resetRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (confirming || !returnFocus.current) return;
    returnFocus.current = false;
    resetRef.current?.focus();
  }, [confirming]);

  function reset() {
    startTransition(async () => {
      const result = await clearMyTripPreferences(tripId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      // A half-finished deck run for this trip is stored client-side; leaving
      // it would resurrect the answers we just cleared on the next visit.
      try {
        sessionStorage.removeItem(preferenceDraftKey(userId, tripId));
      } catch {
        // Nothing stored, nothing to clear.
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        ref={resetRef}
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-full px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:text-ink"
      >
        Reset to my usual
      </button>
    );
  }

  return (
    <span
      role="group"
      aria-labelledby={promptId}
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      {error ? (
        <span id={promptId} role="alert" className="text-stone-600">
          {error}
        </span>
      ) : (
        <span id={promptId} className="text-stone-600">
          Clear your answers for this trip?
        </span>
      )}
      <button
        type="button"
        onClick={reset}
        disabled={pending}
        className="rounded-full bg-pine px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-pine-dark disabled:opacity-60"
      >
        {pending ? "Clearing…" : "Clear"}
      </button>
      <button
        type="button"
        onClick={() => {
          returnFocus.current = true;
          setConfirming(false);
          setError(null);
        }}
        disabled={pending}
        autoFocus
        className="rounded-full px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:text-ink"
      >
        Cancel
      </button>
    </span>
  );
}
