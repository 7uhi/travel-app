"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarCheck } from "lucide-react";

import { setMyAvailability, setTripDates } from "@/actions/availability";
import { Avatar } from "@/components/Avatar";
import { dailyCounts } from "@/lib/availability";
import { formatDateRange } from "@/lib/format";
import type { TripAvailability, TripMemberWithUser } from "@/types";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * The date-picking poll shown in place of the itinerary while a trip has no
 * dates: a heatmap calendar where each member toggles their available days,
 * ranked window suggestions, and (for the owner) confirming the trip dates.
 */
export function AvailabilityPlanner({
  tripId,
  availability,
  members,
  currentUserId,
  isOwner,
}: {
  tripId: string;
  availability: TripAvailability;
  members: TripMemberWithUser[];
  currentUserId: string | null;
  isOwner: boolean;
}) {
  const { windowStart, windowEnd, entries, suggestions } = availability;

  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);
  const [saving, startSaving] = useTransition();
  const [settingDates, startSettingDates] = useTransition();

  const savedMine = useMemo(
    () =>
      new Set(
        entries.filter((e) => e.userId === currentUserId).map((e) => e.date),
      ),
    [entries, currentUserId],
  );
  const mine = draft ?? savedMine;
  const dirty =
    draft !== null &&
    (draft.size !== savedMine.size || [...draft].some((d) => !savedMine.has(d)));

  const counts = useMemo(() => dailyCounts(entries), [entries]);
  const months = useMemo(
    () =>
      windowStart && windowEnd ? buildMonths(windowStart, windowEnd) : [],
    [windowStart, windowEnd],
  );

  if (!windowStart || !windowEnd) {
    return (
      <p className="rounded-2xl border border-stone-200/80 bg-white p-5 text-sm text-stone-500">
        This trip has no dates and no availability window — it can't be
        scheduled from here.
      </p>
    );
  }

  function toggle(iso: string) {
    if (!currentUserId || saving) return;
    setError(null);
    const next = new Set(draft ?? savedMine);
    if (next.has(iso)) {
      next.delete(iso);
    } else {
      next.add(iso);
    }
    setDraft(next);
  }

  function save() {
    if (!draft) return;
    setError(null);
    startSaving(async () => {
      const result = await setMyAvailability(tripId, [...draft]);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDraft(null);
    });
  }

  function confirmDates() {
    if (!confirming) return;
    setError(null);
    startSettingDates(async () => {
      const result = await setTripDates(
        tripId,
        confirming.startDate,
        confirming.endDate,
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      // revalidatePath flips the page into the scheduled dashboard.
      setConfirming(null);
    });
  }

  return (
    <div className="space-y-4">
      {/* Calendar */}
      <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
            Tap the days you're free
          </p>
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <span className="h-3 w-3 rounded bg-pine/20" />
            <span className="h-3 w-3 rounded bg-pine/60" />
            <span className="h-3 w-3 rounded bg-pine" />
            <span>more of the group is free</span>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {months.map((month) => (
            <div key={month.key}>
              <p className="mb-2 text-sm font-medium">{month.label}</p>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w, i) => (
                  <span
                    key={`${w}-${i}`}
                    className="pb-1 text-center text-[10px] font-semibold text-stone-400"
                  >
                    {w}
                  </span>
                ))}
                {month.cells.map((iso, i) => {
                  if (iso === null) return <span key={`pad-${i}`} />;
                  const inWindow = iso >= windowStart && iso <= windowEnd;
                  if (!inWindow) {
                    return (
                      <span
                        key={iso}
                        className="flex h-9 items-center justify-center rounded-lg text-xs text-stone-300"
                      >
                        {dayOfMonth(iso)}
                      </span>
                    );
                  }
                  const count = counts.get(iso) ?? 0;
                  const selected = mine.has(iso);
                  const heat = count / Math.max(members.length, 1);
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => toggle(iso)}
                      disabled={!currentUserId}
                      aria-pressed={selected}
                      title={`${count} of ${members.length} free`}
                      className={`flex h-9 items-center justify-center rounded-lg text-xs tabular-nums transition-[box-shadow,background-color] hover:ring-1 hover:ring-pine/50 ${
                        heat > 0.6 ? "text-white" : "text-ink"
                      } ${selected ? "font-bold ring-2 ring-inset ring-clay" : ""}`}
                      style={{
                        backgroundColor:
                          count > 0
                            ? `color-mix(in srgb, var(--color-pine) ${Math.round(heat * 100)}%, var(--color-pine-soft))`
                            : "var(--color-cream)",
                      }}
                    >
                      {dayOfMonth(iso)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-stone-500">
            {mine.size} {mine.size === 1 ? "day" : "days"} marked
            <span className="text-stone-400"> · outlined days are yours</span>
          </p>
          {dirty && (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-full bg-pine px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-dark disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save availability"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid items-start gap-4 sm:grid-cols-2">
        {/* Suggested windows */}
        <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
            Best windows
          </p>
          {suggestions.length === 0 ? (
            <p className="text-sm text-stone-500">
              Suggestions appear once people mark their availability.
            </p>
          ) : (
            <ul className="space-y-4">
              {suggestions.map((s) => (
                <li key={s.startDate} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {formatDateRange(s.startDate, s.endDate)}
                    </span>
                    <span className="shrink-0 text-xs text-stone-500">
                      {s.availableUserIds.length} of {members.length} free
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="flex -space-x-1.5">
                      {s.availableUserIds.map((id) => {
                        const user = members.find((m) => m.userId === id)?.user;
                        return (
                          <Avatar
                            key={id}
                            name={user?.name ?? null}
                            image={user?.image}
                            size={22}
                          />
                        );
                      })}
                    </span>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setConfirming({
                            startDate: s.startDate,
                            endDate: s.endDate,
                          });
                        }}
                        className="rounded-full border border-pine px-3 py-1 text-xs font-medium text-pine transition-colors hover:bg-pine-soft"
                      >
                        Use these dates
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {isOwner && confirming && (
            <div className="mt-4 rounded-xl bg-pine-soft p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                <CalendarCheck size={15} className="shrink-0 text-pine" />
                Set {formatDateRange(confirming.startDate, confirming.endDate)}?
              </p>
              <p className="mt-1 text-xs text-stone-600">
                This creates the day-by-day itinerary and closes the poll. It
                can't be undone from the app.
              </p>
              <div className="mt-2.5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  disabled={settingDates}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDates}
                  disabled={settingDates}
                  className="rounded-full bg-pine px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-pine-dark disabled:opacity-60"
                >
                  {settingDates ? "Setting…" : "Confirm dates"}
                </button>
              </div>
            </div>
          )}

          {isOwner && !confirming && (
            <form
              className="mt-4 border-t border-stone-100 pt-4"
              action={(formData) => {
                setError(null);
                setConfirming({
                  startDate: String(formData.get("startDate") ?? ""),
                  endDate: String(formData.get("endDate") ?? ""),
                });
              }}
            >
              <p className="mb-2 text-xs font-medium text-stone-500">
                Or pick the dates yourself
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  name="startDate"
                  type="date"
                  required
                  aria-label="Start date"
                  className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-pine"
                />
                <input
                  name="endDate"
                  type="date"
                  required
                  aria-label="End date"
                  className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-pine"
                />
                <button
                  type="submit"
                  className="rounded-full border border-pine px-3 py-1.5 text-xs font-medium text-pine transition-colors hover:bg-pine-soft"
                >
                  Review
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Who's responded */}
        <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
            Who's responded
          </p>
          <ul className="space-y-3">
            {members.map((member) => {
              const dayCount = entries.filter(
                (e) => e.userId === member.userId,
              ).length;
              return (
                <li
                  key={member.userId}
                  className="flex items-center gap-2.5 text-sm"
                >
                  <Avatar
                    name={member.user.name}
                    image={member.user.image}
                    size={26}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {member.user.name ?? "Someone"}
                    {member.userId === currentUserId && (
                      <span className="text-stone-400"> (you)</span>
                    )}
                  </span>
                  {dayCount > 0 ? (
                    <span className="text-xs font-medium text-pine">
                      {dayCount} {dayCount === 1 ? "day" : "days"}
                    </span>
                  ) : (
                    <span className="text-xs text-stone-400">no days yet</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calendar grid helpers (UTC dates only, Monday-first weeks)           */
/* ------------------------------------------------------------------ */

type MonthGrid = {
  key: string;
  label: string;
  /** Leading nulls pad to the first weekday; then one ISO string per day. */
  cells: (string | null)[];
};

function buildMonths(windowStartIso: string, windowEndIso: string): MonthGrid[] {
  const start = new Date(windowStartIso);
  const end = new Date(windowEndIso);
  const months: MonthGrid[] = [];
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
  );
  while (cursor <= end) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const mondayFirstOffset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const cells: (string | null)[] = Array.from(
      { length: mondayFirstOffset },
      () => null,
    );
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(new Date(Date.UTC(year, month, day)).toISOString());
    }
    months.push({
      key: `${year}-${month + 1}`,
      label: new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(cursor),
      cells,
    });
    cursor.setUTCMonth(month + 1);
  }
  return months;
}

function dayOfMonth(iso: string): number {
  return new Date(iso).getUTCDate();
}
