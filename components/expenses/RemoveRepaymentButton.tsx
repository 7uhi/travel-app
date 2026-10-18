"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteSettlement } from "@/actions/expense";

/** Removes a recorded repayment after confirmation, restoring the debt it settled. */
export function RemoveRepaymentButton({
  settlementId,
  description,
}: {
  settlementId: string;
  description: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleRemove() {
    if (
      !window.confirm(
        `Remove the repayment "${description}"? The debt it settled will show as owed again.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteSettlement(settlementId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleRemove}
        disabled={pending}
        aria-label={`Remove repayment: ${description}`}
        className="text-xs font-medium text-stone-600 underline-offset-2 transition-colors hover:text-red-700 hover:underline disabled:opacity-60"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {error && (
        <span role="alert" className="max-w-48 text-right text-xs text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
