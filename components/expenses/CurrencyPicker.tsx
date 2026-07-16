"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateTripCurrency } from "@/actions/trip";
import { CURRENCIES } from "@/lib/currencies";

/**
 * Owner-only trip currency selector. Changing it relabels existing expenses
 * to the new currency without converting amounts, so we confirm first.
 */
export function CurrencyPicker({
  tripId,
  currency,
  hasExpenses,
}: {
  tripId: string;
  currency: string;
  hasExpenses: boolean;
}) {
  const [pending, startTransition] = useTransition();
  // Key forces the select back to the saved value when a change is
  // cancelled or fails.
  const [resetKey, setResetKey] = useState(0);
  const router = useRouter();

  function handleChange(next: string) {
    if (next === currency) return;
    if (
      hasExpenses &&
      !window.confirm(
        `Change the trip currency to ${next}? Existing expense amounts keep their numbers and are relabeled as ${next} — nothing is converted.`,
      )
    ) {
      setResetKey((k) => k + 1);
      return;
    }
    startTransition(async () => {
      const result = await updateTripCurrency(tripId, next);
      if (!result.success) {
        window.alert(result.error);
        setResetKey((k) => k + 1);
        return;
      }
      router.refresh();
    });
  }

  return (
    <label className="flex items-center gap-2 text-sm text-stone-500">
      Currency
      <select
        key={resetKey}
        defaultValue={currency}
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
  );
}
