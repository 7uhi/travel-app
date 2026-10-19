"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  getTripMembers,
  removeMember,
  setMemberRole,
  transferOwnership,
} from "@/actions/members";
import { Avatar } from "@/components/Avatar";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/components/ui/form";
import type { ActionResult } from "@/lib/action-result";
import { canManageMembers } from "@/lib/permissions";
import type { InviteRole, TripMemberDetail, TripRole } from "@/types";

const ROLE_LABELS: Record<TripRole, string> = {
  OWNER: "Owner",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

type Confirming = { userId: string; kind: "remove" | "owner" } | null;

/**
 * Who's on the trip and in what role. Everyone can see it; the owner also
 * changes roles, hands over ownership, and removes people here (each checked
 * again by the server). Mounted only while open, and loads fresh each time.
 */
export function MembersDialog({
  tripId,
  onClose,
}: {
  tripId: string;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<TripMemberDetail[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [rowError, setRowError] = useState<{ userId: string; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const load = useCallback(async () => {
    const result = await getTripMembers(tripId);
    if (result.success) {
      setMembers(result.data);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOwner = canManageMembers(
    members?.find((m) => m.isYou)?.role ?? "VIEWER",
  );
  // Owner first, then everyone else in the order they joined.
  const sorted = [...(members ?? [])].sort(
    (a, b) => Number(b.role === "OWNER") - Number(a.role === "OWNER"),
  );

  function run(userId: string, action: () => Promise<ActionResult<unknown>>) {
    setRowError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setRowError({ userId, message: result.error });
        return;
      }
      setConfirming(null);
      await load();
      router.refresh();
    });
  }

  return (
    <Dialog
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      title="Members"
      description="Editors plan the itinerary, expenses, and shared packing list. Viewers see everything, vote on ideas, answer the group questions, and log their own repayments."
    >
      {loadError ? (
        <FormError message={loadError} />
      ) : members === null ? (
        <p className="py-6 text-center text-sm text-stone-600">Loading members…</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {sorted.map((member) => {
            const name = member.name ?? member.email;
            const manageable = isOwner && !member.isYou;
            const confirm =
              confirming?.userId === member.userId ? confirming.kind : null;
            return (
              <li key={member.userId} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <Avatar name={member.name} image={member.image} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {name}
                      {member.isYou && (
                        <span className="font-normal text-stone-600"> (you)</span>
                      )}
                    </p>
                    {member.name && (
                      <p className="truncate text-xs text-stone-600">{member.email}</p>
                    )}
                  </div>
                  {manageable && member.role !== "OWNER" ? (
                    <select
                      aria-label={`Role for ${name}`}
                      value={member.role}
                      disabled={pending}
                      onChange={(e) =>
                        run(member.userId, () =>
                          setMemberRole(
                            tripId,
                            member.userId,
                            e.target.value as InviteRole,
                          ),
                        )
                      }
                      className="shrink-0 rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-pine focus-visible:ring-2 focus-visible:ring-pine/30 disabled:opacity-60"
                    >
                      <option value="EDITOR">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                  ) : (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                        member.role === "OWNER"
                          ? "bg-pine-soft text-pine"
                          : "bg-stone-100 text-stone-700"
                      }`}
                    >
                      {ROLE_LABELS[member.role]}
                    </span>
                  )}
                </div>

                {manageable && (
                  <div className="mt-2 pl-11">
                    {confirm ? (
                      <div className="rounded-xl bg-stone-100 px-3 py-2.5 text-sm">
                        <p>
                          {confirm === "remove"
                            ? `Remove ${name} from the trip? Expenses and repayments they were part of stay in the history.`
                            : `Make ${name} the owner? You'll become an editor, and only they will be able to manage members, change the dates, or delete the trip.`}
                        </p>
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirming(null);
                              setRowError(null);
                            }}
                            disabled={pending}
                            className="rounded-full px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-ink"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              run(member.userId, () =>
                                confirm === "remove"
                                  ? removeMember(tripId, member.userId)
                                  : transferOwnership(tripId, member.userId),
                              )
                            }
                            className={`rounded-full px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 ${
                              confirm === "remove"
                                ? "bg-red-700 hover:bg-red-800"
                                : "bg-pine hover:bg-pine-dark"
                            }`}
                          >
                            {pending
                              ? "Saving…"
                              : confirm === "remove"
                                ? "Remove"
                                : "Make owner"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-4 text-xs font-medium">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setRowError(null);
                            setConfirming({ userId: member.userId, kind: "owner" });
                          }}
                          className="text-stone-600 underline-offset-2 hover:text-ink hover:underline disabled:opacity-60"
                        >
                          Make owner
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setRowError(null);
                            setConfirming({ userId: member.userId, kind: "remove" });
                          }}
                          className="text-stone-600 underline-offset-2 hover:text-red-700 hover:underline disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    {rowError?.userId === member.userId && (
                      <div className="mt-2">
                        <FormError message={rowError.message} />
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isOwner && (
        <p className="mt-5 border-t border-stone-100 pt-4 text-xs text-stone-600">
          As the owner you can&apos;t leave the trip. To step back, make someone
          else the owner first.
        </p>
      )}
    </Dialog>
  );
}
