import type { Instrumentation } from "next";

/**
 * Every uncaught server error — render, route handler, server action — passes
 * through here once, so this is the single place they're reported. Each one is
 * logged as one JSON line keyed by the digest Next.js shows the user on the
 * error page, which lets a "reference: abc123" from a bug report be matched to
 * its stack trace.
 *
 * Deliberately logs the route pattern, not the URL: invite paths carry their
 * token, and headers carry session cookies.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(
    JSON.stringify({
      level: "error",
      event: "request_error",
      digest: (err as Error & { digest?: string }).digest ?? null,
      name: err.name,
      message: err.message,
      stack: err.stack,
      method: request.method,
      route: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
      renderSource: context.renderSource ?? null,
    }),
  );
};
