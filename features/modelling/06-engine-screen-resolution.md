# Story 06: engine/resolve-screens.js + engine/roll-up-to-sections.js

## Goal

`engine/resolve-screens.js` and `engine/roll-up-to-sections.js` exist
and match protocol.md §5.3 and §5.4. The old
`routes/explorer/map-to-screens.js` becomes a thin re-export shim so
the explorer routes continue to work.

## Why

The screen-mapping functions are the second half of the engine — they
fold the `EvaluationResult` over the journey map's page structure
producing screens (with derived status) and section rollups
(with filtering). Today they live under `routes/explorer/`, which
miscategorises them as host code. They are universal,
journey-agnostic, framework-free pure functions — exactly the engine's
domain. Their move to `engine/` makes the kernel boundary honest.

`mapToScreens` is renamed `resolveScreens` to align with the protocol
vocabulary (per protocol.md §5.3) and to avoid the
`resolver`/`mapper` asymmetry called out in earlier conversation.
`rollUpToSections` keeps its name (already aligned).

The status-derivation rules in §5.3 and §5.4 are tables the test
suite asserts directly.

## Context

- `features/modelling/protocol.md` §5.3 (`resolveScreens`) and §5.4
  (`rollUpToSections`).
- `features/modelling/engine-design.md` §4 and Stage 2d.
- `src/server/routes/explorer/map-to-screens.js` — current
  implementation; contains both functions plus their derive-status
  helpers.
- `src/server/routes/explorer/tasklist-controller.js`,
  `journey-controller.js`, `debug-controller.js` — consumers.

## Specification

**1. Create `src/server/engine/resolve-screens.js`.**

Export `resolveScreens(result, journeyMap)` per protocol.md §5.3:

- **Parameters:** `result: EvaluationResult`, `journeyMap: JourneyMap`.
- **Returns** `Screen[]` (flat, across all sections), each with
  `{ screenId, screenName, sectionId, sectionName, status, fields, repeats? }`.
- Status-derivation table per §5.3 — top-down, first-match-wins:
  no obligations → `complete`; any unsatisfied → `incomplete`; any
  deferred (no unsatisfied) → `cannotStartYet`; all inactive →
  `notApplicable`; otherwise → `complete`.
- Fields are enriched with `obligationStatus` iff they have an
  `obligationRef`; other field properties pass through verbatim.
- **Throws** per §5.3:
  - missing `result` / `result.obligations` → `Error: resolveScreens: evaluationResult must have obligations array`
  - missing `journeyMap` / `journeyMap.sections` → `Error: resolveScreens: journeyMap must have sections array`
  - dangling `obligationRef` → `Error: Field "<fieldName>" references obligation "<obligationRef>" which was not found in evaluation result.`

`deriveScreenStatus`, `enrichField`, `extractScreenObligations`, and
`processScreen` stay inside the module (private helpers).

Imports `SCREEN_STATUS` from `engine/types.js`.

**2. Create `src/server/engine/roll-up-to-sections.js`.**

Export `rollUpToSections(screens)` per protocol.md §5.4:

- **Parameters:** `screens: Screen[]`.
- **Returns** `Section[]` with `{ sectionId, sectionName, status, screens }`.
- Sections appear in first-appearance order.
- Screens with `status === 'notApplicable'` are excluded from
  `section.screens`.
- A section whose every screen is `notApplicable` is omitted.
- Section-status derivation per §5.4 (no `notApplicable` in
  SectionStatus): any `incomplete` → `incomplete`; otherwise any
  `cannotStartYet` → `cannotStartYet`; else `complete`.
- **Throws** per §5.4:
  - non-array input → `Error: rollUpToSections: screens must be an array`
  - missing `sectionName` on first appearance of a `sectionId` →
    `Error: rollUpToSections: screen "<screenId>" has sectionId "<sectionId>" but missing sectionName.`

`deriveSectionStatus` stays inside this module.

Imports `SCREEN_STATUS` from `engine/types.js`.

**3. Convert `routes/explorer/map-to-screens.js` into a re-export shim.**

```javascript
export { resolveScreens as mapToScreens } from '#server/engine/resolve-screens.js'
export { rollUpToSections } from '#server/engine/roll-up-to-sections.js'
```

The shim preserves the old import paths used by the explorer
controllers (`journey-controller.js`, `tasklist-controller.js`,
`debug-controller.js`) until Story 07 switches them.

## Tests

Two test files, each owning its protocol §5 section.

**`src/server/engine/resolve-screens.test.js` — owns §5.3.**

State the behaviour and risks (≤5 lines):

> Folds an EvaluationResult over a JourneyMap producing a flat
> Screen[]. Risks: status-derivation rule order (top-down,
> first-match wins matters), field-enrichment for obligationRef
> presence, repeats pass-through, dangling-ref throws.

High-value cases:

- Status-derivation table per §5.3 — one test per row (5 rows).
- Field enrichment: field with `obligationRef` gets
  `obligationStatus`; field without doesn't.
- `repeats` is preserved on screens where the source had it; absent
  otherwise.
- Throws on missing inputs (2 cases).
- Throws on dangling `obligationRef` with the exact message format.

Explicitly excluded:

- Don't unit-test `deriveScreenStatus` directly — the public table
  covers it.

**`src/server/engine/roll-up-to-sections.test.js` — owns §5.4.**

State the behaviour and risks (≤5 lines):

> Groups screens by section in first-appearance order; filters
> notApplicable; omits whole-notApplicable sections; derives section
> status. Risks: filter behaviour, omission rule, section-status
> rule order, throws.

High-value cases:

- First-appearance ordering preserved across out-of-order input.
- `notApplicable` screens excluded from `section.screens`.
- A section with all screens `notApplicable` is omitted entirely.
- Section-status derivation table per §5.4 (3 rows).
- Throws on non-array input.
- Throws on missing `sectionName` on first appearance.

Both files use real-data inputs (eu-live-animals scenarios and
journey map) as integration smoke cases.

## Acceptance Criteria

- [ ] `engine/resolve-screens.js` exports `resolveScreens(result, journeyMap)`
      matching protocol.md §5.3 (shape, status table, throws).
- [ ] `engine/roll-up-to-sections.js` exports `rollUpToSections(screens)`
      matching protocol.md §5.4 (shape, filter rules, status table,
      throws).
- [ ] `routes/explorer/map-to-screens.js` is a thin shim that
      re-exports both functions (with `resolveScreens` aliased as
      `mapToScreens`).
- [ ] Explorer route handlers continue to import and call the same
      symbols they do today.
- [ ] `engine/resolve-screens.test.js` and
      `engine/roll-up-to-sections.test.js` cover their respective
      protocol sections.
- [ ] All existing tests continue to pass.
- [ ] All four explorer views render correctly, including the task
      list ordering and the section/screen status badges.

## Verification

```bash
TZ=UTC npx vitest run src/server/engine/resolve-screens.test.js
TZ=UTC npx vitest run src/server/engine/roll-up-to-sections.test.js
TZ=UTC npx vitest run src/server/routes/explorer/map-to-screens.test.js
npm test
npm run dev
# All four views are affected by this story (they all consume
# resolveScreens / rollUpToSections directly or transitively):
#   /explorer            — section + screen status badges
#   /explorer/tasklist   — GOV.UK task list rendering
#   /explorer/debug      — uses resolveScreens for the field map
#   /explorer/commodity-config — not affected, but smoke-check
```

## What NOT to change

- Don't modify the explorer route controllers. They continue to
  import from `routes/explorer/map-to-screens.js` (the shim).
- Don't modify view templates.
- Don't delete `map-to-screens.js`. The shim stays until Story 07.
- Don't change the derivation rules — they are the universal
  protocol rules from §5.3 and §5.4, not journey-configurable.
- chedpp-plants is not registered yet.
