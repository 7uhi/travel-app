"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { setTripArchived } from "@/actions/trip";

type RestoredTrip = { id: string; title: string };

const RestoredContext = createContext<(trip: RestoredTrip) => void>(() => {});

/**
 * Wraps the archived list so restoring a trip has somewhere to go: the row
 * (and its button) disappears on refresh, so this announces the restore from
 * a region that stays mounted and moves focus to the trip's card once it is
 * back in the main list.
 */
export function ArchivedTrips({ children }: { children: ReactNode }) {
  const [restored, setRestored] = useState<RestoredTrip | null>(null);
  const [focusPending, setFocusPending] = useState(false);

  useEffect(() => {
    if (!focusPending || !restored) return;
    const card = document.getElementById(`trip-card-${restored.id}`);
    if (!card) return;
    card.focus();
    setFocusPending(false);
  });

  return (
    <RestoredContext.Provider
      value={(trip) => {
        setRestored(trip);
        setFocusPending(true);
      }}
    >
      <p role="status" className="sr-only">
        {restored ? `${restored.title} is back in your trips.` : ""}
      </p>
      {children}
    </RestoredContext.Provider>
  );
}

/** Puts a hidden trip back on the member's own trip list. */
export function UnarchiveTripButton({
  tripId,
  title,
}: {
  tripId: string;
  title: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const onRestored = useContext(RestoredContext);

  function unarchive() {
    setError(null);
    startTransition(async () => {
      const result = await setTripArchived(tripId, false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onRestored({ id: tripId, title });
      router.refresh();
    });
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={unarchive}
        disabled={pending}
        aria-label={`Unarchive ${title}`}
        className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-pine hover:text-pine disabled:opacity-60"
      >
        {pending ? "Restoring…" : "Unarchive"}
      </button>
      {error && (
        <span role="alert" className="max-w-48 text-right text-xs text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
