/** Shared facts for the privacy policy and terms pages. */

/** Shown at the top of both pages; change it whenever either page changes. */
export const LEGAL_LAST_UPDATED = "November 20, 2026";

export const MINIMUM_AGE = 13;

/**
 * Public address for privacy requests and questions about the terms. Production
 * builds refuse to run without it (vercel-build.sh), so the live pages always
 * name a real address; locally it may be unset.
 */
export function contactEmail(): string | null {
  return process.env.CONTACT_EMAIL?.trim() || null;
}
