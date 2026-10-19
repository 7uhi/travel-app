import { SetDestinationButton } from "@/components/trip/SetDestinationButton";
import {
  INTEREST_EMOJI,
  INTEREST_LABELS,
} from "@/lib/preference-questions";
import type {
  GroupProfile,
  GroupTripPreference,
} from "@/lib/preferences";

const REGION_LABELS: Record<string, string> = {
  ANYWHERE: "Anywhere",
  DOMESTIC: "Domestic",
  EUROPE: "Europe",
  ASIA: "Asia",
  AFRICA: "Africa",
  NORTH_AMERICA: "North America",
  SOUTH_AMERICA: "South America",
  OCEANIA: "Oceania",
};

const CLIMATE_LABELS: Record<string, string> = {
  WARM: "Warm",
  MILD: "Mild",
  COLD: "Cold",
  NO_PREFERENCE: "Any weather",
};

/**
 * What the group agrees on. Budget shows the lowest tier anyone chose, because
 * it's a constraint rather than a taste — a plan above it leaves someone out.
 */
export function GroupConsensusPanel({
  group,
  groupTrip,
  memberCount,
  destinationUndecided,
  setDestinationFor = null,
}: {
  group: GroupProfile;
  groupTrip: GroupTripPreference;
  memberCount: number;
  destinationUndecided: boolean;
  /** Set when the viewer may edit the trip, so they can act on the answers. */
  setDestinationFor?: { tripId: string; title: string } | null;
}) {
  const liked = group.interests.filter((i) => !i.vetoed && i.score > 0);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <h3 className="font-display text-xl">What the group agrees on</h3>
      <p className="mt-1 text-xs text-stone-500">
        {group.answeredCount} of {memberCount} answered
      </p>

      {group.answeredCount === 0 ? (
        <p className="mt-4 text-sm text-stone-500">
          Nobody has answered yet. Once a couple of people do, the shared
          picture shows up here.
        </p>
      ) : (
        <>
          {liked.length > 0 && (
            <ul className="mt-4 space-y-2">
              {liked.slice(0, 5).map((interest) => (
                <li
                  key={interest.tag}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-ink">
                    {INTEREST_EMOJI[interest.tag]}{" "}
                    {INTEREST_LABELS[interest.tag]}
                  </span>
                  <span className="shrink-0 text-xs text-stone-500">
                    {describeSupport(interest.voterCount, interest.vetoCount)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {group.interests.some((i) => i.vetoed) && (
            <p className="mt-3 text-xs text-stone-500">
              Keep off the plan:{" "}
              {group.interests
                .filter((i) => i.vetoed)
                .map((i) => INTEREST_LABELS[i.tag])
                .join(", ")}
            </p>
          )}

          <dl className="mt-4 space-y-1.5 border-t border-stone-100 pt-4 text-sm">
            {group.pace && <Row label="Pace">{group.pace}</Row>}
            {group.budgetTier && (
              <Row label="Budget ceiling">
                {group.budgetTier}{" "}
                <span className="whitespace-nowrap text-stone-500">
                  (lowest answer)
                </span>
              </Row>
            )}
            {group.lodgingStyle && <Row label="Lodging">{group.lodgingStyle}</Row>}
          </dl>

          {(group.dietary.length > 0 || group.accessibility.length > 0) && (
            <div className="mt-4 rounded-xl bg-stone-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                Must be respected
              </p>
              {group.dietary.map((note) => (
                <p key={note.userId} className="mt-1.5 text-sm text-ink">
                  🍽️ {note.note}
                </p>
              ))}
              {group.accessibility.map((note) => (
                <p key={note.userId} className="mt-1.5 text-sm text-ink">
                  ♿ {note.note}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      {destinationUndecided && (
        <div className="mt-4 border-t border-stone-100 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
            Where to go
          </p>
          {groupTrip.answeredCount === 0 ? (
            <p className="mt-2 text-sm text-stone-500">
              No one has said where they&apos;re up for going yet.
            </p>
          ) : groupTrip.regions.length === 0 ? (
            <p className="mt-2 text-sm text-stone-600">
              No single region works for the whole group yet — worth talking
              about before picking a place.
            </p>
          ) : (
            <dl className="mt-2 space-y-1.5 text-sm">
              <Row label="Region">
                {groupTrip.regions
                  .map((region) => REGION_LABELS[region] ?? region)
                  .join(" / ")}
              </Row>
              {groupTrip.climates.length > 0 && (
                <Row label="Climate">
                  {groupTrip.climates
                    .map((climate) => CLIMATE_LABELS[climate] ?? climate)
                    .join(" / ")}
                </Row>
              )}
              {groupTrip.maxTravelHours !== null && (
                <Row label="Max travel">
                  {groupTrip.maxTravelHours}h{" "}
                  <span className="whitespace-nowrap text-stone-500">
                    (strictest answer)
                  </span>
                </Row>
              )}
            </dl>
          )}
          {setDestinationFor && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 p-3">
              <p className="text-xs text-stone-600">
                Agreed on a place? Set it so the plan can start.
              </p>
              <SetDestinationButton
                tripId={setDestinationFor.tripId}
                title={setDestinationFor.title}
                tone="panel"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** "3 love this, 1 would skip" — keeps both sides of the score visible. */
function describeSupport(voterCount: number, vetoCount: number): string {
  const keen = voterCount - vetoCount;
  if (vetoCount === 0) return `${keen} into it`;
  return `${keen} into it, ${vetoCount} would skip`;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}
