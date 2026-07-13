/**
 * Pure availability-poll math. Dates are ISO strings at UTC midnight (the
 * serialized form of @db.Date columns). No I/O; deterministic: given the same
 * input order, output is stable.
 */

import type { AvailabilityEntry, SuggestedWindow } from "@/types";

const MS_PER_DAY = 86_400_000;

/** Available-member count per day, keyed by ISO date string. */
export function dailyCounts(entries: AvailabilityEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.date, (counts.get(entry.date) ?? 0) + 1);
  }
  return counts;
}

/**
 * Ranks every `durationDays`-long window inside [windowStart, windowEnd] by
 * how many members are available on all of its days (then by total available
 * member-days, then by earliest start) and returns the best non-overlapping
 * ones, so each suggestion is a genuinely distinct option. Windows nobody has
 * marked any availability in are never suggested.
 */
export function suggestWindows(input: {
  windowStart: string;
  windowEnd: string;
  durationDays: number;
  memberIds: string[];
  entries: AvailabilityEntry[];
  /** Maximum suggestions to return (default 3). */
  limit?: number;
}): SuggestedWindow[] {
  const { durationDays, memberIds, entries, limit = 3 } = input;
  const start = Date.parse(input.windowStart);
  const end = Date.parse(input.windowEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || durationDays < 1) {
    return [];
  }

  const windowLen = Math.round((end - start) / MS_PER_DAY) + 1;
  const candidateCount = windowLen - durationDays + 1;
  if (candidateCount < 1) return [];

  // Per-member set of day offsets (0 = windowStart) they are available.
  const offsetsByMember = new Map<string, Set<number>>(
    memberIds.map((id) => [id, new Set<number>()]),
  );
  for (const entry of entries) {
    const offset = Math.round((Date.parse(entry.date) - start) / MS_PER_DAY);
    if (offset < 0 || offset >= windowLen) continue;
    offsetsByMember.get(entry.userId)?.add(offset);
  }

  type Candidate = {
    offset: number;
    available: string[];
    unavailable: string[];
    memberDays: number;
  };

  const candidates: Candidate[] = [];
  for (let s = 0; s < candidateCount; s++) {
    const available: string[] = [];
    const unavailable: string[] = [];
    let memberDays = 0;
    for (const id of memberIds) {
      const offsets = offsetsByMember.get(id)!;
      let free = 0;
      for (let d = s; d < s + durationDays; d++) {
        if (offsets.has(d)) free++;
      }
      memberDays += free;
      (free === durationDays ? available : unavailable).push(id);
    }
    candidates.push({ offset: s, available, unavailable, memberDays });
  }

  candidates.sort(
    (a, b) =>
      b.available.length - a.available.length ||
      b.memberDays - a.memberDays ||
      a.offset - b.offset,
  );

  // When some window works for at least one whole member, windows that work
  // for nobody are noise; they're only suggested as a "closest option" when
  // no member is fully free anywhere.
  const someoneFullyFree = candidates[0].available.length > 0;

  const picked: Candidate[] = [];
  for (const candidate of candidates) {
    if (picked.length >= limit) break;
    if (candidate.memberDays === 0) continue;
    if (someoneFullyFree && candidate.available.length === 0) continue;
    const overlaps = picked.some(
      (p) => Math.abs(p.offset - candidate.offset) < durationDays,
    );
    if (!overlaps) picked.push(candidate);
  }

  return picked.map((c) => ({
    startDate: new Date(start + c.offset * MS_PER_DAY).toISOString(),
    endDate: new Date(
      start + (c.offset + durationDays - 1) * MS_PER_DAY,
    ).toISOString(),
    availableUserIds: c.available,
    unavailableUserIds: c.unavailable,
  }));
}
