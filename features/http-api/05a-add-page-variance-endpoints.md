# Story 05a: Expose page-variance over HTTP (additive)

## Goal

Add two new HTTP endpoints exposing the existing per-commodity `computePageVariance` pure function. Relocate `computePageVariance` (and its helper `buildCommodityValue`) from `src/server/routes/explorer/page-variance.js` to `src/server/analytics/page-variance.js` so the dependency direction is honest — `plugins/http-api/` reading from `analytics/` rather than from `routes/`.

This story is **additive**. The commodity-config controller is unchanged. It still imports `computePageVariance` (from the new location) and calls it in-process. The page renders identically. Story 05b switches the controller to consume these endpoints over HTTP.

## Why

Splitting the work means the endpoints can be tested in Swagger and Postman before the controller changes. If the new endpoints have bugs, the page is unaffected because nothing on the page consumes them yet.

`computePageVariance` is the SDUI primitive that backs _"pick a commodity → see what fields the page would show"_. Exposing it over HTTP is the SDUI shape made observable in the Network tab. Per the user's principle (`feedback_ui_http_first.md`): if the UI will eventually want this, the HTTP endpoint is the thing to add first.

## Context

- Stories 01–04 must be merged before this story begins.
- This story does **not** add a cross-commodity `/variance` endpoint. The cross-commodity rarity computation (`computeVariance`) is being **dropped** rather than exposed — see Story 05b.
- Pairs with Story 05b, which consumes these endpoints from the controller and enforces the lift-out invariant via ESLint.

## Specification

### 1. Relocate analytics functions

Create `src/server/analytics/page-variance.js`:

- Move `computePageVariance` and `buildCommodityValue` from `src/server/routes/explorer/page-variance.js`.
- Move co-located tests with the function.
- Delete `src/server/routes/explorer/page-variance.js`.
- Update the controller's import path so it still works in-process (`#server/analytics/page-variance.js`).

### 2. New endpoints

| Method | Path                                                                            | Returns                        |
| ------ | ------------------------------------------------------------------------------- | ------------------------------ |
| `GET`  | `/api/config/journeys/{key}/commodities/{code}/page-variance`                   | `{ pageVariance: Array<...> }` |
| `GET`  | `/api/config/journeys/{key}/commodities/{code}/page-variance/species/{species}` | same shape, species-specific   |

Handlers live in `config-routes.js` (these are configuration descriptors, not engine compute). Reassemble the commodity key server-side from the path segments, then call `computePageVariance(journey, key, commodityKey)`.

### 3. Joi schemas

```js
const driverSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  active: Joi.boolean().required(),
  reason: Joi.string().allow('').required()
}).unknown(true)

const pageVarianceItemSchema = Joi.object({
  screenId: Joi.string().required(),
  screenName: Joi.string().required(),
  activates: Joi.boolean().required(),
  drivers: Joi.array().items(driverSchema).required()
}).unknown(true)

export const pageVarianceResponse = Joi.object({
  pageVariance: Joi.array().items(pageVarianceItemSchema).required()
}).label('PageVarianceResponse')
```

Strict inner shapes catch real drift; `unknown(true)` on the item leaves a small forward-compat hatch for the engine.

### 4. Client extension

```js
client.getPageVariance(key, code, species?)
```

Returns the response body **verbatim** — i.e. `{ pageVariance: [...] }`, not the unwrapped array. The wrapper is preserved so Story 05b's controller can use `.catch(() => ({ pageVariance: [] }))` as a uniform fallback shape. URL builder uses the same conditional species segment pattern as `getCommodityDetail` (Story 02).

## Tests

### Pure-function tests move with the code

- `src/server/analytics/page-variance.test.js` — existing `computePageVariance` tests move from `routes/explorer/page-variance.test.js`. Edge cases preserved.

### Route-level integration — extend `plugin.test.js`

`test.each` over both journeys for the new endpoints:

- Returns `{ pageVariance: [...] }` for a commodity with commodity-fact obligations.
- Returns `{ pageVariance: [] }` for a commodity with no commodity-fact obligations.
- Returns 404 for unknown journey or commodity code.
- Species-agnostic call (no species segment) succeeds.
- **PHSI-only commodity edge case (plants)**: a commodity that exists in `commodities` but has no entries in `species` (real fixture, key shape `1234|`). Calling `/page-variance` with no species segment returns 200.

`/page-variance` does **not** 404 on unknown species — a species segment that doesn't exist in refdata is a valid request that returns drivers with `activates: false` for screens that read species. `/commodities/{code}/species/{species}` is the endpoint that owns species existence.

### Client unit — extend `journey-api-client.test.js`

- `getPageVariance(key, code)` URL omits species segment.
- `getPageVariance(key, code, species)` URL includes encoded species segment.
- `getPageVariance(key, code, '')` and `(key, code, null)` omit the species segment.
- Returned shape is the response body verbatim (assertion that the wrapper is **not** stripped).

## Acceptance Criteria

- [ ] `src/server/analytics/page-variance.js` exists with `computePageVariance`, `buildCommodityValue`, and co-located tests. `src/server/routes/explorer/page-variance.js` deleted; controller's import updated.
- [ ] Both new endpoints implemented; tagged `['api', 'config']`; Joi schemas strict on inner shapes.
- [ ] Client extended with `getPageVariance(key, code, species?)`; returns response body verbatim.
- [ ] All tests pass against both journeys.
- [ ] Controller unchanged in behaviour; page renders identically.
- [ ] `npm test` green; `npm run lint` clean; engine isolation test still passes.

## Verification

```bash
TZ=UTC PORT=3001 npx vitest run src/server/plugins/http-api/plugin.test.js
TZ=UTC PORT=3001 npx vitest run src/server/analytics/page-variance.test.js
TZ=UTC PORT=3001 npx vitest run src/server/clients/journey-api-client.test.js

# Manual smoke
npm run dev
curl "http://localhost:3000/api/config/journeys/chedpp-plants/commodities/0808108090/page-variance" | jq '.pageVariance | length'
curl "http://localhost:3000/api/config/journeys/chedpp-plants/commodities/0808108090/page-variance/species/MABSD" | jq '.pageVariance | length'
```

## Known risks

- **Third-journey trap.** `buildCommodityValue` in the relocated module hardcodes a switch on the two registered journey keys (`eu-live-animals`/`chedpp-plants`). This story elevates the function to back a live HTTP endpoint; the first request to `/page-variance` for an unregistered third journey will throw `unknown journey '…'` from `buildCommodityValue`. The error is clear in logs but the page degrades opaquely. Not fixed here — the fix requires a journey-adapter contract extension (`commodityValueFor` per journey), sized for its own story alongside the broader adapter-contract review. Tracked so the next implementer registering a third journey sees the trap before deploy.

## What NOT to change

- Do not modify `computePageVariance` or `buildCommodityValue`. Relocated, not refactored.
- Do not modify the commodity-config controller's render logic — that's Story 05b.
- Do not modify `src/server/engine/*`. Engine isolation invariant stays green.
- Do not modify `nav-context.js`. That's Story 06.
- Do not extend the `/refdata-view` response shape — `pageVariance` is a sibling endpoint, not a sub-field.
- Do not add the ESLint `no-restricted-imports` rule. Story 05b does that.
- Do not introduce URL versioning, CORS, or authentication.

## Opened by this story

- **Story 05b** — _"Switch the commodity-config controller to consume these endpoints over HTTP, drop the cross-commodity variance UI, and enforce the lift-out invariant via ESLint."_
