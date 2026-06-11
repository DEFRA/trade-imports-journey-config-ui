# Story 03: chedd-products journey, registered and live

## Goal

The complete `chedd-products` journey module is assembled and registered, so the evaluation engine loads it, `listJourneys()` returns it, the config and engine HTTP APIs serve it, and it evaluates a CHED-D notification to a submittable result. After this story a third journey exists alongside `eu-live-animals` and `chedpp-plants` — live and correct, with the full obligation contract in place.

## Why

This is the bulk of the deliverable, delivered register-once (decided: no minimal-then-full obligation rework). Because `validateJourney` requires a complete module to boot, the journey can only go live when every export is present — so this story ships them together: refdata-view, resolvers, the full obligation set, the journey map, and the two wiring edits. The seam itself (the registry, `validateJourney`, the HTTP routes, page-variance) is already proven by the two existing journeys, so registering with the full contract carries little risk.

## Context

- Module templates: `src/server/journeys/eu-live-animals/*` (single-grain `resolvers.js`, the `index.js` loader boilerplate, the `obligations.json` / `journey.json` altitude) and `src/server/journeys/chedpp-plants/refdata-view.js` (the `codeOf` key-stripping discipline this journey must copy).
- Inputs from earlier stories: `refdata.json` (story 01); the notification path table in `features/notification-shape/04-migrate-chedd-products.md` (story 02).
- The registry contract: `src/server/plugins/evaluation-engine/plugin.js` (`JOURNEYS` map + `validateJourney`). The closest precedent for the wiring is `features/modelling/09-register-chedpp-plants.md`.
- The conditional-obligation touch point: `src/server/analytics/page-variance.js` (`buildCommodityValue` — a hardcoded `journeyKey` switch that throws for unknown keys).
- CED journey structure: the "CHED-D (CED)" Part-1 section of `cdp-fieldconfig-analysis-frontend/analysis/field-config-to-ui-mapping.md`.

## Specification

**1. Create `src/server/journeys/chedd-products/`.**

- `index.js` — loader boilerplate, identical to `eu-live-animals/index.js` (reads `obligations.json` / `refdata.json` / `journey.json`; re-exports `scenarios`, `resolvers`, `refdataView` / `commodityKeys` / `commodityDetail`).
- `refdata-view.js` — `refdataView` returns dimensions (the internal-market set, with `sourceFor` surfacing the set name as animals surfaces `purpose_set_NN`; the combo) and details (routing flags, product description, packages); `commodityKeys` = `Object.keys(refdata.content)` (2,176 bare codes); `commodityDetail` is single-grain (accepts and ignores `species`) and resolves the internal-market set like animals resolves `identifierSet`. **Every view-closure lookup goes through `codeOf(key) = key.split('|')[0]`** — the closures are invoked with `` `${code}|` `` keys (from `refdataKey()` in `config-routes.js`) but storage is bare-code; this is the single most likely silent bug. Copy plants' discipline, not animals'.
- `resolvers.js` — `facts` (`commodity` = first commodity, the single-commodity routing semantic; `purposeGroup`); `tests.requiresInternalMarket` reads `refdata.routing[commodity.id].has_internal_market` (bare-code lookup, no `|` fallback) and returns `{ active, reason }`; `submissionDatePath = 'submittedAt'`.
- `obligations.json` — the full set (~18): the obligations carried over from animals/plants (`notification-type`, `consignment-origin`, `import-purpose`, `commodity-selection`, `commodity-description`, `entry-and-arrival`, `accompanying-documents`, `consignor`/`consignee`/`importer`/`destination` identification, `contact-designation`, `reference-number`, `legal-declaration`) plus the three CED-specific (`packages-and-weights`, `commodity-complement`, `intended-purpose`). Exactly one conditional: `intended-purpose` with `{ fact: 'commodity', test: 'requiresInternalMarket' }` and the schemaPath settled in story 02. The animals-only obligations (species taxonomy, animal identification/certification/weaning, veterinary/health + establishments, permanent address, CPH, transporter, transit-routing) are not present.
- `journey.json` — 6 sections (About / Description of the goods / Documents / Addresses / Transport / Complete notification) at the `eu-live-animals` altitude, each field carrying an `obligationRef`.
- `scenarios.js` — a representative `scenarioMap` that story 04 keeps verbatim and appends to: `import-wheat` (`1001` "Wheat and meslin", internal-market active) and `import-refrigerator` (`84181020`, anomaly), each a complete CED notification in the new shape that evaluates submittable. Naming them as the subset 04 extends keeps the parity matrix and registration smoke from churning. (Exhaustive coverage is story 04.)

**2. Register the journey.** In `src/server/plugins/evaluation-engine/plugin.js` add `import * as cheddProducts from '../../journeys/chedd-products/index.js'` and `'chedd-products': cheddProducts` to the `JOURNEYS` map. `validateJourney` then enforces the full contract at boot.

**3. Add the page-variance branch.** In `src/server/analytics/page-variance.js`, add a `chedd-products` case to `buildCommodityValue()` returning `{ id: commodityID }` (single-grain, no species sub-object).

**4. Update the registration test.** In `src/server/plugins/evaluation-engine/registration.test.js`, extend the `listJourneys().sort()` assertion (currently `['chedpp-plants', 'eu-live-animals']`) to the three keys, and add `chedd-products` evaluate-smoke cases mirroring the existing per-journey ones (empty notification → an `EvaluationResult`; a committed scenario → `submittable: true`).

**5. Add chedd to the facade-vs-HTTP parity matrix.** In `src/server/plugins/http-api/parity.test.js`, add a `chedd-products` entry to the hardcoded `journeys` array (`{ key, scenarios, adapter }`, lines 54-65). The matrix then round-trips every chedd scenario through both the facade and HTTP automatically; story 04's added scenarios flow through with no further edit.

**Journey picker — automatic; this story only verifies it.** No picker code change: `nav-context.js` maps `listJourneys()` → `journeyOptions` (raw key as label) and `journey-picker-controller.js` validates the switch target against the same live list, so registering in step 2 makes `chedd-products` appear and be switchable. The existing `nav-context.test.js` *stubs* the journey list, so it does not break. This story asserts (AC) and manually verifies that the picker lists and switches to `chedd-products`.

The HTTP/config and engine routes and navigation auto-discover the journey via `listJourneys()` — no edits there.

## Tests

Per-module unit tests at the level the qa-test-planner plans against, plus the existing suite continuing to pass:

> Behaviour and risks: a complete third journey boots and serves. `resolvers.requiresInternalMarket` activates for an internal-market commodity and is inactive for an anomaly. `refdata-view` resolves a `` `${code}|` ``-form key to non-empty data (the `codeOf` regression). The module satisfies `validateJourney`. Risks: the bare-code/`|` key mismatch; a missing page-variance branch throwing at request time.

High-value cases: `resolvers` (the `requiresInternalMarket` test over a known internal-market commodity and a known anomaly); `refdata-view` (a `${code}|` key resolves non-empty, plus `commodityKeys` count and `commodityDetail` for a present/absent code); boot (`validateJourney` accepts the module); the registration test asserts `listJourneys()` includes `chedd-products`; a contract case evaluates a representative scenario to `submittable: true`. Selection follows `.claude/skills/valuable-unit-tests/SKILL.md`.

Explicitly excluded: the exhaustive scenario matrix and the cross-journey parity test are story 04 — don't add them here.

## Acceptance Criteria

- [ ] The server boots with `chedd-products` registered; `validateJourney` passes for all three journeys.
- [ ] `GET /api/config/journeys` includes `chedd-products`.
- [ ] `GET /api/config/journeys/chedd-products/commodities` returns 2,176 codes; `…/commodities/1001` resolves its internal-market set; `…/commodities/84181020` shows `has_internal_market: false` with a null set.
- [ ] `GET /api/config/journeys/chedd-products/refdata-view` renders dimensions and details with no empty-data regression (proves `codeOf`).
- [ ] `POST /api/engine/journeys/chedd-products/evaluate` returns `submittable: true` for the internal-market scenario, and shows `intended-purpose` inactive for the anomaly scenario.
- [ ] `buildCommodityValue('chedd-products', …)` does not throw.
- [ ] `registration.test.js` asserts all three keys from `listJourneys().sort()`, and the chedd evaluate-smoke cases pass.
- [ ] `parity.test.js` includes `chedd-products` rows (scenarios × trace on/off) and they pass.
- [ ] The explorer journey picker lists `chedd-products`, and `POST /explorer/journey` switches to it (the explorer then renders chedd content).
- [ ] All existing tests continue to pass.

## Verification

```bash
npm test
npm run dev      # three journeys registered; the picker lists chedd-products and switches to it; then exercise the endpoints above
npm run lint
```

## What NOT to change

The engine (`src/server/engine/*`), the HTTP route definitions, and the `eu-live-animals` / `chedpp-plants` journeys. `validateJourney` itself — if the new module needs adjustment to pass, adjust the *module*, not the validator (per story 09's precedent). The `refdata.json` from story 01 (consumed read-only). Part 2 / inspector pages — out of scope.
