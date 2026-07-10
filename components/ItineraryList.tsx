"use client";

import { useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";

import { formatCurrency, formatDayDate, formatTime } from "@/lib/format";
import type { Activity, TripDayWithActivities } from "@/types";

interface ItineraryListProps {
  days: TripDayWithActivities[];
  currency?: string;
}

export function ItineraryList({ days, currency = "EUR" }: ItineraryListProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (days.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-8 text-center text-sm text-stone-500">
        This trip has no days yet.
      </div>
    );
  }

  const allCollapsed = days.every((day) => collapsed[day.id]);

  function toggleDay(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAll() {
    setCollapsed(
      allCollapsed
        ? {}
        : Object.fromEntries(days.map((day) => [day.id, true])),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">
          {days.length} {days.length === 1 ? "day" : "days"} ·{" "}
          {days.reduce((n, day) => n + day.activities.length, 0)} activities
        </p>
        <button
          type="button"
          onClick={toggleAll}
          className="text-sm font-medium text-pine transition-colors hover:text-pine-dark"
        >
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
      </div>

      <ol className="space-y-4">
        {days.map((day, index) => (
          <DayCard
            key={day.id}
            day={day}
            dayNumber={index + 1}
            currency={currency}
            isCollapsed={Boolean(collapsed[day.id])}
            onToggle={() => toggleDay(day.id)}
          />
        ))}
      </ol>
    </div>
  );
}

function DayCard({
  day,
  dayNumber,
  currency,
  isCollapsed,
  onToggle,
}: {
  day: TripDayWithActivities;
  dayNumber: number;
  currency: string;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const dayCost = day.activities.reduce((sum, a) => sum + (a.cost ?? 0), 0);
  const count = day.activities.length;

  return (
    <li className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-stone-50"
      >
        <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-pine-soft text-pine">
          <span className="text-[9px] font-semibold uppercase tracking-widest">
            Day
          </span>
          <span className="text-base font-semibold leading-none">
            {dayNumber}
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block font-medium">{formatDayDate(day.date)}</span>
          <span className="block text-xs text-stone-500">
            {count === 0
              ? "Free day"
              : `${count} ${count === 1 ? "activity" : "activities"}`}
          </span>
        </span>

        {dayCost > 0 && (
          <span className="shrink-0 text-sm font-medium tabular-nums text-stone-600">
            {formatCurrency(dayCost, currency)}
          </span>
        )}
        <ChevronDown
          size={18}
          className={`shrink-0 text-stone-400 transition-transform ${
            isCollapsed ? "" : "rotate-180"
          }`}
        />
      </button>

      {!isCollapsed &&
        (count === 0 ? (
          <div className="px-5 pb-5">
            <p className="rounded-xl border border-dashed border-stone-200 px-4 py-3 text-sm text-stone-500">
              Nothing planned yet.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 border-t border-stone-100">
            {day.activities.map((activity) => (
              <ActivityRow
                key={activity.id}
                activity={activity}
                currency={currency}
              />
            ))}
          </ul>
        ))}
    </li>
  );
}

function ActivityRow({
  activity,
  currency,
}: {
  activity: Activity;
  currency: string;
}) {
  return (
    <li className="flex gap-4 px-5 py-4">
      <div className="w-14 shrink-0 pt-0.5">
        {activity.time ? (
          <span className="inline-block rounded-md bg-stone-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-stone-600">
            {formatTime(activity.time)}
          </span>
        ) : (
          <span className="text-xs italic text-stone-400">Anytime</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug">{activity.title}</p>
        {activity.description && (
          <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-stone-500">
            {activity.description}
          </p>
        )}
        {activity.locationName && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-stone-500">
            <MapPin size={12} className="shrink-0 text-stone-400" />
            {activity.locationName}
          </p>
        )}
      </div>

      {activity.cost !== null && activity.cost > 0 && (
        <p className="shrink-0 pt-0.5 text-sm font-medium tabular-nums text-stone-600">
          {formatCurrency(activity.cost, currency)}
        </p>
      )}
    </li>
  );
}
