# Story 05: engine/evaluate-with-trace.js

## Goal

`engine/evaluate-with-trace.js` exports `evaluateWithTrace(notification,
adapter)` matching protocol.md §5.2 exactly. The old
`trace-evaluate-obligations.js` becomes a thin re-export shim so the
existing facade (`evaluationEngine.evaluate` in the plugin) continues
to work.

## Why

Story 04 landed the canonical evaluator in `engine/`. The traced
counterpart follows the same shape: new module with the
adapter-shaped signature, contract tests against §5.2, and a shim
preserving the old caller signature.

protocol.md §5.2 declares the contract: same return shape as
`evaluate` plus a `trace` field per obligation. The trace step shapes
are exhaustive (six variants by `step`), and the terminal step always
matches the obligation's final status. Status equivalence with
`evaluate` is asserted at runtime today (`assertEquivalence`); the
contract test for §5.2 lifts that assertion into a test.

## Context

- `features/modelling/protocol.md` §5.2 — exact contract: trace
  shape, terminal-step / status correspondence, throws.
- `features/modelling/engine-design.md` §4 (today's code → engine
  mapping) and Stage 2c.
- `src/server/plugins/evaluation-engine/trace-evaluate-obligations.js`
  — current implementation.

## Specification

**1. Create `src/server/engine/evaluate-with-trace.js`.**

Export `evaluateWithTrace(notification, adapter)` with this contract:

- **Parameters:** same as `engine/evaluate.js` Story 04.
- **Returns** `EvaluationResult` (per §5.1) with each
  `EvaluatedObligation` extended by a `trace: Trace` field per §5.2.
- **Throws** the §5.1 set of conditions _plus_ the §5.2 mismatch
  error if any traced status diverges from the canonical status.

The module:

- Calls `engine/evaluate.js` to get the canonical result (for the
  equivalence assertion).
- Re-walks the obligations producing traces via the step builders
  (existing `buildExtractFactStep` / `buildApplyTestStep` /
  `buildDeferredStep` / `buildInactiveStep` / `buildSatisfactionStep` /
  `buildActionCheckStep` patterns preserved verbatim).
- For each obligation, `assertEquivalence` compares traced status
  against canonical status; throws on mismatch with the protocol's
  exact message format.

Step builders, `traceObligation`, `buildSatisfactionSteps`, and
`assertEquivalence` stay inside the module (private helpers).

Imports:

- `evaluate` from `engine/evaluate.js`.
- `resolvePath`, `isEmpty` from `engine/path.js`.
- `OBLIGATION_STATUS` from `engine/types.js`.

**2. Convert `trace-evaluate-obligations.js` into a re-export shim.**

```javascript
import { evaluateWithTrace } from '#server/engine/evaluate-with-trace.js'

// Adapt the old positional signature for existing callers.
export const traceEvaluateObligations = (
  notification,
  obligations,
  refdata,
  resolvers
) =>
  evaluateWithTrace(notification, {
    obligations,
    refdata,
    journeyResolver: resolvers
  })
```

The plugin's `evaluationEngine.evaluate(journeyKey, notification)`
internally calls `traceEvaluateObligations` (via the shim); the
explorer routes continue to work without change.

## Tests

New `src/server/engine/evaluate-with-trace.test.js` — owns §5.2 in
full.

**State the behaviour and risks (≤5 lines):**

> The function returns the canonical evaluation plus a `Trace` per
> obligation. Risks: trace step shape drift, mismatched terminal
> step vs status, missing `condition` for conditional traces,
> equivalence-assertion silently broken. Real data: every committed
> scenario.

**High-value cases:**

- Each terminal step shape per §5.2 produces the matching status:
  - `deferred` step → status `'deferred'`.
  - `inactive` step → status `'inactive'`.
  - `satisfaction-check` with `missing === 0` → `'satisfied'`.
  - `satisfaction-check` with `missing > 0` → `'unsatisfied'`.
  - `action-check` with `satisfied: true` → `'satisfied'`.
  - `action-check` with `satisfied: false` → `'unsatisfied'`.
- `trace.type === 'conditional'` iff the obligation has a condition;
  `trace.condition` present iff conditional.
- `trace.steps` last element is always a terminal step.
- Status equivalence: for the same `(notification, adapter)`,
  `evaluate(...)` and `evaluateWithTrace(...)` produce identical
  `obligations[i].status`. Table-driven over every committed
  eu-live-animals scenario plus an empty notification.
- Mismatch throw: if a contrived setup makes the traced status differ
  from canonical, the module throws with the §5.2 message format.
  (This is the safety-net path; one test is sufficient.)

**Explicitly excluded:**

- Don't unit-test the step builders directly — they are private and
  fully covered by the terminal-step-vs-status table.
- Don't snapshot the trace structure — focused assertions per shape
  are clearer.

Existing `trace-evaluate-obligations.test.js` continues to pass
against the shim. No changes to that test.

## Acceptance Criteria

- [ ] `engine/evaluate-with-trace.js` exists and exports
      `evaluateWithTrace(notification, adapter)`.
- [ ] Contract matches protocol.md §5.2 exactly: return shape, trace
      step variants, terminal-step ↔ status correspondence, throws.
- [ ] `trace-evaluate-obligations.js` is a thin shim adapting the
      positional signature.
- [ ] The plugin facade (`evaluationEngine.evaluate`) and explorer
      routes continue to work without modification.
- [ ] `engine/evaluate-with-trace.test.js` covers every §5.2 contract
      case (terminal-step table, conditional/unconditional, equivalence,
      mismatch throw).
- [ ] All existing tests continue to pass.
- [ ] All four explorer views render correctly, including
      `/explorer/debug` which depends on the trace structure.

## Verification

```bash
TZ=UTC npx vitest run src/server/engine/evaluate-with-trace.test.js
TZ=UTC npx vitest run src/server/plugins/evaluation-engine/trace-evaluate-obligations.test.js
npm test
npm run dev
# /explorer/debug must render the trace correctly — this is the view
# that exercises the trace structure most directly.
```

## What NOT to change

- Don't modify route handlers or view templates. The trace shape is
  preserved verbatim, so the debug view continues to work.
- Don't change `engine/evaluate.js` (Story 04 is the source of
  truth for the canonical path).
- Don't delete `trace-evaluate-obligations.js`. The shim stays until
  Story 07.
- Don't change the trace step shapes or the `assertEquivalence`
  behaviour beyond what protocol.md §5.2 declares.
- chedpp-plants is not registered yet; this story is engine-only.
