# Story 10: Universal combinators

## Goal

`engine/combinators.js` exists and exports the five universal
combinators (`or`, `and`, `not`, `always`, `never`) with the exact
semantics from protocol.md §5.5. The `chedpp-plants` journey's local
`or` is replaced with the kernel-exported one; the local definition
is removed.

## Why

Combinators are higher-order functions that compose `ConditionTest`
values. They preserve the `ConditionTest` contract — the engine
treats a combinator's result as an ordinary test — and they let
journey authors express "active if A or B" without duplicating
test logic.

Today `chedpp-plants/resolvers.js` contains a local `or` definition.
That is the seed of a shared library: as soon as a second journey
wanted the same pattern, the right answer is to promote the
combinator to the kernel. The kernel adds the four siblings
(`and`, `not`, `always`, `never`) at the same time because they are
the small completeness set of Boolean composition over
`ConditionTest`.

### Functional-composition rationale for the five

The five operators chosen are the irreducible primitives of Boolean
algebra over a predicate type, here `ConditionTest`:

- **`or`** — the disjunction primitive. Composes any number of tests
  into a "any-active" test. Variadic and short-circuiting matches
  Boolean OR's identity (`false`) for the empty case; we throw on
  zero arguments to surface caller bugs rather than silently
  returning a `never`.
- **`and`** — the conjunction primitive. Mirror of `or` for
  "all-active".
- **`not`** — negation. The unary primitive that flips active.
- **`always`** / **`never`** — the constants. They are the identity
  elements for `and` and `or` respectively. They are useful directly
  (a test that's unconditionally active for a particular obligation)
  and indirectly (default values when conditional tests reduce to
  constants).

Together these are sufficient to express any composable predicate
over `ConditionTest` values. Anything else (XOR, NAND, k-of-n) can
be expressed by composing these — there's no need to ship them
until a journey actually needs them. No other primitive is missing.

## Context

- `features/modelling/protocol.md` §5.5 — exact signatures,
  semantics (short-circuit, reason composition), throws.
- `features/modelling/engine-design.md` Stage 3.
- `src/server/journeys/chedpp-plants/resolvers.js` (after Story 09)
  — contains a local `or` definition that this story replaces.

## Specification

**1. Create `src/server/engine/combinators.js`.**

Export five functions per protocol.md §5.5:

```javascript
// Underlying contract preserved:
//   ConditionTest = (factValue, refdata) → { active, reason }

export const or  = (...tests) => /* variadic, short-circuit on active */
export const and = (...tests) => /* variadic, short-circuit on inactive */
export const not = (test)     => /* invert active; wrap reason "not (...)" */
export const always = (reason = 'always active')  => /* constant true */
export const never  = (reason = 'always inactive') => /* constant false */
```

Semantics per §5.5:

- `or(...tests)` evaluates tests left-to-right, returns the first
  `active: true` result verbatim. If none active, returns
  `{ active: false, reason: r1 + '; ' + r2 + '; ...' }`.
- `and(...tests)` evaluates tests left-to-right, returns the first
  `active: false` result verbatim. If all active, returns
  `{ active: true, reason: r1 + '; ' + r2 + '; ...' }`.
- `not(test)` returns `{ active: !inner.active, reason: 'not (' + inner.reason + ')' }`.
- `always(reason)` and `never(reason)` are constant tests.

Throws per §5.5:

- `or()` / `and()` with zero arguments → `Error: or/and requires at least one test`
- `not(x)` where `x` is not a function → `Error: not requires a ConditionTest`

Imports: none (pure HOFs over the `ConditionTest` contract).

**2. Replace chedpp-plants' local `or` with the kernel one.**

In `src/server/journeys/chedpp-plants/resolvers.js`:

- Remove the local `or` definition.
- Import `or` from `engine/combinators.js`.
- Existing uses of `or` continue to work — semantics are identical
  (the kernel variadic variant accepts the two-argument calls
  chedpp uses today).

## Tests

New `src/server/engine/combinators.test.js` — owns protocol.md §5.5.

State the behaviour and risks (≤5 lines):

> Five HOFs over ConditionTest. Risks: short-circuit semantics
> (returning the active/inactive test's result verbatim, not a
> rebuilt object), reason composition (exact semicolon-space
> separator), throws on bad inputs.

High-value cases (one per primitive plus boundaries):

- `or(t1, t2)` where `t1` active → returns `t1`'s result verbatim
  (including its `reason`); `t2` is not called.
- `or(t1, t2)` where neither active → returns `{ active: false, reason: r1 + '; ' + r2 }`.
- `and(t1, t2)` where `t1` inactive → returns `t1`'s result verbatim;
  `t2` is not called.
- `and(t1, t2)` where both active → returns `{ active: true, reason: r1 + '; ' + r2 }`.
- `not(active-test)` → `{ active: false, reason: 'not (...)' }`.
- `not(inactive-test)` → `{ active: true, reason: 'not (...)' }`.
- `always()` → `{ active: true, reason: 'always active' }`.
- `always('foo')` → `{ active: true, reason: 'foo' }`.
- `never()` → `{ active: false, reason: 'always inactive' }`.
- Throws: `or()`, `and()`, `not(123)` — assert exact messages.

Existing chedpp-plants tests continue to pass (its use of `or`
shouldn't break when switched to the kernel).

Test selection per `.claude/skills/valuable-unit-tests.md`: focus on
the semantic guarantees (verbatim short-circuit, exact reason
separator, throw messages). Reject low-value cases (e.g.
`or(t1, t2, t3, ...)` with five arguments — variadic is covered by
two-arg cases; more args don't add semantic risk).

## Acceptance Criteria

- [ ] `engine/combinators.js` exports `or`, `and`, `not`, `always`,
      `never` with the §5.5 semantics.
- [ ] `engine/combinators.test.js` covers each operator's semantics
      and all documented throws.
- [ ] `chedpp-plants/resolvers.js` imports `or` from the kernel; the
      local `or` is removed.
- [ ] chedpp-plants' existing resolver tests continue to pass.
- [ ] All existing engine tests continue to pass.
- [ ] All four explorer views render correctly for
      `eu-live-animals` content.
- [ ] `evaluate('chedpp-plants', ...)` still works via the engine
      facade (the local-to-kernel `or` swap is transparent).

## Verification

```bash
TZ=UTC npx vitest run src/server/engine/combinators.test.js
TZ=UTC npx vitest run src/server/journeys/chedpp-plants
npm test

# Confirm local `or` is gone from chedpp's resolvers:
rg "const or\s*=" src/server/journeys/chedpp-plants
# Expected: no matches.

npm run dev    # smoke each explorer view (eu-live-animals only)
```

## What NOT to change

- Don't add combinator usage to eu-live-animals — that journey
  doesn't use `or` today, and this story is _not_ about expanding
  usage; it's about consolidating chedpp's pattern into the kernel.
- Don't add any sixth combinator (XOR, k-of-n, etc.) — out of scope
  per the completeness rationale above.
- Don't modify explorer route handlers or view templates.
- Don't change the engine boundary (framework-isolation test from
  Story 07 continues to pass — combinators.js has no imports).
- Don't promote any journey-conventional helper (e.g. `refdataFlag`)
  to the kernel — that's a separate decision, not in scope.
