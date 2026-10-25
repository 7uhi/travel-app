# AI readiness

First AI feature: "suggest activity ideas for this trip based on its
destination, dates, budget, existing ideas/itinerary, and group preferences."
The foundation below is the minimum that supports it: no credentials, no paid
calls, no vector DBs, no queues, no conversation storage.

## Architecture

```
Ideas page ──► suggestActivityIdeas (actions/ai-suggestions.ts, "use server")
                      │  auth (any member may generate) + feature flag
                      ▼
              loadSuggestionContext (lib/ai/context.ts)
                trip facts, idea titles + vote counts, planned activity
                titles, group preference summaries — same trip only,
                minimal fields (no emails, tokens, finances, packing,
                vote authorship)
                      ▼
              buildAiRequest (lib/ai/prompt.ts, version activity-suggestions/v1)
                trusted system instructions + profileToPromptContext group
                block; user-entered notes wrapped in <untrusted-content>
                      ▼
              generateActivitySuggestions (lib/ai/generate.ts)
                timeout → bounded retries → schema validation → normalize
                      ▼
              AiSuggestionProvider ──► MockSuggestionProvider (only impl.)
                      │
              human reviews in <AiSuggestions /> ──► addIdea (existing gate)
```

- **Single group-math seam**: everything flows through
  `profileToPromptContext` (with `findTripConflicts` for deadlocks). No
  feature re-derives group preferences.
- **Provider seam** (`lib/ai/provider.ts`): one narrow interface. A real
  backend means implementing it once and selecting it in
  `actions/ai-suggestions.ts` — do not add multi-provider adapters without a
  concrete need.
- **Schemas** (`lib/ai/schemas.ts`, Zod): request and response shapes are
  runtime-validated; provider output is untrusted by default.
- **Bounds** (`lib/ai/config.ts`): 6,000-char input budget, 8,000-char output
  cap, max 6 suggestions, 8s timeout (`AI_SUGGEST_TIMEOUT_MS`), ≤2 retries
  (`AI_SUGGEST_MAX_RETRIES`; `0` means try once). Retries cover
  timeouts/unavailability only — malformed output fails fast with a
  user-facing message. Env values are parsed strictly (digits + range
  check); malformed values fall back to defaults rather than widening a
  bound.
- **Deadline enforcement**: each attempt races the provider against an
  independent timer and aborts the signal at the deadline. A provider that
  ignores cancellation still loses; late successes are ignored and late
  rejections are swallowed (never unhandled). Timers are always cleared.
- **Input budget semantics**: `AI_MAX_CONTEXT_CHARS` counts
  `systemPrompt + userContent` in JS characters. Budgeting is structural:
  the prompt is assembled from section objects and optional history
  sections (planned activities first, then existing ideas) are omitted
  whole, replaced by a fixed omission line — never identified by matching
  text inside rendered user content, so a multiline deal-breaker containing
  a line like "ALREADY PLANNED: no boat trips" survives verbatim. System
  instructions, vetoes, deal-breakers, hard constraints, and conflicts are
  never trimmed; if they alone exceed the budget, generation fails safe
  ("too much context") instead of dropping them. Budgeting runs before
  schema validation.
- **Duplicate safety**: suggestions are filtered after provider-output
  validation against the originally loaded existing/planned titles
  (normalized), independent of prompt trimming — history omitted from the
  prompt still blocks repeats, returning fewer or zero suggestions.
- **Confidence**: provider estimate status (`grounded`/`estimated`) is
  validated, preserved through normalization, and shown in the UI
  ("From trip details" vs. "Estimate — verify locally"). Missing status
  defaults to `estimated` — never upgraded.
- **Mock honesty**: every candidate, fallbacks included, passes the veto
  filter; existing ideas and planned activities are never repeated;
  when everything is excluded the mock returns zero suggestions.
- **Prompt injection**: not claimed to be prevented by formatting. Defense
  is layered: untrusted span is labeled as data, output is schema-validated,
  estimates must be marked, and nothing writes without human review through
  existing validated actions.
- **Output honesty**: the prompt forbids inventing prices, hours,
  availability, links, or accessibility guarantees; confidence is
  `grounded` (repeated from context) vs `estimated`. The mock marks
  everything `estimated` and says "(Estimated — verify locally.)".

## Privacy boundaries

- Kept out of model input: emails, auth data, invite tokens, financial
  participant identities, personal packing data, vote authorship,
  unrelated-trip data.
- **Dietary/accessibility notes are sensitive.** Visibility to trip members
  does not authorize sending them to an external provider: `buildAiRequest`
  blanks them unless `includeSensitiveNotes` is set, the preview always runs
  with it off, and the mock transmits nothing anywhere.
- Never logged: raw prompts, private notes, tokens, full provider responses
  (errors log only a static line).

## Local mock usage

```sh
AI_SUGGESTIONS_ENABLED=1 npm run dev   # Ideas tab → "Suggested ideas (Preview)"
npm test                               # lib/ai/generate.test.ts: flag, fixtures, invalid output, timeout, sensitivity
```

The preview badge says "Preview" and empty states say suggestions are mock —
no UI implies a live service. Generation never modifies itineraries,
expenses, memberships, or preferences.

## Evaluation fixtures (`lib/ai/fixtures.ts`)

Eight cases, each asserting on request context and mock output: trip override
beats durable taste, vetoed interest never surfaces, conflicting
region/climate stays explicit, missing preferences omit rather than invent,
undecided dates/destination are stated, veto-only input still filters the
fallback candidates, all-fallbacks-vetoed returns nothing, and
existing/planned duplicates are never repeated. `mustAvoid` is matched as
case-insensitive substrings against suggested titles. Reuse the same
fixtures to qualify a real provider.

## Per-trip controls and persistent limits (implemented)

- **Per-trip consent** (`TripAiSetting`, `actions/ai-settings.ts`): off by
  default per trip. The owner enables suggestions from Preferences after
  the disclosure (destination, dates, budget, idea/itinerary titles, group
  preference summary) and an explicit confirmation checkbox; who confirmed
  and when is recorded. Disabling keeps the record. Non-owners see the
  state but cannot change it. Generation requires the global flag **and**
  the trip setting. The panel distinguishes today's local mock ("nothing
  leaves the server") from future external processing, which this same
  consent gates. Dietary/accessibility notes stay excluded — consent here
  never covers them, and no sensitive-note sharing exists.
- **Ownership changes**: settings updates lock the Trip row, then recheck
  current ownership and write the setting in the same transaction. A former
  owner cannot change consent after an ownership transfer wins that lock.
- **Admission and revocation**: membership and per-trip consent are rechecked
  inside the quota reservation transaction, under the Trip lock. Successful
  reservation is the point at which a generation is admitted. If removal or
  disablement wins the lock, the pending request is rejected before the
  provider runs and no ledger row is created. If reservation wins first,
  that admitted request may finish even after removal or disablement commits;
  those changes block later admissions. No transaction or row lock is held
  open during the provider call.
- **Persistent quotas** (`AiGeneration` ledger, `lib/ai/usage.ts`):
  per-user (20/day) and per-trip (50/day) limits, configured by
  `AI_SUGGEST_USER_DAILY_LIMIT` / `AI_SUGGEST_TRIP_DAILY_LIMIT` (strictly
  parsed). Reservation is atomic (Trip row lock, then User row lock;
  RESERVED rows count while in flight, so concurrent requests cannot
  bypass a limit). Completion consumes quota; failure (timeout, provider
  error, validation failure) releases it. Provider retries share one
  reservation and only raise `attempts`. Limit rejections return clear
  per-scope messages. Enforcement and any future credentials live
  server-side only.
- **Failure settlement**: expected generation failures and unexpected thrown
  errors attempt to settle the reservation as FAILED, releasing its slot.
  Settlement only changes RESERVED rows: repeated or conflicting callbacks
  cannot overwrite a terminal outcome or its metadata. If settlement itself
  fails (for example during a database outage), the action preserves the
  generation's success/error response and logs only static metadata. The row
  conservatively stays RESERVED and counts for the remainder of its UTC day.
  A later idempotent settlement can reconcile it without repeating generation;
  no automatic reconciliation worker exists yet. A process crash before
  settlement has the same conservative accounting behavior.
- **Operational metadata**: every settled generation records provider,
  status, attempts, duration, and `validationFailed` — never prompts,
  suggestions, notes, or response bodies.

## Real-provider enablement requirements (remaining)

1. **Provider adapter + credentials**: implement `AiSuggestionProvider`
   once, store keys server-side only (Vercel env), select it in
   `actions/ai-suggestions.ts`. Consent, quotas, and metadata above are
   already in place and apply unchanged.
2. **Spend caps beyond request counts**: quotas bound request volume, not
   token spend; add per-request token/cost ceilings with the adapter.
3. **Alerting**: alert on FAILED/`validationFailed` rates and latency from
   the `AiGeneration` ledger (dashboards may read it; it holds no content).
4. **Re-run the full gate**: `npm run typecheck`, `npm test`,
   `npm run test:integration`, `npm run test:e2e` against a disposable DB,
   plus a screenshot pass of the preview on desktop and mobile.
