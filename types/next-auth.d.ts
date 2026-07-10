import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** Database user id (from the JWT `sub` claim). */
      id: string;
    } & DefaultSession["user"];
  }
}
