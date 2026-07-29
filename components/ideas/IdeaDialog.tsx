"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";

import {
  addIdea,
  deleteIdea,
  updateIdea,
  type ActivityIdeaInput,
} from "@/actions/activity-ideas";
import type { ActivityIdeaWithVotes } from "@/types";

/** Create/edit dialog for an activity idea. Create mode when `idea` is null. */
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={idea ? "Edit idea" : "Add an idea"}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl">
            {idea ? "Edit idea" : "Add idea"}
          </h2>
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
          <Field label="Title">
            <input
              name="title"
              required
              maxLength={80}
              defaultValue={idea?.title ?? ""}
              placeholder="Sunset kayak tour"
              className={inputClass}
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

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

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
                {pending ? "Saving…" : idea ? "Save changes" : "Add idea"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
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
