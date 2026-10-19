"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { updatePackingItem } from "@/actions/packing";
import { Dialog } from "@/components/ui/Dialog";
import {
  Field,
  FormError,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/packing";
import type { PackingCategory, PackingItemWithAssignee } from "@/types";

/** Pencil button opening an edit dialog for an item's name and category.
 * (Assignee changes stay on the row's inline select.) */
export function EditPackingItemButton({
  item,
}: {
  item: PackingItemWithAssignee;
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
      const result = await updatePackingItem(item.id, {
        name: String(formData.get("name") ?? ""),
        category: String(
          formData.get("category") ?? item.category,
        ) as PackingCategory,
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
        aria-label={`Edit ${item.name}`}
        className="rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-ink"
      >
        <Pencil size={15} />
      </button>

      <Dialog open={open} onClose={close} title="Edit item">
        <form action={submit} className="space-y-4">
          <Field label="Item">
            <input
              name="name"
              required
              maxLength={80}
              defaultValue={item.name}
              className={inputClass}
              data-autofocus
            />
          </Field>

          <Field label="Category">
            <select
              name="category"
              defaultValue={item.category}
              className={inputClass}
            >
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>

          <FormError message={error} />

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={close} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={pending} className={primaryButtonClass}>
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
