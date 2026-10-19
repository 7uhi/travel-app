"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import {
  addIdea,
  deleteIdea,
  updateIdea,
  type ActivityIdeaInput,
} from "@/actions/activity-ideas";
import { Dialog } from "@/components/ui/Dialog";
import {
  Field,
  FormError,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
import type { ActivityIdeaWithVotes } from "@/types";

/**
 * Create/edit dialog for an activity idea. Create mode when `idea` is null.
 * Mounted only while open, so unmounting it is what closes the Dialog.
 */
export function IdeaDialog({
  tripId,
  idea,
  onClose,
}: {
  tripId: string;
  idea: ActivityIdeaWithVotes | null;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function close() {
    if (!pending) onClose();
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const text = (name: string) => {
        const v = String(formData.get(name) ?? "").trim();
        return v === "" ? null : v;
      };
      const num = (name: string) => {
        const v = String(formData.get(name) ?? "").trim();
        return v === "" ? null : Number(v);
      };

      const payload: ActivityIdeaInput = {
        title: String(formData.get("title") ?? ""),
        description: text("description"),
        locationName: text("locationName"),
        link: text("link"),
        estimatedCost: num("estimatedCost"),
      };

      const result = idea
        ? await updateIdea(idea.id, payload)
        : await addIdea(tripId, payload);

      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function handleDelete() {
    if (!idea) return;
    if (!window.confirm("Delete this idea? Votes will be removed too.")) return;
    startTransition(async () => {
      const result = await deleteIdea(idea.id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onClose={close} title={idea ? "Edit idea" : "Add idea"}>
      <form action={submit} className="space-y-4">
        <Field label="Title">
          <input
            name="title"
            required
            maxLength={80}
            defaultValue={idea?.title ?? ""}
            placeholder="Sunset kayak tour"
            className={inputClass}
            data-autofocus
          />
        </Field>

        <Field label="Description (optional)">
          <textarea
            name="description"
            rows={2}
            maxLength={500}
            defaultValue={idea?.description ?? ""}
            placeholder="Two-hour guided paddle along the coast."
            className={`${inputClass} resize-none`}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Location (optional)">
            <input
              name="locationName"
              maxLength={80}
              defaultValue={idea?.locationName ?? ""}
              placeholder="Lagos marina"
              className={inputClass}
            />
          </Field>
          <Field label="Est. cost (optional)">
            <input
              name="estimatedCost"
              type="number"
              min="0"
              step="0.01"
              defaultValue={idea?.estimatedCost ?? ""}
              placeholder="35.00"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Link (optional)">
          <input
            name="link"
            maxLength={500}
            defaultValue={idea?.link ?? ""}
            placeholder="getyourguide.com/lagos-kayak-tour"
            className={inputClass}
          />
        </Field>

        <FormError message={error} />

        <div className="flex items-center justify-between gap-3 pt-1">
          {idea ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 size={14} />
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <button type="button" onClick={close} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={pending} className={primaryButtonClass}>
              {pending ? "Saving…" : idea ? "Save changes" : "Add idea"}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
