"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { rescheduleTrip } from "@/actions/trip";
import { Dialog } from "@/components/ui/Dialog";
import {
  Field,
  FormError,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
import { inclusiveDayCount, parseUtcDate } from "@/lib/dates";
import { formatDayDate } from "@/lib/format";

const MS_PER_DAY = 86_400_000;

/**
 * Moves a confirmed trip to new dates (owner only; rescheduleTrip enforces
 * it). Explains what will happen before anything moves: day N stays day N,
 * activity times move with their day, and a shorter range drops days from
 * the end — which the server refuses while those days have activities.
 */
export function RescheduleTripDialog({
  tripId,
  startDate,
  endDate,
  onClose,
}: {
  tripId: string;
  /** Current ISO dates (UTC midnight). */
  startDate: string;
  endDate: string;
  onClose: () => void;
}) {
  const [start, setStart] = useState(startDate.slice(0, 10));
  const [end, setEnd] = useState(endDate.slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const oldStart = new Date(startDate);
  const oldLength = inclusiveDayCount(oldStart, new Date(endDate));
  const newStart = parseUtcDate(start);
  const newEnd = parseUtcDate(end);
  const valid = newStart !== null && newEnd !== null && newEnd >= newStart;
  const shift = valid
    ? Math.round((newStart.getTime() - oldStart.getTime()) / MS_PER_DAY)
    : 0;
  const lengthChange = valid ? inclusiveDayCount(newStart, newEnd) - oldLength : 0;
  const unchanged = valid && shift === 0 && lengthChange === 0;

  function close() {
    if (!pending) onClose();
  }

  function submit() {
    startTransition(async () => {
      const result = await rescheduleTrip(tripId, { startDate: start, endDate: end });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog
      open
      onClose={close}
      title="Change dates"
      description="The whole plan moves with the trip: day 1 stays day 1, and every activity keeps its day and time."
    >
      <form action={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date">
            <input
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              required
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {valid && !unchanged && (
          <ul className="space-y-1.5 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
            {shift !== 0 && (
              <li>
                Day 1 moves to {formatDayDate(newStart.toISOString())} —
                everything shifts {Math.abs(shift)}{" "}
                {Math.abs(shift) === 1 ? "day" : "days"}{" "}
                {shift > 0 ? "later" : "earlier"}.
              </li>
            )}
            {lengthChange > 0 && (
              <li>
                {lengthChange} empty {lengthChange === 1 ? "day is" : "days are"}{" "}
                added at the end.
              </li>
            )}
            {lengthChange < 0 && (
              <li>
                The last {-lengthChange}{" "}
                {lengthChange === -1 ? "day is" : "days are"} removed. That only
                works while {lengthChange === -1 ? "it has" : "they have"} no
                activities.
              </li>
            )}
            <li className="text-stone-500">Expenses keep their own dates.</li>
          </ul>
        )}
        {valid || !start || !end ? null : (
          <p className="text-sm text-stone-600">
            The end date can't be before the start date.
          </p>
        )}

        <FormError message={error} />

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={close} className={secondaryButtonClass}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !valid || unchanged}
            className={primaryButtonClass}
          >
            {pending ? "Moving…" : "Move trip"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
