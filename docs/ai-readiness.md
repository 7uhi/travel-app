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

## Real-provider enablement requirements (do all before turning on)

1. **Disclosure + control**: per-trip notice that content goes to an external
   provider, and explicit opt-in before `includeSensitiveNotes` can ever be
   true. Without this, the flag stays mock-only.
2. **Distributed rate limiting + usage budgets**: the in-memory timeout/retry
   bounds are per-request safety, not production protection. Enforce
   per-user/per-trip quotas and spend caps server-side (e.g. Upstash Redis or
   equivalent) before any paid provider ships.
3. **Operational monitoring**: log provider name, latency, retry counts, and
   validation-failure rates (never prompt/response bodies); alert onspikes.
4. **Key management**: provider credentials server-side only (Vercel env),
   never bundled — the current code paths import no secrets anywhere.
5. **Re-run the full gate**: `npm run typecheck`, `npm test`,
   `npm run test:integration`, `npm run test:e2e` against a disposable DB,
   plus a screenshot pass of the preview on desktop and mobile.
