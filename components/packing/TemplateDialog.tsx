"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";

import { Dialog } from "@/components/ui/Dialog";
import {
  FormError,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
import type { ActionResult } from "@/lib/action-result";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/packing";
import type {
  PackingCategory,
  PackingTemplateInput,
  PackingTemplateItem,
} from "@/types";

type Row = PackingTemplateItem;

const EMPTY_ROW: Row = { name: "", category: "OTHER" };

/**
 * Shared create/edit form for packing templates: a name plus rows of item
 * name + category. The caller supplies the submit action; on success the
 * dialog closes itself. Mounted only while open, so unmounting it is what
 * closes the Dialog.
 */
export function TemplateDialog({
  title,
  submitLabel,
  pendingLabel,
  initialName = "",
  initialItems = [],
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  pendingLabel: string;
  initialName?: string;
  initialItems?: PackingTemplateItem[];
  onSubmit: (input: PackingTemplateInput) => Promise<ActionResult<unknown>>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState<Row[]>(
    initialItems.length > 0
      ? initialItems
      : [EMPTY_ROW, EMPTY_ROW, EMPTY_ROW],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    onClose();
  }

  function setRow(index: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await onSubmit({
        name,
        items: rows.filter((r) => r.name.trim().length > 0),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open onClose={close} title={title} size="xl">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className={`${labelClass} mb-1.5`}>Template name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            placeholder="Ski Weekend"
            className={`${inputClass} w-full`}
            data-autofocus
          />
        </label>

        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className={`${labelClass} min-w-0 flex-1`}>Item</span>
            <span className={`${labelClass} w-32 shrink-0`}>Category</span>
            {/* Spacer matching the remove button so the headers line up. */}
            <span className="w-7 shrink-0" aria-hidden />
          </div>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={row.name}
                  onChange={(e) => setRow(i, { name: e.target.value })}
                  maxLength={80}
                  placeholder={i === 0 ? "Ski goggles" : "Item"}
                  aria-label={`Item ${i + 1} name`}
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <select
                  value={row.category}
                  onChange={(e) =>
                    setRow(i, {
                      category: e.target.value as PackingCategory,
                    })
                  }
                  aria-label={`Item ${i + 1} category`}
                  className={`${inputClass} w-32 shrink-0`}
                >
                  {CATEGORY_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setRows((rs) => rs.filter((_, j) => j !== i))
                  }
                  disabled={rows.length === 1}
                  aria-label={`Remove item ${i + 1}`}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, EMPTY_ROW])}
            className="mt-2 flex items-center gap-1.5 text-sm font-medium text-pine transition-colors hover:text-pine-dark"
          >
            <Plus size={14} />
            Add another item
          </button>
        </div>

        <FormError message={error} />

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={close} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? pendingLabel : submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/* The shared inputClass minus its w-full — each use site sets its own width
   (w-full / flex-1 / w-32), and Tailwind resolves conflicting width
   utilities by stylesheet order, not class order, so a baked-in w-full
   would unpredictably win. */
const inputClass =
  "rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-pine focus-visible:ring-2 focus-visible:ring-pine/30";

const labelClass =
  "block text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500";
