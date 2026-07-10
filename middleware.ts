import NextAuth from "next-auth";

import authConfig from "@/auth.config";

// Adapter-less NextAuth instance: runs on the edge and gates routes via the
// `authorized` callback in auth.config.ts.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/trips/:path*"],
};
