"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { addPackingItem } from "@/actions/packing";
import { Dialog } from "@/components/ui/Dialog";
import {
  Field,
  FormError,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
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

      <Dialog open={open} onClose={close} title="Add item">
        <form action={submit} className="space-y-4">
          <Field label="Item">
            <input
              name="name"
              required
              maxLength={80}
              placeholder="Sunscreen"
              className={inputClass}
              data-autofocus
            />
          </Field>

          <div className={personal ? undefined : "grid grid-cols-2 gap-4"}>
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

          <FormError message={error} />

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={close} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={pending} className={primaryButtonClass}>
              {pending ? "Adding…" : "Add item"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
