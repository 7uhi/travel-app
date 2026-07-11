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
  trip.ts      trips, days, activities
  expense.ts   expenses, splits, settlements, balances
  invite.ts    invite links
lib/
  split.ts     pure expense-splitting math (integer cents)
  prisma.ts    PrismaClient singleton
  session.ts   currentUserId() helper
  action-result.ts  ActionResult<T> union returned by every action
types/index.ts                             JSON-safe types crossing to the client
app/
  /                landing + Google sign-in
  /trips           your trips → /trips/[id] itinerary → /trips/[id]/expenses
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
  `OWNER`, `EDITOR`, or `VIEWER`. Viewers are read-only. `Invite` tokens are
  multi-use, expire after 7 days, and grant `EDITOR` or `VIEWER` — never
  `OWNER`.
- **Expenses.** `Expense` → `ExpenseSplit` (one share per participant) plus
  `Settlement` for recorded repayments. All money is stored as **integer
  cents**; each trip has a single currency.

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

### Auth architecture

The Auth.js config is split across three files so the middleware can run on
the edge runtime:

- `auth.config.ts` — edge-safe config: Google provider + JWT sessions (no
  Prisma, so no Node-only code).
- `middleware.ts` — adapter-less NextAuth instance that gates `/trips/*`
  by verifying the session cookie without a database round-trip.
- `auth.ts` — spreads the same config and adds the `PrismaAdapter` for the
  Node runtime (sign-in persists users to Postgres).
