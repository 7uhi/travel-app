"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";

import {
  deletePackingTemplate,
  importPackingTemplate,
} from "@/actions/packing-templates";
import { CATEGORY_LABELS } from "@/lib/packing";
import type { PackingTemplateSummary } from "@/types";

/**
 * The trip's packing templates: built-ins plus custom ones. Any member can
 * import a template into their personal checklist; OWNER/EDITOR members can
 * delete custom templates (built-ins are permanent).
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

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {templates.map((template) => (
        <div
          key={template.id}
          className="flex flex-col rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]"
        >
          <div className="mb-1 flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">{template.name}</h3>
            {!template.builtin && canEdit && (
              <button
                type="button"
                onClick={() => remove(template)}
                disabled={pending}
                aria-label={`Delete template ${template.name}`}
                className="rounded-full p-1.5 text-stone-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
            {template.builtin ? "Built-in" : "Custom"} ·{" "}
            {template.items.length} items
          </p>

          <ul className="mb-4 flex-1 space-y-0.5">
            {template.items.slice(0, 6).map((item, i) => (
              <li key={i} className="flex items-baseline gap-2 text-sm">
                <span className="text-ink">{item.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-stone-400">
                  {CATEGORY_LABELS[item.category]}
                </span>
              </li>
            ))}
            {template.items.length > 6 && (
              <li className="text-xs text-stone-400">
                +{template.items.length - 6} more
              </li>
            )}
          </ul>

          <button
            type="button"
            onClick={() => importTemplate(template)}
            disabled={pending}
            className="flex items-center justify-center gap-2 rounded-full border border-pine px-4 py-2 text-sm font-medium text-pine transition-colors hover:bg-pine-soft disabled:opacity-60"
          >
            <Download size={15} />
            Import to Personal
          </button>
        </div>
      ))}
    </div>
  );
}
