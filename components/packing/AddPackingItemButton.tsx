"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { addPackingItem } from "@/actions/packing";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/packing";
import type { PackingCategory } from "@/types";

interface Member {
  id: string;
  name: string;
}

/** "Add item" dialog: name, category, and (for shared items) an optional
 * assignee. With `personal`, the item goes on the caller's private list. */
export function AddPackingItemButton({
  tripId,
  members,
  personal = false,
}: {
  tripId: string;
  members: Member[];
  personal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const assigneeId = String(formData.get("assigneeId") ?? "");
      const result = await addPackingItem(tripId, {
        name: String(formData.get("name") ?? ""),
        category: String(
          formData.get("category") ?? "OTHER",
        ) as PackingCategory,
        assigneeId: assigneeId || null,
        personal,
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
        Add item
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add a packing item"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-2xl">Add item</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <form action={submit} className="space-y-4">
              <Field label="Item">
                <input
                  name="name"
                  required
                  maxLength={80}
                  placeholder="Sunscreen"
                  autoFocus
                  className={inputClass}
                />
              </Field>

              <div
                className={
                  personal ? undefined : "grid grid-cols-2 gap-4"
                }
              >
                <Field label="Category">
                  <select name="category" defaultValue="OTHER" className={inputClass}>
                    {CATEGORY_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </Field>
                {!personal && (
                  <Field label="Who's bringing it">
                    <select name="assigneeId" defaultValue="" className={inputClass}>
                      <option value="">Unclaimed</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
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
                  {pending ? "Adding…" : "Add item"}
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
  "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-pine";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        {label}
      </span>
      {children}
    </label>
  );
}
