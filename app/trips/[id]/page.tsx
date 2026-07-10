import Link from "next/link";
import { notFound } from "next/navigation";

import { getTripById } from "@/actions/trip";
import { auth } from "@/auth";
import { TripDashboard } from "@/components/TripDashboard";

export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getTripById(id);

  if (!result.success) {
    if (result.error === "Trip not found.") notFound();
    return <LoadError message={result.error} />;
  }

  const session = await auth();
  const currentUserRole =
    result.data.members.find((m) => m.userId === session?.user?.id)?.role ??
    null;

  return (
    <TripDashboard trip={result.data} currentUserRole={currentUserRole} />
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-3xl">Something went wrong</h1>
      <p className="mt-3 text-sm text-stone-500">{message}</p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-pine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pine-dark"
      >
        Back to trips
      </Link>
    </main>
  );
}
