"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { createTrip } from "@/actions/trip";

/** "New trip" button that opens a create-trip dialog and routes to the new dashboard. */
export function NewTripButton() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"dates" | "poll">("dates");
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
        destination: String(formData.get("destination") ?? ""),
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

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create a new trip"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-2xl">New trip</h2>
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
                  placeholder="Lisbon & the Algarve"
                  className={inputClass}
                />
              </Field>
              <Field label="Destination">
                <input
                  name="destination"
                  required
                  placeholder="Portugal"
                  className={inputClass}
                />
              </Field>
              <div
                role="radiogroup"
                aria-label="How will you pick dates?"
                className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1"
              >
                <ModeButton
                  active={mode === "dates"}
                  onClick={() => setMode("dates")}
                >
                  Dates are set
                </ModeButton>
                <ModeButton
                  active={mode === "poll"}
                  onClick={() => setMode("poll")}
                >
                  Poll the group
                </ModeButton>
              </div>

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
                  <p className="text-xs leading-relaxed text-stone-500">
                    Members mark the days they're free inside the window; you
                    confirm the trip dates from the overlap.
                  </p>
                </>
              )}
              <Field label="Total budget (optional)">
                <input
                  name="totalBudget"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="2000"
                  className={inputClass}
                />
              </Field>

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
                  {pending ? "Creating…" : "Create trip"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-pine";

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-white text-ink shadow-sm" : "text-stone-500 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

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
