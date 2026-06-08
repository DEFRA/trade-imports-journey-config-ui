# HTTP API design

Feature-level context for `features/http-api/`. Read this first;
the four story files reference it but do not duplicate it.

This feature extracts journey configuration and evaluation into two
HTTP API namespaces (`/api/config/*` and `/api/engine/*`) inside the
existing Hapi process, refactors the UI to consume them over loopback
HTTP, and makes the cross-page state explicit through a small UI
session endpoint (`PUT /ui/session/notification`). The architecture
becomes visible — for the debug page directly in the browser
Network tab, and elsewhere via server logs, Swagger, and Postman.

## Purpose

Today the engine and configuration are exposed as an in-process Hapi
facade (`server.app.evaluationEngine`). Route handlers call it as
ordinary JavaScript. From a viewer's perspective the architecture is
invisible — opaque function calls inside one process. `SOLUTION.md`
sells "a journey configuration service" with two responsibilities
(configuration as data; evaluation as pure computation) but the demo
can't show that shape.

After this feature:

- The two responsibilities are surfaced as `/api/config/*` and
  `/api/engine/*`, documented with OpenAPI and reachable from any
  HTTP client.
- The Hapi UI calls those endpoints itself, via a real HTTP client
  module — loopback fetches initiated by the Node process. These
  appear in **server logs**, not in the browser Network tab (since
  the server is the one making them).
- The debug page's browser JS calls the engine API **directly** from
  the browser — visible in the Network tab.
- Cross-page state ("I edited JSON on debug, now my tasklist
  reflects it") is expressed as an explicit `PUT /ui/session/
  notification` request — the "in-memory database" of the SDUI
  paradigm — fired alongside the engine call.
- The same payloads exercised by the UI can be exercised in Postman
  by copying notification JSON out of the debug editor and pasting
  it into a request body.

The architecture is honest demo framing: **two HTTP APIs (config +
engine) plus a tiny UI session endpoint, one process, one shared
facade.** It is not a microservice split — the engine needs the
resolvers, which are JavaScript and ship together. We say this out
loud so the audience isn't misled.

## Decisions

| # | Decision |
|---|---|
| D1 | Two HTTP namespaces (`/api/config`, `/api/engine`) in the existing Hapi process. Two Swagger tags. |
| D2 | UI refactored to call its own HTTP endpoints via a real client module. Loopback `fetch` — not `server.inject` — so the architecture shows in server logs and is traceable end-to-end. |
| D3 | Engine API has three pipeline stages: `/evaluate`, `/screens`, `/sections`. Not five primitives; not one combined endpoint. |
| D4 | Engine API body is the **raw notification** JSON (Option B). No `{ notification: ... }` envelope. `withTrace` is a query param on `/evaluate` only. Optimised for copy-paste from debug editor to Postman. |
| D5 | Config API has six GET endpoints including `GET /journeys/{key}/commodities/{code}` — the per-commodity driver. |
| D6 | Each journey adds `commodityDetail(refdata, code)` alongside existing `refdataView` and `commodityKeys`. Animals returns `{ routingFlags, content, identifierSet }`; plants returns `{ group, regulatoryAuthority, marketingStandard, varieties, classes }`. Journey-shaped vocabulary; the API does not force normalisation. |
| D7 | Both refdata shapes are first-class. Every endpoint is tested against animals AND plants in the story that adds it. |
| D8 | OpenAPI via `hapi-swagger` + `joi`. Swagger UI at `/documentation`. Joi schemas carry `example` values for "Try it out". |
| D9 | `apiBaseUrl` sourced from `server.info.uri` immediately after `server.start()` so tests on port 0 work; overridable via `API_BASE_URL` env var. |
| D10 | Trace id (`x-cdp-request-id`) propagates UI → loopback → API via the client. |
| D11 | Test stratification: route-level API tests use `server.inject` (fast, no loopback). UI handler integration tests share **one** real Hapi instance booted by **vitest `globalSetup`** at `test-helpers/setup.js` on a configured test port (`TEST_PORT` env var, default 3001). All test files read `process.env.API_BASE_URL` set by the hook. Client unit tests use `vitest-fetch-mock`. Parity test (Story 04) reads the same `API_BASE_URL`. No per-file `bootServer()` — one process-wide server avoids port collisions, race conditions on convict `apiBaseUrl`, and test-helper duplication. |
| D12 | `POST /explorer/debug/evaluate` is **deleted**. Browser JS in `src/client/javascripts/explorer.js` is modified to POST directly to `/api/engine/journeys/{key}/evaluate?withTrace=true` with the raw notification body. Cross-page state is preserved by a new explicit UI endpoint `PUT /ui/session/notification` that the browser fires alongside the engine call on save. (Option β; see Q1 resolution below.) |
| D13 | Walking-skeleton Story 01 refactors only `/journey-selection`. `nav-context.navContext` async-ification and remaining consumers come in Story 02. |
| D14 | No URL versioning for the spike. OpenAPI carries `info.version`. |
| D15 | Errors use the existing `{ error, message }` + `statusCodes` constants pattern; Joi error schema documented in `schemas.js`. |
| D16 | Three URL namespaces, three demo concerns: `/api/*` is the public APIs (compute + config); `/ui/*` is UI plumbing (session state — "the in-memory database"); `/explorer/*` and `/journey-selection` are page renders. Swagger documents all three so the architecture is legible from one page. |
| D17 | **URL convention for commodity endpoints — separate path segments.** Commodity-level data: `GET /api/config/journeys/{key}/commodities/{code}`. Species-level data: `GET /api/config/journeys/{key}/commodities/{code}/species/{species}`. No URL-encoded `\|` characters. Animals' refdata composite-key resolution (`${code}\|${species}` with fallback to `${code}\|` for the species-agnostic / PHSI-only row) is performed server-side inside `commodityDetail`. `commodityDetail(refdata, code)` returns commodity-level; `commodityDetail(refdata, code, species)` returns species-level. |
| D18 | **Field naming — camelCase across the API surface.** Response keys, request body keys, and Joi schema field names are camelCase. Underlying refdata JSON files stay snake_case (legacy artefact; not worth churning). Each journey's `commodityDetail` performs the snake→camel transformation in code. Examples: `regulatory_authority` → `regulatoryAuthority`, `marketing_standard` → `marketingStandard`, `cph_number` → `cphNumber`, `requires_test_and_trial` → `requiresTestAndTrial`. |
| D19 | **Response gzip is on by default.** Hapi compresses `application/json` automatically; the browser shows real wire size in the Network panel. No spec work required. |
| D20 | **`payload.maxBytes` bumped on engine routes to 5 MB.** Hapi's default 1 MB ceiling is too low for user-edited debug notifications. Per-route option: `options: { payload: { maxBytes: 5 * 1024 * 1024 } }` on each engine POST. |
| D21 | **Response validation disabled on the bulk refdata endpoint.** `validate: { response: false }` (or `Joi.any()`) on `GET /api/config/journeys/{key}/refdata`. Walking 1 MB of plants JSON through Joi on every request is wasted CPU; the underlying refdata is journey-private and not load-bearing on the API contract. Per-commodity endpoints keep validation. |
| D22 | **Variance computation: per-commodity exposed, cross-commodity dropped.** Story 05a adds `GET /api/config/journeys/{key}/commodities/{code}/page-variance` (and the `/species/{s}` variant) backed by a relocated `computePageVariance` in `src/server/analytics/`. Story 05b switches the commodity-config controller to consume those endpoints over HTTP and **deletes** the cross-commodity variance computation (rarity badges, "of N possible values", excluded-values list, `computeVariance`/`annotateValues`/`computeAbsentValues`) rather than exposing it. The rarity panel was meta-analytics, not part of the SDUI narrative; binning it removed memoisation hazards and an asymmetric coupling guard. Story 05b also turns on an ESLint `no-restricted-imports` rule blocking `#server/engine/*` and `#server/plugins/evaluation-engine/*` across `src/server/routes/`, with a deliberate carve-out for `nav-context.js` that Story 06 removes. Known risk recorded in `05a-add-page-variance-endpoints.md`: the relocated `buildCommodityValue` still hardcodes a journey-key switch (third-journey trap). Resolves DQ4. |

## Invariants

Apply to every story; referenced not restated.

| # | Invariant |
|---|---|
| I1 | Engine framework-isolation preserved. `src/server/engine/_isolation.test.js` continues to pass. The new HTTP plugin lives outside `src/server/engine/`. |
| I2 | All four explorer UI URLs work unchanged. Pages render the same. URLs unchanged. |
| I3 | Cross-page notification state is preserved end-to-end ("load scenario → edit on debug → tasklist reflects the edit"). The *mechanism* moves from a side-effecting proxy to an explicit `PUT /ui/session/notification`, but the user-visible behaviour is identical. |
| I4 | `src/server/engine/*` is not modified. Journey adapters (`src/server/journeys/*`) gain only the new `commodityDetail` function in Story 02. |
| I5 | `src/server/plugins/evaluation-engine/plugin.js` keeps its public API surface (`evaluate`, `getJourney`, `listJourneys`); only `validateJourney` is extended (Story 02) to validate `commodityDetail`. |
| I6 | Tests prefer real journey adapters + real Hapi servers; mocks are limited to the HTTP boundary for client unit tests. |
| I7 | Every API endpoint tested against both registered journeys (`eu-live-animals`, `chedpp-plants`). |

## Rejected alternatives

Recorded so they aren't re-litigated.

| # | Alternative | Why rejected |
|---|---|---|
| R1 | Separate Node HTTP server (two processes) | Bootstrap complexity; no architectural payoff for a demo; resolver coupling between config and engine makes a clean split artificial. |
| R2 | Three processes (UI + config + engine) | Same as R1, stronger — resolvers presuppose refdata shape. |
| R3 | Five-primitive engine API (`evaluate`, `evaluateWithTrace`, `resolveScreens`, `rollUpToSections`, combinators) | Forces clients to ship `JourneyMap`/`Screen[]` between calls; unergonomic in Postman. |
| R4 | One combined endpoint returning evaluate+screens+sections | Clients pay for everything when they want one slice; Swagger less informative. |
| R5 | UI keeps in-process facade with HTTP as additional surface | Incomplete demo story — UI handlers wouldn't exercise the architecture. |
| R6 | Hybrid (UI uses HTTP only for JSON/debug flows) | Same as R5. |
| R7 | URL versioning (`/api/v1/...`) | Pre-paying for a discipline not needed at the spike stage. |
| R8 | Public API as `{ notification, withTrace? }` envelope (Option A) | Wrapping costs the user a step that has no business value; raw body (D4) makes copy-paste from debug editor to Postman the obvious workflow. |
| R9 | Kill `/explorer/debug/evaluate` **and** drop the session-write workflow entirely (Option α) | The cross-page bridge (load scenario → modify on debug → see effect on tasklist) is a key demo element — showing one journey from multiple perspectives. Killing it costs the demo more than it gains. |
| R10 | Public API returns standardised envelope; client adapts on receive | Adds a normaliser in the browser; worst of both worlds. |
| R11 | Per-commodity refdata as lookup-only optimisation | Reversed during planning — per-commodity is a **feature** powering the FE's "origin → commodity → next pages" narrative. |
| R12 | Keep `POST /explorer/debug/evaluate` as a thin server-side proxy that bundles session write + engine call (Option γ) | Architecturally fuzzy — the browser hits a UI URL rather than the public API, and the endpoint conflates session persistence with pure compute. The adopted alternative (Option β: explicit `PUT /ui/session/notification` + browser calls public API directly) gives the same UX with a clean separation. |

## Q1 resolution — debug-page cutover (Option β)

The internal `POST /explorer/debug/evaluate` endpoint today does
**two things** on each browser save:
1. Writes the posted notification to `yar.notification` (read by
   `/explorer`, `/explorer/tasklist`, and the debug-GET handler).
2. Calls the evaluation engine and returns the result.

That bundling is convenient for one consumer (the existing browser
JS) but it muddies the demo: the browser hits a UI URL, the engine
side-effects on session state, and the architecture isn't legible
from the browser Network tab.

**Adopted approach (Option β).** Split the two responsibilities:

- The engine call moves to the public API. Browser JS POSTs directly
  to `POST /api/engine/journeys/{key}/evaluate?withTrace=true` with
  the raw notification body.
- The session write becomes its own explicit endpoint:
  `PUT /ui/session/notification`. The handler is one line:
  `request.yar.set('notification', request.payload)`. The browser
  fires this **sequentially**, before the engine call on save.
- `POST /explorer/debug/evaluate` is **deleted**.

On each "Save & Evaluate" click the browser fires **two HTTP
requests** in sequence, both visible in the Network tab:

```
1. Browser ──PUT──>  /ui/session/notification      (persist state; await 204)
2. Browser ──POST──> /api/engine/journeys/{key}/evaluate?withTrace=true   (compute; render result)
```

The two endpoints are independent on the wire — the engine API is
pure compute and never touches the session; the UI session endpoint
is dumb persistence and never touches the engine. **Sequencing them
in the browser** is a user-experience guarantee: if Save & Evaluate
succeeds, both happened; if PUT fails, the engine call doesn't
fire and the user sees a clear "Save failed" rather than a
half-success where the panels rerender against a notification
that isn't saved. The user-visible workflow is identical to today.

### Concrete browser-side changes

`src/client/javascripts/explorer.js`:
1. **URL** — fetch target changes from `/explorer/debug/evaluate` to
   `/api/engine/journeys/${journeyKey}/evaluate?withTrace=true`.
2. **Body** — send the raw notification JSON (not wrapped in
   `{ notification: ... }`).
3. **Journey key injection** — read from a new
   `data-journey-key="..."` attribute on the page root; the debug
   page's Nunjucks template populates it from session during GET.
4. **Session persistence** — on save, fire `PUT /ui/session/
   notification` (body: raw notification JSON) before or in parallel
   with the engine call.

These changes are localised (≈10 lines). The validators and trace
renderer in `explorer.js` are unchanged — the response shape from
the public engine API is constrained (Joi schema in Story 03) to
match exactly what those validators expect.

### Tests added in Story 03

- **Cross-page session contract.** Replaces the false-positive
  `index.test.js:358-381`. PUT a uniquely-identifying notification
  to `/ui/session/notification`, GET `/explorer/tasklist`, assert
  the unique substring appears. Proves the session bridge.
- **Response-shape contract.** Asserts the public engine API returns
  exactly the keys browser JS reads. Both journeys.
- **Journey-key round-trip.** POST `/explorer/journey` then exercise
  the debug flow; the right journey is used.

## Deferred questions

These do not block any story in this feature.

| # | Question |
|---|---|
| DQ2 | Should pure validators in `src/client/javascripts/explorer.js` be extracted into a testable ESM module? Senior QA flagged the file as untestable in isolation. Story 03 made minimal changes (≤50 lines, four documented zones); a future refactor would lift `validateEvaluationResult`, `renderTraceStep`, and friends into a testable module. |
| DQ3 | HTTP cache headers on the bulk refdata endpoint? `chedpp-plants/refdata.json` is ~1 MB. |

(DQ1 — should "Save & Evaluate" remain a feature — is **resolved** in
favour of keeping it via the explicit session endpoint. See D12 and
Q1 above.)

## Smoke checklist (manual, post-Story-04)

```bash
TZ=UTC npm test
TZ=UTC npx vitest run src/server/routes/explorer/index.test.js
TZ=UTC npx vitest run src/server/routes/explorer/journey-picker.test.js
npm run lint
npm run dev
```

Browser checks (the architecture is visible directly in Network tab
on the debug page):

1. `/explorer?scenario=import-cattle` → "Submittable: Yes"
2. `/explorer/debug` → editor pre-filled with cattle JSON
3. Edit JSON, click "Save & Evaluate" → "Saved to session", panels
   populate. **Network tab shows two browser requests**:
   `PUT /ui/session/notification` (state) and
   `POST /api/engine/journeys/eu-live-animals/evaluate?withTrace=true`
   (compute).
4. Refresh `/explorer/debug` → edited JSON still shown (proves the
   PUT persisted).
5. `/explorer/tasklist` → reflects edited notification (proves the
   cross-page bridge works through the explicit session endpoint).
6. Switch journey on `/journey-selection` → `/explorer/debug`
   editor is empty.
7. `/explorer/debug` with malformed JSON → parse error under
   textarea, no console crash.
8. `/documentation` renders three Swagger tag groups — `config`,
   `engine`, `ui-state` — the latter showing
   `PUT /ui/session/notification`.

Server-log checks (loopback HTTP from page-render routes):

9. Visit `/explorer/tasklist`; server log shows the loopback POST
   to `/api/engine/journeys/.../sections`. Trace id ties the page
   GET to the loopback POST.

Postman checks:

10. `GET /api/config/journeys` returns both journeys.
11. `GET /api/config/journeys/chedpp-plants/commodities/0808108090`
    returns plants per-commodity driver.
12. Copy notification JSON from `/explorer/debug` editor; paste into
    Postman body; `POST /api/engine/journeys/eu-live-animals/
    evaluate?withTrace=true` returns matching obligations + summary.

## Story map

| Story | Purpose | Role |
|---|---|---|
| `01-thin-vertical-slice.md` | Swagger + first endpoint + first client method + `/journey-selection` refactor + vitest `globalSetup` at `test-helpers/setup.js` | **Walking skeleton** — proves the architecture end-to-end on the thinnest slice |
| `02-config-api-and-its-consumers.md` | Remaining `/api/config/*` (including per-commodity) + `commodityDetail` per journey + `navContext` async + commodity-config + journey-picker refactor | Broadens the config side; introduces async controllers |
| `03-engine-api-and-debug-cutover.md` | `/api/engine/*` + UI handler refactors + delete `/explorer/debug/evaluate` + add `PUT /ui/session/notification` + modify browser JS to call public API directly + three contract tests | Broadens the engine side; lands the Option β cutover |
| `04-parity-and-test-tightening.md` | Parity test + SOLUTION.md update + deferred-decisions ledger | Cleanup and confidence-building |
| `05a-add-page-variance-endpoints.md` | New `/page-variance` (+ species variant) endpoints; `computePageVariance` relocated to `src/server/analytics/`; client extended | Additive — endpoints exist, page renders unchanged |
| `05b-switch-controller-and-enforce-lift-out.md` | Commodity-config controller switches to 100% HTTP; cross-commodity variance UI and `computeVariance` dropped; ESLint `no-restricted-imports` rule with `nav-context.js` carve-out | Subtractive + enforcement — controller-level lift-out invariant closed |
| `06-navcontext-engine-decoupling.md` | `nav-context.js` engine reads removed; ESLint carve-out deleted; transitive-import isolation test added | Closes the last in-process engine surface in `src/server/routes/` |

## References

- `SOLUTION.md` — overall architecture; the "future journey configuration service" section motivates this work.
- `src/server/plugins/evaluation-engine/plugin.js` — the existing in-process facade that all HTTP routes delegate to.
- `src/server/engine/_isolation.test.js` — framework isolation guard, kept green throughout.
- `features/modelling/engine-design.md` — design-document precedent for this `design.md`.
- `features/journey-switching/04-runtime-journey-picker.md` and `05-journey-selection-page.md` — recent precedent for routes interacting with `nav-context`.
