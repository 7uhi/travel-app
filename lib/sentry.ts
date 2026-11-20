import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import type * as Sentry from "@sentry/nextjs";

/**
 * Sentry error reporting, shared by the browser (instrumentation-client.ts)
 * and the server (instrumentation.ts). Errors only: no tracing, Session
 * Replay, or logs. Without NEXT_PUBLIC_SENTRY_DSN — locally, in tests,
 * in previews — the SDK stays disabled and sends nothing.
 *
 * The privacy policy promises Sentry never receives names, emails, cookies,
 * what people typed, or invite links, so collection is switched off at the
 * source and every event is scrubbed again before it leaves.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

export const sentryOptions = {
  dsn,
  enabled: Boolean(dsn),
  // Vercel exposes this to the browser too; "development" covers local runs.
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    // Local variables in server stack frames would carry trip data and tokens.
    stackFrameVariables: false,
  },
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
} satisfies Parameters<typeof Sentry.init>[0];

/**
 * Invite links grant access to a trip, so their token never leaves the app.
 * Matches the path both plain and URL-encoded (as in a sign-in callbackUrl).
 */
const INVITE_TOKEN = /((?:\/|%2F)invite(?:\/|%2F))[A-Za-z0-9_-]+/gi;

export function redactUrl(url: string): string {
  return url.replace(INVITE_TOKEN, "$1[token]");
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  if (event.request) {
    const { url, method } = event.request;
    event.request = { method, url: url && redactUrl(url) };
  }
  if (event.transaction) event.transaction = redactUrl(event.transaction);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactUrl(exception.value);
  }
  if (event.message) event.message = redactUrl(event.message);
  // captureRequestError records the request path in contexts.nextjs.
  for (const context of Object.values(event.contexts ?? {})) {
    if (!context) continue;
    for (const [key, value] of Object.entries(context)) {
      if (typeof value === "string") context[key] = redactUrl(value);
    }
  }
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb).filter((b) => b !== null);
  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // Console output can include anything the app logged; keep it out.
  if (breadcrumb.category === "console") return null;
  if (breadcrumb.message) breadcrumb.message = redactUrl(breadcrumb.message);
  if (breadcrumb.data) {
    for (const key of ["url", "from", "to"]) {
      const value = breadcrumb.data[key];
      if (typeof value === "string") breadcrumb.data[key] = redactUrl(value);
    }
  }
  return breadcrumb;
}

/** Origin the browser SDK posts events to, for the CSP's connect-src. */
export function sentryIngestOrigin(): string | null {
  if (!dsn) return null;
  try {
    return new URL(dsn).origin;
  } catch {
    return null;
  }
}
