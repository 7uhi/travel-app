"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import {
  setTripAiSuggestions,
  type TripAiSettingView,
} from "@/actions/ai-settings";
import { FormError, secondaryButtonClass } from "@/components/ui/form";

/**
 * Per-trip AI suggestion control (owner-managed). Enabling is the consent
 * moment: the disclosure below states exactly what a provider would
 * receive, and the owner must explicitly confirm before it takes effect.
 * Dietary/accessibility notes are never included — this consent does not
 * cover them. Today generation runs on a local mock; enabling also records
 * consent for future external AI processing.
 */
export function AiSettingsPanel({
  tripId,
  setting,
}: {
  tripId: string;
  setting: TripAiSettingView;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(enabled: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setTripAiSuggestions(tripId, enabled, confirmed);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirmed(false);
      router.refresh();
    });
  }

  return (
    <section
      aria-label="AI suggestion settings"
      className="rounded-2xl border border-stone-200 bg-white p-5"
    >
      <h3 className="flex items-center gap-2 font-display text-xl">
        <Sparkles size={16} aria-hidden />
        AI suggestions
      </h3>
      <p className="mt-1 text-xs text-stone-500">
        {setting.suggestionsEnabled
          ? `Turned on${setting.enabledByName ? ` by ${setting.enabledByName}` : ""}.`
          : "Turned off for this trip."}{" "}
        Today this runs on a local mock — nothing leaves the server. Turning
        it on also records consent for future external AI processing.
      </p>

      <div className="mt-3 rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
        <p className="font-medium text-ink">What a provider would receive</p>
        <p className="mt-1">
          Destination, dates, budget, existing idea titles and vote counts,
          planned activity titles, and the group preference summary
          (including must-dos, deal-breakers, and conflicts).
        </p>
        <p className="mt-2">
          Never sent: dietary or accessibility notes, email addresses, invite
          links, expenses, packing lists, or who voted for what.
        </p>
      </div>

      {error && (
        <div className="mt-3">
          <FormError message={error} />
        </div>
      )}

      {setting.canManage &&
        (setting.suggestionsEnabled ? (
          <button
            type="button"
            onClick={() => apply(false)}
            disabled={pending}
            className={`${secondaryButtonClass} mt-4`}
          >
            {pending ? "Saving…" : "Turn off for this trip"}
          </button>
        ) : (
          <div className="mt-4">
            <label className="flex items-start gap-2 text-sm text-stone-600">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5"
              />
              I understand what trip information would be shared, and that
              dietary/accessibility notes are never included.
            </label>
            <button
              type="button"
              onClick={() => apply(true)}
              disabled={pending || !confirmed}
              className="mt-3 rounded-full bg-pine px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-dark disabled:opacity-50"
            >
              {pending ? "Saving…" : "Turn on for this trip"}
            </button>
          </div>
        ))}
      {!setting.canManage && (
        <p className="mt-3 text-xs text-stone-500">
          Only the trip owner can change this.
        </p>
      )}
    </section>
  );
}
