import Link from "next/link";
import {
  CalendarCheck,
  Lightbulb,
  ListChecks,
  Map,
  ReceiptText,
  Users,
} from "lucide-react";

import { auth, signIn, signOut } from "@/auth";

const FEATURES = [
  {
    icon: CalendarCheck,
    title: "Pick dates together",
    body: "Everyone marks the days they're free; Roam ranks the windows that work.",
  },
  {
    icon: Map,
    title: "Plan day by day",
    body: "One shared itinerary with times, places, and costs for every day.",
  },
  {
    icon: Lightbulb,
    title: "Vote on ideas",
    body: "Collect things to do, see what the group wants, then schedule the winners.",
  },
  {
    icon: ReceiptText,
    title: "Split costs fairly",
    body: "Log who paid, split it any way, and see who owes whom.",
  },
  {
    icon: ListChecks,
    title: "Pack once",
    body: "Shared gear with owners, plus a private list and reusable templates.",
  },
  {
    icon: Users,
    title: "Know the group",
    body: "Pace, budget, and dietary needs gathered up front, not mid-trip.",
  },
];

export default async function Home() {
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-pine font-display text-2xl text-white">
          R
        </span>
        <h1 className="mt-6 font-display text-4xl tracking-tight sm:text-5xl">
          Plan group trips without the group chat chaos
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-stone-600">
          Roam keeps your dates, itinerary, ideas, expenses, and packing in one
          place everyone on the trip can see and shape.
        </p>

        {session?.user ? (
          <div className="mt-8 flex flex-col items-center gap-3">
            <p className="text-sm text-stone-600">
              Signed in as{" "}
              <span className="font-medium">
                {session.user.name ?? session.user.email}
              </span>
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/trips"
                className="rounded-full bg-pine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pine-dark"
              >
                Your trips
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:border-stone-400 hover:text-ink"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        ) : (
          <form
            className="mt-8"
            action={async () => {
              "use server";
              await signIn("google");
            }}
          >
            <button
              type="submit"
              className="rounded-full bg-pine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pine-dark"
            >
              Sign in with Google
            </button>
          </form>
        )}

        <Link
          href="/preview"
          className="mt-4 inline-block text-sm font-medium text-pine transition-colors hover:text-pine-dark"
        >
          See a sample trip →
        </Link>
      </div>

      <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            className="rounded-2xl border border-stone-200/80 bg-white p-5"
          >
            <Icon size={18} className="text-pine" aria-hidden />
            <h2 className="mt-3 font-medium">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-stone-600">{body}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
