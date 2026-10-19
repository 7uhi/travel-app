"use client";

import { useState, useTransition } from "react";

import { Dialog } from "@/components/ui/Dialog";
import {
  Field,
  FormError,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { ActionResult } from "@/lib/action-result";
import {
  amountInputProps,
  amountInputValue,
  currencyUnitCents,
  isWholeUnit,
  parseAmountInput,
} from "@/lib/currencies";
import { formatCents } from "@/lib/format";
import { isEqualSplit, prorate, splitEqual } from "@/lib/split";
import type {
  ExpenseCategory,
  ExpenseInput,
  ExpenseWithDetails,
  SplitInput,
} from "@/types";

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: "FOOD", label: "Food & drink" },
  { value: "TRANSPORT", label: "Transport" },
  { value: "LODGING", label: "Lodging" },
  { value: "ACTIVITY", label: "Activities" },
  { value: "SHOPPING", label: "Shopping" },
  { value: "OTHER", label: "Other" },
];

type Mode = "EQUAL" | "EXACT" | "PERCENT";

export interface Member {
  id: string;
  name: string;
}

interface InitialState {
  description: string;
  amount: string;
  date: string;
  category: ExpenseCategory;
  paidById: string;
  mode: Mode;
  excluded: Record<string, boolean>;
  exactAmounts: Record<string, string>;
}

/**
 * The split mode isn't stored, so infer it from the shares: an expense whose
 * shares differ by at most one unit (the rounding remainder of an equal
 * split — a cent, or a yen in JPY) reopens in EQUAL mode; anything else
 * reopens as exact amounts.
 */
function initialStateFrom(
  expense: ExpenseWithDetails,
  members: Member[],
  currency: string,
): InitialState {
  const isEqual = isEqualSplit(
    expense.splits.map((s) => s.amountCents),
    currencyUnitCents(currency),
  );

  const participants = new Set(expense.splits.map((s) => s.userId));
  const excluded: Record<string, boolean> = {};
  for (const m of members) {
    if (!participants.has(m.id)) excluded[m.id] = true;
  }

  const exactAmounts: Record<string, string> = {};
  for (const s of expense.splits) {
    exactAmounts[s.userId] = amountInputValue(s.amountCents, currency);
  }

  return {
    description: expense.description,
    amount: amountInputValue(expense.amountCents, currency),
    date: expense.date.slice(0, 10),
    category: expense.category,
    paidById: expense.paidBy.id,
    mode: isEqual ? "EQUAL" : "EXACT",
    excluded,
    exactAmounts,
  };
}

/** Shared add/edit expense dialog with equal / exact / percentage splits. */
export function ExpenseDialog({
  title,
  submitLabel,
  pendingLabel,
  currency,
  members,
  currentUserId,
  expense,
  onClose,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  pendingLabel: string;
  currency: string;
  members: Member[];
  currentUserId: string;
  /** When set, the form is prefilled from this expense (edit mode). */
  expense?: ExpenseWithDetails;
  onClose: () => void;
  onSubmit: (data: ExpenseInput) => Promise<ActionResult<unknown>>;
}) {
  const initial = expense ? initialStateFrom(expense, members, currency) : null;
  const unit = currencyUnitCents(currency);

  const [mode, setMode] = useState<Mode>(initial?.mode ?? "EQUAL");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [excluded, setExcluded] = useState<Record<string, boolean>>(
    initial?.excluded ?? {},
  );
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>(
    initial?.exactAmounts ?? {},
  );
  // Tax and tip are an input aid for EXACT mode: they're prorated onto the
  // item subtotals at submit time and never stored (edits reopen with the
  // prorated shares and empty tax/tip fields).
  const [tax, setTax] = useState("");
  const [tip, setTip] = useState("");
  // Tax always follows item subtotals (it accrues per item); tip is a group
  // choice, so the payer picks proportional vs even.
  const [tipMode, setTipMode] = useState<"BY_ITEMS" | "EVEN">("BY_ITEMS");
  const [percents, setPercents] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amountCents = parseAmountInput(amount);

  function close() {
    if (pending) return;
    onClose();
  }

  function buildSplit(): SplitInput {
    if (mode === "EQUAL") {
      return {
        mode,
        participantIds: members.filter((m) => !excluded[m.id]).map((m) => m.id),
      };
    }
    if (mode === "EXACT") {
      const items = members
        .filter((m) => (exactAmounts[m.id] ?? "").trim() !== "")
        .map((m) => ({
          userId: m.id,
          amountCents: parseAmountInput(exactAmounts[m.id]),
        }))
        .filter((s) => s.amountCents > 0);
      if (extrasCents > 0) {
        const weights = items.map((s) => ({
          userId: s.userId,
          weightCents: s.amountCents,
        }));
        const taxShares =
          taxCents > 0 ? prorate(taxCents, weights, unit) : null;
        const tipShares =
          tipCents > 0
            ? tipMode === "EVEN"
              ? splitEqual(tipCents, items.map((s) => s.userId), unit)
              : prorate(tipCents, weights, unit)
            : null;
        return {
          mode,
          shares: items.map((s, i) => ({
            userId: s.userId,
            amountCents:
              s.amountCents +
              (taxShares?.[i].amountCents ?? 0) +
              (tipShares?.[i].amountCents ?? 0),
          })),
        };
      }
      return { mode, shares: items };
    }
    return {
      mode,
      shares: members
        .filter((m) => (percents[m.id] ?? "").trim() !== "")
        .map((m) => ({
          userId: m.id,
          percent: Number.parseFloat(percents[m.id]),
        })),
    };
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await onSubmit({
        description: String(formData.get("description") ?? ""),
        amountCents,
        category: String(formData.get("category") ?? "OTHER") as ExpenseCategory,
        date: String(formData.get("date") ?? ""),
        paidById: String(formData.get("paidById") ?? currentUserId),
        split: buildSplit(),
      });

      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  const exactCents = members.map((m) => parseAmountInput(exactAmounts[m.id] ?? ""));
  const exactAssigned = exactCents.reduce((sum, cents) => sum + cents, 0);
  const percentTotal = members.reduce(
    (sum, m) => sum + (Number.parseFloat(percents[m.id]) || 0),
    0,
  );

  // Save stays disabled until the split reconciles with the total, so
  // mismatches surface as live feedback instead of a server error.
  const taxCents = parseAmountInput(tax);
  const tipCents = parseAmountInput(tip);
  const extrasCents = taxCents + tipCents;
  // A zero-decimal currency only takes whole numbers; "100.5" yen keeps
  // Save disabled with the reason shown, rather than failing on the server.
  const wholeUnits = [
    amountCents,
    ...(mode === "EXACT" ? [taxCents, tipCents, ...exactCents] : []),
  ].every((cents) => isWholeUnit(cents, currency));
  // In EXACT mode the per-person inputs are item subtotals; they must add up
  // to the total minus tax and tip.
  const itemTargetCents = amountCents - extrasCents;
  const exactBalanced = itemTargetCents > 0 && exactAssigned === itemTargetCents;
  const percentBalanced = Math.abs(percentTotal - 100) <= 0.01;
  const splitReady =
    wholeUnits &&
    (mode === "EQUAL"
      ? members.some((m) => !excluded[m.id])
      : mode === "EXACT"
        ? exactBalanced
        : percentBalanced);
  const fmtPercent = (n: number) => String(Math.round(n * 100) / 100);

  return (
    <Dialog open onClose={close} title={title} size="lg">
      <form action={submit} className="space-y-4">
        <Field label="Description">
          <input
            name="description"
            required
            placeholder="Dinner at Time Out Market"
            defaultValue={initial?.description}
            className={inputClass}
            data-autofocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={`Amount (${currency})`}>
            <input
              name="amount"
              {...amountInputProps(currency)}
              min={unit / 100}
              required
              placeholder={unit === 1 ? "90.00" : "9000"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Date">
            <input
              name="date"
              type="date"
              required
              defaultValue={
                initial?.date ?? new Date().toISOString().slice(0, 10)
              }
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">
            <select
              name="category"
              defaultValue={initial?.category}
              className={inputClass}
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Paid by">
            <select
              name="paidById"
              defaultValue={initial?.paidById ?? currentUserId}
              className={inputClass}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === currentUserId ? `${m.name} (you)` : m.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <SegmentedControl
          legend="Split"
          showLegend
          options={[
            ["EQUAL", "Equally"],
            ["EXACT", "Exact amounts"],
            ["PERCENT", "Percentages"],
          ]}
          value={mode}
          onChange={setMode}
          size="sm"
        />

        {mode === "EXACT" && (
          <div className="grid grid-cols-2 gap-4">
            <Field label={`Tax (${currency}) · optional`}>
              <input
                {...amountInputProps(currency)}
                min="0"
                placeholder={unit === 1 ? "0.00" : "0"}
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                className={inputClass}
              />
            </Field>
            <div>
              <Field label={`Tip (${currency}) · optional`}>
                <input
                  {...amountInputProps(currency)}
                  min="0"
                  placeholder={unit === 1 ? "0.00" : "0"}
                  value={tip}
                  onChange={(e) => setTip(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <SegmentedControl
                legend="How to split the tip"
                options={[
                  ["BY_ITEMS", "By items"],
                  ["EVEN", "Evenly"],
                ]}
                value={tipMode}
                onChange={setTipMode}
                size="sm"
                className="mt-1.5"
              />
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-xl border border-stone-200 p-3">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 text-sm">
              {mode === "EQUAL" ? (
                <label className="flex flex-1 cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={!excluded[m.id]}
                    onChange={(e) =>
                      setExcluded((prev) => ({
                        ...prev,
                        [m.id]: !e.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-pine"
                  />
                  {m.name}
                </label>
              ) : (
                <>
                  <span className="flex-1">{m.name}</span>
                  <input
                    {...(mode === "EXACT"
                      ? amountInputProps(currency)
                      : { type: "number", step: "0.1", inputMode: "decimal" })}
                    min="0"
                    placeholder={mode === "EXACT" && unit === 1 ? "0.00" : "0"}
                    aria-label={
                      mode === "EXACT"
                        ? `${m.name}'s amount in ${currency}`
                        : `${m.name}'s percentage`
                    }
                    value={
                      mode === "EXACT"
                        ? (exactAmounts[m.id] ?? "")
                        : (percents[m.id] ?? "")
                    }
                    onChange={(e) =>
                      mode === "EXACT"
                        ? setExactAmounts((prev) => ({
                            ...prev,
                            [m.id]: e.target.value,
                          }))
                        : setPercents((prev) => ({
                            ...prev,
                            [m.id]: e.target.value,
                          }))
                    }
                    className="w-24 rounded-lg border border-stone-300 px-2 py-1 text-right text-sm outline-none focus:border-pine focus-visible:ring-2 focus-visible:ring-pine/30"
                  />
                  <span aria-hidden className="w-4 text-xs text-stone-600">
                    {mode === "PERCENT" ? "%" : ""}
                  </span>
                </>
              )}
            </div>
          ))}

          {/* A live region, so the running total is read out as shares
              change: it's what says why Save is still disabled. */}
          <div role="status">
            {mode === "EQUAL" && (
              <p className="pt-1 text-xs text-stone-600">
                {(() => {
                  const ids = members.filter((m) => !excluded[m.id]).map((m) => m.id);
                  const people = `${ids.length} ${ids.length === 1 ? "person" : "people"}`;
                  if (ids.length === 0 || amountCents <= 0 || !wholeUnits) {
                    return `${people} selected`;
                  }
                  const shares = splitEqual(amountCents, ids, unit).map(
                    (s) => s.amountCents,
                  );
                  const low = Math.min(...shares);
                  const high = Math.max(...shares);
                  return `${formatCents(low, currency)}${high > low ? `–${formatCents(high, currency)}` : ""} each · ${people}`;
                })()}
              </p>
            )}
            {mode === "EXACT" &&
              (extrasCents > 0 && itemTargetCents <= 0 ? (
                <p className="pt-1 text-xs text-red-600">
                  Tax + tip can&apos;t reach or exceed the expense total.
                </p>
              ) : (
                <p
                  className={`pt-1 text-xs ${
                    exactBalanced
                      ? "text-pine"
                      : exactAssigned > itemTargetCents
                        ? "text-red-600"
                        : "text-stone-600"
                  }`}
                >
                  {extrasCents > 0 ? "Items assigned" : "Assigned"}{" "}
                  {formatCents(exactAssigned, currency)} of{" "}
                  {formatCents(itemTargetCents, currency)}
                  {exactAssigned > itemTargetCents
                    ? ` · ${formatCents(exactAssigned - itemTargetCents, currency)} over`
                    : !exactBalanced && itemTargetCents > 0
                      ? ` · ${formatCents(itemTargetCents - exactAssigned, currency)} left`
                      : extrasCents > 0
                        ? ` · ${
                            taxCents > 0 && tipCents > 0
                              ? tipMode === "EVEN"
                                ? "tax by items, tip split evenly"
                                : "tax & tip added by items"
                              : tipCents > 0
                                ? tipMode === "EVEN"
                                  ? "tip split evenly"
                                  : "tip added by items"
                                : "tax added by items"
                          }`
                        : ""}
                </p>
              ))}
            {mode === "PERCENT" && (
              <p
                className={`pt-1 text-xs ${
                  percentBalanced
                    ? "text-pine"
                    : percentTotal > 100
                      ? "text-red-600"
                      : "text-stone-600"
                }`}
              >
                Total {fmtPercent(percentTotal)}% of 100%
                {percentBalanced
                  ? ""
                  : percentTotal > 100
                    ? ` · ${fmtPercent(percentTotal - 100)}% over`
                    : ` · ${fmtPercent(100 - percentTotal)}% left`}
              </p>
            )}
          </div>
        </div>

        {!wholeUnits && (
          <p role="alert" className="text-sm text-red-700">
            {currency} has no decimal places — enter whole numbers.
          </p>
        )}
        <FormError message={error} />

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={close} className={secondaryButtonClass}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !splitReady}
            className={primaryButtonClass}
          >
            {pending ? pendingLabel : submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
