# Story 11: Per-journey contract tests

## Goal

Both registered journeys (`eu-live-animals` and `chedpp-plants`) ship
a `journey.contract.test.js` file in their journey directory. Each
test uses `test.each` over `adapter.scenarios` and asserts every
scenario evaluates `summary.submittable === true`. This is the
real-data integration test that proves each journey is fit for the
engine.

## Why

The contract test answers the question "is this journey internally
consistent?" in one assertion: every scenario the journey ships must
evaluate to a submittable state. If a scenario fails, either the
scenario is wrong or the obligation/resolver/journey-map shape is
broken — both are caught.

It is the _reviewer's safety net_ — a reviewer can verify journey
fitness without reading the entire adapter. It is also the
real-data integration test from engine-design.md §6: it exercises
the full engine pipeline (`evaluate` → `resolveScreens` →
`rollUpToSections` if desired) against the journey's own fixtures,
with no mocks.

By placing the test inside each journey's directory and importing
from canonical `engine/*` paths (settled in Story 07/08), it becomes
a per-journey deliverable that ships with the journey itself.

## Context

- `features/modelling/authoring.md` §6 — the contract test pattern.
- `features/modelling/engine-design.md` §6 ("Real-data integration").
- `src/server/journeys/eu-live-animals/` — first journey.
- `src/server/journeys/chedpp-plants/` — second journey (registered
  in Story 09).

## Specification

**1. Add `src/server/journeys/eu-live-animals/journey.contract.test.js`.**

```javascript
import { describe, expect, test } from 'vitest'
import { evaluate } from '#server/engine/evaluate.js'
import * as adapter from './index.js'

describe('eu-live-animals: every scenario is submittable', () => {
  test.each(Object.entries(adapter.scenarios))(
    'scenario "%s" evaluates submittable',
    (_name, scenario) => {
      const { summary } = evaluate(scenario.notification, adapter)
      expect(summary.submittable).toBe(true)
    }
  )
})
```

If the adapter's `scenarios` shape differs from `Object.entries`-able
(e.g. an array of named objects), adapt the iteration accordingly —
preserve the property that each scenario gets its own
`test.each` row with a descriptive name.

The adapter passed to `evaluate` must match the `JourneyAdapter`
record shape settled by Stories 02-08: at least `obligations`,
`refdata`, `journeyResolver`. If the journey's `index.js` exports a
single adapter object, import it; if it exports named pieces,
construct the adapter inline.

**2. Add `src/server/journeys/chedpp-plants/journey.contract.test.js`.**

Same pattern, against the chedpp-plants adapter.

```javascript
import { describe, expect, test } from 'vitest'
import { evaluate } from '#server/engine/evaluate.js'
import * as adapter from './index.js'

describe('chedpp-plants: every scenario is submittable', () => {
  test.each(Object.entries(adapter.scenarios))(
    'scenario "%s" evaluates submittable',
    (_name, scenario) => {
      const { summary } = evaluate(scenario.notification, adapter)
      expect(summary.submittable).toBe(true)
    }
  )
})
```

**3. Match the import path convention.**

If the project uses path aliases (`#server/engine/...`), use them.
Otherwise use relative imports (`../../engine/evaluate.js`). Confirm
against the existing test files for consistency.

## Tests

This story _is_ the test work. The acceptance is whether both
journeys' scenarios evaluate `submittable: true`.

If any scenario fails:

- It is a real problem in the journey (mis-authored scenario, or a
  semantic mismatch between obligations/resolvers and the scenario
  data) — not a problem to suppress in the test.
- The journey needs fixing in this story (or the scenario removed
  with explicit justification).

Test selection per `.claude/skills/valuable-unit-tests.md`: the
contract is one assertion per scenario; this is the highest-value
test per scenario authoring. No need for additional shapes.

## Acceptance Criteria

- [ ] `src/server/journeys/eu-live-animals/journey.contract.test.js`
      exists and runs `test.each` over `adapter.scenarios`.
- [ ] `src/server/journeys/chedpp-plants/journey.contract.test.js`
      exists and runs `test.each` over `adapter.scenarios`.
- [ ] Every scenario from both journeys evaluates
      `summary.submittable === true`.
- [ ] Both tests import `evaluate` from the canonical
      `engine/evaluate.js` path.
- [ ] `npm test` is green.
- [ ] No existing tests change as part of this story.

## Verification

```bash
TZ=UTC npx vitest run src/server/journeys/eu-live-animals/journey.contract.test.js
TZ=UTC npx vitest run src/server/journeys/chedpp-plants/journey.contract.test.js
npm test

# Confirm both files exist:
ls src/server/journeys/eu-live-animals/journey.contract.test.js
ls src/server/journeys/chedpp-plants/journey.contract.test.js

npm run dev    # smoke the four eu-live-animals views (unchanged)
```

## What NOT to change

- Don't modify any obligation, resolver, refdata, journey map, or
  scenario file to _make_ a failing scenario pass without diagnosing
  the cause. A failed scenario is a real signal.
- Don't add tests at any other granularity in this story (no
  obligation-by-obligation tests; no module-internal tests). The
  contract test is the per-journey deliverable.
- Don't modify the engine, the plugin, or any route handler.
- Don't add a UI surface for chedpp-plants.
- Don't change the import path convention; match what existing tests
  use.
