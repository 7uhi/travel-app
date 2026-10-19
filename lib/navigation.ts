const BASE = "http://roam.invalid";

/**
 * Returns `next` only if it's a path inside this app, else `fallback`. A
 * prefix check isn't enough: browsers treat "/\\evil.example" like
 * "//evil.example", and tabs or newlines are stripped before parsing. So the
 * value is resolved the way a browser would and must land on the same
 * origin; only the normalized path, query, and hash are returned.
 */
export function safeLocalPath(next: unknown, fallback: string): string {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
