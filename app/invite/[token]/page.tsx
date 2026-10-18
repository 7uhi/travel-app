import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, MapPin, Users } from "lucide-react";

import { getInvitePreview } from "@/actions/invite";
import { getMyProfile } from "@/actions/preferences";
import { auth } from "@/auth";
import { InviteAcceptForm } from "@/components/InviteAcceptForm";
import { formatDateRange } from "@/lib/format";

/**
 * The page an invite link opens. It only describes the invitation — what the
 * trip is, the role on offer, and exactly what joining shares with the group.
 * Joining is a separate, explicit POST from the Join button.
 */
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

  const [previewRes, profileRes] = await Promise.all([
    getInvitePreview(token),
    getMyProfile(),
  ]);

  if (!previewRes.success) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-3xl">This invite won&apos;t open</h1>
        <p className="mt-3 text-sm text-stone-600">{previewRes.error}</p>
        <Link
          href="/trips"
          className="mt-6 rounded-full bg-pine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pine-dark"
        >
          Go to your trips
        </Link>
      </main>
    );
  }

  const invite = previewRes.data;
  if (invite.alreadyMember) redirect(`/trips/${invite.tripId}`);

  const profile = profileRes.success ? profileRes.data : null;
  const sharedNotes = [
    profile?.dietaryNotes && "dietary notes",
    profile?.accessibilityNotes && "accessibility notes",
  ].filter(Boolean);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="rounded-3xl border border-stone-200/80 bg-white p-8 text-center shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-600">
          {invite.invitedBy ? `${invite.invitedBy} invited you` : "You're invited"}
        </p>
        <h1 className="mt-3 font-display text-4xl tracking-tight">
          {invite.tripTitle}
        </h1>
        <ul className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-stone-600">
          <li className="flex items-center gap-1.5">
            <MapPin size={14} aria-hidden />
            {invite.destination ?? "Destination not decided"}
          </li>
          <li className="flex items-center gap-1.5">
            <CalendarDays size={14} aria-hidden />
            {invite.startDate && invite.endDate
              ? formatDateRange(invite.startDate, invite.endDate)
              : "Dates not decided"}
          </li>
          <li className="flex items-center gap-1.5">
            <Users size={14} aria-hidden />
            {invite.memberCount} {invite.memberCount === 1 ? "member" : "members"}
          </li>
        </ul>

        <p className="mt-6 text-sm">
          You&apos;ll join as{" "}
          <strong>{invite.role === "EDITOR" ? "an editor" : "a viewer"}</strong>
          {invite.role === "EDITOR"
            ? " — you can plan the itinerary, add expenses, and edit the packing list."
            : " — you can see the plan, vote on ideas, and answer the group questions."}
        </p>

        <div className="mt-6 rounded-2xl bg-stone-100 px-5 py-4 text-left text-sm">
          <p className="font-medium">Joining shares with everyone on this trip:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-700">
            <li>your name and email address</li>
            <li>
              {profile
                ? "your travel profile answers"
                : "any travel profile answers you add later"}
              {sharedNotes.length > 0 && `, including your ${sharedNotes.join(" and ")}`}
            </li>
          </ul>
          {profile && (
            <Link
              href={`/onboarding?next=${encodeURIComponent(`/invite/${token}`)}`}
              className="mt-3 inline-block font-medium text-pine underline-offset-2 hover:underline"
            >
              Review your travel profile first
            </Link>
          )}
        </div>

        <InviteAcceptForm token={token} />
      </div>
    </main>
  );
}
