# Roam

A collaborative trip-planning app: shared trips with day-by-day itineraries,
availability polls to pick trip dates together, invite links, and
Splitwise-style group expense splitting.

Built with Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4,
Prisma 7 + PostgreSQL, and Auth.js (NextAuth v5) with Google sign-in.

## Getting started

### Prerequisites

- Node.js 22.12+ (Node 22 LTS recommended)
- PostgreSQL running locally (e.g. `brew install postgresql@14 && brew services start postgresql@14`)
- Google OAuth credentials (for sign-in)

### Setup

1. **Install dependencies** (also runs `prisma generate`):

   ```sh
   npm install
   ```

2. **Configure environment** — copy the template and fill it in:

   ```sh
   cp .env.example .env
   ```

   | Variable | How to get it |
   | --- | --- |
   | `DATABASE_URL` | Postgres connection string, e.g. `postgresql://$(whoami)@localhost:5432/travel_app` after `createdb travel_app` |
   | `AUTH_SECRET` | `npx auth secret` or `openssl rand -base64 32` |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials): create an OAuth client ID (type: Web application) with authorized redirect URI `http://localhost:3000/api/auth/callback/google` |

3. **Create the schema**:

   ```sh
   npx prisma migrate deploy
   ```

4. **Run it** (`npm test` runs the unit tests):

   ```sh
   npm run dev
   ```

   Open <http://localhost:3000>. To browse the UI without a database or
   Google credentials, visit <http://localhost:3000/preview> for a static
   demo dashboard.

### Deploying to Vercel

1. **Database.** Create a hosted Postgres database (Neon, Supabase, or a
   Postgres integration from the Vercel Marketplace) and copy two connection
   strings: the pooled one for the app, since serverless functions open many
   short-lived connections, and the direct one for migrations.

2. **Project.** Import the repository in Vercel; it detects Next.js. Add
   these environment variables to the Production environment:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | The pooled connection string |
   | `DIRECT_DATABASE_URL` | The direct (non-pooled) connection string |
   | `AUTH_SECRET` | A new secret from `npx auth secret`; don't reuse your local one |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | The Google OAuth client (next step) |

   Under Settings → Functions, pick the region closest to the database: each
   trip page makes several queries per load.

3. **Google sign-in.** Add `https://<your-domain>/api/auth/callback/google`
   to the OAuth client's authorized redirect URIs. While the OAuth consent
   screen's publishing status is *Testing*, only the test users listed there
   can sign in; switch it to *In production* to let anyone in.

4. **Deploy.** `vercel.json` runs `vercel-build.sh` as the build command.
   On production deployments it applies pending migrations with
   `prisma migrate deploy` over `DIRECT_DATABASE_URL` before `next build`,
   and fails the build if that variable is missing. Preview deployments only
   build.

Google accepts only redirect URIs that are listed exactly, so sign-in doesn't
work on Vercel's per-deployment preview URLs, and previews build without any of
these variables. Keep the database variables on Production only, so a preview
can never write to the production database.

## How it works

There is no REST API layer — all reads and mutations go through React Server
Actions in `actions/`, and the only API route is the Auth.js handler.

```
auth.ts / auth.config.ts / middleware.ts   Auth wiring (see below)
prisma/schema.prisma                       Data model + migrations
prisma.config.ts                           CLI datasource + migration configuration
generated/prisma/                          Generated client (gitignored)
actions/                                   Server actions — the "backend"
  trip.ts        trips, days, activities, trip header, edit/reschedule/delete/hide
  members.ts     member list, leaving, removal, roles, ownership transfer
  expense.ts     expenses, splits, settlements, balances
  invite.ts      invite links (create, list, revoke, accept)
  preferences.ts travel profiles + per-trip preference answers
lib/
  split.ts     pure expense-splitting math (integer cents)
  preferences.ts       pure group-consensus math + LLM prompt context
  preference-questions.ts  the question banks, as code data
  prisma.ts    PrismaClient singleton
  session.ts   currentUserId() helper
  action-result.ts  ActionResult<T> union returned by every action
types/index.ts                             JSON-safe types crossing to the client
app/
  /                landing + Google sign-in
  /onboarding      the account-level travel profile deck (first sign-in)
  /trips           your trips → /trips/[id] itinerary → /trips/[id]/expenses
                   → /trips/[id]/preferences (+ /onboarding, the trip deck)
  /invite/[token]  accept an invite, then redirect to the trip
  /preview         demo dashboard (no DB required)
components/                                UI (server + client components)
```

### Domain model

- **Trip → TripDay → Activity.** One `TripDay` per calendar day is
  pre-generated when a trip is created with fixed dates. Activities hold
  title, time, location, and optional cost.
- **Availability poll.** A trip can instead be created with a candidate
  window + desired length; members mark free days (`AvailabilityDay`, one row
  per member-day) on a heatmap calendar, and the owner confirms dates from
  ranked suggestions (`lib/availability.ts`) — which generates the `TripDay`
  rows and unlocks the itinerary.
- **Membership & roles.** `TripMember` links users to trips with a role:
  `OWNER`, `EDITOR`, or `VIEWER`. Viewers can't edit the itinerary,
  expenses, or shared packing list; they can still vote on ideas, answer the
  group questions, mark their own availability, keep a personal packing list,
  and record repayments they made or received. Owners and editors can edit
  the trip's title and destination; only the owner reschedules it, deletes it
  (by typing its title), or manages members — changing roles between
  `EDITOR` and `VIEWER`, removing people, and handing over ownership (the
  old owner stays on as an editor, so there's always exactly one `OWNER`).
  Anyone except the owner can leave. Leaving or being removed is refused while
  that member's balance isn't zero, so nobody walks away from a debt the
  ledger still shows; their past expenses and repayments stay on the trip.
- **Rescheduling keeps day N as day N.** Moving the dates shifts every
  `TripDay` (and its activities) by the same offset. Shortening drops days
  off the end, and is refused while any of those days still has activities.
- **Hiding is per member.** `TripMember.archivedAt` moves a trip into a
  collapsed "Archived" section of *your* trip list without touching anyone
  else's.
- **Invites.** `Invite` tokens are multi-use, expire after 7 days, and grant
  `EDITOR` or `VIEWER` — never `OWNER`. Only the owner creates them and
  sees the trip's active links; a link can be revoked by the owner or whoever
  created it (a former owner keeps that for links they sent). Revoking
  sets `Invite.revokedAt` rather than deleting the row, so opening a
  revoked link says it was revoked instead of looking like a mistyped URL.
  Opening an invite link only shows a preview; joining is an explicit POST
  from its Join button.
- **Expenses.** `Expense` → `ExpenseSplit` (one share per participant) plus
  `Settlement` for recorded repayments. All money is stored as **integer
  cents** (hundredths of the major unit, whatever the currency), and an
  expense's shares always sum to its amount. Any member, viewers included,
  can open an expense to see who paid and each person's share. A repayment
  can't exceed what the balances support, records who entered it, and can be
  removed by the people involved, its recorder, or the owner.
- **One currency per trip, never converted.** It's picked when the trip is
  created. Each currency has a *unit* in those hundredths
  (`lib/currencies.ts`, derived from `Intl`): 1 for cent currencies, 100 for
  zero-decimal ones like JPY, KRW, and VND. Expense amounts, shares,
  repayments, and the budget must be whole units, and splits hand out whole
  units — ¥1000 three ways is ¥334 + ¥333 + ¥333, never ¥333.33s. Balances
  are rounded to whole units (sum-preserving) before settling up, which only
  matters for fractional shares stored before this rule. Changing the
  currency *relabels* amounts instead of converting them: that's silent only
  while the trip holds no amounts; otherwise the owner confirms an example and
  `updateTripCurrency` requires `relabel: true`. Switching to a zero-decimal
  currency is refused while any amount has cents.
- **Preferences, in two layers, asked at two moments.** `TravelProfile` is one
  row per *user* — durable taste (pace, budget tier, rhythm, lodging) that
  outlives any single trip. It's collected by the account-level deck at
  `/onboarding` just after first sign-in (skippable; the trip banner nudges
  anyone who skips). `TripPreference` is one row per *(user, trip)*, collected
  when they create or join a trip. Interest weights hang off each layer as
  child rows scored −2…+2 (`TravelInterest`, `TripInterest`), so they're
  SQL-aggregatable and a future swipe UI can write the same shape.
- **Trip answers are overrides, never deltas.** A trip question that also
  exists on the profile opens pre-filled with the member's usual answer —
  continuing accepts it, changing it applies to that trip only. Nothing in the
  trip deck ever writes back to the durable profile, which is what keeps
  "museums in Rome" from permanently rewriting someone's general taste and what
  makes an answer readable back out again. Always read the pair through
  `resolveEffectiveProfile`; either layer alone is the wrong answer whenever a
  member has said this trip is different.
- Which trip bank a member gets depends on whether `Trip.destination` is set
  yet — nullable for exactly that reason, mirroring the nullable `startDate`
  used by the date poll. The banks live in code (`lib/preference-questions.ts`).
- **Hard constraints are unioned, not averaged.** Dietary and accessibility
  notes are free text and every one of them is carried into the group view and
  the prompt context. Budget and travel-time take the *strictest* answer, and
  region/climate *intersect* — they're constraints, not tastes. Only interest
  weights are averaged, and even then ranked by `(mean + min) / 2` so one hard
  "no" outweighs several mild "yes"es. Note these notes sit on the user-level
  profile, so they're visible to every trip that member belongs to; the deck
  says so at the point of entry.

### Conventions

- **Server actions follow one template**: resolve the session → validate
  input → run an authorization gate query → mutate → `revalidatePath()` →
  return a serialized `ActionResult<T>` (never throw to the client).
- **Authorization never leaks existence**: non-members get the same
  "not found" error as genuinely missing records, so ids can't be probed.
- **Serialization boundary**: Prisma `Date`/`Decimal` values never cross to
  the client; actions map rows to the JSON-safe shapes in `types/index.ts`.
- **Money math is pure**: `lib/split.ts` has no I/O. Splits always sum
  exactly to the total (largest-remainder rounding), and
  `simplifyDebts` produces at most n−1 suggested payments.
- **Group consensus is pure too**: `lib/preferences.ts` has no I/O and is
  deterministic regardless of member order. It's the single seam any future AI
  feature should call — `profileToPromptContext` renders the group as one
  stable text block (no `Intl`, no `Date.now()`) so every feature describes the
  group identically instead of re-deriving it.

### Auth architecture

The Auth.js config is split across three files so the middleware can run on
the edge runtime:

- `auth.config.ts` — edge-safe config: Google provider + JWT sessions (no
  Prisma, so no Node-only code).
- `middleware.ts` — adapter-less NextAuth instance that gates `/trips/*`
  by verifying the session cookie without a database round-trip.
- `auth.ts` — spreads the same config and adds the `PrismaAdapter` for the
  Node runtime (sign-in persists users to Postgres).

## Testing

There are three layers, and CI (`.github/workflows/ci.yml`) runs all of them
on every pull request and push to `main`:

| Layer | Command | Covers |
| --- | --- | --- |
| Unit | `npm test` | Pure logic in `lib/*.test.ts` (split math, consensus, …). No I/O. |
| Integration | `npm run test:integration` | Server actions in `actions/` against a real Postgres, with the session and `next/cache`, `next/headers`, and `next/navigation` mocked (`tests/integration/`). Includes concurrent-request tests for the row-locking fixes. |
| End-to-end | `npm run test:e2e` | The production build in Chromium, desktop and a 375×667 mobile viewport, signed in as seeded users (`e2e/`). |

The integration race tests for leaving a trip, rescheduling, and switching
currency don't leave the interleaving to chance: `holdOpen` in
`tests/integration/helpers.ts` keeps a competing transaction open, and
`untilBlocked` waits until an action is parked on its lock, so the risky
ordering happens on every run. Each of them fails when the lock it guards is
removed.

`npm run typecheck` runs the TypeScript compiler. CI also runs
`npm audit --omit=dev --audit-level=critical`, so a critical advisory in a
production dependency fails the build. The Prisma 7 upgrade also resolves the
previous high advisories in Prisma 6's CLI tooling (`prisma` → `@prisma/config` → `deepmerge-ts`).

Prisma 7 uses `prisma.config.ts` for the CLI database URL and loads `.env`
explicitly with `dotenv`. The schema generates the client into
`generated/prisma/`; `npm ci` regenerates it. The application and test clients
use `@prisma/adapter-pg` with `DATABASE_URL`. Production migrations still use
`DIRECT_DATABASE_URL` through `vercel-build.sh`. Generation and preview builds
work without a database URL; migrations and runtime queries need one.
See the [official Prisma 7 migration guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7).

The integration and e2e suites **wipe every table**, so they need a
disposable database. They read `DATABASE_URL` (default
`postgresql://postgres@localhost:5432/travel_test`), apply migrations
themselves, and refuse to run unless the database name contains `test`.
The quickest throwaway Postgres is a container:

```sh
docker run -d --name travel-test-db -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=travel_test -p 127.0.0.1:5432:5432 postgres:17
npm run test:integration
npx playwright install chromium   # once per machine
npm run test:e2e
docker rm -f travel-test-db
```

If a local Postgres already holds port 5432, map the container to another
port (`-p 127.0.0.1:5433:5432`) and export
`DATABASE_URL=postgresql://postgres@localhost:5433/travel_test`.

Notes on the e2e suite:

- Locally it runs `npm run build && npm start` on port 3100 (`E2E_PORT`
  overrides), or reuses a server already listening there. With `CI` set it
  only runs `npm start`, because CI builds in an earlier step.
- Global setup seeds an owner, editor, viewer, and non-member plus one trip
  (`e2e/seed.ts`), and mints Auth.js session cookies for them, so no Google
  credentials are needed. `test.use({ signedInAs: "viewer" })` from
  `e2e/fixtures.ts` signs a test in.
- Tests that change data (joining via an invite, sharing or revoking a link,
  changing a member's role, recording a repayment) create their own users or
  trip through the `db` fixture and sign in with `signIn(user)`, so they
  don't disturb the shared seed, the other viewport, or a retry.
  `seedSharedDinner(db)` in `e2e/seed.ts` creates such a trip, where the
  editor and the viewer each owe the owner $10.
- Failures leave traces and screenshots in `playwright-report/`
  (`npx playwright show-report`).
