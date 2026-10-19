import { notFound } from "next/navigation";

import {
  getTripBalances,
  getTripExpenses,
  getTripSettlements,
} from "@/actions/expense";
import { getTripMembers } from "@/actions/members";
import { getTripHeader } from "@/actions/trip";
import { auth } from "@/auth";
import { LoadError } from "@/components/LoadError";
import { TripHeader } from "@/components/TripHeader";
import { AddExpenseButton } from "@/components/expenses/AddExpenseButton";
import { BalancesPanel } from "@/components/expenses/BalancesPanel";
import { CurrencyPicker } from "@/components/expenses/CurrencyPicker";
import { ExpenseList } from "@/components/expenses/ExpenseList";
import { summarizeTripAmounts } from "@/lib/currencies";

export default async function TripExpensesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tripRes, expensesRes, balancesRes, settlementsRes, membersRes] =
    await Promise.all([
      getTripHeader(id),
      getTripExpenses(id),
      getTripBalances(id),
      getTripSettlements(id),
      getTripMembers(id),
    ]);

  if (!tripRes.success) {
    if (tripRes.error === "Trip not found.") notFound();
    return <LoadError message={tripRes.error} />;
  }
  if (!expensesRes.success) return <LoadError message={expensesRes.error} />;
  if (!balancesRes.success) return <LoadError message={balancesRes.error} />;
  if (!settlementsRes.success) {
    return <LoadError message={settlementsRes.error} />;
  }
  if (!membersRes.success) return <LoadError message={membersRes.error} />;

  const trip = tripRes.data;
  const session = await auth();
  const currentUserId = session?.user?.id ?? null;
  const role = trip.role;
  const canEdit = role === "OWNER" || role === "EDITOR";

  // Current members only: people who left still appear in the expense and
  // repayment history (named from those rows), but can't be picked anew.
  const members = membersRes.data.map((m) => ({
    id: m.userId,
    name: m.name ?? m.email,
  }));
  const amounts = summarizeTripAmounts({
    totalBudget: trip.totalBudget,
    expenses: expensesRes.data,
    settlementCents: settlementsRes.data.map((s) => s.amountCents),
    plannedCost: trip.plannedCost,
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TripHeader trip={trip} activeTab="expenses" />

      <section className="mt-10 grid items-start gap-8 lg:grid-cols-3">
        {/* min-w-0 on both columns: a grid item is otherwise as wide as its
            longest unbreakable line — a truncated expense title or name —
            which pushed the page sideways on phones. */}
        <div className="min-w-0 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl">Expenses</h2>
            <div className="flex flex-wrap items-center gap-3">
              {role === "OWNER" && (
                <CurrencyPicker
                  tripId={trip.id}
                  currency={trip.currency}
                  example={amounts.example}
                  fractional={amounts.fractional}
                />
              )}
              {canEdit && currentUserId && (
                <AddExpenseButton
                  tripId={trip.id}
                  currency={trip.currency}
                  members={members}
                  currentUserId={currentUserId}
                />
              )}
            </div>
          </div>
          <ExpenseList
            expenses={expensesRes.data}
            currency={trip.currency}
            members={members}
            currentUserId={currentUserId}
            isOwner={role === "OWNER"}
          />
        </div>

        <aside className="min-w-0 lg:sticky lg:top-8">
          <BalancesPanel
            tripId={trip.id}
            balances={balancesRes.data}
            settlements={settlementsRes.data}
            members={members}
            currentUserId={currentUserId}
            role={role}
          />
        </aside>
      </section>
    </main>
  );
}
