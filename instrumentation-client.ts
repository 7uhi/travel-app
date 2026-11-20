import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/sentry";

// Browser errors go to Sentry; it stays off without NEXT_PUBLIC_SENTRY_DSN.
Sentry.init({
  ...sentryOptions,
  // BrowserSession pings Sentry on every page load to count sessions. That's
  // usage tracking, which the privacy policy says Roam doesn't do.
  integrations: (defaults) => defaults.filter((i) => i.name !== "BrowserSession"),
});
