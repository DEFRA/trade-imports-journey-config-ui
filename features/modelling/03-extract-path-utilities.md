# Story 03: Extract path utilities

## Goal

`resolvePath` and `isEmpty` live at `engine/path.js`. The two existing
callers import from there. No behaviour change.

## Why

`resolvePath` (dot-notation traversal with `[]` array marker) and
`isEmpty` (protocol-specific emptiness check) live inside
`evaluate-obligations.js` today and are re-imported by
`trace-evaluate-obligations.js`. They are genuinely shared engine
utilities — two distinct public functions both depend on them — but
they are not part of the public surface of the engine (protocol.md §3
does not expose them).

`engine-design.md` §1 names `path.js` as the only non-public file in
the engine. Landing it before the public modules (`evaluate.js`,
`evaluate-with-trace.js` in Stories 04 and 05) means the public moves
import from a settled location.

## Context

- `features/modelling/engine-design.md` §4 (where today's code lands)
  and Stage 2a.
- `src/server/plugins/evaluation-engine/evaluate-obligations.js` —
  current source of `resolvePath` and `isEmpty`.
- `src/server/plugins/evaluation-engine/trace-evaluate-obligations.js`
  — imports both from the canonical module.

## Specification

**1. Create `src/server/engine/path.js`.**

Move `resolvePath` and `isEmpty` from `evaluate-obligations.js` to the
new file, *verbatim*. Both are exported.

Behaviour preserved:

- `resolvePath` strips the `notification.` prefix; walks dot-separated
  segments; handles `[]` array markers per the existing logic.
- `isEmpty`: `undefined` / `null` / `''` / `[]` / `{}` empty;
  `false` / `0` not empty.

No type imports needed at this stage; `engine/types.js` typedefs are
available but the utilities are simple enough that JSDoc on the
functions themselves is sufficient.

**2. Update the two callers to import from the new location.**

- `src/server/plugins/evaluation-engine/evaluate-obligations.js`:
  delete the local definitions; import from `engine/path.js`.
- `src/server/plugins/evaluation-engine/trace-evaluate-obligations.js`:
  switch the import source from `./evaluate-obligations.js` to
  `engine/path.js`.

Use the existing import-alias convention (`#server/engine/path.js`)
if it matches project setup; otherwise a relative path.

## Tests

New `src/server/engine/path.test.js`. Table-driven coverage:

`resolvePath`:

- Simple dot path: `resolvePath({a:{b:1}}, 'a.b')` → `1`.
- `notification.` prefix stripped: `resolvePath({type:'X'}, 'notification.type')` → `'X'`.
- Missing segment: `resolvePath({a:{}}, 'a.b.c')` → `undefined`.
- Array marker `[]` last segment returns the array.
- Array marker `[]` mid-path returns the first non-empty value at the
  remaining path; `undefined` if none.
- Null/undefined intermediate: stops, returns `undefined`.

`isEmpty`:

- `undefined`, `null` → `true`.
- `''` → `true`. `'x'` → `false`.
- `[]` → `true`. `[1]` → `false`.
- `{}` → `true`. `{a:1}` → `false`.
- `false`, `0` → `false` (per protocol semantics).

Test selection per `.claude/skills/valuable-unit-tests.md`: pick the
boundary cases above; reject low-value cases (e.g. `resolvePath` with
a circular reference — not a real risk for these inputs).

Existing tests pass unmodified.

## Acceptance Criteria

- [ ] `src/server/engine/path.js` exports `resolvePath` and `isEmpty`.
- [ ] `evaluate-obligations.js` has no local `resolvePath` or
  `isEmpty` definition; it imports both from `engine/path.js`.
- [ ] `trace-evaluate-obligations.js` imports `resolvePath` and
  `isEmpty` from `engine/path.js` (not from the evaluator module).
- [ ] `engine/path.test.js` passes for both functions, covering the
  table above.
- [ ] All existing tests pass unmodified.
- [ ] All four explorer views render correctly.

## Verification

```bash
TZ=UTC npx vitest run src/server/engine/path.test.js
npm test
# Confirm no leftover local definitions:
rg "^const resolvePath\s*=" src/server/plugins/evaluation-engine
rg "^const isEmpty\s*=" src/server/plugins/evaluation-engine
# Both should return no matches.
npm run dev    # smoke each explorer view
```

## What NOT to change

- Don't move any other module yet. Only `path.js` lands.
- Don't change `resolvePath` or `isEmpty` behaviour. Verbatim copy.
- Don't introduce a re-export shim for these utilities — they are
  not part of the protocol's public surface, so no backwards
  compatibility is owed.
- Don't change `evaluate-obligations.js`'s public function name or
  return shape; that's Story 04.
- Don't modify any route handler or view template.
