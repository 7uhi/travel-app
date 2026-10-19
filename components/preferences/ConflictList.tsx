import { AlertTriangle, Info } from "lucide-react";

import { INTEREST_LABELS } from "@/lib/preference-questions";
import type { PreferenceConflict } from "@/lib/preferences";
import type { InterestTag } from "@/types";

/**
 * Where the group genuinely disagrees, most severe first. Surfacing this
 * before the trip is the point — it's cheaper to settle now than on day three.
 */
export function ConflictList({
  conflicts,
  names,
}: {
  conflicts: PreferenceConflict[];
  /** userId → display name, for naming who sits on each side. */
  names: Map<string, string>;
}) {
  if (conflicts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-clay/30 bg-clay/5 p-5">
      <h3 className="font-display text-xl">Worth talking about</h3>
      <ul className="mt-4 space-y-3">
        {conflicts.map((conflict) => (
          <li
            key={`${conflict.kind}-${conflict.tag ?? ""}`}
            className="flex items-start gap-3"
          >
            <span className="mt-0.5 shrink-0 text-clay">
              {conflict.severity === 2 ? (
                <AlertTriangle size={16} />
              ) : (
                <Info size={16} />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {title(conflict)}
              </p>
              <p className="text-xs text-stone-600">
                {conflict.summary} —{" "}
                {sideNames(conflict.forUserIds, names)} vs{" "}
                {sideNames(conflict.againstUserIds, names)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function title(conflict: PreferenceConflict): string {
  switch (conflict.kind) {
    case "interest":
      return INTEREST_LABELS[conflict.tag as InterestTag] ?? "An activity";
    case "pace":
      return "How packed the days are";
    case "budget":
      return "How much to spend";
    case "dayRhythm":
      return "Early starts vs late nights";
  }
}

function sideNames(userIds: string[], names: Map<string, string>): string {
  return userIds.map((id) => names.get(id) ?? "someone").join(", ");
}
