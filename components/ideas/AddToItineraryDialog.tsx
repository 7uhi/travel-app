"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { promoteIdea } from "@/actions/activity-ideas";
import { formatDayDate } from "@/lib/format";
import type { ActivityIdeaWithVotes } from "@/types";

/**
 * Schedules an idea onto the itinerary: pick a day, optionally tweak the
 * title and set a time. Description, location and cost are carried over
 * from the idea server-side.
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add to itinerary"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl">Add to itinerary</h2>
            <p className="mt-0.5 text-xs text-stone-500">{idea.title}</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <form action={submit} className="space-y-4">
          <Field label="Day">
            <select name="tripDayId" required className={inputClass}>
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

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={close}
              className="rounded-full px-4 py-2 text-sm font-medium text-stone-500 transition-colors hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-pine px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-dark disabled:opacity-60"
            >
              {pending ? "Adding…" : "Add activity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-pine";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        {label}
      </span>
      {children}
    </label>
  );
}
