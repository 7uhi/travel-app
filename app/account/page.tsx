import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getAccountDeletionPlan } from "@/actions/account";
import { auth, signOut } from "@/auth";
import { DeleteAccountButton } from "@/components/account/DeleteAccountButton";
import { Avatar } from "@/components/Avatar";
import { LoadError } from "@/components/LoadError";
import { DELETE_ACCOUNT_PHRASE, DELETED_USER_NAME } from "@/lib/account";

export const metadata = { title: "Your account — Roam" };

/** Account overview: who you're signed in as, sign out, and account deletion. */
export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin?callbackUrl=/account");

  const planRes = await getAccountDeletionPlan();
  if (!planRes.success) return <LoadError message={planRes.error} />;
  const plan = planRes.data;
  const { name, email, image } = session.user;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/trips"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Your trips
      </Link>
      <h1 className="mt-4 font-display text-4xl tracking-tight">Your account</h1>

      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <Avatar name={name ?? null} image={image} size={48} />
          <div className="min-w-0">
            <p className="truncate font-medium">{name ?? email}</p>
            {name && <p className="truncate text-sm text-stone-600">{email}</p>}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/onboarding?next=/account"
            className="rounded-full border border-stone-300 px-5 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-stone-400 hover:text-ink"
          >
            Edit travel profile
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="rounded-full px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </section>

      <section
        aria-labelledby="delete-account"
        className="mt-8 rounded-2xl border border-red-200 bg-white p-6"
      >
        <h2 id="delete-account" className="text-lg font-semibold">
          Delete account
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Your name, email, photo, travel profile, and Google sign-in link are
          erased, and you&apos;re signed out on every device. Expenses and
          repayments you were part of stay on their trips so everyone else&apos;s
          balances still add up — they&apos;ll show you as “{DELETED_USER_NAME}”,
          as will ideas you suggested.
        </p>

        {plan.blockers.length > 0 ? (
          <div className="mt-5">
            <p className="text-sm font-medium">Before you can delete your account:</p>
            <ul className="mt-2 space-y-2">
              {plan.blockers.map((blocker) => (
                <li
                  key={blocker.tripId}
                  className="rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-700"
                >
                  {blocker.message}{" "}
                  <Link
                    href={
                      blocker.reason === "owner"
                        ? `/trips/${blocker.tripId}`
                        : `/trips/${blocker.tripId}/expenses`
                    }
                    className="font-medium text-pine underline-offset-2 hover:underline"
                  >
                    Open trip
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {plan.tripsToDelete.length > 0 && (
              <TripList
                heading="These trips have no one else on them and will be deleted:"
                trips={plan.tripsToDelete}
              />
            )}
            {plan.tripsToLeave.length > 0 && (
              <TripList
                heading="You'll leave these trips; they carry on for everyone else:"
                trips={plan.tripsToLeave}
              />
            )}
            <DeleteAccountButton confirmPhrase={DELETE_ACCOUNT_PHRASE} />
          </div>
        )}
      </section>
    </main>
  );
}

function TripList({
  heading,
  trips,
}: {
  heading: string;
  trips: { id: string; title: string }[];
}) {
  return (
    <div>
      <p className="text-sm font-medium">{heading}</p>
      <ul className="mt-1 list-disc pl-5 text-sm text-stone-700">
        {trips.map((trip) => (
          <li key={trip.id}>{trip.title}</li>
        ))}
      </ul>
    </div>
  );
}
