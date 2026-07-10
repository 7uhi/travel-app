"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { recordSettlement } from "@/actions/expense";

/** Records the suggested repayment as a Settlement, then refreshes balances. */
export function SettleUpButton({
  tripId,
  fromUserId,
  toUserId,
  amountCents,
}: {
  tripId: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSettle() {
    startTransition(async () => {
      const result = await recordSettlement(
        tripId,
        fromUserId,
        toUserId,
        amountCents,
      );
      if (!result.success) {
        setError(result.error);
        setTimeout(() => setError(null), 3000);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleSettle}
      disabled={pending}
      title={error ?? "Record this repayment"}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
        error
          ? "bg-red-50 text-red-700"
          : "bg-pine-soft text-pine hover:bg-pine hover:text-white"
      }`}
    >
      {error ? "Failed" : pending ? "Settling…" : "Settle up"}
    </button>
  );
}
