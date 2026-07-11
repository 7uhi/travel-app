"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { createExpense } from "@/actions/expense";
import { formatCents } from "@/lib/format";
import type { ExpenseCategory, SplitInput } from "@/types";

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: "FOOD", label: "Food & drink" },
  { value: "TRANSPORT", label: "Transport" },
  { value: "LODGING", label: "Lodging" },
  { value: "ACTIVITY", label: "Activities" },
  { value: "SHOPPING", label: "Shopping" },
  { value: "OTHER", label: "Other" },
];

type Mode = "EQUAL" | "EXACT" | "PERCENT";

interface Member {
  id: string;
  name: string;
}

/** "Add expense" dialog with equal / exact / percentage split modes. */
export function AddExpenseButton({
  tripId,
  currency,
  members,
  currentUserId,
}: {
  tripId: string;
  currency: string;
  members: Member[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("EQUAL");
  const [amount, setAmount] = useState("");
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percents, setPercents] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const amountCents = Math.round((Number.parseFloat(amount) || 0) * 100);

  function reset() {
    setMode("EQUAL");
    setAmount("");
    setExcluded({});
    setExactAmounts({});
    setPercents({});
    setError(null);
  }

  function close() {
    if (pending) return;
    setOpen(false);
    reset();
  }

  function buildSplit(): SplitInput {
    if (mode === "EQUAL") {
      return {
        mode,
        participantIds: members.filter((m) => !excluded[m.id]).map((m) => m.id),
      };
    }
    if (mode === "EXACT") {
      return {
        mode,
        shares: members
          .filter((m) => (exactAmounts[m.id] ?? "").trim() !== "")
          .map((m) => ({
            userId: m.id,
            amountCents: Math.round(Number.parseFloat(exactAmounts[m.id]) * 100),
          })),
      };
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
      const result = await createExpense(tripId, {
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
      close();
      router.refresh();
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full bg-pine px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-dark"
      >
        <Plus size={16} />
        Add expense
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add an expense"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-2xl">Add expense</h2>
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
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Category">
                  <select name="category" className={inputClass}>
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
                    defaultValue={currentUserId}
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
                {mode === "EXACT" && (
                  <p
                    className={`pt-1 text-xs ${
                      exactAssigned === amountCents && amountCents > 0
                        ? "text-pine"
                        : "text-stone-500"
                    }`}
                  >
                    Assigned {formatCents(exactAssigned, currency)} of{" "}
                    {formatCents(amountCents, currency)}
                  </p>
                )}
                {mode === "PERCENT" && (
                  <p
                    className={`pt-1 text-xs ${
                      Math.abs(percentTotal - 100) <= 0.01
                        ? "text-pine"
                        : "text-stone-500"
                    }`}
                  >
                    Total {percentTotal}% of 100%
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
                  disabled={pending}
                  className="rounded-full bg-pine px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-dark disabled:opacity-60"
                >
                  {pending ? "Adding…" : "Add expense"}
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
