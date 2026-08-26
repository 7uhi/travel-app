/**
 * Set once a member has been shown the account-level travel profile deck, so
 * skipping it doesn't bounce them straight back into it on the next visit.
 *
 * A cookie rather than a database column: this records "we've asked", which is
 * a nudge concern, while the TravelProfile row itself is the real record of
 * having answered. Consequence: it's per-device, so a member who skips on
 * their phone is asked once more on their laptop. That's an acceptable price
 * for not adding a column, and the trip-page banner is the real safety net.
 */
export const PROFILE_ONBOARDING_SEEN = "roam.profile-onboarding-seen";

/** A year: the prompt is one-time, not a session-scoped thing. */
export const PROFILE_ONBOARDING_SEEN_MAX_AGE = 60 * 60 * 24 * 365;
