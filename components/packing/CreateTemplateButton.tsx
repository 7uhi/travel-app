"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { createPackingTemplate } from "@/actions/packing-templates";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/packing";
import type { PackingCategory, PackingTemplateItem } from "@/types";

type Row = PackingTemplateItem;

const EMPTY_ROW: Row = { name: "", category: "OTHER" };

/** "New template" dialog: a name plus rows of item name + category. */
export function CreateTemplateButton({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function close() {
    if (pending) return;
    setOpen(false);
    setName("");
    setRows([EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]);
    setError(null);
  }

  function setRow(index: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createPackingTemplate(tripId, {
        name,
        items: rows.filter((r) => r.name.trim().length > 0),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full bg-pine px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-dark"
      >
        <Plus size={16} />
        New template
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create a packing template"
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-2xl">New template</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className={labelClass}>Template name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={80}
                  placeholder="Ski Weekend"
                  autoFocus
                  className={inputClass}
                />
              </label>

              <div>
                <span className={labelClass}>Items</span>
                <div className="space-y-2">
                  {rows.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={row.name}
                        onChange={(e) => setRow(i, { name: e.target.value })}
                        maxLength={80}
                        placeholder={i === 0 ? "Ski goggles" : "Item"}
                        aria-label={`Item ${i + 1} name`}
                        className={`${inputClass} flex-1`}
                      />
                      <select
                        value={row.category}
                        onChange={(e) =>
                          setRow(i, {
                            category: e.target.value as PackingCategory,
                          })
                        }
                        aria-label={`Item ${i + 1} category`}
                        className={`${inputClass} w-36`}
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
                        className="rounded-full p-1.5 text-stone-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
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

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-full px-4 py-2 text-sm font-medium text-stone-500 transition-colors hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-full bg-pine px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-dark disabled:opacity-60"
                >
                  {pending ? "Creating…" : "Create template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const inputClass =
  "rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-pine w-full";

const labelClass =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500";
