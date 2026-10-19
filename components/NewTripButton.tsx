"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { createTrip } from "@/actions/trip";
import { Dialog } from "@/components/ui/Dialog";
import {
  Field,
  FormError,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { amountInputProps, CURRENCIES } from "@/lib/currencies";

/** "New trip" button that opens a create-trip dialog and routes to the new dashboard. */
export function NewTripButton() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"dates" | "poll">("dates");
  // Independent of `mode`: a trip can have fixed dates but no destination yet,
  // or a date poll for a place that's already settled.
  const [place, setPlace] = useState<"known" | "undecided">("known");
  // Chosen up front: the budget is entered in it, and changing it later only
  // relabels amounts, never converts them.
  const [currency, setCurrency] = useState("USD");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const budgetRaw = String(formData.get("totalBudget") ?? "").trim();
      const base = {
        title: String(formData.get("title") ?? ""),
        // The input isn't rendered at all while undecided, so there's nothing
        // to read — createTrip stores null and the group picks a place later.
        destination:
          place === "known"
            ? String(formData.get("destination") ?? "")
            : undefined,
        currency,
        totalBudget: budgetRaw === "" ? null : Number(budgetRaw),
      };
      const result = await createTrip(
        mode === "dates"
          ? {
              ...base,
              startDate: String(formData.get("startDate") ?? ""),
              endDate: String(formData.get("endDate") ?? ""),
            }
          : {
              ...base,
              windowStart: String(formData.get("windowStart") ?? ""),
              windowEnd: String(formData.get("windowEnd") ?? ""),
              durationDays: Number(formData.get("durationDays") ?? ""),
            },
      );

      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/trips/${result.data.id}`);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full bg-pine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pine-dark"
      >
        <Plus size={16} />
        New trip
      </button>

      <Dialog open={open} onClose={close} title="New trip">
        <form action={submit} className="space-y-4">
          <Field label="Title">
            <input
              name="title"
              required
              placeholder="Lisbon & the Algarve"
              className={inputClass}
              data-autofocus
            />
          </Field>

          <SegmentedControl
            legend="Do you know where you're going?"
            options={[
              ["known", "I know where"],
              ["undecided", "Not decided yet"],
            ]}
            value={place}
            onChange={setPlace}
          />

          {place === "known" ? (
            <Field label="Destination">
              <input
                name="destination"
                required
                placeholder="Portugal"
                className={inputClass}
              />
            </Field>
          ) : (
            <p className="text-xs leading-relaxed text-stone-600">
              Everyone answers a few questions about what they're after, and
              the group picks a place from there.
            </p>
          )}

          <SegmentedControl
            legend="How will you pick dates?"
            options={[
              ["dates", "Dates are set"],
              ["poll", "Poll the group"],
            ]}
            value={mode}
            onChange={setMode}
          />

          {mode === "dates" ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start date">
                <input
                  name="startDate"
                  type="date"
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="End date">
                <input
                  name="endDate"
                  type="date"
                  required
                  className={inputClass}
                />
              </Field>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Window opens">
                  <input
                    name="windowStart"
                    type="date"
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Window closes">
                  <input
                    name="windowEnd"
                    type="date"
                    required
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field label="Trip length (days)">
                <input
                  name="durationDays"
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="7"
                  className={inputClass}
                />
              </Field>
              <p className="text-xs leading-relaxed text-stone-600">
                Members mark the days they're free inside the window; you
                confirm the trip dates from the overlap.
              </p>
            </>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Currency">
              <select
                name="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={inputClass}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Budget in ${currency}`}>
              <input
                name="totalBudget"
                {...amountInputProps(currency)}
                min="0"
                placeholder="Optional"
                className={inputClass}
              />
            </Field>
          </div>

          <FormError message={error} />

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={close} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={pending} className={primaryButtonClass}>
              {pending ? "Creating…" : "Create trip"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
