# Story 04: engine/evaluate.js (walking skeleton)

## Goal

`engine/evaluate.js` exports `evaluate(notification, adapter)` matching
the protocol contract exactly. The old `evaluate-obligations.js`
becomes a thin re-export shim so existing callers continue to work.
This is the **walking skeleton** of the refactor — the first
behavioural function to land in `engine/` via the branch-by-abstraction
pattern. Every later module repeats this same shape.

## Why

`protocol.md` §5.1 declares the exact contract: `evaluate(notification,
adapter) → EvaluationResult`. Today the equivalent function is
`evaluateObligations(notification, obligations, refdata, resolvers)`
with positional parameters that *flatten* what should be one adapter
record.

Landing the new shape first, with a shim preserving the old caller
signature, proves the branch-by-abstraction pattern works:
- New file beside old; old file becomes the shim.
- Public contract tests anchor the new shape.
- Existing tests against the old shape continue passing through the
  shim.
- Subsequent stories repeat this with confidence.

Doing this as the *fourth* story (after preflight + types + path) is
deliberate — Stories 01-03 provide the dependencies this story
consumes (`summary` in the return; `OBLIGATION_STATUS` constants;
shared `resolvePath`/`isEmpty`).

## Context

- `features/modelling/protocol.md` §5.1 — the exact public contract
  for `evaluate`.
- `features/modelling/engine-design.md` §4 (today's code → engine
  mapping) and Stage 2b.
- `src/server/plugins/evaluation-engine/evaluate-obligations.js` —
  current implementation.

## Specification

**1. Create `src/server/engine/evaluate.js`.**

Export `evaluate(notification, adapter)` with this contract:

- **Parameters:**
  - `notification: object` — the notification under evaluation.
  - `adapter: JourneyAdapter` — the journey contribution as a single
    record with at least `obligations`, `refdata`, and
    `journeyResolver` (renamed from the old positional `resolvers`).
- **Returns** `EvaluationResult` per protocol.md §5.1:
  `{ obligations: EvaluatedObligation[], summary: Summary }`.
- **Throws** per §5.1:
  - `notification` null/non-object → `Error: notification must be a non-null object`
  - `adapter` null/non-object → `Error: adapter must be a non-null object`
  - `adapter.obligations` non-array → `Error: adapter.obligations must be an array`
  - Unknown fact name → `Error: Obligation "<id>" references unknown fact: "<fact>"`
  - Unknown test name → `Error: Obligation "<id>" references unknown test: "<test>"`

Behaviour mirrors today's `evaluateObligations` plus the Story 01
summary calculation. `evaluateSatisfaction` and the summary reduction
stay inside this module as private helpers.

Imports:
- `resolvePath`, `isEmpty` from `engine/path.js` (Story 03).
- `OBLIGATION_STATUS` from `engine/types.js` (Story 02).

**2. Convert `evaluate-obligations.js` into a re-export shim.**

```javascript
import { evaluate } from '#server/engine/evaluate.js'

// Adapt the old positional signature to the new adapter form so
// existing callers (route handlers, trace evaluator) keep working
// without modification.
export const evaluateObligations = (notification, obligations, refdata, resolvers) =>
  evaluate(notification, {
    obligations,
    refdata,
    journeyResolver: resolvers
  })

// Re-export the path utilities that traceEvaluateObligations may
// still expect from this module. (Or update its imports — see below.)
export { resolvePath, isEmpty } from '#server/engine/path.js'
```

Keep `trace-evaluate-obligations.js` working unchanged. If it
currently imports `resolvePath`/`isEmpty` from
`evaluate-obligations.js`, the re-exports above preserve that. Story 03
already moved trace's import to `engine/path.js` directly, so the
re-exports here are belt-and-braces.

## Tests

New `src/server/engine/evaluate.test.js` — owns protocol.md §5.1 in
full. Per `.claude/skills/valuable-unit-tests.md`:

**State the behaviour and risks (≤5 lines):**
> The function classifies each obligation as one of four statuses
> based on (a) condition fact/test resolution and (b) schema-path
> population; emits a summary with exact invariants. Risks: shape
> drift (status-discriminated fields), throw conditions, summary
> arithmetic. Inputs are real adapters and notifications; no mocks.

**High-value cases (~5-7):**

- Per `EvaluatedObligation` variant by status (the four shapes from §5.1):
  - `satisfied` — populated schemaPaths.
  - `unsatisfied` — at least one missing schemaPath; `missingPaths`
    lists the absent paths.
  - `deferred` — condition with null fact; `reason` is
    `${fact} not yet provided`.
  - `inactive` — condition test returns `active: false`; `reason` is
    the test's reason.
- Action-only obligation (`schemaPaths: []`): satisfied iff
  `submissionDatePath` is populated.
- `summary` invariants from §5.1 (counts sum to total; submittable
  rule). Already covered by Story 01's extension, but this story
  re-asserts via the new module's surface.
- Every committed eu-live-animals scenario evaluates `submittable:
  true` (real-data integration).
- Throws: each of the five conditions in §5.1, asserted by message
  pattern.

**Explicitly excluded (low-value):**

- Don't test `evaluateSatisfaction` directly — it's a private helper;
  the public surface covers it.
- Don't test internal call order or argument propagation — that's
  implementation detail.

Existing `evaluate-obligations.test.js` continues to pass against the
shim — no test changes there.

## Acceptance Criteria

- [ ] `engine/evaluate.js` exists and exports `evaluate(notification, adapter)`.
- [ ] Return shape, throw conditions, and status semantics match
  protocol.md §5.1 exactly.
- [ ] `evaluate-obligations.js` is a thin shim that adapts the old
  positional signature to the new adapter form.
- [ ] Existing route handlers (in `routes/explorer/*`) and the trace
  evaluator continue to work without modification.
- [ ] `engine/evaluate.test.js` covers every §5.1 contract case
  (variants, summary invariants, throws, real-data smoke).
- [ ] All existing tests continue to pass.
- [ ] All four explorer views render correctly.

## Verification

```bash
TZ=UTC npx vitest run src/server/engine/evaluate.test.js
TZ=UTC npx vitest run src/server/plugins/evaluation-engine/evaluate-obligations.test.js
npm test
npm run dev    # smoke each explorer view
```

## What NOT to change

- Don't touch the trace evaluator's public behaviour or tests
  (Story 05).
- Don't modify route handlers — they continue importing
  `evaluation-engine/index.js` and calling
  `evaluationEngine.evaluate('eu-live-animals', notification)`. The
  plugin facade is unchanged; the shim is the bridge.
- Don't delete `evaluate-obligations.js`. The shim stays until
  Story 07 deletes all shims at once.
- Don't introduce a journey picker or expose chedpp-plants to the UI
  (chedpp isn't registered yet; Story 09).
- Don't change behaviour beyond what protocol.md §5.1 declares.
