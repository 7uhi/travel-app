"use client";

import { useState } from "react";

import { AddPackingItemButton } from "@/components/packing/AddPackingItemButton";
import { CreateTemplateButton } from "@/components/packing/CreateTemplateButton";
import { PackingList } from "@/components/packing/PackingList";
import { TemplateList } from "@/components/packing/TemplateList";
import type { PackingItemWithAssignee, PackingTemplateSummary } from "@/types";

interface Member {
  id: string;
  name: string;
}

type Tab = "personal" | "shared" | "templates";

/**
 * Subtabs switching between the member's private personal checklist, the
 * trip's shared one, and importable packing templates. Personal items are
 * always editable by their owner; the shared list keeps the OWNER/EDITOR
 * gate (check-off is assignee-only); templates are importable by anyone and
 * creatable by OWNER/EDITOR.
 */
export function PackingTabs({
  tripId,
  personalItems,
  sharedItems,
  templates,
  members,
  canEditShared,
  currentUserId,
}: {
  tripId: string;
  personalItems: PackingItemWithAssignee[];
  sharedItems: PackingItemWithAssignee[];
  templates: PackingTemplateSummary[];
  members: Member[];
  canEditShared: boolean;
  currentUserId: string | null;
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
              ["personal", "Personal", personalItems.length],
              ["shared", "Shared", sharedItems.length],
              ["templates", "Templates", templates.length],
            ] as const
          ).map(([key, label, count]) => (
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
              <span className="ml-1.5 text-xs text-stone-400">{count}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {tab !== "templates" && items.length > 0 && (
            <span className="text-sm text-stone-500">
              {packedCount} of {items.length} packed
            </span>
          )}
          {tab === "templates"
            ? canEditShared && <CreateTemplateButton tripId={tripId} />
            : canEdit && (
                <AddPackingItemButton
                  key={tab}
                  tripId={tripId}
                  members={members}
                  personal={tab === "personal"}
                />
              )}
        </div>
      </div>

      {tab === "templates" ? (
        <TemplateList
          tripId={tripId}
          templates={templates}
          canEdit={canEditShared}
          onImported={() => setTab("personal")}
        />
      ) : (
        <PackingList
          items={items}
          members={members}
          canEdit={canEdit}
          variant={tab}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}
