"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { updateTripBudget } from "@/actions/trip";
import { Dialog } from "@/components/ui/Dialog";
import {
  Field,
  FormError,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
import {
  amountInputProps,
  isWholeUnit,
  isZeroDecimal,
  parseAmountInput,
} from "@/lib/currencies";
import { formatCurrency } from "@/lib/format";

/**
 * Owner-only hero chip: shows the trip budget and opens a small dialog to
 * set, change, or remove it, in the trip's currency (whole numbers for
 * zero-decimal ones). Non-owners see the static chip in TripHeader.
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
  const hintId = useId();

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
    if (!isWholeUnit(parseAmountInput(raw), currency)) {
      setError(`${currency} has no decimal places — enter a whole number.`);
      return;
    }
    save(parsed);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-white/30 bg-black/35 px-3.5 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-black/45"
      >
        <Pencil size={12} />
        {totalBudget !== null
          ? `Budget · ${formatCurrency(totalBudget, currency)}`
          : "Set budget"}
      </button>

      <Dialog open={open} onClose={close} title="Trip budget" size="sm">
        <form onSubmit={submit} className="space-y-4">
          <Field label={`Budget in ${currency} — whole trip`}>
            <input
              {...amountInputProps(currency)}
              min="0"
              placeholder={isZeroDecimal(currency) ? "2000" : "2000.00"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-describedby={hintId}
              className={inputClass}
              data-autofocus
            />
          </Field>
          <p id={hintId} className="text-xs text-stone-600">
            Compared against the planned cost of itinerary activities. Leave
            empty to remove the budget.
          </p>

          <FormError message={error} />

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
            <button type="button" onClick={close} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={pending} className={primaryButtonClass}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
