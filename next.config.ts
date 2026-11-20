import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

import { sentryIngestOrigin } from "./lib/sentry";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy without nonces (see Next's CSP guide): nonces would
 * force every page to render dynamically. Inline scripts/styles stay allowed
 * because Next.js emits them; everything else is locked to our own origin.
 *
 * - img-src: Google profile photos (components/Avatar.tsx), and the provider
 *   logo on Auth.js's built-in /api/auth/signin page.
 * - form-action: sign-in is a form POST that redirects to Google, and
 *   browsers apply form-action to that redirect.
 * - frame-ancestors 'none': nothing may embed the app (clickjacking).
 * - connect-src: the browser posts error reports to Sentry's ingest host
 *   when NEXT_PUBLIC_SENTRY_DSN is set (lib/sentry.ts).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://*.googleusercontent.com https://authjs.dev",
  "font-src 'self'",
  ["connect-src 'self'", sentryIngestOrigin()].filter(Boolean).join(" "),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Legacy equivalent of frame-ancestors for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Invite paths carry their token; never send a full URL to another origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

/**
 * Uploads source maps so Sentry shows real file names and lines, then deletes
 * them from the deployment. Needs SENTRY_AUTH_TOKEN, SENTRY_ORG, and
 * SENTRY_PROJECT at build time; without the token the upload is skipped and
 * the build carries on.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  widenClientFileUpload: true,
  silent: !process.env.CI,
  telemetry: false,
});
