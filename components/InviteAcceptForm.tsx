"use client";

import { useActionState } from "react";
import Link from "next/link";

import { acceptInviteFromForm } from "@/actions/invite";
import { FormError, primaryButtonClass } from "@/components/ui/form";

/** The explicit Join step: the only way an invite link adds someone to a trip. */
export function InviteAcceptForm({ token }: { token: string }) {
  const [error, formAction, pending] = useActionState(acceptInviteFromForm, null);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormError message={error} />
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Joining…" : "Join trip"}
        </button>
        <Link
          href="/trips"
          className="rounded-full px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:text-ink"
        >
          Not now
        </Link>
      </div>
    </form>
  );
}
