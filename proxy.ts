import NextAuth from "next-auth";

import authConfig from "@/auth.config";

// Adapter-less NextAuth instance: gates routes via the `authorized` callback
// in auth.config.ts by verifying the session cookie, with no database
// round-trip. (Next.js 16 renamed the `middleware` file convention to `proxy`.)
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ["/trips/:path*", "/account"],
};
