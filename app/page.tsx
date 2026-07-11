import Link from "next/link";

import { auth, signIn, signOut } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pine font-display text-2xl text-white">
        R
      </span>
      <h1 className="mt-6 font-display text-4xl tracking-tight">Roam</h1>
      <p className="mt-3 text-sm leading-relaxed text-stone-500">
        Plan trips day by day. Trip dashboards live at{" "}
        <code className="rounded bg-stone-200/60 px-1 py-0.5 text-xs">
          /trips/[id]
        </code>{" "}
        once your database is connected.
      </p>

      {session?.user ? (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-sm text-stone-600">
            Signed in as{" "}
            <span className="font-medium">
              {session.user.name ?? session.user.email}
            </span>
          </p>
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
      ) : (
        <form
          className="mt-6"
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
        className="mt-4 text-sm font-medium text-pine transition-colors hover:text-pine-dark"
      >
        View demo dashboard →
      </Link>
    </main>
  );
}
