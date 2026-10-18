# Roam

A collaborative trip-planning app: shared trips with day-by-day itineraries,
availability polls to pick trip dates together, invite links, and
Splitwise-style group expense splitting.

Built with Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4,
Prisma 6 + PostgreSQL, and Auth.js (NextAuth v5) with Google sign-in.

## Getting started

### Prerequisites

- Node.js 20+
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

## How it works

There is no REST API layer — all reads and mutations go through React Server
Actions in `actions/`, and the only API route is the Auth.js handler.

```
auth.ts / auth.config.ts / middleware.ts   Auth wiring (see below)
prisma/schema.prisma                       Data model + migrations
actions/                                   Server actions — the "backend"
  trip.ts        trips, days, activities
  expense.ts     expenses, splits, settlements, balances
  invite.ts      invite links
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
  and record repayments they made or received. `Invite` tokens are multi-use, expire after 7 days, and grant
  `EDITOR` or `VIEWER` — never `OWNER`. Opening an invite link only shows
  a preview; joining is an explicit POST from its Join button.
- **Expenses.** `Expense` → `ExpenseSplit` (one share per participant) plus
  `Settlement` for recorded repayments. All money is stored as **integer
  cents**; each trip has a single currency, and an expense's shares always sum
  to its amount. A repayment can't exceed what the balances support, records
  who entered it, and can be removed by the people involved, its recorder, or
  the owner.
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
