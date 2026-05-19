# Story 02: Declare protocol types

## Goal

`engine/types.js` exists and exports the protocol vocabulary as
named, frozen constants plus JSDoc typedefs. Existing modules import
the constants in place of their string literals. No behaviour change.

## Why

Today the obligation status values (`'satisfied'`, `'unsatisfied'`,
`'deferred'`, `'inactive'`) and screen status values (`'complete'`,
`'incomplete'`, `'cannotStartYet'`, `'notApplicable'`) live as
scattered string literals across `evaluate-obligations.js`,
`trace-evaluate-obligations.js`, and `routes/explorer/map-to-screens.js`.

`protocol.md` §3 names these enums as part of the *immovable surface*
of the protocol. Promoting them to named, frozen constants makes the
protocol visible in code, greppable, and stable. Subsequent refactor
stages reference them rather than re-introducing literals as the code
moves.

The JSDoc typedefs declare the rest of the protocol vocabulary
(`Obligation`, `Condition`, `JourneyResolver`, …) in one place so
future modules can `@param` against them.

## Context

- `features/modelling/protocol.md` §2 (contract inventory) and §3
  (immovable surface).
- `features/modelling/engine-design.md` Stage 1.
- Files that currently use the literals:
  - `src/server/plugins/evaluation-engine/evaluate-obligations.js`
  - `src/server/plugins/evaluation-engine/trace-evaluate-obligations.js`
  - `src/server/routes/explorer/map-to-screens.js`
  - `src/server/routes/explorer/tasklist-controller.js`

## Specification

Create `src/server/engine/types.js`. Two responsibilities:

**1. Frozen status constants.**

```javascript
export const OBLIGATION_STATUS = Object.freeze({
  SATISFIED:   'satisfied',
  UNSATISFIED: 'unsatisfied',
  DEFERRED:    'deferred',
  INACTIVE:    'inactive'
})

export const SCREEN_STATUS = Object.freeze({
  COMPLETE:         'complete',
  INCOMPLETE:       'incomplete',
  CANNOT_START_YET: 'cannotStartYet',
  NOT_APPLICABLE:   'notApplicable'
})
```

The literal strings must match what callers already check against
(per protocol.md §3 — these values are the wire format).

**2. JSDoc typedefs.**

Declare typedefs for every interface in protocol.md §2:
`Obligation`, `Condition`, `JourneyResolver`, `FactExtractor`,
`ConditionTest`, `TestResult`, `JourneyMap`, `Section`, `ScreenDef`,
`Field`, `Visibility`, `EvaluationResult`, `EvaluatedObligation`,
`Summary`, `Trace`, `TraceStep`, `Screen`, `EnrichedField`,
`JourneyAdapter`.

JSDoc only; no runtime exports for typedefs.

**Update existing modules to import and use the constants.**

In each file listed in Context, replace the four obligation status
literals with `OBLIGATION_STATUS.SATISFIED` etc., and the four screen
status literals (where present) with `SCREEN_STATUS.*` etc. Behaviour
unchanged.

`map-to-screens.js` returns `SCREEN_STATUS.COMPLETE` etc. and the task
list controller's `SCREEN_STATUS_TAGS` map keys to the same constants.

## Tests

New `src/server/engine/types.test.js`:

- Each `OBLIGATION_STATUS.*` resolves to the exact string literal it
  replaces (wire compatibility).
- Each `SCREEN_STATUS.*` resolves to the exact string literal it
  replaces.
- Both constants are frozen (`Object.isFrozen(...)` returns `true`).

Test selection per `.claude/skills/valuable-unit-tests.md`: the only
risk here is wire mismatch. Two table-driven tests (one per enum) plus
two freeze assertions. No need to test the typedefs — JSDoc is
documentation.

Greppability — a manual check, not a Vitest test:

```bash
rg "'satisfied'|'unsatisfied'|'deferred'|'inactive'" \
  src/server/plugins/evaluation-engine src/server/routes/explorer \
  | grep -v test.js | grep -v scenarios | grep -v types.js
```

Should return no matches after the replacement.

Existing tests pass unchanged.

## Acceptance Criteria

- [ ] `src/server/engine/types.js` exists and exports
  `OBLIGATION_STATUS` and `SCREEN_STATUS` as frozen objects.
- [ ] Each enum value matches the literal it replaces (wire
  compatibility).
- [ ] JSDoc typedefs declared for the protocol records named in
  protocol.md §2.
- [ ] The four engine/route modules import and use the constants in
  place of literals.
- [ ] String literals for status values appear only in tests,
  fixtures, scenarios, and `types.js` itself (greppable).
- [ ] All existing tests pass.
- [ ] All four explorer views render correctly.

## Verification

```bash
TZ=UTC npx vitest run src/server/engine/types.test.js
npm test
# Greppability:
rg "'satisfied'|'unsatisfied'|'deferred'|'inactive'" \
  src/server/plugins/evaluation-engine src/server/routes/explorer \
  | grep -v test.js | grep -v scenarios | grep -v types.js
# Expected: no output.
npm run dev    # smoke each explorer view
```

## What NOT to change

- Don't move any module. Only `engine/types.js` is new; existing
  files only change their internals to use constants.
- Don't change any return shape, throw condition, or behaviour.
- Don't touch route handlers' import paths or their `'eu-live-animals'`
  hardcoding.
- Don't add `engine/` re-export shims or barrels; that begins
  Story 04.
- Don't extract `resolvePath` / `isEmpty` yet (Story 03).
