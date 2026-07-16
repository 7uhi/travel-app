"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";

import type { ActionResult } from "@/lib/action-result";
import { formatCents } from "@/lib/format";
import { prorate, splitEqual } from "@/lib/split";
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
 * shares differ by at most one cent (the rounding remainder of an equal
 * split) reopens in EQUAL mode; anything else reopens as exact amounts.
 */
function initialStateFrom(
  expense: ExpenseWithDetails,
  members: Member[],
): InitialState {
  const amounts = expense.splits.map((s) => s.amountCents);
  const isEqual = Math.max(...amounts) - Math.min(...amounts) <= 1;

  const participants = new Set(expense.splits.map((s) => s.userId));
  const excluded: Record<string, boolean> = {};
  for (const m of members) {
    if (!participants.has(m.id)) excluded[m.id] = true;
  }

  const exactAmounts: Record<string, string> = {};
  for (const s of expense.splits) {
    exactAmounts[s.userId] = (s.amountCents / 100).toFixed(2);
  }

  return {
    description: expense.description,
    amount: (expense.amountCents / 100).toFixed(2),
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
  const initial = expense ? initialStateFrom(expense, members) : null;

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

  const amountCents = Math.round((Number.parseFloat(amount) || 0) * 100);

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
          amountCents: Math.round(Number.parseFloat(exactAmounts[m.id]) * 100),
        }))
        .filter((s) => s.amountCents > 0);
      if (extrasCents > 0) {
        const weights = items.map((s) => ({
          userId: s.userId,
          weightCents: s.amountCents,
        }));
        const taxShares = taxCents > 0 ? prorate(taxCents, weights) : null;
        const tipShares =
          tipCents > 0
            ? tipMode === "EVEN"
              ? splitEqual(tipCents, items.map((s) => s.userId))
              : prorate(tipCents, weights)
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

  const exactAssigned = members.reduce(
    (sum, m) => sum + Math.round((Number.parseFloat(exactAmounts[m.id]) || 0) * 100),
    0,
  );
  const percentTotal = members.reduce(
    (sum, m) => sum + (Number.parseFloat(percents[m.id]) || 0),
    0,
  );

  // Save stays disabled until the split reconciles with the total, so
  // mismatches surface as live feedback instead of a server error.
  const taxCents = Math.round((Number.parseFloat(tax) || 0) * 100);
  const tipCents = Math.round((Number.parseFloat(tip) || 0) * 100);
  const extrasCents = taxCents + tipCents;
  // In EXACT mode the per-person inputs are item subtotals; they must add up
  // to the total minus tax and tip.
  const itemTargetCents = amountCents - extrasCents;
  const exactBalanced = itemTargetCents > 0 && exactAssigned === itemTargetCents;
  const percentBalanced = Math.abs(percentTotal - 100) <= 0.01;
  const splitReady =
    mode === "EQUAL"
      ? members.some((m) => !excluded[m.id])
      : mode === "EXACT"
        ? exactBalanced
        : percentBalanced;
  const fmtPercent = (n: number) => String(Math.round(n * 100) / 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl">{title}</h2>
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
          <Field label="Description">
            <input
              name="description"
              required
              placeholder="Dinner at Time Out Market"
              defaultValue={initial?.description}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={`Amount (${currency})`}>
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="90.00"
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

          <Field label="Split">
            <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
              {(
                [
                  ["EQUAL", "Equally"],
                  ["EXACT", "Exact amounts"],
                  ["PERCENT", "Percentages"],
                ] as [Mode, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    mode === value
                      ? "bg-white text-ink shadow-sm"
                      : "text-stone-500 hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          {mode === "EXACT" && (
            <div className="grid grid-cols-2 gap-4">
              <Field label={`Tax (${currency}) · optional`}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <div>
                <Field label={`Tip (${currency}) · optional`}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={tip}
                    onChange={(e) => setTip(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <div
                  role="group"
                  aria-label="How to split the tip"
                  className="mt-1.5 flex gap-1 rounded-lg bg-stone-100 p-0.5"
                >
                  {(
                    [
                      ["BY_ITEMS", "By items"],
                      ["EVEN", "Evenly"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTipMode(value)}
                      className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                        tipMode === value
                          ? "bg-white text-ink shadow-sm"
                          : "text-stone-500 hover:text-ink"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
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
                      type="number"
                      min="0"
                      step={mode === "EXACT" ? "0.01" : "0.1"}
                      placeholder={mode === "EXACT" ? "0.00" : "0"}
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
                      className="w-24 rounded-lg border border-stone-200 px-2 py-1 text-right text-sm outline-none focus:border-pine"
                    />
                    <span className="w-4 text-xs text-stone-400">
                      {mode === "PERCENT" ? "%" : ""}
                    </span>
                  </>
                )}
              </div>
            ))}

            {mode === "EQUAL" && (
              <p className="pt-1 text-xs text-stone-500">
                {(() => {
                  const n = members.filter((m) => !excluded[m.id]).length;
                  return n > 0 && amountCents > 0
                    ? `≈ ${formatCents(Math.floor(amountCents / n), currency)} each · ${n} ${n === 1 ? "person" : "people"}`
                    : `${n} ${n === 1 ? "person" : "people"} selected`;
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
                        : "text-stone-500"
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
                      : "text-stone-500"
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
              disabled={pending || !splitReady}
              className="rounded-full bg-pine px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-dark disabled:opacity-60"
            >
              {pending ? pendingLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
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
