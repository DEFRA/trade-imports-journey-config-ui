# Story 08: Extract plugin.js

## Goal

The Hapi plugin lives at `src/server/plugins/evaluation-engine/plugin.js`
and is the only file in the codebase that knows about Hapi. It
imports engine functions from `engine/*` and adapts them to
`server.app.evaluationEngine`. The old
`evaluation-engine/index.js` is removed.

## Why

Story 07 left `evaluation-engine/index.js` as the only file under
`plugins/evaluation-engine/` — it contains the Hapi plugin
registration, the `JOURNEYS` registry, and the `validateJourney`
startup check. Today it imports engine logic directly. After this
story it imports from `engine/*` and is purely *adaptation*: Hapi
plugin lifecycle + journey lookup + `server.app.evaluationEngine`
binding.

Naming the file `plugin.js` (rather than `index.js`) signals its
single purpose. The directory contains exactly one file. The engine
itself contains zero Hapi code.

`validateJourney` stays inline in `plugin.js`. Per protocol.md §4 and
engine-design.md ("Parked"), a comprehensive validator is explicitly
out of scope; the existing structural startup check stays as-is.

## Context

- `features/modelling/engine-design.md` §2 (directory layout) and
  Stage 2f.
- `src/server/plugins/evaluation-engine/index.js` — current plugin +
  registry.

## Specification

**1. Create `src/server/plugins/evaluation-engine/plugin.js`.**

The file contains:

- The Hapi plugin definition (`name: 'evaluation-engine'`, `register`
  function).
- The `JOURNEYS` map (keyed by journey key, values are adapter
  modules).
- The `validateJourney` function, *unchanged from today's behaviour*
  — same checks, same throw conditions, same wording.
- The `server.app.evaluationEngine` facade: `evaluate(journeyKey,
  notification)`, `getJourney(journeyKey)`, `listJourneys()`. These
  signatures **do not change**; the explorer routes consume them as
  they do today.

`evaluate(journeyKey, notification)` internally:
1. Looks up the adapter by `journeyKey`.
2. Builds the adapter record (or accesses the imported module's
   exports as the record — depending on how the journey module is
   shaped).
3. Calls `evaluateWithTrace(notification, adapter)` from
   `engine/evaluate-with-trace.js`.
4. Returns the result.

Imports:
- `evaluateWithTrace` from `engine/evaluate-with-trace.js`.
- Each registered journey module (today: only `eu-live-animals`).

**2. Update Hapi server registration to use `plugin.js`.**

Wherever `src/server/server.js` (or equivalent) registers the
evaluation-engine plugin, update the import path to point at
`plugin.js`.

**3. Delete `src/server/plugins/evaluation-engine/index.js`.**

After tests pass and the server boots correctly.

## Tests

This story is a structural move. The test work is:

- Re-route any tests that target the plugin registration to use
  `plugin.js`.
- Confirm `npm test` is still green.
- Confirm `npm run dev` boots and `server.app.evaluationEngine`
  resolves with the same surface as before.

The framework-isolation test from Story 07 continues to pass —
`plugin.js` lives *outside* `engine/`, so its Hapi import doesn't
break the engine boundary.

A small additional test (if not already covered by an existing
integration test): boot the plugin and assert
`server.app.evaluationEngine` has the three methods (`evaluate`,
`getJourney`, `listJourneys`) and that `evaluate('eu-live-animals',
fixture)` returns an `EvaluationResult`.

Test selection per `.claude/skills/valuable-unit-tests.md`: the
plugin layer is thin adaptation; one boot+facade-shape test is
enough. Don't re-test the underlying engine — Stories 04-06 own
that.

## Acceptance Criteria

- [ ] `src/server/plugins/evaluation-engine/plugin.js` exists,
  contains the Hapi plugin, the JOURNEYS map, and `validateJourney`.
- [ ] `plugin.js` imports engine functions from `engine/*`; no engine
  logic is inlined.
- [ ] `server.app.evaluationEngine` exposes the same surface as
  before (`evaluate`, `getJourney`, `listJourneys`); route handlers
  continue to work without modification.
- [ ] `validateJourney` runs at plugin registration; existing
  startup behaviour preserved (throws on missing required fields).
- [ ] `src/server/plugins/evaluation-engine/index.js` is deleted.
- [ ] The framework-isolation test (Story 07) still passes — `engine/`
  has no Hapi imports.
- [ ] All existing tests pass.
- [ ] All four explorer views render correctly. `npm run dev` boots
  cleanly.

## Verification

```bash
# Plugin file shape:
ls src/server/plugins/evaluation-engine/plugin.js
ls src/server/plugins/evaluation-engine/index.js 2>&1   # No such file

# @hapi only inside the plugin file:
rg "@hapi" src/server/plugins/evaluation-engine
# Should match plugin.js only.

# Engine remains framework-free:
TZ=UTC npx vitest run src/server/engine/_isolation.test.js

# Full suite + boot:
npm test
npm run dev    # smoke each explorer view + check the server boots
```

## What NOT to change

- Don't change `server.app.evaluationEngine`'s public surface —
  routes depend on it.
- Don't modify `validateJourney` — behaviour and message wording
  preserved. (A comprehensive validator is parked.)
- Don't change the journey-key hardcoding in route handlers.
- Don't register chedpp-plants yet (Story 09).
- Don't introduce a journey picker or any UI change.
- Don't move engine modules — they were settled in Stories 02-06.
