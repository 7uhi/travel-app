# Project audit

Date: 2026-10-24. Scope: authorization/concurrency sampling, domain math,
preferences seam, Ideas workflow. Method: code reading plus the unit suite —
integration/e2e need Postgres and none is startable in this sandbox (see
"Not run" below). Findings are confirmed defects only where a test or a
concrete trace says so; everything else is labeled as sampled or remaining.

## Confirmed defect: empty region/climate intersections lost meaning

- **Where**: `aggregateTripPreferences` + `profileToPromptContext` in
  [lib/preferences.ts](../lib/preferences.ts),
  rendered by
  [GroupConsensusPanel.tsx](../components/preferences/GroupConsensusPanel.tsx).
- **What**: both "nobody answered" and "members gave incompatible answers"
  collapse to `regions: []` / `climates: []`, and the prompt builder emitted
  those fields only when non-empty — so disagreement vanished from the AI
  context entirely. The UI had a second, related bug: when regions disagreed,
  the whole "where to go" block collapsed to one region message and a
  disagreed-on climate plus the max-travel answer were hidden with it.
- **Impact**: the group could look undecided when it was actually deadlocked,
  and any AI feature built on the context would plan against a false blank.
- **Fix**:
  - New `findTripConflicts` in `lib/preferences.ts` reports per-dimension
    disagreement (largest camp first, deterministic, `ANYWHERE` /
    `NO_PREFERENCE` / null treated as compatible).
  - `profileToPromptContext` now emits `Region: no compatible option
    (…)` / `climate: no compatible option (…)` and lists trip conflicts under
    `CONFLICTS`. Unanswered dimensions stay silent — "unanswered" and
    "disagree" are now distinguishable by construction.
  - `PreferenceConflict.kind` gains `"region" | "climate"`;
    `ConflictList` titles them ("Where to go" / "What weather to go for").
  - `GroupConsensusPanel` renders region, climate, and max-travel
    independently, with per-dimension unanswered-vs-deadlocked copy, and takes
    a `tripConflicts` prop.
  - The preferences page computes `findTripConflicts` once and feeds both
    the panel and the conflict list.
- **Regression coverage**: 8 new cases in
  [lib/preferences.test.ts](../lib/preferences.test.ts)
  (conflict detection, camp sides, identity/unanswered handling, reorder
  stability, explicit prompt lines, climate-visible-despite-region-conflict,
  silence-when-unanswered, CONFLICTS listing). Suite: 52/52 pass.

## Sampled, no defect found

- **Server-action authorization** (sampled `actions/activity-ideas.ts`,
  `actions/preferences.ts` gates): member/edit gates on every mutation,
  same-response-for-missing-and-inaccessible convention kept
  (`getIdeas`, `toggleVote`, `promoteIdea`, `tripMemberGate`), related-id
  scoping verified in `promoteIdea` (day must belong to the idea's trip).
- **Expense domain** (read, not re-tested): `lib/split.ts` keeps the
  exact-sum invariant in integer units with zero-decimal support;
  `actions/expense.ts` wraps mutations in transactions with trip-row locking.
- **Preferences layering**: `resolveEffectiveProfile` honored by the page and
  the prompt builder; trip answers never mutate durable profiles (separate
  tables, separate writes).
- **Budget/travel-time strictness**: lowest-tier / strictest-limit reductions
  preserved and covered by existing tests.

## Remaining work, ranked

1. **Run integration + e2e against a real Postgres** (unavailable here).
   New coverage waiting: `tests/integration/ai-suggestions.test.ts`
   (unauthorized, cross-trip, missing-vs-inaccessible, disabled flag,
   viewer/editor apply path). The file follows existing `seedTripWithRoles`
   / `actAs` conventions; CI will pick it up automatically.
2. **Screenshot-review the new Ideas preview and the reworked "where to go"
   block** (desktop + 375px mobile) once the dev server can run with
   `AI_SUGGESTIONS_ENABLED=1`.
3. **Evaluate remaining concurrency surfaces** the task named (invite
   accept/revoke races, ownership-transfer races) with the `holdOpen` /
   `untilBlocked` harness — sampled reads looked sound, but no new race
   test was added for them.
4. **Dependency health**: no upgrades made; `npm audit` gate left to CI
   (could not reach the network meaningfully from here — not attempted).

## Hardening pass (2026-10-24)

Fixes from independent review of the mock suggestion feature; preference
fixes and authorization flow unchanged:

- **Config**: `AI_SUGGEST_MAX_RETRIES=0` now means zero retries. Both AI
  env values are strict-parsed (digits + range); malformed falls back to
  documented defaults (`lib/ai/config.ts`, +7 tests).
- **Deadline**: attempts race an independent timer; the signal is aborted
  at the deadline, late success is ignored, late rejection is swallowed,
  timers always cleared (`lib/ai/generate.ts`). Tested with a
  never-settling provider and late settle/reject providers.
- **Mock honesty**: fallback candidates pass the same veto filter; existing
  ideas and planned activities are de-duplicated (normalized titles);
  all-excluded returns zero (`lib/ai/mock-provider.ts`, +3 fixtures:
  veto-only fallback, all-vetoed, existing/planned duplicates).
- **Input budget**: counts `systemPrompt + userContent`; cumulative
  trimming (planned → existing) with omission notes; required constraints
  never trimmed, unbudgetable context fails safe *before* validation, and
  the appended-truncation overflow is gone (`lib/ai/prompt.ts`).
- **Logging**: the action no longer logs raw errors. Static message +
  allowlisted `{code}` only (`lib/ai/log.ts`, tested that private content
  in an error body cannot appear in log output).
- **Confidence**: estimate status is preserved through validation and
  normalization into the UI badge; missing status defaults to `estimated`.
- **Fixtures**: `mustAvoid` now asserts case-insensitive substrings (was
  exact array membership).

Observed results this pass: `tsc --noEmit` clean, `npm test` 203/203
(16 files; +27 tests over the previous 176), `npm run build` passes.

Written but **not executed** (exact blocker: no Postgres is startable in
this sandbox — `pg_isready` reports "no attempt", and `initdb` refuses
because sandbox uid 501 has no passwd entry; the Homebrew `postgresql@16`
service is stopped and starting it would still hit the same lookup).
Covered in writing only: `tests/integration/ai-suggestions.test.ts`
(existing, from the prior pass) and the new `e2e/ai-suggestions.spec.ts`
(viewer generate-without-apply, editor apply, region/climate disagreement
rendering, desktop + 375px screenshots attached on run:
`AI_SUGGESTIONS_ENABLED=1 npm run test:e2e -- e2e/ai-suggestions.spec.ts`).
The dev database was never migrated or truncated. Invite/ownership race
tests are deferred to a separate task as agreed.

## Final correctness pass (2026-10-24)

Two reproduced defects fixed; verification wiring completed:

- **Structural budgeting**: `applyContextBudget` (which line-matched
  rendered text and could eat a multiline deal-breaker's
  "ALREADY PLANNED: …" line) is replaced by `buildBudgetedAiRequest` —
  sections are budgeted as objects before rendering; optional sections are
  omitted whole or not at all. Regression: multiline deal-breaker/must-do
  with section-like trap lines survive verbatim under forced trimming.
- **Trim-independent duplicates**: provider output is filtered after
  validation against the originally loaded existing/planned titles
  (normalized), so history omitted from the prompt still blocks repeats —
  including the mock's own "Neighborhood coffee crawl" when planned.
  Regressions: large-history + duplicate candidate, case/space-variant
  duplicates, fewer-suggestions outcomes.
- **E2E actually runs**: CI now has an explicitly enabled mock step
  (`AI_SUGGESTIONS_ENABLED=1 npx playwright test e2e/ai-suggestions.spec.ts`)
  after the default disabled run, and uploads `playwright-report/` +
  `test-results/` with `if: always()` so screenshots survive success too.
  The spec was rewritten for isolation (own trip + users per test),
  a stable deterministic title instead of first-button scraping, exact
  heading assertions on the saved list, scoped "Where to go" checks in
  both the consensus panel and the conflict list, attached desktop/375px
  screenshots, and a kept feature-disabled describe (runs in the default
  CI pass).

Observed: `tsc --noEmit` clean, `npm test` 206/206 (was 203; +3
regressions), `npm run build` passes. Executed vs written: unit suite
executed here; integration and E2E remain written-not-executed under the
same exact blocker (no startable Postgres — `pg_isready`: "no attempt";
sandbox uid 501 has no passwd entry for `initdb`), so no screenshots were
visually reviewed and no CI pass is claimed. The dev database was never
touched.

## Verification + concurrency pass (2026-10-24)

Database execution completed against a throwaway Postgres cluster in
/tmp (port 5433, `travel_test`, local postgresql@16 binaries) started via
the approval mechanism and stopped afterwards; the development database
was never migrated or truncated. Executed, not just written:

- **Integration: 193/193 pass** (12 files), including the AI suggestion
  boundary suite and 7 new deterministic race tests.
- **E2E disabled run: 38 passed, 6 skipped** (the skipped 6 are the
  enabled-only AI tests, 3 × desktop/mobile — correct by design).
- **E2E enabled AI run: 6 passed, 2 skipped** (the disabled-only test ×2).
  One real failure was found and fixed first: the "Where to go" scoping
  matched ancestors; locators are now anchored on each box's heading.
- **Screenshots visually reviewed** (desktop + 375px): preview with
  estimate badges and no apply buttons for the viewer; applied idea gone
  from the preview with remaining suggestions intact; consensus panel and
  conflict list both stating region/climate deadlock with names.
- **CI evidence separated**: disabled/enabled runs write distinct
  report/results directories (`playwright-report-disabled|enabled`,
  `test-results-disabled|enabled`) and upload both with `if: always()`;
  new dirs are gitignored.

Concurrency findings (harness: `holdOpen`/`untilBlocked`/`actInTurn`, no
sleeps):

- **Defect found and fixed — invite accept vs revoke**: neither action
  locked anything; with revocation queued first, acceptance still created
  the member (test failed as designed before the fix). Both actions now
  serialize on the invite row (`FOR UPDATE`, checks re-read after the
  lock, revocation rechecks authorization after locking), so a
  revoked-first link can never grant access, while an accept-first join
  survives revocation (documented product rule).
  `tests/integration/membership-races.test.ts` covers both orderings.
- **No defect — ownership races**: concurrent transfers, transfer vs
  removal, and transfer vs departure (both orderings each) already
  serialize on the existing trip-row lock; the second operation is
  rechecked and refused, exactly one owner remains, and membership
  changes stay atomic. Covered by 5 tests in the same file.
- Existing invite/members suites (62 tests) pass unchanged alongside.

## Deadlock fix (2026-10-24)

The invite-row locking from the earlier pass introduced a cross-operation
deadlock (PostgreSQL 40P01), confirmed by an independent reproduction:
acceptance held the Invite row and needed the Trip row for the membership
insert's foreign-key check, while creator cleanup (`removeMember`,
`leaveTrip`, `setMemberRole` demotion) held the Trip row and needed the
Invite rows to revoke the creator's links. Observed outcome before the
fix: acceptance succeeded and removal failed with a generic transaction
error.

- **Fix**: one lock order everywhere — Trip, then Invite. `acceptInvite`
  and `revokeInvite` now acquire the Trip row lock before the Invite row
  lock (membership cleanup already locked Trip first), and re-read invite
  validity and revocation authorization after both locks are held.
  Missing/inaccessible responses and all product rules are unchanged.
- **Coverage**: 7 new deterministic tests in
  `tests/integration/membership-races.test.ts` — acceptance racing removal,
  departure, and demotion of the invite creator in both serialized
  orderings (acceptance wins: membership survives later revocation;
  cleanup wins: the revoked link grants no membership), plus the original
  reproduction interleaving (acceptance parked mid-insert on the joiner's
  User row) with diagnostic output removed. The 4 cleanup-wins/parked
  cases failed with deadlock errors before the fix; all 14 race tests
  pass after it, preserving the earlier accept/revoke and ownership
  coverage.
- **Executed results** (disposable Postgres in /tmp, stopped and removed
  afterward; dev database never touched): full integration 200/200,
  unit 206/206, `tsc --noEmit` clean, production build passes.

## Not run (and why)

- `npm audit`: omitted deliberately; no dependency changes were made.
- CI itself was not observed — the workflow changes above are verified by
  local runs mirroring them, not by a GitHub run. (Earlier passes recorded
  integration/e2e as blocked by the sandbox; the verification pass above
  superseded that via the approval mechanism.)
