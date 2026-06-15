# Story 09: Register chedpp-plants

## Goal

The `chedpp-plants` journey (currently untracked at
`src/server/journeys/chedpp-plants/`) is committed and registered in
the engine. Both `eu-live-animals` and `chedpp-plants` pass the
plugin's startup validation. The UI continues to expose only
`eu-live-animals` — chedpp-plants is engine-only at this stage.

## Why

Subsequent stories (10 combinators, 11 contract tests) assume both
journeys are registered. Story 10's "replace chedpp-plants' local
`or`" step depends on chedpp-plants being part of the live engine.
Story 11's "per-journey contract test for both" depends on both
adapters being reachable through the engine facade.

The journey code exists in the working tree but is untracked; this
story commits it and adds it to the `JOURNEYS` map. The plugin's
existing `validateJourney` runs against both adapters at startup.

The UI surface remains as it is — every explorer controller is
hardcoded to `'eu-live-animals'`. Adding chedpp-plants to the UI
(journey selector, plant-specific views) is a separate stream of
work and is _not_ part of this refactor.

## Context

- `features/modelling/engine-design.md` §2 (directory layout shows
  both journeys); §4 (today's code mapping — chedpp-plants is
  referenced in the combinators row).
- `features/modelling/protocol.md` §2-3 — adapter contract that
  chedpp-plants must satisfy.
- Working-tree files at `src/server/journeys/chedpp-plants/` —
  obligations, refdata, journey map, resolvers, scenarios,
  notification schema, index.

## Specification

**1. Commit the chedpp-plants journey code.**

The directory `src/server/journeys/chedpp-plants/` and its contents
get added to git. Expected files (verify against working tree):

- `obligations.json`
- `refdata.json`
- `journey.json`
- `resolvers.js` (today contains a local `or` combinator —
  Story 10 replaces it with the kernel one)
- `scenarios.js`
- `chedpp-notification-schema.json`
- `index.js` (exports the adapter surface: obligations, refdata,
  journeyMap, journeyResolver, scenarios)

The journey's `index.js` exports must satisfy the adapter contract
that the plugin and engine require. Verify by:

- `validateJourney` accepts it at startup (i.e. obligations is a
  non-empty array; refdata.routing is an object; journeyMap.sections
  is an array; resolvers / journeyResolver has the right shape; etc.
  — whatever the existing inline check requires).

If any of the working-tree files don't quite satisfy the contract
(e.g. naming mismatches against the adapter shape settled in
Stories 02-08), bring them into line — keep the changes minimal and
local to the chedpp-plants directory.

**2. Register `chedpp-plants` in the JOURNEYS map.**

`src/server/plugins/evaluation-engine/plugin.js` (per Story 08)
contains the JOURNEYS map. Add:

```javascript
import * as chedppPlants from '#server/journeys/chedpp-plants/index.js'
// ...
const JOURNEYS = {
  'eu-live-animals': euLiveAnimals,
  'chedpp-plants': chedppPlants
}
```

At plugin startup, `validateJourney` runs against each entry. Both
journeys must pass.

`server.app.evaluationEngine.listJourneys()` now returns both keys.
`evaluate(journeyKey, ...)` and `getJourney(journeyKey)` accept
either key.

**3. UI surface — untouched.**

The five explorer route handlers continue to import from
`src/server/journeys/eu-live-animals/index.js` directly and continue
to call `evaluationEngine.evaluate('eu-live-animals', ...)` and
`evaluationEngine.getJourney('eu-live-animals')`. No new UI exposes
chedpp-plants. Adding a journey picker, registering plant scenarios
to a dropdown, or building plant-specific views is _separate work_
and is not part of this refactor.

## Tests

A small registration test, plus the existing tests continue to pass.

New `src/server/plugins/evaluation-engine/registration.test.js` (or
similar; co-locate with the plugin) — only if not already covered
by Story 08's boot test:

State the behaviour and risks (≤5 lines):

> Plugin registration with two journeys: both pass validateJourney
> at startup; listJourneys returns both keys; evaluate routes by
> key. Risks: adapter shape mismatch for chedpp-plants, accidental
> coupling between journey modules.

High-value cases:

- `listJourneys()` returns `['eu-live-animals', 'chedpp-plants']`
  (order-independent).
- `evaluate('chedpp-plants', <empty notification>)` returns an
  `EvaluationResult` (shape per §5.1) — does not throw.
- `evaluate('chedpp-plants', <a chedpp scenario from the journey>)`
  returns `summary.submittable === true`.
- `evaluate('eu-live-animals', <empty notification>)` still works
  (regression).

Explicitly excluded:

- Don't add a contract test per scenario in this story — that's
  Story 11.
- Don't test chedpp-plants' internal resolver functions; the
  evaluate-engine contract covers the surface.

## Acceptance Criteria

- [ ] `src/server/journeys/chedpp-plants/` is committed (no longer
      untracked).
- [ ] `chedpp-plants` is registered in the JOURNEYS map in
      `plugin.js`.
- [ ] `validateJourney` accepts both adapters at startup; the server
      boots cleanly with `npm run dev`.
- [ ] `server.app.evaluationEngine.listJourneys()` returns both
      keys.
- [ ] `evaluate('chedpp-plants', notification)` and
      `getJourney('chedpp-plants')` work via the facade.
- [ ] Explorer route handlers and view templates are unchanged.
- [ ] All four UI views continue to render `eu-live-animals` content
      correctly. The UI does not expose chedpp-plants.
- [ ] All existing tests continue to pass; the new registration test
      passes.

## Verification

```bash
git status   # chedpp-plants/ files now tracked

# Both journeys load:
npm run dev   # logs should mention both journeys at registration
              # or `listJourneys` can be inspected at the debug view

# Tests:
TZ=UTC npx vitest run src/server/plugins/evaluation-engine/registration.test.js
npm test

# UI smoke — eu-live-animals only, as before:
#   /explorer
#   /explorer/tasklist
#   /explorer/debug
#   /explorer/commodity-config
```

## What NOT to change

- Don't modify explorer route handlers. They stay hardcoded to
  `'eu-live-animals'`. No journey picker, no chedpp scenario dropdown,
  no chedpp commodity-config view.
- Don't modify view templates.
- Don't change `validateJourney` to accommodate chedpp-plants — if
  chedpp-plants needs adjustment to pass the existing check, adjust
  the _journey_, not the validator.
- Don't replace chedpp-plants' local `or` combinator in this story
  (Story 10).
- Don't add `journey.contract.test.js` files in this story
  (Story 11).
