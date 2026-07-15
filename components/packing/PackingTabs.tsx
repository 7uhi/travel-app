"use client";

import { useState } from "react";

import { AddPackingItemButton } from "@/components/packing/AddPackingItemButton";
import { PackingList } from "@/components/packing/PackingList";
import type { PackingItemWithAssignee } from "@/types";

interface Member {
  id: string;
  name: string;
}

type Tab = "personal" | "shared";

/**
 * Subtabs switching between the member's private personal checklist and the
 * trip's shared one, each with its own add button and packed-progress count.
 * Personal items are always editable by their owner; the shared list keeps
 * the OWNER/EDITOR gate.
 */
export function PackingTabs({
  tripId,
  personalItems,
  sharedItems,
  members,
  canEditShared,
}: {
  tripId: string;
  personalItems: PackingItemWithAssignee[];
  sharedItems: PackingItemWithAssignee[];
  members: Member[];
  canEditShared: boolean;
}) {
  const [tab, setTab] = useState<Tab>("personal");

  const items = tab === "personal" ? personalItems : sharedItems;
  const packedCount = items.filter((item) => item.packed).length;
  const canEdit = tab === "personal" || canEditShared;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Packing lists"
          className="flex rounded-full bg-stone-100 p-1"
        >
          {(
            [
              ["personal", "Personal", personalItems],
              ["shared", "Shared", sharedItems],
            ] as const
          ).map(([key, label, tabItems]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === key
                  ? "bg-white text-ink shadow-sm"
                  : "text-stone-500 hover:text-ink"
              }`}
            >
              {label}
              <span className="ml-1.5 text-xs text-stone-400">
                {tabItems.length}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {items.length > 0 && (
            <span className="text-sm text-stone-500">
              {packedCount} of {items.length} packed
            </span>
          )}
          {canEdit && (
            <AddPackingItemButton
              key={tab}
              tripId={tripId}
              members={members}
              personal={tab === "personal"}
            />
          )}
        </div>
      </div>

      <PackingList
        items={items}
        members={members}
        canEdit={canEdit}
        variant={tab}
      />
    </div>
  );
}
