import Link from "next/link";
import { redirect } from "next/navigation";

import { acceptInvite } from "@/actions/invite";
import { auth } from "@/auth";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const session = await auth();
  if (!session?.user) {
    // Come back to this invite after signing in.
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`,
    );
  }

  const result = await acceptInvite(token);

  if (result.success) {
    // A brand-new member arrives with no context, so the deck is the natural
    // first screen; someone re-clicking a link they already used isn't asked
    // again. Every question is skippable either way.
    redirect(
      result.data.alreadyMember
        ? `/trips/${result.data.tripId}`
        : `/trips/${result.data.tripId}/preferences/onboarding`,
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-3xl">This invite won&apos;t open</h1>
      <p className="mt-3 text-sm text-stone-500">{result.error}</p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-pine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pine-dark"
      >
        Back to Roam
      </Link>
    </main>
  );
}
