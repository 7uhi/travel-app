import { MoveRight } from "lucide-react";

import { Avatar } from "@/components/Avatar";
import { RecordRepaymentButton } from "@/components/expenses/RecordRepaymentButton";
import { RemoveRepaymentButton } from "@/components/expenses/RemoveRepaymentButton";
import { formatCents, formatDayDate } from "@/lib/format";
import { canRecordRepayment, canRemoveRepayment } from "@/lib/permissions";
import type { SettlementRecord, TripBalances, TripRole } from "@/types";

const cardClass =
  "rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]";
const headingClass =
  "mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-600";

/**
 * Net position per member, the simplified "who pays whom" list with a
 * reviewed way to record each repayment, and the history of repayments
 * already recorded (each removable by the people it concerns).
 */
export function BalancesPanel({
  tripId,
  balances,
  settlements,
  members,
  currentUserId,
  role,
}: {
  tripId: string;
  balances: TripBalances;
  settlements: SettlementRecord[];
  members: { id: string; name: string }[];
  currentUserId: string | null;
  role: TripRole | null;
}) {
  const nameOf = new Map(
    balances.members.map((m) => [m.userId, m.name ?? "Someone"]),
  );
  const actor = currentUserId && role ? { id: currentUserId, role } : null;

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <h3 className={headingClass}>Balances</h3>
        <ul className="space-y-3">
          {balances.members.map((member) => (
            <li key={member.userId} className="flex items-center gap-2.5 text-sm">
              <Avatar name={member.name} image={member.image} size={26} />
              <span className="min-w-0 flex-1 truncate">
                {member.name ?? "Someone"}
                {member.userId === currentUserId && (
                  <span className="text-stone-600"> (you)</span>
                )}
              </span>
              {member.netCents === 0 ? (
                <span className="text-xs text-stone-600">settled</span>
              ) : (
                <span
                  className={`font-medium tabular-nums ${
                    member.netCents > 0 ? "text-pine" : "text-red-700"
                  }`}
                >
                  <span className="sr-only">
                    {member.netCents > 0 ? "is owed " : "owes "}
                  </span>
                  <span aria-hidden>{member.netCents > 0 ? "+" : "−"}</span>
                  {formatCents(Math.abs(member.netCents), balances.currency)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className={cardClass}>
        <h3 className={headingClass}>Settle up</h3>
        {balances.suggestedPayments.length === 0 ? (
          <p className="text-sm text-stone-600">
            All settled up — nobody owes anything.
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
                    aria-hidden
                    className="mx-1.5 inline text-stone-500"
                  />
                  <span className="sr-only"> pays </span>
                  {nameOf.get(payment.toUserId) ?? "Someone"}
                </span>
                <span className="font-medium tabular-nums">
                  {formatCents(payment.amountCents, balances.currency)}
                </span>
                {actor &&
                  canRecordRepayment(
                    actor.role,
                    actor.id,
                    payment.fromUserId,
                    payment.toUserId,
                  ) && (
                    <RecordRepaymentButton
                      tripId={tripId}
                      currency={balances.currency}
                      members={members}
                      currentUserId={actor.id}
                      role={actor.role}
                      suggestion={payment}
                    />
                  )}
              </li>
            ))}
          </ul>
        )}
        {actor && members.length > 1 && (
          <div className="mt-4 border-t border-stone-100 pt-3">
            <RecordRepaymentButton
              tripId={tripId}
              currency={balances.currency}
              members={members}
              currentUserId={actor.id}
              role={actor.role}
            />
          </div>
        )}
      </div>

      <div className={cardClass}>
        <h3 className={headingClass}>Repayments</h3>
        {settlements.length === 0 ? (
          <p className="text-sm text-stone-600">No repayments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {settlements.map((s) => {
              const summary = `${s.fromUser.name ?? "Someone"} paid ${s.toUser.name ?? "someone"} ${formatCents(s.amountCents, balances.currency)}`;
              return (
                <li key={s.id} className="flex items-start gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{summary}</p>
                    <p className="text-xs text-stone-600">
                      {formatDayDate(s.date)}
                      {s.createdBy && ` · recorded by ${s.createdBy.name ?? "a member"}`}
                    </p>
                  </div>
                  {actor && canRemoveRepayment(actor.role, actor.id, s) && (
                    <RemoveRepaymentButton settlementId={s.id} description={summary} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
