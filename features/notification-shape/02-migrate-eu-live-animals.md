# Story 02: Migrate eu-live-animals to the new notification shape

## Goal

Rewrite the **eu-live-animals** journey adapter (and the explorer's
animals-coupled UI plumbing) so notifications use the new shape declared
in `01-target-shape.md`. Every committed scenario continues to evaluate
`submittable: true` with the same per-status obligation counts. All four
explorer views render the same content as before. The engine, the
plugin, the journey map, and the templates are **not modified**.

This is one of two parallel migration stories (the other is Story 03 for
chedpp-plants). They are independent — animals first because:

- No schema file to retire (chedpp has the only one, deleted in Story 03).
- Live UI consumer — proves end-to-end correctness, not just engine
  contract.
- `mixed-livestock` scenario exercises multi-commodity.

## Why

The current IPAFFS shape (`notification.partOne.commodities.commodityComplement[0].speciesName`,
etc.) is data-model baggage we no longer need — we own the shape
end-to-end, no round-trip to an external system. Paths are 4–5 levels
deep; field names (`commodityComplement`, `partOne`) carry no meaning
inside our system. The new shape is shallower (median depth 2) and uses
named shared fragments (`Party`, `Address`, `Place`, `Contact`,
`Document`) so a future journey can reuse them.

The engine is already schema-agnostic (verified in `00-deep-dive.md`),
so this migration is purely about the journey adapter and a small slice
of UI plumbing. No engine logic changes.

## Context

- `features/notification-shape/00-deep-dive.md` — inventory of where the
  shape leaks; this story uses the deep dive's animals touch list as the
  source of truth for which files to change.
- `features/notification-shape/01-target-shape.md` — the target shape
  and the path-translation table that this story carries forward.
- The engine's `path.js` strips a leading `notification.` prefix during
  resolution. The new shape drops this prefix entirely; new paths are
  written without it.
- `engine/path.js#isEmpty` treats `{}` (object with no keys) as
  **non-empty**. Risk R2 below — scenarios must not introduce
  always-present empty wrapper objects.

## Specification

### 1. Files to modify

| File                                                    | What changes                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server/journeys/eu-live-animals/obligations.json`  | Rewrite every `schemaPaths` entry per the Path Translation Table below. Strip the `notification.` prefix. 23 obligations × 35 unique paths.                                                                                                                                                                                                                                                                                             |
| `src/server/journeys/eu-live-animals/resolvers.js`      | Rewrite both `facts.*` extractors (`purposeGroup` and `commodity`) to navigate the new shape. Update `submissionDatePath` from `'notification.partOne.submissionDate'` to `'submittedAt'`. Tests bodies (`tests.*`) are unchanged — they receive extracted values, not paths. Header docstring's mention of "notification.partOne.\* shape" is updated.                                                                                 |
| `src/server/journeys/eu-live-animals/scenarios.js`      | Rebuild the `buildNotification` helper (lines ~213–245) and the 7 scenario constants (`importSemen`, `importOwls`, `importCattle`, `importCats`, `transhipmentSemen`, `transhipmentCattle`, `importMixedLivestock`) in the new shape. Shared building blocks (`address`, `veterinaryInfo`, `transporterBlock`, `commodity`, `parameterSet`) are rewritten to the new shape; their signatures stay the same so call sites are unchanged. |
| `src/server/journeys/eu-live-animals/index.test.js`     | Rewrite the 5 raw-path assertions (lines 62, 65, 71, 74, 75 — checked at story-write time) to use new paths. Test intent preserved.                                                                                                                                                                                                                                                                                                     |
| `src/server/journeys/eu-live-animals/resolvers.test.js` | Update fixture construction to match the new shape. Test intent preserved.                                                                                                                                                                                                                                                                                                                                                              |
| `src/server/routes/explorer/config-utils.js`            | Rewrite `buildMinimalNotification` (currently constructs `{ type, partOne: { purpose, commodities: { commodityComplement } } }`) to produce a minimal new-shape notification (`{ type, purpose: { group }, commodities: [{ id, species: { name } }], origin: { country } }`).                                                                                                                                                           |
| `src/server/routes/explorer/config-utils.test.js`       | Update the 7 assertions that read `result.partOne.*` (lines 52, 53, 56, 64, 70, 79, 88) to the new shape.                                                                                                                                                                                                                                                                                                                               |
| `src/server/routes/explorer/scenarios.test.js`          | Update the 4 mixed-livestock assertions (lines 137, 143, 149, 156) that index into `importMixedLivestock.partOne.commodities…` to the new shape.                                                                                                                                                                                                                                                                                        |
| `src/server/routes/explorer/obligation-fragments.js`    | **Audit only** — this file consumes whatever `schemaPaths` declare. The internal `getValueAtPath`/`setValueAtPath` are generic. Verify post-migration that the fragments panel still shows non-empty JSON for each obligation. If `obligation-fragments.test.js` references IPAFFS paths, update those too.                                                                                                                             |

**No source code in `src/server/engine/` is touched.** The engine
isolation test (`engine/_isolation.test.js`) continues to pass without
modification.

### 2. Path translation

The complete `old → new` mapping for the 35 paths this journey
references (15 shared + 20 animals-only) lives in
[`01-target-shape.md` § Path translation — complete inventory](./01-target-shape.md#path-translation--complete-inventory).
That table is the **single source of truth** for the
`obligations.json` rewrite. Author from it; do not re-derive paths
from memory.

For this story specifically: use the **Shared paths** + **Animals-only
paths** sub-tables. The plants-only sub-table does not apply.

The special-case `submissionDatePath` resolver export
(`'notification.partOne.submissionDate'` → `'submittedAt'`) is also
in that section.

### 3. Resolver rewrite

Both `facts` extractors in `journeys/eu-live-animals/resolvers.js` are
rewritten to navigate the new shape. The signatures are unchanged; only
the body changes.

```javascript
// Old:
const facts = {
  purposeGroup: (notification) =>
    notification?.partOne?.purpose?.purposeGroup ?? null,
  commodity: (notification) => {
    const c = notification?.partOne?.commodities?.commodityComplement?.[0]
    return c?.commodityID ? c : null
  }
}

// New:
const facts = {
  purposeGroup: (notification) => notification?.purpose?.group ?? null,
  commodity: (notification) => {
    const c = notification?.commodities?.[0]
    return c?.id ? c : null
  }
}
```

**Note:** The `commodity` extractor preserves the `[0]`-only semantic.
This is the current multi-commodity limitation (Risk R4) — the
migration does NOT fix it. Mixed-livestock continues to route from the
first commodity only.

`submissionDatePath` becomes:

```javascript
const submissionDatePath = 'submittedAt'
```

The engine's `path.js#resolvePath` accepts paths without the
`notification.` prefix; nothing in the engine needs to change.

### 4. Scenarios rewrite

`scenarios.js`'s shared building blocks are rewritten:

- `address(prefix, country)` returns `{ name, address: { country } }` (a `Party`-shaped object with name + address fragment).
- `veterinaryInfo` becomes a new-shape `{ reference, issueDate, establishments: [...] }` under `documents.veterinary` plus an `accompanying` array.
- `transporterBlock` becomes a `Party` with `name`, `address.country`, `approvalNumber`.
- `commodity({id, speciesName, typeName, type, cls, family, nomination, description, count})` returns `{ id, species: { name, typeName, type, class, family, nomination }, commodityDescription, animalsCertified: count }`.
- `parameterSet(identifierData, count, permanentAddr)` returns `{ keyDataPair: [...], identifiers: [...] }` directly on the commodity (no `complementParameterSet[0]` indirection).

The 7 scenario constructors and `scenarioMap` are unchanged in
structure; they just produce new-shape notifications.

### 5. `config-utils.js#buildMinimalNotification` rewrite

```javascript
// Old:
const notification = {
  type: 'IMPv2',
  partOne: {
    purpose: { purposeGroup },
    commodities: {
      commodityComplement: [
        { commodityID, speciesName: speciesName || undefined }
      ]
    }
  }
}
if (countryOfOrigin)
  notification.partOne.commodities.countryOfOrigin = countryOfOrigin

// New:
const notification = {
  type: 'IMPv2',
  purpose: { group: purposeGroup },
  commodities: [
    { id: commodityID, species: { name: speciesName || undefined } }
  ]
}
if (countryOfOrigin) notification.origin = { country: countryOfOrigin }
```

The function's signature and return contract are unchanged; only the
internal literal structure differs.

## Tests

The existing test surface is the regression net. **No new tests are
required for animals migration** — the pre-existing scenario tests,
resolver tests, and route tests exhaust the behaviour. Fixtures are
updated; test intent preserved.

### Test files to update

- `journeys/eu-live-animals/index.test.js` — 5 path-access assertions
  (lines 62, 65, 71, 74, 75). Update to new paths.
- `journeys/eu-live-animals/resolvers.test.js` — fixture construction
  uses IPAFFS shape; update to new shape.
- `routes/explorer/config-utils.test.js` — 7 assertions on
  `result.partOne.*` access. Update to new shape.
- `routes/explorer/scenarios.test.js` — 4 assertions on
  `importMixedLivestock.partOne.*` access. Update to new shape.
- `routes/explorer/obligation-fragments.test.js` — audit; update if any
  fixtures reference IPAFFS paths.

### Engine tests — do NOT modify

Engine tests (`engine/*.test.js`) reference `partOne.` paths in their
hand-rolled synthetic adapters. Those paths are arbitrary — the engine
treats them as opaque dot-paths. The migration does not change them.
**Any change to engine tests is a code smell** — the migration has
crossed the boundary.

## Non-functional requirements

These are gates the migration must satisfy. Carried through from the
plan-level non-functionals.

### Test integrity

- `npm test` is green: **301 tests, 300 passing, 1 pre-existing favicon
  failure** unrelated to engine. The 300/301 baseline is the same
  pre- and post-migration.
- Engine contract tests (`engine/*.test.js`) pass **unmodified**.
- Framework-isolation test (`engine/_isolation.test.js`) passes
  **unmodified** with no new `@hapi/*` imports under `engine/`.

### Behavioural preservation (parity targets)

For each of the 7 committed eu-live-animals scenarios, the
`{satisfied, unsatisfied, deferred, inactive}` counts must be identical
to the pre-migration values pinned in
`routes/explorer/scenarios.test.js`:

| Scenario                 | Pre-migration satisfied | Pre-migration inactive                     |
| ------------------------ | ----------------------- | ------------------------------------------ |
| `import-semen`           | 17                      | 6                                          |
| `import-owls`            | 18                      | 5                                          |
| `import-cattle`          | 19                      | 4                                          |
| `import-cats`            | 19                      | 4 (cph inactive; permanent-address active) |
| `transhipment-semen`     | 18                      | 5                                          |
| `transhipment-cattle`    | 20                      | 3                                          |
| `import-mixed-livestock` | 19                      | 4                                          |

All scenarios produce `summary.submittable === true`,
`summary.unsatisfied === 0`, `summary.deferred === 0`.

Additionally:

- An **empty notification `{}`** still produces a mix of `unsatisfied`
  (data-bearing obligations) and `deferred` (conditional obligations
  whose facts return null) — never silently `satisfied`. (Inverse check
  for Risk R2.)
- The current multi-commodity routing semantic is preserved: the
  `commodity` fact extractor returns `commodities[0]` only. (Risk R4.)

### Service health

- `npm run dev` boots cleanly. Startup log includes
  `Evaluation engine loaded: 2 journey(s), 51 total obligations`.
- All four explorer views return HTTP 200:
  - `/explorer`
  - `/explorer/tasklist`
  - `/explorer/debug`
  - `/explorer/commodity-config`
- `POST /explorer/debug/evaluate` accepts a new-shape notification in
  the JSON body and returns 200 with an `EvaluationResult`.

### UI rendering parity (cattle scenario)

For `import-cattle`:

- `/explorer` shows the same `govuk-tag--*` distribution as before
  (verified by tag-count grep over the rendered HTML).
- `/explorer/tasklist` renders **15 visible task-list items** (across
  6 sections, with 2 screens omitted as `notApplicable`).
- `/explorer/commodity-config` renders without error for at least two
  commodities — one with a permanent-address obligation active (cats),
  one without (cattle).
- Engine-evaluated split: **17 total screens, 15 complete + 2
  notApplicable**.

### Code health

- `npm run lint` is clean.
- `npm run format` is a no-op (Prettier already happy).
- No new dependencies (no schema-validation library, no transform lib).

## Acceptance Criteria

- [ ] `obligations.json` uses the new shape. Every `schemaPath` matches
      the Path Translation Table above; no `notification.partOne.*` prefix.
- [ ] `resolvers.js` fact extractors navigate the new shape;
      `submissionDatePath` is `'submittedAt'`; the `[0]`-only commodity
      semantic is preserved.
- [ ] All 7 scenarios in `scenarios.js` use the new shape.
- [ ] `index.test.js` and `resolvers.test.js` pass against the new
      fixtures.
- [ ] `config-utils.js#buildMinimalNotification` constructs new-shape
      notifications. Its tests pass with new-shape assertions.
- [ ] `routes/explorer/scenarios.test.js` mixed-livestock assertions
      use the new shape and the scenario's existing
      `satisfied/inactive/deferred` count assertions remain pinned and
      pass.
- [ ] Full `npm test` is green: 300 passing + 1 pre-existing favicon
      failure.
- [ ] Engine contract tests, framework-isolation test, registration
      test all pass **unmodified**.
- [ ] `grep -rn "partOne" src/server/journeys/eu-live-animals/
src/server/routes/explorer/` returns **zero hits**.
- [ ] All four explorer views render unchanged content for the
      `import-cattle` scenario.
- [ ] `npm run dev` boots cleanly with both journeys loaded.

## Risks and pre-emptive mitigations

Carried forward from the plan; the implementer must address each
before declaring done.

### R1 — Path typos in `schemaPaths`

A typo like `parties.consigner` instead of `parties.consignor` silently
turns an obligation always unsatisfied. Scenario tests catch it, but
the failure points (e.g. "Scenario X expected 19 satisfied got 18")
take time to root-cause.

**Mitigation:** the Path Translation Table above is the artefact most
likely to harbour typos. Review it before any code touches
`obligations.json`. Once reviewed, the rewrite is mechanical — copy from
the table.

### R2 — `isEmpty` wrapper-object trap

`isEmpty({})` returns `true` (empty), but `isEmpty({ x: null })`
returns `false` (non-empty). If a scenario builder produces e.g.
`parties: { importer: { name: 'X' } }` always — even when the importer
is unspecified — every obligation referencing `parties.importer`
silently satisfies for empty-spec notifications.

**Mitigation:** verify each scenario builder only adds optional fields
when their input is truthy. The existing `if (transporter)
partOne.transporter = transporter` pattern in `scenarios.js` (lines
236–238) is the model — replicate for any new optional fragments.
Also: add an inverse check that an empty `{}` notification produces
no spurious `satisfied` statuses.

### R3 — Deep array paths (permanent-address)

The deepest animals path is
`commodities[].identifiers[].permanentAddress.line1` — two `[]` layers.
Only the `import-cats` scenario exercises this. A misrewritten
permanent-address path could pass every scenario except cats.

**Mitigation:** explicitly verify the `permanent-address` obligation
is `satisfied` for `import-cats` post-migration. Currently asserted at
`routes/explorer/scenarios.test.js:96–110` — those lines stay the
parity gate.

### R4 — Multi-commodity routing must NOT be "accidentally fixed"

The current `commodity` extractor returns `commodities?.[0]` only.
A well-meaning rewrite could change this to `commodities` (return the
array) — that would _fix_ a real bug but breaks `mixed-livestock`
because the goat commodity's routing flags differ from cattle's.

**Mitigation:** the resolver rewrite in this story preserves the
`[0]`-only semantic explicitly. Multi-commodity routing is a separate,
deferred piece of work.

### R5 — `submissionDatePath` prefix-strip subtlety

The engine's `path.js#resolvePath` strips a leading `notification.`
if present. Old path was `'notification.partOne.submissionDate'`; new
path is `'submittedAt'`. Both resolve correctly today (the engine
doesn't require the prefix). One-line audit of
`engine/path.js#resolvePath` confirms the prefix-strip is the only
convention-dependent behaviour.

**Mitigation:** action-only obligations (e.g. `legal-declaration`)
must remain `satisfied` for any scenario with a populated submission
date. Verified by the scenario count assertions in
`routes/explorer/scenarios.test.js`.

### R6 — `buildMinimalNotification` silent break

This function constructs the minimal notification for the
`/explorer/commodity-config` view (commodity dropdown + per-commodity
variance). If the rewrite produces a notification that doesn't satisfy
the obligations the variance view expects, the view's table renders
empty cells without erroring.

**Mitigation:** the view's HTML output is the test boundary. Smoke
check `/explorer/commodity-config` for at least two commodities (one
with permanent-address, one without). Take a screenshot or diff the
rendered HTML pre/post.

### R7 — Untracked `partOne.` references

Tests and code outside the listed files may also reference IPAFFS
paths. The earlier inventory found references in 6 files (some are
synthetic engine tests that don't need changes; some are real-shape
tests that do).

**Mitigation:** before code changes, run
`grep -rn "partOne\." src/ --include="*.js"` and triage each result —
"synthetic adapter, no change" vs "real shape, change required".
After migration, the same grep restricted to non-engine files must
return zero hits.

### R8 — No new engine code

Don't add a transformation helper to `engine/`. The migration's blast
radius is journey-local; if you find yourself wanting to write a
`migrateNotificationShape` helper under `engine/`, you're crossing the
boundary.

**Mitigation:** call it out in the implementation review. Engine
isolation test catches any new file under `engine/` via the directory
scan.

### R10 — Cross-journey field leakage

`consignment.cph` is animals-specific. `commodities[].species.eppoCode`
is plants-specific. If a developer copies an obligation between
journeys without updating the path, the resolver returns undefined
silently.

**Mitigation:** this story explicitly does not touch chedpp-plants.
Each story's "What NOT to change" calls out cross-journey field
contamination as a no-go.

### R12 — `obligation-fragments.js` silent regression

The fragments panel on `/explorer/debug` generates per-obligation
example JSON by walking each obligation's `schemaPaths`. A path-typo
in `obligations.json` makes the fragment empty `{}` for that
obligation — visible only by looking at the panel.

**Mitigation:** post-migration manual check of the fragments panel.
Each obligation should still show non-empty example data.

## Verification

```bash
# 1. Path Translation Table sanity check (pre-code-change):
#    Visual review of the table in this story.

# 2. Lint clean:
npm run lint

# 3. Per-journey tests:
TZ=UTC npx vitest run src/server/journeys/eu-live-animals/

# 4. Explorer route tests (config-utils, scenarios, etc.):
TZ=UTC npx vitest run src/server/routes/explorer/

# 5. Engine contract tests (must pass unmodified):
TZ=UTC npx vitest run src/server/engine/

# 6. Plugin registration test:
TZ=UTC npx vitest run src/server/plugins/evaluation-engine/registration.test.js

# 7. Full suite:
npm test
# Expected: 300 passing, 1 pre-existing favicon failure.

# 8. Verify no partOne references remain in animals code:
grep -rn "partOne" src/server/journeys/eu-live-animals/ \
                   src/server/routes/explorer/
# Expected: zero hits.

# 9. Service smoke:
npm run dev
#    Browser checks (see Non-functional requirements > UI rendering parity):
#      /explorer                    — same tag distribution as before
#      /explorer/tasklist           — 15 visible task-list items for import-cattle
#      /explorer/debug              — fragments panel shows non-empty JSON per obligation
#      /explorer/commodity-config   — at least 2 commodities render without error
#      POST /explorer/debug/evaluate with a new-shape body → 200
```

## What NOT to change

- **The engine** (`src/server/engine/*`). Schema-agnostic by
  construction; no edits.
- **The plugin** (`src/server/plugins/evaluation-engine/plugin.js`).
- **The journey map** (`src/server/journeys/eu-live-animals/journey.json`).
  Fields reference obligations by `id`, not by path. Verified by
  earlier deep dive — zero notification-path references in this file.
- **The Nunjucks templates**. They consume `Screen[]` / `Section[]` and
  don't see notification paths.
- **`refdata.json`**. Independent of notification shape.
- **chedpp-plants**. Separate story (Story 03).
- **The multi-commodity routing semantic** (`commodities?.[0]` in the
  extractor). Preserved deliberately; fixing it is a separate piece of
  work.
- **The `notification.` prefix-stripping behaviour in `engine/path.js`**.
  Stays for backwards compatibility with anything still using the old
  prefix in synthetic test paths.
