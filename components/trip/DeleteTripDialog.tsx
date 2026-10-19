"use client";

import { useState, useTransition } from "react";

import { deleteTrip } from "@/actions/trip";
import { Dialog } from "@/components/ui/Dialog";
import {
  Field,
  FormError,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui/form";

/**
 * Owner-only permanent delete. Typing the title is the confirmation, and
 * deleteTrip checks it again on the server; on success it redirects to /trips.
 */
export function DeleteTripDialog({
  tripId,
  title,
  onClose,
}: {
  tripId: string;
  title: string;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = typed.trim() === title.trim();

  function close() {
    if (!pending) onClose();
  }

  function submit() {
    startTransition(async () => {
      const result = await deleteTrip(tripId, typed);
      // Success redirects, so only a failure comes back here.
      if (result && !result.success) setError(result.error);
    });
  }

  return (
    <Dialog
      open
      onClose={close}
      title="Delete this trip?"
      description="This permanently deletes the trip for everyone: its itinerary, ideas, expenses and repayments, packing lists, preferences, and invite links. It can't be undone."
    >
      <form action={submit} className="space-y-4">
        <Field label={`Type “${title}” to confirm`}>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
        </Field>
        <FormError message={error} />
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={close} className={secondaryButtonClass}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !matches}
            className="rounded-full bg-red-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete trip"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
