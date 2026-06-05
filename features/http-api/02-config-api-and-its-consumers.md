# Story 02: Config API and its UI consumers

## Goal

Expose the full read-only Journey Configuration API
(`/api/config/*`), add per-journey `commodityDetail(refdata, code)`
so the API can serve a journey-shaped per-commodity driver, and
refactor every UI consumer that uses configuration data to call the
new endpoints over HTTP. After this story, `nav-context.navContext`
is async, every explorer controller is async, and the commodity
config page is fed entirely by the HTTP API.

## Why

Story 01 proved the architecture on a single endpoint. This story
broadens the config side to everything the UI needs from journey
configuration: the journey object itself (obligations, journey map,
scenarios), refdata (bulk), the dimension-and-detail view used by
the inspector, the commodity list, and — the new piece — the
per-commodity driver.

The per-commodity driver answers the FE's narrative question: *given
this commodity, what does the rest of the journey look like?*
Specifically, "Routing Flags" (animals) or "regulatory authority +
marketing standard + varieties + classes" (plants). It's how the
demo can demonstrate the "origin → commodity → next pages"
storyline. See `design.md` D5–D6.

Async-ifying `navContext` is the cross-cutting change that
propagates async-ness to every explorer controller. Doing it here,
once the patterns are settled, keeps Story 03 focused on the engine.

## Context

Feature-level context: `features/http-api/design.md`. Read first.

Story 01 must be merged before this story begins; it provides
the vitest `globalSetup` server boot (`test-helpers/setup.js`),
the client module pattern, and the hapi-swagger registration.

Existing journey contract (per `validateJourney` in
`src/server/plugins/evaluation-engine/plugin.js`):

- `obligations`, `refdata`, `journeyMap` — data.
- `resolvers.{facts, tests, submissionDatePath}` — code (not exposed).
- `refdataView(refdata)` — function returning the dimension view used by
  `/explorer/commodity-config`.
- `commodityKeys(refdata)` — function returning the commodity list.
- This story adds `commodityDetail(refdata, code)` — function
  returning a journey-shaped object describing one commodity.

Animals refdata layout: `routing[code|species]` (flags),
`content[code|species]` (identifier set, certification metadata),
`definitions.identifier_sets[name]` (the resolved identifier set).

Plants refdata layout: `commodities[code]` (group, grouping flags),
`species[code|eppoCode]` (regulatory authority, marketing standard,
varieties, validity period, classes available).

Existing controllers that this story touches:
- `src/server/routes/explorer/nav-context.js`
- `src/server/routes/explorer/journey-controller.js`
- `src/server/routes/explorer/tasklist-controller.js`
- `src/server/routes/explorer/debug-controller.js`
- `src/server/routes/explorer/commodity-config-controller.js`
- `src/server/routes/explorer/journey-picker-controller.js`
- `src/server/routes/journey-selection/controller.js` (re-touched to use updated `navContext`)

This story does **not** touch the engine call paths in those
controllers — the calls that go to `evaluationEngine.evaluate` stay
in-process for now. Story 03 replaces them with HTTP.

## Specification

### 1. New `commodityDetail(refdata, code, species?)` per journey

Signature: `commodityDetail(refdata, code, species)` where `species`
is optional. Returns the appropriate journey-shaped object, or
**`null`** if the lookup misses (so the route handler can translate
to 404, not let the engine throw 500). All response keys are
camelCase (D18); the function does the snake→camel transformation
in code.

`src/server/journeys/eu-live-animals/refdata-view.js` adds:

```js
// Without species: return the species-agnostic row (the existing
// `${code}|` fallback in refdata.routing / refdata.content).
// With species:    return the species-specific row; if not found,
// fall back to the species-agnostic row.
// Returns null if neither row exists.
//
// Shape (camelCase, transformed from snake_case refdata):
//   {
//     routingFlags:   { cphNumber, permanentAddress, transporterAddress },
//     content:        { identifiers, certification, weaningStatus, ... },
//     identifierSet:  refdata.definitions.identifier_sets[content.identifiers]
//   }
export const commodityDetail = (refdata, code, species) => { /* ... */ }
```

`src/server/journeys/chedpp-plants/refdata-view.js` adds:

```js
// Without species: return commodity-level data from refdata.commodities[code].
// With species:    return species-level data from refdata.species[`${code}|${species}`].
// Returns null if the lookup misses.
//
// Commodity-level shape (camelCase, transformed):
//   {
//     group,
//     requiresTestAndTrial,
//     requiresFinishedOrPropagated,
//     propagation,
//     classes
//   }
//
// Species-level shape (camelCase, transformed):
//   {
//     regulatoryAuthority,
//     marketingStandard,
//     validityPeriod,
//     varieties
//   }
export const commodityDetail = (refdata, code, species) => { /* ... */ }
```

Each journey's `index.js` re-exports `commodityDetail`.

**Snake→camel transformation.** Refdata files stay snake_case
(legacy); `commodityDetail` transforms keys on the way out so the
API surface is uniform (D18). A small `mapKeys`-style helper or
hand-written object literal is fine; the Plan agent decides
implementation detail.

**Null vs throw.** `commodityDetail` returns `null` on miss; the
route handler in §3 translates `null` → 404 with the standard
`{ error, message }` body. This keeps engine-/HTTP-boundary
responsibilities separate: the function is a pure lookup; the route
is the only place that knows about HTTP status codes.

### 2. `validateJourney` extension

`src/server/plugins/evaluation-engine/plugin.js` — the
`validateJourney` function adds:

```js
if (typeof journey.commodityDetail !== 'function') {
  throw new Error(`Journey "${key}": commodityDetail is missing or not a function`)
}
```

Fail-fast at startup, mirroring the existing checks (`refdataView`,
`commodityKeys`). This is the only modification to the facade in
this feature.

### 3. New API endpoints

Extend `src/server/plugins/http-api/config-routes.js` with six
routes (URL convention per D17 — separate path segments, no
URL-encoded `|`):

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/config/journeys/{key}` | `{ key, obligations, journeyMap, scenarios }` (refdata stripped) |
| `GET` | `/api/config/journeys/{key}/refdata` | journey-specific refdata JSON (bulk; **no response validation** — see below) |
| `GET` | `/api/config/journeys/{key}/refdata-view` | output of `journey.refdataView(refdata)` |
| `GET` | `/api/config/journeys/{key}/commodities` | `{ commodities: [{ code, label, ... }] }` (output of `journey.commodityKeys(refdata)`) |
| `GET` | `/api/config/journeys/{key}/commodities/{code}` | output of `journey.commodityDetail(refdata, code)` — commodity-level data |
| `GET` | `/api/config/journeys/{key}/commodities/{code}/species/{species}` | output of `journey.commodityDetail(refdata, code, species)` — species-level data |

**Status codes:**
- Unknown `{key}` → 404 with `{ error, message }`.
- Unknown `{code}` or `{code}/species/{species}` (commodityDetail
  returns `null`) → route handler translates to 404 with
  `{ error, message }`. The journey function does not throw; the
  route owns the HTTP boundary (D17, §1).
- Malformed path params → 400 (Joi).

**Path-segment encoding.** The `{species}` segment uses standard
percent-encoding for spaces and special characters (e.g.
`Bos%20taurus`). No literal `|` characters in any URL — that
disambiguation lives inside `commodityDetail` against the
`${code}|${species}` refdata key, not in the URL surface (D17).

**Response validation policy:**
- All endpoints except the bulk-refdata one: Joi schemas validate
  responses. Schemas for journey-shaped responses
  (`refdataView`, `commodityDetail`) use `Joi.object().unknown(true)`
  and carry `example` values per journey via hapi-swagger `meta`.
- **`GET /api/config/journeys/{key}/refdata`**: `validate: { response: false }`
  per D21. Walking 1 MB of plants JSON on every request is wasted
  CPU, and the underlying refdata is journey-private (not a load-
  bearing public contract — the per-commodity endpoints carry the
  real contract).

### 4. Client extensions

`src/server/clients/journey-api-client.js` gains:

```js
client.getJourney(key)                          // returns the object
client.getJourneyRefdata(key)                   // returns the refdata
client.getRefdataView(key)                      // returns the dimension view
client.getCommodities(key)                      // returns the commodity list
client.getCommodityDetail(key, code, species?)  // commodity-level when species omitted; species-level otherwise
```

`getCommodityDetail` constructs the URL conditionally: with a
`species` argument it appends `/species/${encodeURIComponent(species)}`;
without, it stops at `/commodities/${code}`. 404 responses surface
as `ApiError` with `status: 404`; callers translate as needed.

All async, all use the `traceId` propagation pattern established
in Story 01.

### 5. `nav-context.navContext` becomes async

`src/server/routes/explorer/nav-context.js`:

```js
export const navContext = async (request) => {
  const client = clientForRequest(request)
  const journeys = await client.listJourneys()
  const currentKey = currentJourneyKey(request)
  return {
    journeys,
    journeyKey: currentKey,
    // ... other existing fields
  }
}
```

`currentJourneyKey(request)` stays sync — it only reads `yar`.

### 6. Refactor explorer controllers

Every controller that calls `await navContext(request)` becomes
`async`:

- `src/server/routes/explorer/journey-controller.js`
- `src/server/routes/explorer/tasklist-controller.js`
- `src/server/routes/explorer/debug-controller.js`
- `src/server/routes/explorer/commodity-config-controller.js`

Of those, **only `commodity-config-controller.js` switches its
engine/config calls** to use the HTTP client in this story:

```js
const client = clientForRequest(request)
const refdataView = await client.getRefdataView(key)
const commodities = await client.getCommodities(key)
const detail = commodityParam
  ? await client.getCommodityDetail(key, commodityParam)
  : null
```

The remaining three controllers keep their engine calls
(`evaluationEngine.evaluate`, `evaluationEngine.getJourney`) for
now — Story 03 replaces them with HTTP.

### 7. `journey-picker-controller.js`

`src/server/routes/explorer/journey-picker-controller.js` validates
the posted target against the journey list via the client:

```js
const journeys = await client.listJourneys()
const valid = journeys.some((j) => j.key === request.payload.journey)
```

### 8. `/journey-selection` controller — minor update

The Story 01 controller already calls `client.listJourneys()`
directly. Now that `navContext` does the same internally, simplify
the controller to read journeys from `navContext`'s output:

```js
const ctx = await navContext(request)
return h.view('journey-selection/index', { ..., ...ctx })
```

## Tests

### Route-level integration — extend `src/server/plugins/http-api/plugin.test.js`

For **each** new endpoint, table-driven over both journeys
(per I7). All asserted field names are camelCase (D18). URL
construction follows D17 (separate path segments).

- `GET /api/config/journeys/{key}` returns the journey object with
  expected obligation count.
- `GET /api/config/journeys/{key}/refdata` returns the refdata JSON;
  non-empty for both journeys. Response is **not** Joi-validated
  (D21); verify by asserting `JSON.parse(body)` matches a known key
  (e.g. `routing` for animals, `commodities` for plants).
- `GET /api/config/journeys/{key}/refdata-view` returns an object
  matching what `journey.refdataView(refdata)` produces in-process.
- `GET /api/config/journeys/{key}/commodities` returns a non-empty
  list.
- `GET /api/config/journeys/{key}/commodities/{code}` returns the
  commodity-level driver:
  - Animals example: `GET /api/config/journeys/eu-live-animals/commodities/21044150`
    → asserts `routingFlags.cphNumber` is a boolean and `content`
    is an object (resolved against the species-agnostic
    `${code}\|` refdata row).
  - Plants example: `GET /api/config/journeys/chedpp-plants/commodities/0808108090`
    → asserts `group` is a string, `classes` is an array.
- `GET /api/config/journeys/{key}/commodities/{code}/species/{species}`
  returns the species-level driver:
  - Animals example: `GET /api/config/journeys/eu-live-animals/commodities/21044150/species/Bos%20taurus`
    → asserts `routingFlags.cphNumber` is a boolean (resolved
    against the specific `${code}|${species}` row, falling back
    to `${code}\|` if absent).
  - Plants example: `GET /api/config/journeys/chedpp-plants/commodities/0808108090/species/MABSD`
    → asserts `regulatoryAuthority` is a string,
    `marketingStandard` is a string, `varieties` is an array.
- `GET /api/config/journeys/unknown-key` returns 404 with
  `{ error, message }`.
- `GET /api/config/journeys/eu-live-animals/commodities/UNKNOWN`
  returns 404 (commodityDetail returns null; route translates).
- `GET /api/config/journeys/chedpp-plants/commodities/0808108090/species/UNKNOWN`
  returns 404.

These tests double as **Postman fixtures**: each row is a complete,
realistic request payload + expected response.

### Client unit — extend `src/server/clients/journey-api-client.test.js`

For each new client method:
- Calls the correct URL.
- Forwards trace id.
- Surfaces non-2xx as `ApiError` with `.status` and `.body`.

### Journey unit — new `commodityDetail` tests

- `src/server/journeys/eu-live-animals/refdata-view.test.js` — adds
  a `commodityDetail` block: returns expected shape for a known
  code, with and without species; throws (or returns null — Plan
  agent decides) for unknown.
- `src/server/journeys/chedpp-plants/refdata-view.test.js` — same.

### Controller integration

- `src/server/routes/explorer/commodity-config-controller.test.js`
  — uses the shared server booted by `globalSetup`
  (`test-helpers/setup.js`); asserts the page renders for both
  journeys; asserts the per-commodity driver values appear in the
  rendered HTML.
- `src/server/routes/explorer/nav-context.test.js` (if it exists;
  otherwise create) — `navContext` is async; returns both journeys
  in `journeys`; surfaces `currentJourneyKey`.
- `src/server/routes/explorer/journey-picker.test.js` — POST with a
  valid key still redirects; POST with an invalid key still
  rejects.

### Plugin startup

- `src/server/plugins/evaluation-engine/registration.test.js` (or
  equivalent) — startup throws if `commodityDetail` is missing from
  a journey. Test by registering a stub journey missing the
  function.

## Acceptance Criteria

- [ ] `commodityDetail(refdata, code, species?)` exported from both journeys' `refdata-view.js` (and re-exported from `index.js`). Returns `null` on miss (does not throw). Response keys are camelCase (D18) — snake→camel transformation done inside the function.
- [ ] `validateJourney` rejects a journey lacking `commodityDetail`.
- [ ] **Six** new `GET /api/config/*` endpoints implemented, Swagger-documented. Response Joi schemas validate everything **except** the bulk-refdata endpoint, which uses `validate: { response: false }` per D21.
- [ ] `/api/config/journeys/{key}/commodities/{code}` returns the commodity-level driver; `/commodities/{code}/species/{species}` returns the species-level driver. Different shapes for animals vs plants, each documented via Joi `example`. URL uses separate path segments per D17 (no URL-encoded `\|`).
- [ ] Unknown `{code}` or `{species}` → 404 with `{ error, message }`; the route handler translates the `null` return from `commodityDetail` (does not let the function throw → 500).
- [ ] Client extended with `getJourney`, `getJourneyRefdata`, `getRefdataView`, `getCommodities`, `getCommodityDetail(key, code, species?)`.
- [ ] `navContext` is `async` and uses the client.
- [ ] All explorer controllers (`journey`, `tasklist`, `debug`, `commodity-config`) are `async` and `await navContext(...)`.
- [ ] `commodity-config-controller.js` uses the client for refdata-view, commodities, commodity-detail.
- [ ] `journey-picker-controller.js` uses `client.listJourneys()` for target validation.
- [ ] All endpoints tested against **both** journeys.
- [ ] Engine isolation test still passes.
- [ ] `npm test` green.
- [ ] `/explorer/commodity-config` works for both journeys, including the per-commodity detail panel; server log shows the loopback API calls (page is server-rendered — loopback fetches are not visible in browser DevTools).
- [ ] Swagger UI's `config` tag group lists all six endpoints with examples.

## Verification

```bash
# Targeted route + client tests
TZ=UTC npx vitest run src/server/plugins/http-api/plugin.test.js
TZ=UTC npx vitest run src/server/clients/journey-api-client.test.js

# Per-journey unit tests
TZ=UTC npx vitest run src/server/journeys/eu-live-animals/refdata-view.test.js
TZ=UTC npx vitest run src/server/journeys/chedpp-plants/refdata-view.test.js

# Controller integration
TZ=UTC npx vitest run src/server/routes/explorer/commodity-config-controller.test.js
TZ=UTC npx vitest run src/server/routes/explorer/journey-picker.test.js

# Engine isolation invariant
TZ=UTC npx vitest run src/server/engine/_isolation.test.js

# Full
TZ=UTC npm test
npm run lint

# Manual
npm run dev
# - /explorer/commodity-config (animals): dropdown lists commodities; selecting one
#   triggers a page reload (?commodity=X); the server-side handler fetches
#   /commodities/{code} via the client and the page re-renders with routing flags
#   + content + identifier set
# - Switch to chedpp-plants via /journey-selection
# - /explorer/commodity-config (plants): selecting a commodity shows regulatory
#   authority + marketing standard + varieties + classes
# - Server log on each: confirm loopback GETs to /api/config/journeys/{key}/...
#   (page is server-rendered; the loopback fetch is server-initiated and does
#   NOT appear in browser DevTools)
# - /documentation: config tag shows six endpoints; "Try it out" works for each
#   with the appropriate example

# Postman parity check (commodity-level)
curl http://localhost:3000/api/config/journeys/chedpp-plants/commodities/0808108090
curl http://localhost:3000/api/config/journeys/eu-live-animals/commodities/<known-animals-code>

# Postman parity check (species-level — separate path segments per D17)
curl 'http://localhost:3000/api/config/journeys/chedpp-plants/commodities/0808108090/species/MABSD'
curl 'http://localhost:3000/api/config/journeys/eu-live-animals/commodities/<code>/species/Bos%20taurus'

# 404 paths
curl -i http://localhost:3000/api/config/journeys/unknown-key
curl -i http://localhost:3000/api/config/journeys/chedpp-plants/commodities/UNKNOWN
```

## Known unknowns

None resolved-blocking. Worth flagging:
- The exact field names in each journey's per-commodity response are
  decided by the Plan agent during implementation. They must be
  documented in the journey's Swagger example so reviewers can see
  them without running the code.

## What NOT to change

- Do not modify `src/server/engine/*`. The engine has no role in this story.
- Do not modify the in-process `evaluate`, `getJourney`, `listJourneys` surface of `server.app.evaluationEngine`. Only `validateJourney` is extended.
- Do not add or modify the `/api/engine/*` endpoints — that is Story 03.
- Do not refactor any controller's **engine** calls (`evaluationEngine.evaluate(...)`); those stay in-process until Story 03.
- Do not touch `src/server/routes/explorer/api-controller.js` (the internal debug-evaluate endpoint) — Story 03 owns it.
- Do not touch `src/client/javascripts/explorer.js`.
- Do not introduce URL versioning, CORS, or authentication.
- Do not change the cross-journey normalisation policy — per-commodity responses are journey-shaped.