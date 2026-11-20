import * as Sentry from "@sentry/nextjs";

/**
 * For errors a server action catches and turns into a friendly message: they
 * never reach instrumentation.ts's onRequestError, so report them here. Logs
 * to the server console as before, and sends to Sentry when it's configured.
 */
export function reportError(operation: string, error: unknown): void {
  console.error(`${operation} failed:`, error);
  Sentry.captureException(error, { tags: { operation } });
}
