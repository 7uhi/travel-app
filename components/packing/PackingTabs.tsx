"use client";

import { useId, useState } from "react";

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

const TAB_ORDER: readonly Tab[] = ["personal", "shared", "templates"];

/**
 * Subtabs switching between the member's private personal checklist, the
 * trip's shared one, and importable packing templates. Personal items are
 * always editable by their owner; the shared list keeps the OWNER/EDITOR
 * gate (check-off is assignee-only); templates are importable by anyone and
 * creatable by OWNER/EDITOR.
 *
 * Follows the WAI-ARIA tabs pattern: the tablist is one Tab stop (roving
 * tabindex), arrow keys and Home/End move between tabs, and selection
 * follows focus — switching is instant client state, so there's no reason
 * to make keyboard users press Enter as well.
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
  const baseId = useId();
  const tabId = (key: Tab) => `${baseId}-tab-${key}`;
  const panelId = `${baseId}-panel`;

  const items = tab === "personal" ? personalItems : sharedItems;
  const packedCount = items.filter((item) => item.packed).length;
  const canEdit = tab === "personal" || canEditShared;

  function onTabKeyDown(event: React.KeyboardEvent) {
    const index = TAB_ORDER.indexOf(tab);
    const next = {
      ArrowRight: TAB_ORDER[(index + 1) % TAB_ORDER.length],
      ArrowLeft: TAB_ORDER[(index - 1 + TAB_ORDER.length) % TAB_ORDER.length],
      Home: TAB_ORDER[0],
      End: TAB_ORDER[TAB_ORDER.length - 1],
    }[event.key];
    if (!next) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(tabId(next))?.focus();
  }

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
              id={tabId(key)}
              type="button"
              role="tab"
              aria-selected={tab === key}
              // Only one panel is ever rendered, so only the selected tab
              // points at it; an idref to a missing element is invalid.
              aria-controls={tab === key ? panelId : undefined}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={onTabKeyDown}
              className={`rounded-full px-4 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-pine ${
                tab === key
                  ? "bg-white text-ink shadow-sm"
                  : "text-stone-600 hover:text-ink"
              }`}
            >
              {label}
              <span
                className={`ml-1.5 text-xs ${tab === key ? "text-stone-500" : "text-stone-600"}`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {tab !== "templates" && items.length > 0 && (
            <span className="text-sm text-stone-600">
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

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        // Focusable so the panel is reachable even when it holds no controls
        // (an empty or read-only list).
        tabIndex={0}
        className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-pine"
      >
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
    </div>
  );
}
