"use client";

import { useState, useTransition } from "react";

import { leaveTrip } from "@/actions/members";
import { Dialog } from "@/components/ui/Dialog";
import { FormError, secondaryButtonClass } from "@/components/ui/form";

/**
 * Confirms leaving a trip. leaveTrip refuses while the member's balance isn't
 * settled and says how much is outstanding; on success it redirects to /trips.
 */
export function LeaveTripDialog({
  tripId,
  title,
  onClose,
}: {
  tripId: string;
  title: string;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (!pending) onClose();
  }

  function submit() {
    startTransition(async () => {
      const result = await leaveTrip(tripId);
      // Success redirects, so only a failure comes back here.
      if (result && !result.success) setError(result.error);
    });
  }

  return (
    <Dialog open onClose={close} title={`Leave “${title}”?`}>
      <form action={submit} className="space-y-4">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-stone-700">
          <li>The trip disappears from your list and you lose access to it.</li>
          <li>
            Expenses and repayments you were part of stay in the trip&apos;s
            history under your name. You can only leave once your balance is
            settled.
          </li>
          <li>
            Your availability, answers for this trip, idea votes, and personal
            packing list are removed. Invite links you created stop working.
          </li>
          <li>To come back, you&apos;ll need a new invite link.</li>
        </ul>
        <FormError message={error} />
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={close} className={secondaryButtonClass}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-red-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-50"
          >
            {pending ? "Leaving…" : "Leave trip"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
