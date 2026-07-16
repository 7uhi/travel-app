---
name: verify
description: How to run and e2e-verify travel-app locally — dev server, minted Auth.js session cookies, and driving server actions with curl.
---

# Verifying travel-app changes end-to-end

## Environment gotchas

- Machine runs Node v22 (Homebrew, upgraded 2026-07-14). `npm test` (vitest 4)
  works. A stale Node 21.5 binary lingers at `/usr/local/bin/node`, shadowed by
  `/opt/homebrew/bin/node` — if tooling mysteriously fails on old-Node errors,
  check which node is first on PATH.
- If vitest dies with "Cannot find module '@rolldown/binding-darwin-arm64'",
  that's the npm optional-deps bug: `npm install --no-save @rolldown/binding-darwin-arm64`.
- Typecheck with the project-local `./node_modules/.bin/tsc --noEmit`
  (`npx tsc` is a squatter package).
- Postgres 17 via Homebrew service; binaries not on PATH:
  `/opt/homebrew/opt/postgresql@17/bin/psql -d travel_app` (superuser = macOS user).

## Launch

```bash
npm run dev   # Next.js dev on http://localhost:3000
```

Stopping the background task can orphan the `next-server` child, which keeps
port 3000 and serves STALE code — the next `npm run dev` silently binds 3001.
After stopping, check `lsof -nP -iTCP:3000 -sTCP:LISTEN` and kill leftovers;
always read the startup log for the actual port before driving requests.

## Authenticated requests without Google OAuth

Mint Auth.js session JWTs with `next-auth/jwt` `encode()` — salt
`"authjs.session-token"`, secret `AUTH_SECRET` from `.env`, token payload
`{ sub, id, email, name }` matching a `User` row. The minting script must live
inside the project tree (ESM resolves `next-auth` from `node_modules`).
Send as `Cookie: authjs.session-token=<jwt>` with curl; the cookie is httpOnly
so a browser session can't be overwritten from JS.

Seed extra role users (EDITOR/VIEWER) directly with psql into `"User"` +
`"TripMember"`; delete the users afterwards — memberships and owned rows cascade.

## Driving server actions over HTTP

Server actions are POSTs to the page route:

```bash
curl -s -X POST "http://localhost:3000/trips/<tripId>/<tab>" \
  -H "Cookie: authjs.session-token=$TOK" \
  -H "Next-Action: <actionId>" \
  -H "Content-Type: text/plain;charset=UTF-8" \
  --data-raw '["arg1",{"arg":2}]' | grep -o '{"success".*' | head -1
```

Find action IDs after the dev server has compiled the page (GET it once):
the client chunk `.next/static/chunks/app/trips/[id]/<tab>/page.js` contains a
JSON map of `"<40-hex-id>":"<exportName>"` — grep for the action name.
The `ActionResult` JSON is embedded in the RSC flight response; the
`grep -o '{"success".*'` above extracts it.

## What to check

- Page SSR: GET with the cookie, grep the HTML (note: JSX text nodes are
  separated by `<!-- -->` in SSR output, so grep loosely).
- Permission gates: repeat mutations as OWNER/EDITOR/VIEWER and as a
  non-owner of personal rows; expect `{"success":false,"error":...}`.
- Restore DB state after (un-toggle flags, delete seeded rows).

## Browser verification (UI visuals)

Playwright is NOT a project dep — install it in the session scratchpad
(`npm init -y && npm i playwright`); the Chromium download persists at
`~/Library/Caches/ms-playwright` (fetched 2026-07-14), so later sessions only
pay the small npm install. Auth works via `context.addCookies` with the minted
`authjs.session-token` (httpOnly is fine there, unlike page JS). Drive tabs and
dialogs with `getByRole`, screenshot with `deviceScaleFactor: 2`, and Read the
PNG to inspect. Two visual bugs shipped here that curl-based checks missed —
screenshot anything layout-related.

Tailwind gotcha this repo hit: conflicting width utilities (`w-full` baked
into a shared class + `w-32` at a use site) resolve by stylesheet order, not
class order — keep widths out of shared class strings.
