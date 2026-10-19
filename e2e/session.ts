import { encode } from "next-auth/jwt";

import { AUTH_SECRET } from "./env";

const SESSION_COOKIE = "authjs.session-token";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

/** An Auth.js session cookie for `user`, minted the way the app's sign-in would. */
export async function sessionCookie({ id, email, name }: SessionUser) {
  return {
    name: SESSION_COOKIE,
    value: await encode({
      token: { sub: id, id, email, name },
      secret: AUTH_SECRET,
      salt: SESSION_COOKIE,
    }),
    domain: "localhost",
    path: "/",
    expires: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    httpOnly: true,
    secure: false,
    sameSite: "Lax" as const,
  };
}
