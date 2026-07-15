"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { createPackingTemplate } from "@/actions/packing-templates";
import { TemplateDialog } from "@/components/packing/TemplateDialog";
import type { PackingTemplateInput } from "@/types";

/** "New template" button opening the shared template dialog. */
export function CreateTemplateButton({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function create(input: PackingTemplateInput) {
    const result = await createPackingTemplate(tripId, input);
    if (result.success) router.refresh();
    return result;
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
        <TemplateDialog
          title="New template"
          submitLabel="Create template"
          pendingLabel="Creating…"
          onSubmit={create}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
