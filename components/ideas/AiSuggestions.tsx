"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";

import { addIdea } from "@/actions/activity-ideas";
import { suggestActivityIdeas } from "@/actions/ai-suggestions";
import { FormError, secondaryButtonClass } from "@/components/ui/form";
import type { AiSuggestionWithConfidence } from "@/lib/ai/schemas";

/**
 * Mock-powered suggestion preview. Rendered only when AI_SUGGESTIONS_ENABLED=1
 * (see the Ideas page). Suggestions are read-only until a human applies one:
 * applying calls the existing addIdea action, so the OWNER/EDITOR gate and
 * field validation run exactly as for a hand-typed idea.
 */
export function AiSuggestions({
  tripId,
  canApply,
}: {
  tripId: string;
  canApply: boolean;
}) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<AiSuggestionWithConfidence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [applying, setApplying] = useState<string | null>(null);

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await suggestActivityIdeas(tripId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSuggestions(result.data.suggestions);
    });
  }

  function apply(suggestion: AiSuggestionWithConfidence) {
    setApplying(suggestion.title);
    startTransition(async () => {
      const result = await addIdea(tripId, {
        title: suggestion.title,
        description: suggestion.description,
        locationName: suggestion.locationName,
      });
      setApplying(null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSuggestions((current) =>
        current === null
          ? current
          : current.filter((item) => item.title !== suggestion.title),
      );
      router.refresh();
    });
  }

  return (
    <section
      aria-label="Suggested ideas preview"
      className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-white/60 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-lg">
            <Sparkles size={16} aria-hidden />
            Suggested ideas
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">
              Preview
            </span>
          </h3>
          <p className="mt-1 text-xs text-stone-500">
            Mock suggestions for review — nothing is added until you apply it.
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className={secondaryButtonClass}
        >
          {pending
            ? "Thinking…"
            : suggestions === null
              ? "Suggest ideas"
              : "Suggest again"}
        </button>
      </div>

      {error && (
        <div className="mt-3">
          <FormError message={error} />
        </div>
      )}

      {suggestions !== null && suggestions.length === 0 && !error && (
        <p className="mt-3 text-sm text-stone-500">
          No suggestions right now — answer the trip preferences and try again.
        </p>
      )}

      {suggestions !== null && suggestions.length > 0 && (
        <ul className="mt-4 space-y-2">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.title}
              className="flex items-start justify-between gap-3 rounded-xl bg-white p-3 shadow-sm"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {suggestion.title}{" "}
                  <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 align-middle text-[11px] font-medium text-stone-500">
                    {suggestion.confidence === "grounded"
                      ? "From trip details"
                      : "Estimate — verify locally"}
                  </span>
                </p>
                {suggestion.reason && (
                  <p className="mt-0.5 text-xs text-stone-500">
                    {suggestion.reason}
                  </p>
                )}
              </div>
              {canApply && (
                <button
                  type="button"
                  onClick={() => apply(suggestion)}
                  disabled={pending || applying !== null}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-pine px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-pine-dark disabled:opacity-50"
                >
                  <Plus size={14} aria-hidden />
                  {applying === suggestion.title ? "Adding…" : "Add as idea"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
