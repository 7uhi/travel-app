"use client";

import { useEffect } from "react";

import "./globals.css";

/**
 * Last-resort boundary for errors in the root layout itself, which app/error
 * can't catch because it renders inside that layout. It replaces the whole
 * document, so it brings its own <html> and <body> and keeps to plain markup.
 */
export default function GlobalError({
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
    <html lang="en">
      <body className="min-h-screen font-sans">
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
          <h1 className="text-3xl">Roam ran into a problem</h1>
          <p className="mt-3 text-sm text-stone-600">
            Something went wrong loading the app. Try again in a moment.
          </p>
          {error.digest && (
            <p className="mt-2 text-xs text-stone-600">
              Error reference: <code className="font-mono">{error.digest}</code>
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-full bg-pine px-5 py-2.5 text-sm font-medium text-white"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
