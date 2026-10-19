"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import {
  addActivityToDay,
  deleteActivity,
  updateActivity,
  type AddActivityInput,
} from "@/actions/trip";
import { Dialog } from "@/components/ui/Dialog";
import {
  Field,
  FormError,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
import { formatDayDate, formatTime } from "@/lib/format";
import type { Activity, TripDayWithActivities } from "@/types";

/**
 * Create/edit dialog for an itinerary activity. Create mode when `activity`
 * is null. The time field is wall-clock ("HH:mm") and is combined with the
 * day's date as UTC, matching the codebase's UTC-everywhere convention.
 *
 * Mounted only while open, so it renders the Dialog permanently open and
 * unmounting it is what closes it (and hands focus back to the opener).
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
    <Dialog
      open
      onClose={close}
      title={activity ? "Edit activity" : "Add activity"}
      description={formatDayDate(day.date)}
    >
      <form action={submit} className="space-y-4">
        <Field label="Title">
          <input
            name="title"
            required
            defaultValue={activity?.title ?? ""}
            placeholder="Pena Palace & gardens"
            className={inputClass}
            data-autofocus
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

        <FormError message={error} />

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
            <button type="button" onClick={close} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={pending} className={primaryButtonClass}>
              {pending ? "Saving…" : activity ? "Save changes" : "Add activity"}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
