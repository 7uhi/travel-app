"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Catches anything a page throws below the root layout, so a failure inside
 * one trip section shows a recoverable message instead of a blank screen. The
 * digest is the same one instrumentation.ts logs on the server.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-3xl">Something went wrong</h1>
      <p className="mt-3 text-sm text-stone-600">
        This page couldn&apos;t load. Try again, or head back to your trips.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-stone-600">
          Error reference: <code className="font-mono">{error.digest}</code>
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-pine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pine-dark"
        >
          Try again
        </button>
        <Link
          href="/trips"
          className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:border-stone-400 hover:text-ink"
        >
          Back to trips
        </Link>
      </div>
    </main>
  );
}
