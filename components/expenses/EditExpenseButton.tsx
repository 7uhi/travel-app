"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { updateExpense } from "@/actions/expense";
import { ExpenseDialog, type Member } from "@/components/expenses/ExpenseDialog";
import type { ExpenseInput, ExpenseWithDetails } from "@/types";

/** Opens the shared expense dialog prefilled with an existing expense. */
export function EditExpenseButton({
  expense,
  currency,
  members,
  currentUserId,
}: {
  expense: ExpenseWithDetails;
  currency: string;
  members: Member[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSubmit(data: ExpenseInput) {
    const result = await updateExpense(expense.id, data);
    if (result.success) router.refresh();
    return result;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Edit expense"
        className="rounded-full p-1.5 text-stone-300 transition-colors hover:bg-stone-100 hover:text-ink"
      >
        <Pencil size={15} />
      </button>

      {open && (
        <ExpenseDialog
          title="Edit expense"
          submitLabel="Save changes"
          pendingLabel="Saving…"
          currency={currency}
          members={members}
          currentUserId={currentUserId}
          expense={expense}
          onClose={() => setOpen(false)}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}
