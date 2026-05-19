# Story 07: Switch callers, delete shims, add isolation test

## Goal

Every consumer in the codebase imports from `engine/*` directly. The
three re-export shims left in place by Stories 04, 05, and 06 are
deleted. A framework-isolation test asserts that no `@hapi/*` package
appears anywhere in `engine/`'s module graph — the boundary becomes
machine-enforced.

## Why

Stories 04-06 used the shim pattern (introduce new module beside old;
old becomes a re-export) so each module could land in `engine/`
without breaking callers. This story is the *consume the shim*
step of branch-by-abstraction: every caller flips to the new import
path, then the shims are removed.

The framework-isolation test is the engine boundary's enforcement
mechanism. Without it, a future PR can quietly add a Hapi import
inside `engine/` and break the "engine is a library" invariant
without any test failing. With it, that breakage is a red CI signal.

## Context

- `features/modelling/engine-design.md` Stage 2e.
- `features/modelling/engine-design.md` §6 — framework-isolation test
  description.
- Three shim files left after Stories 04-06:
  - `src/server/plugins/evaluation-engine/evaluate-obligations.js`
  - `src/server/plugins/evaluation-engine/trace-evaluate-obligations.js`
  - `src/server/routes/explorer/map-to-screens.js`
- Callers to switch (from earlier code reads):
  - Route handlers in `src/server/routes/explorer/*`
  - Tests in `src/server/plugins/evaluation-engine/*.test.js`
  - Test in `src/server/routes/explorer/map-to-screens.test.js`
  - The plugin in `src/server/plugins/evaluation-engine/index.js`

## Specification

**1. Switch every caller to the canonical `engine/*` import.**

For each consumer:

- Replace imports of `evaluate-obligations.js` /
  `trace-evaluate-obligations.js` symbols with imports from
  `engine/evaluate.js` / `engine/evaluate-with-trace.js`. Callers
  that used the old positional `evaluateObligations(notification,
  obligations, refdata, resolvers)` now call `evaluate(notification,
  adapter)` with an adapter record.
- Replace imports of `routes/explorer/map-to-screens.js` symbols
  with imports from `engine/resolve-screens.js` /
  `engine/roll-up-to-sections.js`. `mapToScreens` is renamed
  `resolveScreens` at every call site.

The plugin's `evaluate(journeyKey, notification)` facade
*does not change* in this story. Internally it calls the new
`evaluateWithTrace` from `engine/`; externally route handlers
continue to call `server.app.evaluationEngine.evaluate('eu-live-animals', ...)`
exactly as before.

**2. Delete the three shim files.**

After every caller is switched and tests pass:

- Delete `src/server/plugins/evaluation-engine/evaluate-obligations.js`
- Delete `src/server/plugins/evaluation-engine/trace-evaluate-obligations.js`
- Delete `src/server/routes/explorer/map-to-screens.js`

Their tests (`evaluate-obligations.test.js`,
`trace-evaluate-obligations.test.js`, `map-to-screens.test.js`)
either:

- Move alongside their new modules (already done in Stories 04-06
  with new test files) and the originals delete with the shims; or
- Delete if every case is covered by the new
  `engine/*.test.js` files.

Choose whichever leaves the smaller, less-duplicative test suite.
The protocol contract tests in Stories 04-06 are the floor; legacy
tests that exercised the same behaviour can be removed.

**3. Add the framework-isolation test.**

New `src/server/engine/_isolation.test.js` (or similar name) asserts:

- Importing every file under `src/server/engine/` does not pull any
  `@hapi/*` package into the module graph.

Implementation sketch:

```javascript
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const ENGINE_DIR = resolve(import.meta.dirname)

test('engine module graph contains no @hapi/* dependency', async () => {
  const files = readdirSync(ENGINE_DIR).filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
  for (const file of files) {
    const mod = await import(resolve(ENGINE_DIR, file))
    // mod is loaded; if any transitive import was @hapi/*, the
    // load would not necessarily fail. The assertion compares
    // resolved module IDs.
  }
  // Use Vitest's vi.dynamicImportSettled or a custom resolver hook to
  // collect the import graph; assert none start with '@hapi/'.
})
```

The mechanism for graph inspection should use Vitest's available
APIs (e.g. `import.meta` introspection) or a simple grep-based
companion check executed as part of `npm test`. The acceptance
criterion is: a `@hapi/*` import anywhere under `engine/` fails this
test.

## Tests

This story is largely a delete + switch operation; the test work is:

- Adapt or remove the three legacy test files
  (`evaluate-obligations.test.js`, `trace-evaluate-obligations.test.js`,
  `map-to-screens.test.js`). The Stories 04-06 contract tests cover
  the same surface; remove duplication.
- Add the framework-isolation test described above.
- All existing tests (now switched to `engine/*` imports) must pass.

Test selection per `.claude/skills/valuable-unit-tests.md`: the
isolation test has one job (no `@hapi/*` in `engine/`); keep it
minimal. Don't add tests that re-prove §5.1-§5.4 contracts — those
are owned by Stories 04-06's test files.

## Acceptance Criteria

- [ ] Every route handler and every test imports engine symbols from
  `engine/*` directly. No imports remain that target the three shim
  files.
- [ ] The three shim files are deleted from the codebase.
- [ ] Their legacy test files are either deleted (where Stories 04-06
  cover the surface) or moved to alongside the new modules.
- [ ] `src/server/engine/_isolation.test.js` (or equivalent) exists
  and passes: no `@hapi/*` in the engine module graph.
- [ ] `npm test` is green.
- [ ] All four explorer views render correctly.

## Verification

```bash
# Switched-caller check — these three import paths should return no
# matches anywhere in source code:
rg "from.*plugins/evaluation-engine/evaluate-obligations" src/
rg "from.*plugins/evaluation-engine/trace-evaluate-obligations" src/
rg "from.*routes/explorer/map-to-screens" src/

# Shim files deleted:
ls src/server/plugins/evaluation-engine/evaluate-obligations.js 2>&1   # No such file
ls src/server/plugins/evaluation-engine/trace-evaluate-obligations.js 2>&1   # No such file
ls src/server/routes/explorer/map-to-screens.js 2>&1   # No such file

# Framework isolation:
TZ=UTC npx vitest run src/server/engine/_isolation.test.js

# Full suite + UI smoke:
npm test
npm run dev    # smoke each explorer view
```

## What NOT to change

- Don't change the plugin facade
  (`server.app.evaluationEngine.evaluate(journeyKey, notification)`).
  Plugin extraction is Story 08.
- Don't move `evaluation-engine/index.js`. That's the plugin layer;
  it stays for now and changes in Story 08.
- Don't add chedpp-plants to anything in this story.
- Don't rewrite contract test files just to add the new import path;
  if a legacy test duplicates a Stories 04-06 test, delete it.
- Don't modify view templates.
