import { fileURLToPath } from "node:url";

import { testDatabaseUrl } from "../tests/database";

export const PORT = Number(process.env.E2E_PORT ?? 3100);
export const BASE_URL = `http://localhost:${PORT}`;
/** Shared by the server and the cookie minting; a fixed fallback is fine for a throwaway test server. */
export const AUTH_SECRET = process.env.AUTH_SECRET ?? "e2e-insecure-auth-secret";
export const DATABASE_URL = testDatabaseUrl();

export function authStatePath(user: string): string {
  return fileURLToPath(new URL(`./.auth/${user}.json`, import.meta.url));
}
