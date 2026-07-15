"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Pencil, Trash2 } from "lucide-react";

import {
  createPackingTemplate,
  deletePackingTemplate,
  importPackingTemplate,
  updatePackingTemplate,
} from "@/actions/packing-templates";
import { TemplateDialog } from "@/components/packing/TemplateDialog";
import { CATEGORY_LABELS } from "@/lib/packing";
import type { PackingTemplateInput, PackingTemplateSummary } from "@/types";

/** Item rows shown on a collapsed template card. */
const PREVIEW_COUNT = 6;

/**
 * The trip's packing templates: built-ins plus custom ones. Any member can
 * import a template into their personal checklist; OWNER/EDITOR members can
 * copy a built-in into an editable custom template, and edit or delete
 * custom ones (built-ins are permanent).
 */
export function TemplateList({
  tripId,
  templates,
  canEdit,
  onImported,
}: {
  tripId: string;
  templates: PackingTemplateSummary[];
  canEdit: boolean;
  onImported: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<PackingTemplateSummary | null>(null);
  const router = useRouter();

  function importTemplate(template: PackingTemplateSummary) {
    startTransition(async () => {
      const result = await importPackingTemplate(tripId, template.id);
      if (!result.success) {
        window.alert(result.error);
        return;
      }
      router.refresh();
      onImported();
    });
  }

  function copyToCustom(template: PackingTemplateSummary) {
    startTransition(async () => {
      const result = await createPackingTemplate(tripId, {
        name: `${template.name} (Copy)`,
        items: template.items,
      });
      if (!result.success) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  function remove(template: PackingTemplateSummary) {
    if (!window.confirm(`Delete the "${template.name}" template?`)) return;
    startTransition(async () => {
      const result = await deletePackingTemplate(template.id);
      if (!result.success) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function saveEdit(input: PackingTemplateInput) {
    if (!editing) return { success: false as const, error: "No template selected." };
    const result = await updatePackingTemplate(editing.id, input);
    if (result.success) router.refresh();
    return result;
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {templates.map((template) => {
          const isExpanded = !!expanded[template.id];
          const visibleItems = isExpanded
            ? template.items
            : template.items.slice(0, PREVIEW_COUNT);
          return (
            <div
              key={template.id}
              className="flex flex-col rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">
                  {template.name}
                </h3>
                {!template.builtin && canEdit && (
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => setEditing(template)}
                      disabled={pending}
                      aria-label={`Edit template ${template.name}`}
                      className="rounded-full p-1.5 text-stone-300 transition-colors hover:bg-stone-100 hover:text-ink disabled:opacity-50"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(template)}
                      disabled={pending}
                      aria-label={`Delete template ${template.name}`}
                      className="rounded-full p-1.5 text-stone-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                {template.builtin ? "Built-in" : "Custom"} ·{" "}
                {template.items.length} items
              </p>

              <ul className="mb-4 flex-1 space-y-0.5">
                {visibleItems.map((item, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-sm">
                    <span className="text-ink">{item.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-stone-400">
                      {CATEGORY_LABELS[item.category]}
                    </span>
                  </li>
                ))}
                {template.items.length > PREVIEW_COUNT && (
                  <li>
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((e) => ({
                          ...e,
                          [template.id]: !isExpanded,
                        }))
                      }
                      className="text-xs font-medium text-pine transition-colors hover:text-pine-dark"
                    >
                      {isExpanded
                        ? "See less"
                        : `+${template.items.length - PREVIEW_COUNT} more`}
                    </button>
                  </li>
                )}
              </ul>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => importTemplate(template)}
                  disabled={pending}
                  className="flex items-center justify-center gap-2 rounded-full border border-pine px-4 py-2 text-sm font-medium text-pine transition-colors hover:bg-pine-soft disabled:opacity-60"
                >
                  <Download size={15} />
                  Import to Personal
                </button>
                {template.builtin && canEdit && (
                  <button
                    type="button"
                    onClick={() => copyToCustom(template)}
                    disabled={pending}
                    className="flex items-center justify-center gap-2 rounded-full border border-stone-200 px-4 py-2 text-sm font-medium text-stone-500 transition-colors hover:border-stone-300 hover:text-ink disabled:opacity-60"
                  >
                    <Copy size={15} />
                    Copy to Custom
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <TemplateDialog
          title="Edit template"
          submitLabel="Save changes"
          pendingLabel="Saving…"
          initialName={editing.name}
          initialItems={editing.items}
          onSubmit={saveEdit}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
