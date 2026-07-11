"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { createTrip } from "@/actions/trip";

/** "New trip" button that opens a create-trip dialog and routes to the new dashboard. */
export function NewTripButton() {
  const [open, setOpen] = useState(false);
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
      const result = await createTrip({
        title: String(formData.get("title") ?? ""),
        destination: String(formData.get("destination") ?? ""),
        startDate: String(formData.get("startDate") ?? ""),
        endDate: String(formData.get("endDate") ?? ""),
        totalBudget: budgetRaw === "" ? null : Number(budgetRaw),
      });

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
