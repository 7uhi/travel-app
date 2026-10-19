"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Copy, Share2 } from "lucide-react";

import { createInvite, getTripInvites, revokeInvite } from "@/actions/invite";
import { Dialog } from "@/components/ui/Dialog";
import { FormError, primaryButtonClass } from "@/components/ui/form";
import type { ActiveInvite, InviteLink, InviteRole } from "@/types";

const MS_PER_HOUR = 3_600_000;

const ROLE_OPTIONS: { role: InviteRole; label: string; description: string }[] = [
  {
    role: "VIEWER",
    label: "Viewer",
    description:
      "Sees the plan, votes on ideas, answers the group questions, and logs their own repayments.",
  },
  {
    role: "EDITOR",
    label: "Editor",
    description:
      "Also plans the itinerary, adds expenses, edits the shared packing list, and can invite others.",
  },
];

/**
 * Opens the trip's sharing dialog: create an invite link for a chosen role,
 * see every link that still works (role, who made it, when it expires), and
 * revoke them. Rendered for owners and editors; the invite actions enforce
 * the same rules server-side.
 */
export function ShareTripButton({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-white/25"
      >
        <Share2 size={14} aria-hidden />
        Share
      </button>
      {open && <ShareDialog tripId={tripId} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareDialog({
  tripId,
  onClose,
}: {
  tripId: string;
  onClose: () => void;
}) {
  const [role, setRole] = useState<InviteRole>("VIEWER");
  const [created, setCreated] = useState<InviteLink | null>(null);
  const [invites, setInvites] = useState<ActiveInvite[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const [revokePending, startRevoke] = useTransition();
  const pending = creating || revokePending;

  const load = useCallback(async () => {
    const result = await getTripInvites(tripId);
    if (result.success) setInvites(result.data);
    else setError(result.error);
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  function create() {
    setError(null);
    startCreate(async () => {
      const result = await createInvite(tripId, role);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setCreated(result.data);
      await load();
    });
  }

  function revoke(inviteId: string) {
    setError(null);
    startRevoke(async () => {
      const result = await revokeInvite(inviteId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setRevoking(null);
      if (invites?.some((i) => i.id === inviteId && i.url === created?.url)) {
        setCreated(null);
      }
      await load();
    });
  }

  return (
    <Dialog
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      title="Share this trip"
      description="Invite links work for 7 days and can be used by anyone who has them. Pick the role people get when they join."
    >
      <div className="space-y-6">
        <section>
          <fieldset>
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-600">
              People who join with the link can
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROLE_OPTIONS.map((option) => (
                <label
                  key={option.role}
                  className={`block cursor-pointer rounded-xl border p-3 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-pine/30 ${
                    role === option.role
                      ? "border-pine bg-pine-soft/60"
                      : "border-stone-200 hover:border-stone-300"
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input
                      type="radio"
                      name="invite-role"
                      value={option.role}
                      checked={role === option.role}
                      onChange={() => setRole(option.role)}
                      className="accent-pine"
                    />
                    {option.label}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-stone-600">
                    {option.description}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={create}
              disabled={pending}
              className={primaryButtonClass}
            >
              {creating
                ? "Creating…"
                : `Create ${role === "EDITOR" ? "editor" : "viewer"} link`}
            </button>
          </div>

          {created && (
            <div className="mt-3 rounded-xl bg-stone-100 p-3">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={created.url}
                  aria-label="New invite link"
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-700 outline-none"
                />
                <CopyButton url={created.url} />
              </div>
              <p className="mt-2 text-xs text-stone-600">
                Anyone with this link can join as{" "}
                {created.role === "EDITOR" ? "an editor" : "a viewer"} until{" "}
                {formatExpiry(created.expiresAt)}, unless it&apos;s revoked
                sooner.
              </p>
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-600">
            Active links
          </h3>
          {invites === null ? (
            <p className="text-sm text-stone-600">Loading links…</p>
          ) : invites.length === 0 ? (
            <p className="text-sm text-stone-600">
              No links are active. People can only join with a link that
              hasn&apos;t expired or been revoked.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
              {invites.map((invite) => (
                <li key={invite.id} className="px-3 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2">
                        <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
                          {invite.role === "EDITOR" ? "Editor" : "Viewer"}
                        </span>
                        <span className="truncate text-xs text-stone-700">
                          by {invite.createdBy.name ?? "a member"}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-stone-600">
                        {expiresIn(invite.expiresAt)}
                      </p>
                    </div>
                    <CopyButton url={invite.url} compact />
                    {invite.canRevoke && revoking !== invite.id && (
                      <button
                        type="button"
                        onClick={() => setRevoking(invite.id)}
                        disabled={pending}
                        className="shrink-0 text-xs font-medium text-stone-600 underline-offset-2 hover:text-red-700 hover:underline disabled:opacity-60"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                  {revoking === invite.id && (
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-2 rounded-lg bg-stone-100 px-3 py-2 text-xs">
                      <span className="mr-auto">
                        Turn this link off? People who already joined stay on
                        the trip.
                      </span>
                      <button
                        type="button"
                        onClick={() => setRevoking(null)}
                        disabled={pending}
                        className="rounded-full px-2.5 py-1 font-medium text-stone-600 hover:text-ink"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => revoke(invite.id)}
                        disabled={pending}
                        className="rounded-full bg-red-700 px-3 py-1 font-medium text-white hover:bg-red-800 disabled:opacity-60"
                      >
                        {revokePending ? "Revoking…" : "Revoke link"}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <FormError message={error} />

        <p className="text-xs text-stone-600">
          Revoking a link doesn&apos;t remove anyone who already joined — the
          owner manages people under Members.
        </p>
      </div>
    </Dialog>
  );
}

function CopyButton({ url, compact = false }: { url: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied — let the user copy manually instead.
      window.prompt("Copy the invite link:", url);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={compact ? "Copy link" : undefined}
      className={
        compact
          ? "shrink-0 rounded-full p-1.5 text-stone-600 transition-colors hover:bg-stone-100 hover:text-ink"
          : "flex shrink-0 items-center gap-1.5 rounded-full bg-pine px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-pine-dark"
      }
    >
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {!compact && (copied ? "Copied" : "Copy")}
      {compact && copied && <span className="sr-only">Copied</span>}
    </button>
  );
}

/** "Oct 25, 11:12 PM" in the viewer's own time zone (client-only render). */
function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "Expires in 6 days · Oct 25" / "Expires in 5 hours · 11:12 PM" */
function expiresIn(iso: string): string {
  const hours = Math.max(
    1,
    Math.round((Date.parse(iso) - Date.now()) / MS_PER_HOUR),
  );
  const days = Math.round(hours / 24);
  const when = new Intl.DateTimeFormat(
    "en",
    hours < 24
      ? { hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric" },
  ).format(new Date(iso));
  const span =
    hours < 24
      ? `${hours} ${hours === 1 ? "hour" : "hours"}`
      : `${days} ${days === 1 ? "day" : "days"}`;
  return `Expires in ${span} · ${when}`;
}
