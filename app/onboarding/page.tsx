import { redirect } from "next/navigation";

import { getMyProfile } from "@/actions/preferences";
import { auth } from "@/auth";
import { LoadError } from "@/components/LoadError";
import { PreferenceDeck } from "@/components/preferences/PreferenceDeck";
import { safeLocalPath } from "@/lib/navigation";

/**
 * The account-level travel profile deck, shown just after a member first signs
 * in and reachable later to edit. Deliberately skippable: most people arrive
 * from an invite link wanting to see a trip, and a wall of questions between
 * them and it is how onboarding funnels die. Anyone who skips is nudged again
 * by the banner on the trip page.
 */
export default async function ProfileOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin?callbackUrl=/onboarding");

  const profileRes = await getMyProfile();
  if (!profileRes.success) return <LoadError message={profileRes.error} />;

  // Only ever bounce back into the app, never to an attacker-supplied origin.
  const { next } = await searchParams;
  const returnTo = safeLocalPath(next, "/trips");

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        Your travel profile
      </p>
      <PreferenceDeck
        mode="profile"
        profile={profileRes.data}
        returnTo={returnTo}
      />
    </main>
  );
}
