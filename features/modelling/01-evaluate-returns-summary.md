# Story 01: Evaluate returns summary

## Goal

`evaluateObligations` returns `{ obligations, summary }` as
`protocol.md` §5.1 declares. Today it returns `{ obligations }` only;
summary is computed only in the trace path. After this story the
canonical evaluator's return shape matches the documented contract.
No structural moves, no file renames.

## Why

`protocol.md` §5.1 defines `EvaluationResult` as
`{ obligations, summary }`. The canonical evaluator does not currently
produce `summary` — the only caller that needs it
(`traceEvaluateObligations`) computes its own. This is an oversight,
not a design choice.

### Why summary lives on both evaluator paths

After this story, the canonical evaluator and the trace evaluator
differ in *exactly two ways*:

1. The trace evaluator adds a `trace` field per obligation
   (chronological steps showing how each status was derived).
2. The trace evaluator runs the canonical-equivalence assertion
   (calls the canonical evaluator internally and throws if statuses
   diverge — a runtime safety net).

Summary is *not* a third differentiator — it lives on both. The
reason is twofold:

- **Cost.** Summary is a single reduction (six counts plus a boolean)
  over the obligations array. Sub-millisecond work. Making it
  conditional adds branching without saving anything meaningful.
- **Demand.** Every host that uses the engine today consumes
  `submittable`: the task list shows it, the submit gate uses it,
  the journey controller branches on it. If the canonical path
  doesn't compute summary, every host iterates obligations to
  re-derive it — duplication the contract avoids.

The "production vs diagnostic" distinction the trace evaluator was
designed for is preserved by the *trace field*, not by the summary.
Trace generation is measurably more work (per-obligation step
builders; the double pass — canonical first, then trace — for the
equivalence assertion). That's the cost the trace evaluator exists
to opt into. The canonical `evaluate` skips that work entirely and
still returns enough to drive the production submission gate and
basic UI state.

### Why preflight

Aligning the canonical path with the documented contract has to
happen before the structural refactor begins, because every
subsequent story tests against the protocol shape. Isolating this
one behavioural delta in its own commit also separates "behaviour
change" from the mechanical moves that follow.

## Context

- `features/modelling/protocol.md` §5.1 — `EvaluationResult` shape,
  `Summary` shape, and the invariants summary must satisfy.
- `features/modelling/engine-design.md` Stage 0 — the preflight
  framing.
- `src/server/plugins/evaluation-engine/evaluate-obligations.js` —
  current canonical evaluator.
- `src/server/plugins/evaluation-engine/trace-evaluate-obligations.js`
  — current trace evaluator; contains the existing summary
  calculation (`calculateSummary`).

## Specification

`src/server/plugins/evaluation-engine/evaluate-obligations.js`:

1. After computing `evaluated`, compute `summary` using the same
   reduction the trace path already uses: counts per status, `total`,
   `submittable === (unsatisfied === 0 && deferred === 0)`.
2. Return `{ obligations: evaluated, summary }` instead of
   `{ obligations: evaluated }`.

`src/server/plugins/evaluation-engine/trace-evaluate-obligations.js`:

- Behaviour unchanged. It may continue computing summary independently
  or read it from the canonical result; either is acceptable. The
  module's public contract does not change.

No file renames. No new modules. No directory moves.

## Tests

`src/server/plugins/evaluation-engine/evaluate-obligations.test.js`
extended:

- Existing assertions on the return shape add `summary`.
- New assertions cover the §5.1 invariants:
  - `summary.satisfied + summary.unsatisfied + summary.deferred + summary.inactive === summary.total`
  - `summary.total === obligations.length`
  - `summary.submittable === (summary.unsatisfied === 0 && summary.deferred === 0)`
- Empty notification → `summary.submittable === false`.
- Every committed eu-live-animals scenario → `summary.submittable === true`.

Test selection follows `.claude/skills/valuable-unit-tests.md`: focus
on the invariants, not on internals of how summary is computed.
Table-driven where multiple status combinations need coverage.

`trace-evaluate-obligations.test.js` is unchanged.

## Acceptance Criteria

- [ ] `evaluateObligations(...)` returns an object with both
  `obligations` and `summary` keys.
- [ ] Summary matches the shape declared in `protocol.md` §5.1.
- [ ] Summary invariants hold for every test case (table-driven).
- [ ] All existing tests pass (with their shape assertions extended).
- [ ] All four explorer views render correctly for every committed
  eu-live-animals scenario.

## Verification

```bash
TZ=UTC npx vitest run src/server/plugins/evaluation-engine/evaluate-obligations.test.js
npm test
npm run dev
# Manual smoke against the four views:
#   /explorer
#   /explorer/tasklist
#   /explorer/debug
#   /explorer/commodity-config
```

## What NOT to change

- No new files. No directory moves. No renames.
- Don't touch the trace evaluator's public behaviour or its tests.
- Don't modify any explorer route handler or view template; they
  consume the engine through `server.app.evaluationEngine` and
  continue to use `'eu-live-animals'` as the journey key.
- Don't introduce the `engine/` directory; that begins in Story 02.
- Don't touch chedpp-plants (not registered yet; Story 09).
