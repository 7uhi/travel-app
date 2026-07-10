import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe Auth.js config: no Prisma adapter here, so middleware.ts can
 * bundle it for the edge runtime. auth.ts spreads this and adds the adapter.
 *
 * JWT session strategy (not database sessions) for the same reason — the
 * middleware can verify the session cookie without a database round-trip.
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
      if (request.nextUrl.pathname.startsWith("/trips")) {
        return Boolean(auth?.user); // false -> redirect to sign-in
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
