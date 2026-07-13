"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deletePackingItem, updatePackingItem } from "@/actions/packing";
import type { ActionResult } from "@/lib/action-result";
import { groupByCategory } from "@/lib/packing";
import type { PackingItemWithAssignee } from "@/types";

interface Member {
  id: string;
  name: string;
}

/**
 * The shared list of things to bring, grouped by category. OWNER/EDITOR
 * members can reassign who's bringing each item and delete them; VIEWERs see
 * a read-only list.
 */
export function PackingList({
  items,
  members,
  canEdit,
}: {
  items: PackingItemWithAssignee[];
  members: Member[];
  canEdit: boolean;
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
          {canEdit
            ? "Add your first item to start the packing list."
            : "No packing items yet."}
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.category}>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                {group.label}
              </h3>
              <ul className="divide-y divide-stone-100">
                {group.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-2">
                    <span className="flex-1 text-sm text-ink">{item.name}</span>

                    {canEdit ? (
                      <>
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
                        <button
                          type="button"
                          onClick={() => run(() => deletePackingItem(item.id))}
                          disabled={pending}
                          aria-label={`Delete ${item.name}`}
                          className="rounded-full p-1.5 text-stone-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-stone-400">
                        {item.assignee?.name ?? "—"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
