"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setTripArchived } from "@/actions/trip";

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

  function unarchive() {
    setError(null);
    startTransition(async () => {
      const result = await setTripArchived(tripId, false);
      if (!result.success) {
        setError(result.error);
        return;
      }
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
