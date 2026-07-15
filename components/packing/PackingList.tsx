"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import {
  deletePackingItem,
  togglePackingItem,
  updatePackingItem,
} from "@/actions/packing";
import type { ActionResult } from "@/lib/action-result";
import { groupByCategory } from "@/lib/packing";
import type { PackingItemWithAssignee } from "@/types";

interface Member {
  id: string;
  name: string;
}

/**
 * A packing checklist grouped by category. The shared variant shows who's
 * bringing each item; OWNER/EDITOR members can reassign and delete, but an
 * item's checkbox belongs to its assignee alone — unassigned items can't be
 * checked by anyone. The personal variant is the signed-in member's private
 * list, so everything is editable and there's no assignee.
 */
export function PackingList({
  items,
  members,
  canEdit,
  variant,
  currentUserId,
}: {
  items: PackingItemWithAssignee[];
  members: Member[];
  canEdit: boolean;
  variant: "shared" | "personal";
  currentUserId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const groups = groupByCategory(items);

  function run(action: () => Promise<ActionResult<unknown>>) {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-500">
          {!canEdit
            ? "No packing items yet."
            : variant === "personal"
              ? "Add your first item to start your personal packing list."
              : "Add your first item to start the packing list."}
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.category}>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                {group.label}
              </h3>
              <ul className="divide-y divide-stone-100">
                {group.items.map((item) => {
                  const canToggle =
                    variant === "personal"
                      ? canEdit
                      : item.assigneeId !== null &&
                        item.assigneeId === currentUserId;
                  const toggleHint = canToggle
                    ? undefined
                    : item.assigneeId
                      ? `Only ${item.assignee?.name ?? "the assigned member"} can check this off`
                      : "Assign this item to a member before checking it off";
                  return (
                  <li key={item.id} className="flex items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      checked={item.packed}
                      disabled={!canToggle || pending}
                      title={toggleHint}
                      onChange={(e) =>
                        run(() => togglePackingItem(item.id, e.target.checked))
                      }
                      aria-label={`Mark ${item.name} as packed`}
                      className="size-4 shrink-0 accent-pine disabled:opacity-60"
                    />
                    <span
                      className={`flex-1 text-sm ${
                        item.packed
                          ? "text-stone-400 line-through decoration-stone-300"
                          : "text-ink"
                      }`}
                    >
                      {item.name}
                    </span>

                    {variant === "shared" &&
                      (canEdit ? (
                        <select
                          value={item.assigneeId ?? ""}
                          disabled={pending}
                          onChange={(e) =>
                            run(() =>
                              updatePackingItem(item.id, {
                                assigneeId: e.target.value || null,
                              }),
                            )
                          }
                          aria-label={`Who's bringing ${item.name}`}
                          className="max-w-[9rem] rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600 outline-none transition-colors focus:border-pine disabled:opacity-60"
                        >
                          <option value="">Unclaimed</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-stone-400">
                          {item.assignee?.name ?? "—"}
                        </span>
                      ))}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => run(() => deletePackingItem(item.id))}
                        disabled={pending}
                        aria-label={`Delete ${item.name}`}
                        className="rounded-full p-1.5 text-stone-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
