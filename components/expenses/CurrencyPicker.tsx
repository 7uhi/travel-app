"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoveRight } from "lucide-react";

import { updateTripCurrency } from "@/actions/trip";
import { Dialog } from "@/components/ui/Dialog";
import {
  FormError,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
import { CURRENCIES, isZeroDecimal, zeroDecimalRefusal } from "@/lib/currencies";
import { formatCents } from "@/lib/format";
import type { TripAmountExample } from "@/types";

/**
 * Owner-only trip currency selector. Roam never converts between currencies:
 * changing the code relabels every stored amount, so once the trip holds any
 * amount the owner first sees what that does to a real one and confirms the
 * relabel. Switching to a zero-decimal currency while some amount has cents
 * is refused up front, with the same message the server would give.
 */
export function CurrencyPicker({
  tripId,
  currency,
  example,
  fractional,
}: {
  tripId: string;
  currency: string;
  /** A real amount from the trip; null when it has none to relabel. */
  example: TripAmountExample | null;
  /** The first expense, share, repayment, or budget amount with cents. */
  fractional: TripAmountExample | null;
}) {
  // The currency picked in the select but not saved (or not yet refreshed in).
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // The refresh after a save has landed, so nothing is pending any more.
  if (target !== null && target === currency) setTarget(null);

  function save(next: string, relabel: boolean) {
    startTransition(async () => {
      const result = await updateTripCurrency(tripId, next, { relabel });
      if (!result.success) {
        if (relabel) {
          setError(result.error);
          return;
        }
        window.alert(result.error);
        setTarget(null);
        return;
      }
      router.refresh();
    });
  }

  function handleChange(next: string) {
    setError(null);
    setTarget(next === currency ? null : next);
    if (next !== currency && !example) save(next, false);
  }

  function cancel() {
    if (!pending) setTarget(null);
  }

  const refusal =
    target && fractional && isZeroDecimal(target)
      ? zeroDecimalRefusal(target, currency, fractional)
      : null;

  return (
    <>
      <label className="flex items-center gap-2 text-sm text-stone-600">
        Currency
        <select
          value={target ?? currency}
          disabled={pending}
          onChange={(e) => handleChange(e.target.value)}
          aria-label="Trip currency"
          className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-pine disabled:opacity-60"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.label}
            </option>
          ))}
        </select>
      </label>

      <Dialog
        open={target !== null && example !== null}
        onClose={cancel}
        title={refusal ? `Can't switch to ${target}` : `Relabel amounts as ${target}?`}
        description={
          refusal
            ? undefined
            : `Roam doesn't convert between currencies. Every amount on this trip — expenses, shares, repayments, the budget, planned costs — keeps its number and is shown in ${target} instead of ${currency}.`
        }
      >
        {target && example && (
          <div className="space-y-4">
            {refusal ? (
              <p className="text-sm text-stone-700">{refusal}</p>
            ) : (
              <div className="rounded-xl bg-stone-100 px-4 py-3 text-sm">
                <p className="text-stone-600">For example, {example.label}:</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-base font-medium tabular-nums">
                  <span>{formatCents(example.cents, currency)}</span>
                  <MoveRight size={14} aria-hidden className="text-stone-500" />
                  <span className="sr-only">becomes</span>
                  <span>{formatCents(example.cents, target)}</span>
                </p>
                <p className="mt-2 text-xs text-stone-600">
                  No exchange rate is applied. To convert, edit the amounts
                  yourself after switching.
                </p>
              </div>
            )}
            <FormError message={error} />

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={cancel}
                data-autofocus
                className={refusal ? primaryButtonClass : secondaryButtonClass}
              >
                {refusal ? "OK" : "Cancel"}
              </button>
              {!refusal && (
                <button
                  type="button"
                  onClick={() => save(target, true)}
                  disabled={pending}
                  className={primaryButtonClass}
                >
                  {pending ? "Relabeling…" : `Relabel as ${target}`}
                </button>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
