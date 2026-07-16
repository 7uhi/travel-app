import {
  BedDouble,
  CarFront,
  Receipt,
  ShoppingBag,
  Ticket,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

import { Avatar } from "@/components/Avatar";
import { DeleteExpenseButton } from "@/components/expenses/DeleteExpenseButton";
import { EditExpenseButton } from "@/components/expenses/EditExpenseButton";
import type { Member } from "@/components/expenses/ExpenseDialog";
import { formatCents, formatDayDate } from "@/lib/format";
import type { ExpenseCategory, ExpenseWithDetails } from "@/types";

const CATEGORY_META: Record<ExpenseCategory, { icon: LucideIcon; label: string }> = {
  FOOD: { icon: UtensilsCrossed, label: "Food & drink" },
  TRANSPORT: { icon: CarFront, label: "Transport" },
  LODGING: { icon: BedDouble, label: "Lodging" },
  ACTIVITY: { icon: Ticket, label: "Activities" },
  SHOPPING: { icon: ShoppingBag, label: "Shopping" },
  OTHER: { icon: Receipt, label: "Other" },
};

/** Expenses grouped by calendar day, newest day first. */
export function ExpenseList({
  expenses,
  currency,
  members,
  currentUserId,
  isOwner,
}: {
  expenses: ExpenseWithDetails[];
  currency: string;
  members: Member[];
  currentUserId: string | null;
  isOwner: boolean;
}) {
  if (expenses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-8 text-center text-sm text-stone-500">
        No expenses yet. Add the first one and Roam will start tracking who
        owes whom.
      </div>
    );
  }

  const byDay = new Map<string, ExpenseWithDetails[]>();
  for (const expense of expenses) {
    const key = expense.date.slice(0, 10);
    const group = byDay.get(key);
    if (group) group.push(expense);
    else byDay.set(key, [expense]);
  }

  return (
    <div className="space-y-6">
      {[...byDay.entries()].map(([day, dayExpenses]) => (
        <section key={day}>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h3 className="text-sm font-medium text-stone-600">
              {formatDayDate(`${day}T00:00:00.000Z`)}
            </h3>
            <p className="text-xs tabular-nums text-stone-500">
              {formatCents(
                dayExpenses.reduce((s, e) => s + e.amountCents, 0),
                currency,
              )}
            </p>
          </div>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
            {dayExpenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                currency={currency}
                members={members}
                currentUserId={currentUserId}
                canModify={
                  isOwner || expense.paidBy.id === (currentUserId ?? "")
                }
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ExpenseRow({
  expense,
  currency,
  members,
  currentUserId,
  canModify,
}: {
  expense: ExpenseWithDetails;
  currency: string;
  members: Member[];
  currentUserId: string | null;
  canModify: boolean;
}) {
  const { icon: Icon, label } = CATEGORY_META[expense.category];
  const splitCount = expense.splits.length;

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pine-soft text-pine">
        <Icon size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium leading-snug">
          {expense.description}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-500">
          <Avatar
            name={expense.paidBy.name}
            image={expense.paidBy.image}
            size={16}
          />
          {expense.paidBy.name ?? "Someone"} paid · {label} · split{" "}
          {splitCount} {splitCount === 1 ? "way" : "ways"}
        </p>
      </div>

      <p className="shrink-0 text-sm font-medium tabular-nums">
        {formatCents(expense.amountCents, currency)}
      </p>
      {canModify && currentUserId && (
        <EditExpenseButton
          expense={expense}
          currency={currency}
          members={members}
          currentUserId={currentUserId}
        />
      )}
      {canModify && <DeleteExpenseButton expenseId={expense.id} />}
    </li>
  );
}
