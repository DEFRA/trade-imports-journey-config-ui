# Story 03: Engine API, debug-page cutover, and UI session endpoint

## Goal

Expose the evaluation engine as three HTTP endpoints
(`/api/engine/journeys/{key}/{evaluate,screens,sections}`), refactor
the UI handlers that today call the in-process engine to use the new
HTTP client, and replace the existing `POST /explorer/debug/evaluate`
endpoint with a clean two-piece architecture:

- the **public engine API** for compute (what Postman hits, what
  browser JS hits);
- a new **`PUT /ui/session/notification`** endpoint for state
  persistence (the "in-memory database" of the SDUI demo).

`src/client/javascripts/explorer.js` is modified — small, localised
edits — to call the public API directly and fire the session write
explicitly. The result: a clean separation between compute and
state, visible end-to-end in the browser Network tab.

## Why

Stories 01 and 02 made the config side honest. This story does the
same for the engine side, but the engine path has an extra
constraint: the current debug-page flow conflates two things in one
endpoint — calling the engine and writing the notification to
session for cross-page sharing. Untangling them is the heart of this
story.

The cross-page bridge (load scenario → edit on debug → see effect on
tasklist) is a **key demo element**: showing one journey from
multiple perspectives by mutating the notification mid-stream. It
must survive. The bundling, however, does not need to. By splitting
state persistence into an explicit `PUT /ui/session/notification`
endpoint, the demo gains two things at once:

1. The engine API stays pure compute — Postman hits the same URL the
   browser hits.
2. The cross-page mechanism becomes legible — the audience sees the
   "in-memory database" call in Network tab, not a hidden side
   effect of an evaluate call.

This is Option β from the Q1 review; see `design.md` for the full
rationale.

The engine API body shape is **raw notification** (D4 in
`design.md`): copy from debug editor → paste into Postman → POST
works.

## Context

Feature-level context: `features/http-api/design.md`. Read the Q1
resolution section — this story is its implementation.

Story 02 must be merged before this story begins. It provides
`navContext` async, the client module pattern, and the per-commodity
endpoint.

Relevant files:

- `src/server/engine/{evaluate-with-trace,resolve-screens,roll-up-to-sections,evaluate}.js` — pure functions; unchanged.
- `src/server/plugins/evaluation-engine/plugin.js` — facade; unchanged.
- `src/server/routes/explorer/api-controller.js` — **deleted**.
- `src/server/routes/explorer/{journey,tasklist,debug}-controller.js` — refactored to use the engine client methods.
- `src/client/javascripts/explorer.js` — **modified** (URL, body, journey key, session-write call). All changes localised.
- `src/server/routes/explorer/index.test.js:358-381` — the false-positive "debugger POST → tasklist" test; replaced by a real cross-page contract test.

## Specification

### 1. New engine API endpoints

Extend `src/server/plugins/http-api/engine-routes.js` (mirror Story
02's `config-routes.js` structure) with three POSTs:

| Method | Path                                  | Body                        | Query                        | Returns                                                                          |
| ------ | ------------------------------------- | --------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `POST` | `/api/engine/journeys/{key}/evaluate` | `<notification>` (raw JSON) | `?withTrace=true` (optional) | `EvaluationResult` (`{ obligations, summary }`, optional per-obligation `trace`) |
| `POST` | `/api/engine/journeys/{key}/screens`  | `<notification>` (raw JSON) | —                            | `{ screens: Screen[] }`                                                          |
| `POST` | `/api/engine/journeys/{key}/sections` | `<notification>` (raw JSON) | —                            | `{ sections: Section[], summary }`                                               |

Body shape: the body **is** the notification (D4). No
`{ notification: ... }` envelope.

`evaluate` delegates to `server.app.evaluationEngine.evaluate(key,
notification)`, which internally calls `evaluateWithTrace`.
`withTrace=true` returns the trace field; `withTrace=false` (default)
strips trace data.

`screens` calls `evaluate` then `resolveScreens(result, journeyMap)`.
`sections` calls `evaluate` then `resolveScreens` then
`rollUpToSections(screens)`.

404 for unknown `key`. 400 for malformed body (Joi). The response
schema for `/evaluate` **must match what
`src/client/javascripts/explorer.js#validateEvaluationResult`
expects** (`summary.{satisfied,unsatisfied,deferred,inactive,total,
submittable}`, `obligations[].{id,status,missingPaths?,reason?,
trace?}`, trace step enum `extract-fact | apply-test | deferred |
inactive | satisfaction-check | action-check`). The response-shape
contract test (§10) is the canary.

**Payload size.** All three engine POSTs configure
`payload.maxBytes: 5 * 1024 * 1024` (per D20). Hapi's default 1 MB
ceiling is too low for user-edited debug notifications; lifting it
to 5 MB avoids opaque 413s.

```js
options: {
  ...,
  payload: { maxBytes: 5 * 1024 * 1024 }
}
```

### 2. New UI session endpoint

New plugin or new module under `src/server/routes/ui-state/`:

```
src/server/routes/ui-state/
  plugin.js
  notification-controller.js
  notification-controller.test.js
```

```js
// notification-controller.js
export const putNotification = {
  method: 'PUT',
  path: '/ui/session/notification',
  options: {
    description: 'Replace the current notification in the UI session',
    tags: ['api', 'ui-state'],
    validate: { payload: notificationSchema },
    response: { schema: emptyResponseSchema }
  },
  handler(request, h) {
    request.yar.set('notification', request.payload)
    return h.response().code(204)
  }
}
```

Joi `notificationSchema` is permissive (`Joi.object().unknown(true)`)
— the notification is journey-specific and we don't validate its
shape at this boundary.

Register in `src/server/plugins/router.js` alongside existing
plugins. Surfaces in Swagger UI under a third tag `ui-state`,
documented in `design.md` D16.

### 3. Engine API Joi schemas

Extend `src/server/plugins/http-api/schemas.js`:

- `Notification` — `Joi.object().unknown(true)`.
- `EvaluationResult` — strict on the keys browser JS reads (see §1).
- `Screen`, `Section` — derived from `src/server/engine/types.js`
  JSDoc; narrow on load-bearing fields, `.unknown(true)` on
  enrichment.
- `ScreensResponse`, `SectionsResponse`.
- All response schemas carry `example` values from real scenarios
  (one per journey where the shape differs meaningfully).

### 4. Client extensions

`src/server/clients/journey-api-client.js` gains:

```js
client.evaluate(key, notification, ({ withTrace = false } = {}))
client.getScreens(key, notification)
client.getSections(key, notification)
client.putSessionNotification(notification) // PUT /ui/session/notification
```

Each sends the notification as the raw body (`JSON.stringify`),
`Content-Type: application/json`. `evaluate` appends
`?withTrace=true` when requested. Errors map to `ApiError`. Trace
id propagation as established in Story 01.

### 5. Refactor `tasklist-controller.js`

```js
const client = clientForRequest(request)
const notification = request.yar.get('notification') ?? {}
const { sections, summary } = await client.getSections(key, notification)
// render with sections + summary
```

### 6. Refactor `journey-controller.js` (`/explorer` route)

```js
const client = clientForRequest(request)
const journey = await client.getJourney(key)
const notification = request.yar.get('notification') ?? scenarioFallback
const { sections, summary } = await client.getSections(key, notification)
// render
```

### 7. Refactor `debug-controller.js` GET path

```js
const client = clientForRequest(request)
const journey = await client.getJourney(key)
// build the fragment select + editor pre-population from yar.notification
```

The GET handler additionally **passes the active journey key into
the template** so the rendered HTML carries it as a data attribute
the browser JS can read (see §8).

### 8. Modify browser JS — `src/client/javascripts/explorer.js`

The validators, trace renderer, panel rendering, status-feedback
helper, and DOM construction are unchanged. The edits target three
zones in the existing file:

- the **payload helper** at `buildEvaluationPayload` (line 141)
- the **fetch + body** in the function that posts to the engine
  (line 157, currently inside the function that wraps line 141)
- the **journey-key plumbing** — currently not present at all
- the **save-feedback path** at `attachEventHandlers` (lines 380–401)

Net change is **larger than a 15-line diff** (realistic estimate
30–50 lines including helper removal and journey-key threading).
Verification §12 below replaces the false `wc -l` ceiling with a
specific list of zones that may change.

**Required edits, by zone:**

**(a) Delete `buildEvaluationPayload` (lines 141–148 incl. JSDoc).**
Its only caller is the fetch on line 160; after edit (b) the helper
has no callers.

**(b) Rewrite the fetch (around line 157).** Change URL to
`/api/engine/journeys/${journeyKey}/evaluate?withTrace=true`. Send
the **raw notification** as the body (no `{ notification: ... }`
wrap):

```js
const response = await fetch(
  `/api/engine/journeys/${journeyKey}/evaluate?withTrace=true`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(notification)
  }
)
```

**(c) Read journey key from the DOM at module init.** Add a single
read at the top of `initializeEditor` (line 443):

```js
const journeyKey =
  document.querySelector('[data-journey-key]')?.dataset.journeyKey
if (!journeyKey)
  throw new Error('debug page missing data-journey-key attribute')
```

Hold it in a module-scope `let` or close over it via the existing
closure structure. The Plan agent decides; do not refactor
`evaluateAndNotify` / `attachEventHandlers` signatures to thread
the key as a parameter — closure is simpler and matches the
existing style.

**Template change for (c):** `src/server/common/templates/explorer/debug.njk:14`
already carries `data-initial-notification` and `data-fragments` on
the `govuk-grid-row` wrapper. Add `data-journey-key="{{ journeyKey }}"`
to that same element. The GET handler in §7 already passes
`journeyKey` into the template context.

**(d) Sequential PUT-then-POST on save** (replacing the bare engine
fetch in the post-parse branch of `attachEventHandlers` around
lines 397–400):

```js
try {
  // 1. Persist to UI session first; if this fails, abort the
  //    engine call so we don't render results against a
  //    notification that isn't saved.
  const persistResp = await fetch('/ui/session/notification', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data)
  })
  if (!persistResp.ok) {
    showSaveStatus('Save failed', true)
    return
  }

  // 2. Evaluate; result drives the panels.
  await evaluateAndNotify(parsed.data)
  showSaveStatus('Saved to session')
} catch (error) {
  showSaveStatus('Save failed', true)
}
```

**Why sequential, not `Promise.all`** (D11/Q1 alignment): PUT and
POST are independent on the wire, but the _user-visible_ contract
is "if Save & Evaluate succeeded, both happened; otherwise neither
should appear to have happened". Parallel fires can produce
"engine succeeded but session didn't" with a stale tasklist on the
next navigation — the exact regression mode this whole story is
trying to prevent.

**(e) No other changes.** `validateEvaluationResult`, the trace
renderer, the obligation panels, `showSaveStatus`,
`initializeEditor` beyond the one-line key read — all unchanged.

### 9. Delete the old proxy

- Delete `src/server/routes/explorer/api-controller.js` and its
  test (or move its tests to the new endpoints).
- Remove the route registration for `POST /explorer/debug/evaluate`
  from `src/server/routes/explorer/index.js` (or wherever it is
  registered).
- After this, `POST /explorer/debug/evaluate` returns 404.

### 10. Three new contract tests

The QA-recommended tests; see `design.md` Q1 resolution.

**(a) Cross-page session contract** — replaces the false-positive
test at `src/server/routes/explorer/index.test.js:358-381`.

**The previous test only asserted `"Check your notification"`
appears in the HTML** — a static heading printed unconditionally by
`tasklist-controller.js:79`. This is exactly the kind of incidental
substring match that passes whether or not the cross-page bridge
works.

**This test asserts state-driven _behaviour change_, not substring
presence.** Concrete shape:

1. Boot real server (shared from globalSetup).
2. POST `/explorer/journey` with `journey=eu-live-animals`.
3. **Capture baseline.** GET `/explorer/tasklist` with empty session
   (or after a journey switch clears notification). Parse the
   rendered task-list section-status block — record each section's
   status tag (e.g. `cannotStartYet`, `incomplete`).
4. PUT `/ui/session/notification` with a fixture notification chosen
   so it **observably flips at least one section's status** —
   e.g. it satisfies the obligations behind a section that was
   `cannotStartYet` in step 3, flipping it to `incomplete` or
   `complete`.
5. GET `/explorer/tasklist`.
6. **Assert the section-status tag for the chosen section changed
   between step 3 and step 5.** The diff is the signal that the
   bridge works.

Failure mode this catches: if the PUT endpoint silently no-ops, or
`yar.set` doesn't fire, or the tasklist handler reads from a
different store, the status tags won't change between baseline and
post-PUT, and the test fails with a useful diff (which tag is wrong).

Implement this once per journey (both fixtures need a known
status-flipping notification — pull from `scenarios.js` where
possible).

Substring assertions on the notification's commodity name, species
name, or any other refdata-derived value are **explicitly not
sufficient** — those strings appear in dropdowns and refdata-driven
help text regardless of session contents.

**(b) Response-shape contract** — proves the public engine API
returns what browser JS expects.

Test outline:

1. POST `/api/engine/journeys/eu-live-animals/evaluate?withTrace=true`
   with a real scenario notification.
2. Assert the response has every key
   `src/client/javascripts/explorer.js#validateEvaluationResult`
   reads:
   - `summary.satisfied/unsatisfied/deferred/inactive/total`,
     `summary.submittable` (boolean).
   - `obligations[].{id, status, missingPaths?, reason?, trace?}`.
   - `status` ∈ four-value enum.
   - Where `trace` exists, `trace.steps[].step` ∈ six-value enum.
3. Repeat for `chedpp-plants`.

**(c) Journey-key round-trip** — proves the debug page uses the
right journey after a switch.

Test outline:

1. POST `/explorer/journey` with `journey=chedpp-plants`.
2. GET `/explorer/debug` — assert the rendered HTML carries
   `data-journey-key="chedpp-plants"` on the editor root.
3. Simulate the browser save flow: PUT
   `/ui/session/notification`, POST to
   `/api/engine/journeys/chedpp-plants/evaluate?withTrace=true`.
4. Assert the obligations are the plants set (e.g. a plants-specific
   obligation id appears) — not animals.

### 11. Swagger documentation

Each engine endpoint's Joi schema carries:

- `description` field used by hapi-swagger.
- `example` request body — a real scenario notification (one per
  journey, picked to exercise multiple obligation statuses).
- `example` response — the corresponding evaluation result.

The `ui-state` tag is registered alongside `config` and `engine` in
`server.js`. `PUT /ui/session/notification` appears under it with
its `description`, an example body (a small notification), and 204
response example.

## Tests

### Route-level integration — extend `src/server/plugins/http-api/plugin.test.js`

Table-driven over both journeys and multiple scenarios:

- `POST .../evaluate` with empty body → 200, obligations
  `unsatisfied`/`deferred`.
- `POST .../evaluate` with scenario notification → expected
  obligation counts.
- `POST .../evaluate?withTrace=true` → each obligation has
  `trace.steps` with valid step types.
- `POST .../screens` → array length matches `journeyMap` screens.
- `POST .../sections` → `notApplicable` screens absent; `summary`
  matches `evaluate`.
- `POST .../journeys/unknown-key/evaluate` → 404.
- Malformed body (non-JSON) → 400.

These tests double as the Postman fixture catalogue.

### UI session endpoint — `src/server/routes/ui-state/notification-controller.test.js`

- `PUT /ui/session/notification` with a body → 204; subsequent
  `request.yar.get('notification')` returns the same value.
- Empty body → 400 (Joi rejects).
- Non-JSON body → 400.

### Client unit — extend `src/server/clients/journey-api-client.test.js`

- `client.evaluate` constructs the right URL with `?withTrace=true`
  when requested.
- `client.evaluate` sends the raw notification as body.
- `client.getScreens`, `client.getSections` same.
- `client.putSessionNotification` PUTs to `/ui/session/notification`
  with raw body, returns void.
- Errors surface as `ApiError`.

### Controller integration

- `src/server/routes/explorer/tasklist-controller.test.js` — task
  list renders for both journeys; loopback HTTP fires.
- `src/server/routes/explorer/journey-controller.test.js` —
  `/explorer` renders for both journeys.
- `src/server/routes/explorer/debug-controller.test.js` — GET
  renders for both journeys; rendered HTML carries
  `data-journey-key="..."`.

### Contract tests

- `src/server/routes/explorer/index.test.js` — extended with the
  cross-page session contract test (replaces
  lines 358-381). Both journeys.
- `src/server/plugins/http-api/engine-contract.test.js` (new) —
  response-shape contract; both journeys.
- `src/server/routes/explorer/journey-picker.test.js` — extended
  with journey-key round-trip (data-attribute + post-switch
  evaluation); both journeys.

### What happens to the old proxy tests

- The tests at `src/server/routes/explorer/api-controller.test.js`
  (if any) are deleted alongside the controller. Coverage they
  provided is now provided by:
  - The engine endpoint tests (compute correctness).
  - The session endpoint test (persistence correctness).
  - The cross-page contract test (the two combined).

## Acceptance Criteria

- [ ] Three `POST /api/engine/journeys/{key}/*` endpoints implemented; raw notification body; `withTrace` query param on `/evaluate` only.
- [ ] `PUT /ui/session/notification` endpoint implemented; one-line `yar.set` handler; 204 response.
- [ ] Joi schemas declared for `Notification`, `EvaluationResult`, `Screen`, `Section`, response wrappers, and the empty-204 response.
- [ ] Each engine response schema carries an `example` for each journey, surfaced in Swagger UI.
- [ ] Client extended with `evaluate`, `getScreens`, `getSections`, `putSessionNotification`.
- [ ] `tasklist-controller`, `journey-controller`, `debug-controller` (GET) refactored to use the client.
- [ ] `debug-controller` GET passes `currentJourneyKey(request)` into the template; the rendered editor element carries `data-journey-key="..."`.
- [ ] `src/client/javascripts/explorer.js` modified in the four zones listed in §8: (a) `buildEvaluationPayload` helper deleted; (b) fetch URL/body changed; (c) journey-key read added at `initializeEditor` top; (d) sequential PUT-then-POST + status handling in `attachEventHandlers`. No other functions touched (`validateEvaluationResult`, trace renderer, panel rendering, `showSaveStatus` body, DOM construction). Expected diff: ~30–50 lines.
- [ ] `POST /explorer/debug/evaluate` is **deleted**; the URL returns 404.
- [ ] `src/server/routes/explorer/api-controller.js` is deleted.
- [ ] Cross-page session contract test replaces `index.test.js:358-381` and exercises `PUT /ui/session/notification`.
- [ ] Response-shape contract test asserts every key browser JS reads, for both journeys.
- [ ] Journey-key round-trip test passes for both journeys.
- [ ] Swagger UI shows three tag groups — `config`, `engine`, `ui-state`.
- [ ] Every API endpoint tested against **both** journeys.
- [ ] Engine isolation test still passes.
- [ ] `npm test` green.
- [ ] All four explorer URLs render the same as before; Network tab shows the two-request save on `/explorer/debug`.
- [ ] Copy a notification from `/explorer/debug` editor; POST it to `/api/engine/journeys/eu-live-animals/evaluate?withTrace=true` in Postman → returns matching obligations + summary + traces.

## Verification

```bash
# Route + client + controller tests
TZ=UTC npx vitest run src/server/plugins/http-api/plugin.test.js
TZ=UTC npx vitest run src/server/plugins/http-api/engine-contract.test.js
TZ=UTC npx vitest run src/server/clients/journey-api-client.test.js
TZ=UTC npx vitest run src/server/routes/explorer/
TZ=UTC npx vitest run src/server/routes/ui-state/

# Old endpoint is gone
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/explorer/debug/evaluate
# Expected: 404

# Engine isolation invariant
TZ=UTC npx vitest run src/server/engine/_isolation.test.js

# explorer.js diff: scoped to the four zones in §8.
# Spot-check that the validator, trace renderer, panel rendering,
# and showSaveStatus body are unchanged.
git diff main -- src/client/javascripts/explorer.js
# Visual review: changes should only appear at buildEvaluationPayload
# (deletion), the engine fetch (URL + body), initializeEditor
# (journey-key read), and the save handler in attachEventHandlers
# (PUT-then-POST). Anything else is scope creep.

# Full
TZ=UTC npm test
npm run lint

# Manual smoke (in browser)
npm run dev
# 1. /explorer?scenario=import-cattle → "Submittable: Yes"
# 2. /explorer/debug → editor pre-filled with cattle JSON
# 3. Edit JSON, click "Save & Evaluate"
#    - Network tab shows TWO requests:
#        PUT /ui/session/notification → 204
#        POST /api/engine/journeys/eu-live-animals/evaluate?withTrace=true → 200
#    - Obligations / trace panels populate
# 4. /explorer/tasklist → reflects edited notification (proves bridge)
# 5. Refresh /explorer/debug → edited JSON still in editor
# 6. Switch journey on /journey-selection → debug editor empty, plants journey selected
# 7. /documentation → three tag groups (config, engine, ui-state); engine endpoints have working "Try it out"

# Postman copy-paste workflow
# 1. /explorer?scenario=import-cattle (animals)
# 2. /explorer/debug → select-all in editor → copy
# 3. Postman: POST http://localhost:3000/api/engine/journeys/eu-live-animals/evaluate?withTrace=true
#    Content-Type: application/json
#    Body: <paste>
# 4. Response: obligations + summary + traces (same as the page shows)
```

## Known unknowns

None blocking.

The senior QA review flagged that `src/client/javascripts/explorer.js`
is 1000 lines mixing fetch + validation + DOM. We're modifying ~30–50
lines in this story (the four zones in §8); the broader refactor
(extracting pure validators into a testable module) is DQ2 in
`design.md` — a deferred refactor.

## What NOT to change

- Do not modify the validators, trace renderer, panel-rendering
  code, `showSaveStatus` body, or `initializeEditor` (beyond the
  one-line journey-key read) in `src/client/javascripts/explorer.js`.
  Only the four zones in §8 are in scope: (a) delete
  `buildEvaluationPayload`; (b) rewrite the engine fetch; (c) add
  the journey-key read at `initializeEditor`; (d) sequential
  PUT-then-POST in the save handler. Expected diff: ~30–50 lines.
- Do not modify `src/server/engine/*`. The engine is unchanged.
- Do not modify the public API surface of
  `src/server/plugins/evaluation-engine/plugin.js` (Story 02
  already extended `validateJourney` for `commodityDetail`).
- Do not introduce a server-side proxy that calls the engine and
  writes to session in the same handler — that path (Option γ) is
  rejected (R12).
- Do not bundle the session write into any `/api/engine/*` handler.
  The engine API is pure compute; session is `/ui/state/notification`.
- Do not change `journey.json`, `obligations.json`, `refdata.json`,
  `resolvers.js`, or `scenarios.js` in either journey.
- Do not introduce URL versioning, CORS, or authentication.
- Do not introduce `{ notification: ... }` envelope on the public API.
  Body is raw notification (D4).
- Do not extract pure validators from `explorer.js` (DQ2 —
  deferred refactor).
