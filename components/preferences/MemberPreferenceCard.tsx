import { Avatar } from "@/components/Avatar";
import { resolveEffectiveProfile } from "@/lib/preferences";
import {
  INTEREST_EMOJI,
  INTEREST_LABELS,
} from "@/lib/preference-questions";
import type { MemberPreferences } from "@/types";

const PACE_LABELS = {
  RELAXED: "Slow and easy",
  BALANCED: "A bit of both",
  PACKED: "Sees everything",
} as const;

const BUDGET_LABELS = {
  SHOESTRING: "Shoestring",
  MODERATE: "Moderate",
  COMFORT: "Comfortable",
  LUXURY: "Splurge",
} as const;

const RHYTHM_LABELS = {
  EARLY_BIRD: "Early bird",
  FLEXIBLE: "Flexible hours",
  NIGHT_OWL: "Night owl",
} as const;

/**
 * One member's answers. Hard constraints are labelled as group-visible because
 * they live on the durable profile and are shared with everyone on the trip.
 */
export function MemberPreferenceCard({
  member,
  isYou,
}: {
  member: MemberPreferences;
  isYou: boolean;
}) {
  const { trip } = member;
  const status = member.profile
    ? trip
      ? "Answered"
      : "Profile only"
    : "Not answered";

  // Show what applies on this trip, not the member's usual settings.
  const profile = member.profile
    ? resolveEffectiveProfile(member.profile, trip)
    : null;
  const overridden = Boolean(
    trip && (trip.budgetComfort !== null || trip.interests.length > 0),
  );

  const loved = (profile?.interests ?? [])
    .filter((interest) => interest.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
  const avoided = (profile?.interests ?? []).filter(
    (interest) => interest.weight < 0,
  );

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} image={member.image} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {member.name ?? "Member"}
            {isYou && <span className="text-stone-400"> (you)</span>}
          </p>
          <p className="text-xs text-stone-500">
            {status}
            {overridden && (
              <span className="text-stone-400"> · set for this trip</span>
            )}
          </p>
        </div>
      </div>

      {profile && (
        <>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {profile.pace && <Chip>{PACE_LABELS[profile.pace]}</Chip>}
            {profile.budgetTier && (
              <Chip>{BUDGET_LABELS[profile.budgetTier]}</Chip>
            )}
            {profile.dayRhythm && <Chip>{RHYTHM_LABELS[profile.dayRhythm]}</Chip>}
          </div>

          {loved.length > 0 && (
            <p className="mt-3 text-sm text-stone-600">
              {loved
                .map(
                  (interest) =>
                    `${INTEREST_EMOJI[interest.tag]} ${INTEREST_LABELS[interest.tag]}`,
                )
                .join(" · ")}
            </p>
          )}
          {avoided.length > 0 && (
            <p className="mt-1.5 text-xs text-stone-400">
              Would skip:{" "}
              {avoided.map((i) => INTEREST_LABELS[i.tag]).join(", ")}
            </p>
          )}

          {(profile.dietaryNotes || profile.accessibilityNotes) && (
            <div className="mt-4 rounded-xl bg-stone-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                Shared with everyone on this trip
              </p>
              {profile.dietaryNotes && (
                <p className="mt-1.5 text-sm text-ink">
                  🍽️ {profile.dietaryNotes}
                </p>
              )}
              {profile.accessibilityNotes && (
                <p className="mt-1 text-sm text-ink">
                  ♿ {profile.accessibilityNotes}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {trip && (trip.mustDo || trip.dealBreakers) && (
        <div className="mt-3 space-y-1 text-sm">
          {trip.mustDo && (
            <p className="text-stone-600">
              <span className="text-stone-400">Must do:</span> {trip.mustDo}
            </p>
          )}
          {trip.dealBreakers && (
            <p className="text-stone-600">
              <span className="text-stone-400">Deal-breaker:</span>{" "}
              {trip.dealBreakers}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-pine-soft px-2.5 py-1 text-xs font-medium text-pine-dark">
      {children}
    </span>
  );
}
