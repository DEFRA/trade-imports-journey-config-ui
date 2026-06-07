# Story 06: Remove the in-process engine reads from nav-context.js

## Goal

Close the last in-process engine reads in the explorer UI. After
this story, no file under `src/server/routes/` imports anything from
`#server/engine/*` or `#server/plugins/evaluation-engine/*`. The
ESLint carve-out for `nav-context.js` (added in Story 05) is removed,
and a transitive-import test enforces the closure across the whole
UI route tree.

## Why

Story 05 closed the larger half of the lift-out gap (the commodity-
config controller). This story closes the smaller half:
`nav-context.js#currentJourneyKey` validates the session value
against the engine, and `nav-context.js#navContext` falls back to
the engine when its HTTP call fails. Both reads exist for legitimate
reasons; neither is worth keeping.

The project principle that drove this decision: UI code accesses
config and engine only via HTTP APIs — never in-process, never as a
fallback. See `feedback_ui_http_first.md`.

## What changes

### `currentJourneyKey(request)` — stale-session validation: removed

Today: reads `request.yar.get('journey')`, validates against
`request.server.app.evaluationEngine.listJourneys()`, falls back to
`config.get('journey')` if the session value isn't registered.

After: reads `request.yar.get('journey')`, returns it. If absent or
empty, returns `config.get('journey')`. Stays sync.

**Behavioural consequence:** if a user's session cookie holds a
journey key that has been removed between deploys, downstream code
gets that stale key. Consequences surface where the key is used
(picker page, explorer page) rather than as a pre-check in
nav-context. Acceptable: low-frequency failure mode, UI is
recoverable (pick a new journey).

### `navContext(request)` — in-process fallback: removed

Today: `clientForRequest(request).listJourneys().catch(() =>
request.server.app.evaluationEngine.listJourneys())`.

After: `clientForRequest(request).listJourneys()` — no catch. If
the HTTP call fails (on loopback this means the server is wedged),
the page returns a 500 honestly.

### `extractJourneyKey` helper — simplified or deleted

Exists in `journey-api-client.js` only to normalise between two
shapes: HTTP summary objects (`{ key, name, ... }`) and bare key
strings from the in-process fallback. With the fallback gone, only
one shape remains. The helper either becomes a one-liner
(`s => s.key`) and gets inlined at call sites, or stays as a named
alias for grep-ability. Implementer's choice; flag in PR if not
obvious.

### ESLint carve-out: removed

The deliberate exception for `nav-context.js` added by Story 05's
flat-config block is deleted. The `no-restricted-imports` rule now
applies without exception across `src/server/routes/`.

### Transitive-import test: added

This is the test Story 05 deferred because the carve-out made it
impossible to pass. Walks the resolved dependency closure of each
explorer controller (the entry points reachable from
`src/server/plugins/router.js`) and asserts no path reaches
`#server/engine/*` or `#server/plugins/evaluation-engine/*`.

Lives at `src/server/routes/explorer/_isolation.test.js` to mirror
the engine isolation test (`src/server/engine/_isolation.test.js`).

## Tests

- **`nav-context.test.js`** — sync `currentJourneyKey`: cookie
  present returns its value; cookie absent or empty returns
  `config.get('journey')` default.
- **`nav-context.test.js`** — async `navContext` happy path: HTTP
  succeeds, returns the journey list. Failure path: HTTP throws, the
  thrown error surfaces (no silent fallback).
- **`_isolation.test.js`** — the transitive-import closure walk
  described above.

## Acceptance Criteria

- [ ] `src/server/routes/explorer/nav-context.js` has zero imports
      from `#server/engine/*` or `#server/plugins/evaluation-engine/*`.
- [ ] `grep -RE "evaluationEngine|#server/engine" src/server/routes/`
      returns empty.
- [ ] The ESLint carve-out for `nav-context.js` is removed from
      `eslint.config.js` and `npm run lint` passes.
- [ ] The transitive-import isolation test exists and passes.
- [ ] All explorer pages render successfully for both registered
      journeys with the default session (no stale value).
- [ ] `npm test` green; `npm run lint` clean; engine isolation test
      still passes.
- [ ] `design.md` records that the lift-out invariant now holds
      across the whole UI route tree.

## Risks / known issues

- **Stale session cookies.** Users whose session holds a removed
  journey key pass that key through `currentJourneyKey()`
  unvalidated. The picker or explorer page receives it. Acceptable
  per the project principle (`feedback_ui_http_first.md`):
  validation moves to where the key is used, not as a cross-cutting
  precheck. If a future story wants explicit handling, the right
  shape is a redirect to journey-selection with a flash message.
- **HTTP-failure observability.** Without the fallback, a transient
  API failure blacks out every explorer page. On loopback this is
  fine (server wedged = nothing works anyway). It would matter if
  the API ever became truly remote; documented, not addressed.

## What NOT to change

- The HTTP API endpoints themselves — Story 06 changes how the UI
  consumes them, not the surface.
- The engine modules — engine isolation invariant stays green.
- The journey adapters — their exports are unchanged.
- The session cookie shape — `yar.get('journey')` still holds a
  string journey key.
