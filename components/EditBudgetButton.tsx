"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";

import { updateTripBudget } from "@/actions/trip";
import { formatCurrency } from "@/lib/format";

/**
 * Owner-only hero chip: shows the trip budget and opens a small dialog to
 * set, change, or remove it. Non-owners see the static chip in TripHeader.
 */
export function EditBudgetButton({
  tripId,
  totalBudget,
  currency,
}: {
  tripId: string;
  totalBudget: number | null;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(
    totalBudget != null ? String(totalBudget) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
    setValue(totalBudget != null ? String(totalBudget) : "");
  }

  function save(next: number | null) {
    startTransition(async () => {
      const result = await updateTripBudget(tripId, next);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setError(null);
      router.refresh();
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const raw = value.trim();
    if (raw === "") {
      save(null);
      return;
    }
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Budget must be a non-negative number.");
      return;
    }
    save(parsed);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-white/25"
      >
        <Pencil size={12} />
        {totalBudget !== null
          ? `Budget · ${formatCurrency(totalBudget, currency)}`
          : "Set budget"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Trip budget"
            className="w-full max-w-sm rounded-2xl bg-white p-6 text-ink shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-2xl">Trip budget</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Budget ({currency}) — whole trip
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="2000.00"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoFocus
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-pine"
                />
              </label>
              <p className="text-xs text-stone-500">
                Compared against the planned cost of itinerary activities.
                Leave empty to remove the budget.
              </p>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                {totalBudget !== null && (
                  <button
                    type="button"
                    onClick={() => save(null)}
                    disabled={pending}
                    className="mr-auto rounded-full px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                  >
                    Remove budget
                  </button>
                )}
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
                  {pending ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
