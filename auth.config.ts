import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Adapter-free Auth.js config: no Prisma here, so proxy.ts can use it without
 * pulling in the database client. auth.ts spreads this and adds the adapter.
 *
 * JWT session strategy (not database sessions) for the same reason — the
 * proxy can verify the session cookie without a database round-trip.
 */
export default {
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    session({ session, token }) {
      // token.sub is the database user id (set by the adapter at sign-in)
      if (token.sub) session.user.id = token.sub;
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/trips") || pathname.startsWith("/account")) {
        return Boolean(auth?.user); // false -> redirect to sign-in
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
