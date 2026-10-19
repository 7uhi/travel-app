import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-3xl">Page not found</h1>
      <p className="mt-3 text-sm text-stone-600">
        The link may be mistyped, or the page may have moved.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-pine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pine-dark"
      >
        Go to Roam
      </Link>
    </main>
  );
}
