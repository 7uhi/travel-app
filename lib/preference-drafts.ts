/**
 * sessionStorage key for an unfinished preference deck run. Keyed by account
 * as well as deck: a browser tab outlives a sign-out, and the next account to
 * sign in there must not resume someone else's answers. Shared by the deck,
 * which writes the draft, and by anything that must clear it.
 */
export function preferenceDraftKey(userId: string, tripId?: string): string {
  return tripId
    ? `roam.prefs-draft.${userId}.trip.${tripId}`
    : `roam.prefs-draft.${userId}.profile`;
}
