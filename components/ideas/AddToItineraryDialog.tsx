"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { promoteIdea } from "@/actions/activity-ideas";
import { Dialog } from "@/components/ui/Dialog";
import {
  Field,
  FormError,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
import { formatDayDate } from "@/lib/format";
import type { ActivityIdeaWithVotes } from "@/types";

/**
 * Schedules an idea onto the itinerary: pick a day, optionally tweak the
 * title and set a time. Description, location and cost are carried over
 * from the idea server-side. Mounted only while open, like IdeaDialog.
 */
export function AddToItineraryDialog({
  idea,
  days,
  onClose,
}: {
  idea: ActivityIdeaWithVotes;
  days: { id: string; date: string }[];
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function close() {
    if (!pending) onClose();
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const tripDayId = String(formData.get("tripDayId") ?? "");
      const day = days.find((d) => d.id === tripDayId);
      if (!day) {
        setError("Pick a day for the activity.");
        return;
      }

      // Wall-clock time combined with the day's date as UTC, matching the
      // codebase's UTC-everywhere convention (see ActivityDialog).
      const timeRaw = String(formData.get("time") ?? "").trim();
      const time = timeRaw
        ? `${day.date.slice(0, 10)}T${timeRaw}:00.000Z`
        : null;

      const result = await promoteIdea(idea.id, tripDayId, {
        title: String(formData.get("title") ?? ""),
        time,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog
      open
      onClose={close}
      title="Add to itinerary"
      description={idea.title}
    >
      <form action={submit} className="space-y-4">
        <Field label="Day">
          <select
            name="tripDayId"
            required
            className={inputClass}
            data-autofocus
          >
            {days.map((day) => (
              <option key={day.id} value={day.id}>
                {formatDayDate(day.date)}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Title">
            <input
              name="title"
              required
              defaultValue={idea.title}
              className={inputClass}
            />
          </Field>
          <Field label="Time (optional)">
            <input name="time" type="time" className={inputClass} />
          </Field>
        </div>

        <FormError message={error} />

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={close} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Adding…" : "Add activity"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
