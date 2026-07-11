"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";

import {
  addActivityToDay,
  deleteActivity,
  updateActivity,
  type AddActivityInput,
} from "@/actions/trip";
import { formatDayDate, formatTime } from "@/lib/format";
import type { Activity, TripDayWithActivities } from "@/types";

/**
 * Create/edit dialog for an itinerary activity. Create mode when `activity`
 * is null. The time field is wall-clock ("HH:mm") and is combined with the
 * day's date as UTC, matching the codebase's UTC-everywhere convention.
 */
export function ActivityDialog({
  day,
  activity,
  onClose,
}: {
  day: TripDayWithActivities;
  activity: Activity | null;
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
      const text = (name: string) => {
        const v = String(formData.get(name) ?? "").trim();
        return v === "" ? null : v;
      };
      const num = (name: string) => {
        const v = String(formData.get(name) ?? "").trim();
        return v === "" ? null : Number(v);
      };

      const timeRaw = String(formData.get("time") ?? "").trim();
      const payload: AddActivityInput = {
        title: String(formData.get("title") ?? ""),
        description: text("description"),
        time: timeRaw ? `${day.date.slice(0, 10)}T${timeRaw}:00.000Z` : null,
        locationName: text("locationName"),
        latitude: num("latitude"),
        longitude: num("longitude"),
        cost: num("cost"),
      };

      const result = activity
        ? await updateActivity(activity.id, payload)
        : await addActivityToDay(day.id, payload);

      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function handleDelete() {
    if (!activity) return;
    if (!window.confirm("Delete this activity?")) return;
    startTransition(async () => {
      const result = await deleteActivity(activity.id);
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
        aria-label={activity ? "Edit activity" : "Add an activity"}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl">
              {activity ? "Edit activity" : "Add activity"}
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {formatDayDate(day.date)}
            </p>
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
          <Field label="Title">
            <input
              name="title"
              required
              defaultValue={activity?.title ?? ""}
              placeholder="Pena Palace & gardens"
              className={inputClass}
            />
          </Field>

          <Field label="Description (optional)">
            <textarea
              name="description"
              rows={2}
              defaultValue={activity?.description ?? ""}
              placeholder="Timed entry at 10:30 — take the shuttle up."
              className={`${inputClass} resize-none`}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Time (optional)">
              <input
                name="time"
                type="time"
                defaultValue={activity?.time ? formatTime(activity.time) : ""}
                className={inputClass}
              />
            </Field>
            <Field label="Cost (optional)">
              <input
                name="cost"
                type="number"
                min="0"
                step="0.01"
                defaultValue={activity?.cost ?? ""}
                placeholder="28.00"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Location (optional)">
            <input
              name="locationName"
              defaultValue={activity?.locationName ?? ""}
              placeholder="Sintra"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Latitude (optional)">
              <input
                name="latitude"
                type="number"
                min="-90"
                max="90"
                step="any"
                defaultValue={activity?.latitude ?? ""}
                placeholder="38.7876"
                className={inputClass}
              />
            </Field>
            <Field label="Longitude (optional)">
              <input
                name="longitude"
                type="number"
                min="-180"
                max="180"
                step="any"
                defaultValue={activity?.longitude ?? ""}
                placeholder="-9.3904"
                className={inputClass}
              />
            </Field>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            {activity ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
              >
                <Trash2 size={14} />
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
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
                {pending ? "Saving…" : activity ? "Save changes" : "Add activity"}
              </button>
            </div>
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
