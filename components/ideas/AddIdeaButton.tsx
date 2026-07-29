"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { IdeaDialog } from "@/components/ideas/IdeaDialog";

/** Opens the idea dialog in create mode. Rendered for OWNER/EDITOR only. */
export function AddIdeaButton({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full bg-pine px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-dark"
      >
        <Plus size={16} />
        Add idea
      </button>
      {open && (
        <IdeaDialog tripId={tripId} idea={null} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
