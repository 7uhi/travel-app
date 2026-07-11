import { notFound } from "next/navigation";

import { getTripBalances, getTripExpenses } from "@/actions/expense";
import { getTripById } from "@/actions/trip";
import { auth } from "@/auth";
import { LoadError } from "@/components/LoadError";
import { TripHeader } from "@/components/TripHeader";
import { AddExpenseButton } from "@/components/expenses/AddExpenseButton";
import { BalancesPanel } from "@/components/expenses/BalancesPanel";
import { ExpenseList } from "@/components/expenses/ExpenseList";

export default async function TripExpensesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tripRes, expensesRes, balancesRes] = await Promise.all([
    getTripById(id),
    getTripExpenses(id),
    getTripBalances(id),
  ]);

  if (!tripRes.success) {
    if (tripRes.error === "Trip not found.") notFound();
    return <LoadError message={tripRes.error} />;
  }
  if (!expensesRes.success) return <LoadError message={expensesRes.error} />;
  if (!balancesRes.success) return <LoadError message={balancesRes.error} />;

  const trip = tripRes.data;
  const session = await auth();
  const currentUserId = session?.user?.id ?? null;
  const role =
    trip.members.find((m) => m.userId === currentUserId)?.role ?? null;
  const canEdit = role === "OWNER" || role === "EDITOR";

  const members = trip.members.map((m) => ({
    id: m.userId,
    name: m.user.name ?? m.user.email,
  }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TripHeader trip={trip} currentUserRole={role} activeTab="expenses" />

      <section className="mt-10 grid items-start gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl">Expenses</h2>
            {canEdit && currentUserId && (
              <AddExpenseButton
                tripId={trip.id}
                currency={trip.currency}
                members={members}
                currentUserId={currentUserId}
              />
            )}
          </div>
          <ExpenseList
            expenses={expensesRes.data}
            currency={trip.currency}
            currentUserId={currentUserId}
            isOwner={role === "OWNER"}
          />
        </div>

        <aside className="lg:sticky lg:top-8">
          <BalancesPanel
            tripId={trip.id}
            balances={balancesRes.data}
            currentUserId={currentUserId}
            canSettle={role !== null}
          />
        </aside>
      </section>
    </main>
  );
}
