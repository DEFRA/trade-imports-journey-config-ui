# Story 05b: Switch commodity-config controller to HTTP and enforce the lift-out invariant

## Goal

After this story, `commodity-config-controller.js` imports nothing from `#server/engine/*` or `#server/plugins/evaluation-engine/*`, does not access `request.server.app.evaluationEngine`, and is exercised only over HTTP — even in tests. The lift-out invariant is enforced across `src/server/routes/` by an `eslint no-restricted-imports` rule with one deliberate carve-out for `nav-context.js` that Story 06 removes.

This story also **drops the cross-commodity variance computation entirely** — `computeVariance` and its presentation helpers (`annotateValues`, `computeAbsentValues`, and any orphan helpers from `config-variance.js`) are deleted. The associated UI (rarity badges on each dimension value, "total commodities" page counter) is removed from the template. Per the user's decision: cross-commodity rarity is meta-analytics, not part of the SDUI demo narrative.

## Why

Story 05a added the page-variance endpoints. This story consumes them from the controller. The result: the commodity-config page is built over HTTP end-to-end (modulo `nav-context.js`, which Story 06 closes).

The variance cull removes complexity that didn't earn its keep:
- The cross-commodity aggregation served only the meta-rarity panel; not the "commodity drives the page" narrative.
- Exposing it over HTTP would have required WeakMap memoisation (a test-mode hazard the second-round review flagged) and a journey-asymmetric coupling guard test (plants-only, with animals untestable in the same shape).
- The presentation helpers `annotateValues` and `computeAbsentValues` are dead once `computeVariance` is gone.

User principle (`feedback_ui_http_first.md`): bin the feature before compromising the seam.

## Context

- Story 05a must be merged before this story begins.
- Stories 01–04 must be merged.
- The ESLint rule has one **deliberate** carve-out for `nav-context.js`. Story 06 removes the carve-out and adds the strict transitive-import test.

## Specification

### 1. Controller — 100% HTTP

```js
import {
  extractCommodityOptions,
  parseCommodityKey,
  toSelectItems
} from './config-utils.js'
import { navContext } from './nav-context.js'
import { clientForRequest } from '#server/clients/journey-api-client.js'

// NO imports from #server/engine
// NO imports from #server/plugins/evaluation-engine
// NO references to request.server.app.evaluationEngine
// NO imports of computeVariance, computePageVariance, or annotate helpers
```

Two branches:

**No-commodity branch** (no `?commodity=`): one HTTP call for the commodity dropdown.

**With-commodity branch**: four parallel HTTP calls via `Promise.all`:
- `client.getCommodities(journeyKey)` — dropdown population.
- `client.getRefdataView(journeyKey, { commodity, species })` — dimensions and details.
- `client.getPageVariance(journeyKey, commodityID, speciesName || undefined)` — SDUI page-variance panel.
- `client.getCommodityDetail(journeyKey, commodityID, speciesName || undefined)` — per-commodity driver panel.

**Fail-loud asymmetry**: the first two fetches (`getCommodities`, `getRefdataView`) have no `.catch` — any failure rejects the `Promise.all`, propagates to Hapi, surfaces as 500. The last two (`getPageVariance`, `getCommodityDetail`) have `.catch` handlers returning safe defaults — these are demo affordances, intentional degradation paths.

```js
.catch(() => ({ pageVariance: [] }))           // getPageVariance
.catch((error) => { request.logger.warn(...); return null })  // getCommodityDetail
```

**Defensive guard**: before the with-commodity branch's `Promise.all`, an `if (!commodityID)` early-return falls through to the no-commodity branch shape. This restores the guard Story 02 had for the per-commodity driver fetch (an empty or whitespace-only `?commodity=` query is structurally "no commodity selected").

### 2. Pure functions deleted

- `src/server/routes/explorer/config-variance.js` — **deleted entirely**, including `computeVariance`, `annotateValues`, `computeAbsentValues`, and `classifyValue` if no other caller remains. Verify with `grep -RE "classifyValue|annotateValues|computeAbsentValues" src/` before deleting.
- Co-located tests deleted with the file.

### 3. Template — variance UI dropped

In `src/server/routes/explorer/views/commodity-config.njk`:

- Remove rarity annotations from each dimension value (no more "used by 145/200 commodities").
- Remove the "total commodities" page header counter.
- Dimensions still render — as plain value lists per commodity, sourced from `refdataView`'s `dimensions[].values`.

`buildDimensionView` in the controller becomes simpler (no `variance.byDimension[id]` lookup, no `annotate`/`computeAbsent` calls) or disappears entirely if dimensions can be passed through.

### 4. ESLint rule (with carve-out)

`eslint.config.js`:

```js
import neostandard from 'neostandard'

export default [
  ...neostandard({ /* existing options */ }),
  {
    files: ['src/server/routes/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '#server/engine/*',
              '#server/plugins/evaluation-engine/*'
            ],
            message:
              'UI route handlers must consume the engine over HTTP, ' +
              'not in-process. See features/http-api/design.md.'
          }
        ]
      }]
    }
  },
  // Carve-out for nav-context.js. Story 06 closes this last gap and
  // removes the block.
  {
    files: ['src/server/routes/explorer/nav-context.js'],
    rules: { 'no-restricted-imports': 'off' }
  }
]
```

**Scope of the rule, honestly stated:**

- ✅ Catches `import { x } from '#server/engine/foo.js'` and similar direct imports.
- ⚠️ Does **NOT** catch `request.server.app.evaluationEngine.getJourney(...)` — property access on Hapi's `server.app` is not an import. The grep pre-check below catches existing property access at rule-on time; thereafter the only file using property access is `nav-context.js` (closed by Story 06).

**Pre-check** — before turning the rule on:

```bash
grep -RE "#server/engine|#server/plugins/evaluation-engine|evaluationEngine" \
  src/server/routes/
```

Any matches outside `nav-context.js` need handling — either resolve in-place (use the HTTP client) or surface as a blocker before the rule lands.

### 5. design.md ledger

- Move DQ4 out of *Deferred questions* into *Decisions*. The decision row:
  - Per-commodity page-variance: exposed via HTTP (`/commodities/{code}/page-variance`, Story 05a).
  - Cross-commodity variance: **dropped**, not exposed. Rarity badges and total counter removed from the UI.
  - `analytics/` relocation rationale.
  - ESLint rule with `nav-context.js` carve-out; Story 06 removes the carve-out.
- Add a brief cross-reference to the Story 05a "Known risks" third-journey trap.
- Add a one-line forward reference to Story 06 in the Story Map.

### 6. SOLUTION.md note

In "How the demo runs over HTTP", add a short paragraph: the commodity-config controller is now consumed entirely over HTTP; the lift-out invariant holds at the controller level; `nav-context.js` is the last remaining in-process engine reader, closed by Story 06.

## Tests

### Controller integration — `commodity-config-controller.test.js`

Existing tests need adjustment: the `Promise.all` fan-out changes the wire pattern, the rarity UI is gone, the view-context shape lost `totalCommodities` and gained/dropped fields. Update where needed; do **not** declare "no changes" if the implementation requires them.

**Defensive guard table (per second-review patch — four cases, not one):**

| `?commodity=` query | Expected branch |
|---|---|
| empty (`?commodity=`) | no-commodity render |
| whitespace (`?commodity=%20`) | no-commodity render |
| species-without-id (`?commodity=|MABSD`) | no-commodity render |
| well-formed key with no detail row (`?commodity=zzz`) | with-commodity render; `commodityDriver` is `null`; warn logged |

**Fail-loud asymmetry** — one test per fetch:

- 500 when `getCommodities` throws.
- 500 when `getRefdataView` throws.
- Renders without `pageVariance` panel when `getPageVariance` throws (empty fallback).
- Renders without `commodityDriver` when `getCommodityDetail` throws (warn logged).

**Snapshot guard**: a single snapshot or substring-match test on the rendered HTML for a known fixture, to catch regressions in the template-side cleanup (rarity badges gone, dimensions still present).

### Module-graph (transitive-import) test — DEFERRED to Story 06

The controller imports `nav-context.js`, which Story 05 deliberately preserves as the last in-process engine reader (the ESLint carve-out). A strict transitive-import walk seeded at the controller would reach the engine through `nav-context.js` and fail. Story 05b relies on:

1. The ESLint `no-restricted-imports` rule — catches direct engine imports added anywhere under `src/server/routes/` outside the carve-out.
2. The grep pre-check above — catches `evaluationEngine` property access at rule-on time.
3. Story 06 — adds the seeded module-graph walk once the carve-out is gone.

### Engine isolation

Untouched. Invariant stays green.

## Acceptance Criteria

- [ ] `commodity-config-controller.js` imports nothing from `#server/engine/*` or `#server/plugins/evaluation-engine/*`, and contains no reference to `request.server.app.evaluationEngine`. Verified by the ESLint rule and the grep pre-check. **Transitive isolation is deferred to Story 06.**
- [ ] `src/server/routes/explorer/config-variance.js` deleted. Orphan presentation helpers (`annotateValues`, `computeAbsentValues`, `classifyValue` if unused elsewhere) deleted with it.
- [ ] `commodity-config.njk` no longer renders rarity badges or a "total commodities" counter. Dimensions still render as plain value lists per commodity.
- [ ] ESLint flat-config block added with the deliberate `nav-context.js` carve-out. `npm run lint` passes.
- [ ] Defensive guard test table covers four malformed-`?commodity=` cases.
- [ ] Fail-loud asymmetry tests cover all four HTTP fetch failure modes.
- [ ] Snapshot or substring-match test on rendered HTML pins the new template shape.
- [ ] DQ4 moved out of `design.md` Deferred questions; Decisions row added; Story 06 cross-referenced.
- [ ] SOLUTION.md "How the demo runs over HTTP" gains the honest paragraph.
- [ ] `npm test` green; `npm run lint` clean; engine isolation test still passes.

## Verification

```bash
# Pre-check — must match only nav-context.js
grep -RE "#server/engine|#server/plugins/evaluation-engine|evaluationEngine" \
  src/server/routes/

# Targeted tests
TZ=UTC PORT=3001 npx vitest run src/server/routes/explorer/commodity-config-controller.test.js

# Engine isolation
TZ=UTC PORT=3001 npx vitest run src/server/engine/_isolation.test.js

# ESLint — adding `import { x } from '#server/engine/types.js'` to the
# commodity-config controller should fail with the no-restricted-imports message
npm run lint

# Full suite
TZ=UTC PORT=3001 npm test

# Manual smoke
npm run dev
# Visit /explorer/commodity-config; pick a commodity. Page renders without
# rarity badges and without a "total commodities" counter. Server log shows
# four loopback fetches firing in parallel for the with-commodity branch.
```

## Known risks

- **UI simplification visible to users.** Rarity badges and "total commodities" counter are removed. Explicitly accepted — cross-commodity rarity is meta-analytics, not the SDUI narrative.
- **ESLint rule is import-only.** Does not catch `request.server.app.evaluationEngine.*` property access. Mitigated by the grep pre-check and Story 06 closing the last property-access site (`nav-context.js`).
- **Third-journey trap (carried from Story 05a).** `buildCommodityValue` now backs the live HTTP endpoint with a hardcoded journey-key switch. Documented in 05a; not fixed here.

## What NOT to change

- Do not re-introduce `computeVariance` or any of its presentation helpers.
- Do not modify `computePageVariance` or `buildCommodityValue` (Story 05a relocated them; refactoring is out of scope).
- Do not modify the journey-adapter contract.
- Do not modify `src/server/engine/*` or the evaluation-engine plugin.
- Do not modify `nav-context.js`. Story 06.
- Do not extend `/refdata-view`'s response shape.
- Do not introduce URL versioning, CORS, or authentication.

## Resolved by this story

- **DQ4** — *"Should cross-commodity variance computation be exposed via an HTTP endpoint?"*. Resolved: **no, dropped**. Per-commodity page-variance is exposed (Story 05a); cross-commodity rarity is removed from the UI rather than relocated to an HTTP endpoint.

## Opened by this story

- **Story 06** — *"Remove the in-process engine reads from nav-context.js. The last remaining gap in the lift-out invariant."*
