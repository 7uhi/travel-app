import { MoveRight } from "lucide-react";

import { Avatar } from "@/components/Avatar";
import { SettleUpButton } from "@/components/expenses/SettleUpButton";
import { formatCents } from "@/lib/format";
import type { TripBalances } from "@/types";

/** Net position per member plus the simplified "who pays whom" list. */
export function BalancesPanel({
  tripId,
  balances,
  currentUserId,
  canSettle,
}: {
  tripId: string;
  balances: TripBalances;
  currentUserId: string | null;
  canSettle: boolean;
}) {
  const nameOf = new Map(
    balances.members.map((m) => [m.userId, m.name ?? "Someone"]),
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
          Balances
        </p>
        <ul className="space-y-3">
          {balances.members.map((member) => (
            <li key={member.userId} className="flex items-center gap-2.5 text-sm">
              <Avatar name={member.name} image={member.image} size={26} />
              <span className="min-w-0 flex-1 truncate">
                {member.name ?? "Someone"}
                {member.userId === currentUserId && (
                  <span className="text-stone-400"> (you)</span>
                )}
              </span>
              {member.netCents === 0 ? (
                <span className="text-xs text-stone-400">settled</span>
              ) : (
                <span
                  className={`font-medium tabular-nums ${
                    member.netCents > 0 ? "text-pine" : "text-red-600"
                  }`}
                >
                  {member.netCents > 0 ? "+" : "−"}
                  {formatCents(Math.abs(member.netCents), balances.currency)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
          Settle up
        </p>
        {balances.suggestedPayments.length === 0 ? (
          <p className="text-sm text-stone-500">
            All settled up — nobody owes anything. 🎉
          </p>
        ) : (
          <ul className="space-y-3">
            {balances.suggestedPayments.map((payment) => (
              <li
                key={`${payment.fromUserId}-${payment.toUserId}`}
                className="flex items-center gap-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {nameOf.get(payment.fromUserId) ?? "Someone"}
                  <MoveRight
                    size={12}
                    className="mx-1.5 inline text-stone-400"
                  />
                  {nameOf.get(payment.toUserId) ?? "Someone"}
                </span>
                <span className="font-medium tabular-nums">
                  {formatCents(payment.amountCents, balances.currency)}
                </span>
                {canSettle && (
                  <SettleUpButton
                    tripId={tripId}
                    fromUserId={payment.fromUserId}
                    toUserId={payment.toUserId}
                    amountCents={payment.amountCents}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
