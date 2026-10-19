"use client";

import { useState } from "react";

import { Avatar } from "@/components/Avatar";
import { Dialog } from "@/components/ui/Dialog";
import { currencyUnitCents } from "@/lib/currencies";
import { formatCents, formatDayDate } from "@/lib/format";
import { isEqualSplit } from "@/lib/split";
import type { ExpenseWithDetails } from "@/types";

/**
 * Turns an expense row's summary into a button that opens a read-only
 * breakdown: who paid, how it was split, each person's share, the date and
 * category. Every member can open it, viewers included — reading a split
 * never needed edit access — and it offers no way to change anything; the
 * row keeps its separate Edit and Delete controls for those allowed to.
 */
export function ExpenseDetailsButton({
  expense,
  currency,
  categoryLabel,
  currentUserId,
  children,
}: {
  expense: ExpenseWithDetails;
  currency: string;
  categoryLabel: string;
  currentUserId: string | null;
  /** The row summary the button wraps. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const nameOf = (user: { name: string | null }) => user.name ?? "Someone";
  const you = (id: string) => (id === currentUserId ? " (you)" : "");

  const amounts = expense.splits.map((s) => s.amountCents);
  const equal = isEqualSplit(amounts, currencyUnitCents(currency));
  const spread = Math.max(...amounts) - Math.min(...amounts);
  const count = expense.splits.length;
  const splitSummary =
    count === 1
      ? "Not split — one person"
      : equal
        ? `Equally between ${count} people`
        : `Custom amounts between ${count} people`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/30"
      >
        {children}
        <span className="sr-only">, view details</span>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={expense.description}
      >
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-6 gap-y-3 text-sm">
          <dt className="text-stone-600">Total</dt>
          <dd className="text-right font-display text-2xl tabular-nums">
            {formatCents(expense.amountCents, currency)}
          </dd>
          <dt className="text-stone-600">Paid by</dt>
          <dd className="flex min-w-0 items-center justify-end gap-2">
            <Avatar
              name={expense.paidBy.name}
              image={expense.paidBy.image}
              size={22}
            />
            <span className="truncate">
              {nameOf(expense.paidBy)}
              {you(expense.paidBy.id)}
            </span>
          </dd>
          <dt className="text-stone-600">Date</dt>
          <dd className="text-right">{formatDayDate(expense.date)}</dd>
          <dt className="text-stone-600">Category</dt>
          <dd className="text-right">{categoryLabel}</dd>
          <dt className="text-stone-600">Split</dt>
          <dd className="text-right">{splitSummary}</dd>
        </dl>

        <h3 className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-600">
          Shares
        </h3>
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
          {expense.splits.map((split) => (
            <li
              key={split.userId}
              className={`flex items-center gap-2.5 px-3 py-2.5 text-sm ${
                split.userId === currentUserId ? "bg-pine-soft/60" : ""
              }`}
            >
              <Avatar name={split.user.name} image={split.user.image} size={22} />
              <span className="min-w-0 flex-1 truncate">
                {nameOf(split.user)}
                {you(split.userId)}
              </span>
              {!equal && (
                <span className="text-xs tabular-nums text-stone-600">
                  {formatPercent(split.amountCents / expense.amountCents)}
                </span>
              )}
              <span className="font-medium tabular-nums">
                {formatCents(split.amountCents, currency)}
              </span>
            </li>
          ))}
        </ul>
        {equal && spread > 0 && (
          <p className="mt-2 text-xs text-stone-600">
            {formatCents(expense.amountCents, currency)} doesn&apos;t divide
            evenly, so some shares are {formatCents(spread, currency)} more.
          </p>
        )}
      </Dialog>
    </>
  );
}

/** 0.3333 → "33.3%" */
function formatPercent(fraction: number): string {
  return new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(fraction);
}
