import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";

import authConfig from "@/auth.config";
import { isActiveUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Sessions are stateless JWTs that outlive whatever happens to the
     * account, so every server-side session check confirms the user still
     * exists and hasn't deleted their account. Returning null ends the
     * session (Auth.js clears the cookie where it can). proxy.ts keeps the
     * adapter-free config and skips this — the pages and actions behind it
     * all go through auth() and get no session.
     */
    async jwt({ token }) {
      if (token.sub && !(await isActiveUser(token.sub))) return null;
      return token;
    },
  },
});
