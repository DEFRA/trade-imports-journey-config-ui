# Story 06: Show which pages each commodity drives on the commodity-config view

> **Builds on** Story 02 (journey-agnostic commodity-config view). Adds a derived "Pages this commodity drives" panel to `/explorer/commodity-config`. For the selected commodity, the panel lists each page in the active journey whose presence is determined by commodity or species data, and shows whether that commodity triggers the page along with the reason returned by the journey's resolver tests. All computation happens in the explorer layer; the engine and the journey adapters are not touched.

## Goal

Add a panel to `/explorer/commodity-config` that lists, per selected commodity, every screen in the active journey whose presence is determined by commodity-fact conditional obligations. For each such screen, show Yes/No (would this commodity make the screen appear?) and the reasons from each obligation that drives the screen. Include a hint stating that the values are **derived** by running the journey's predicates against the commodity's refdata, not stored as flags. The panel works for both `eu-live-animals` and `chedpp-plants`.

## Why

The Commodity Reference Data Configuration page currently shows what data is *present* in the refdata for a selected commodity (dimensions and details). It does not show which conditional pages each commodity triggers. A demo audience comparing HMI+GMS oranges against JOINT+SMS apples against PHSI-only foliage cannot tell, from the existing page, which conditional pages exist for each commodity.

The two journeys in this spike encode commodity-driven page presence two different ways:

- The animals journey stamps page-firing decisions as commodity-level booleans in the routing table (`cph_number`, `permanent_address`, `transporter_address`). The flag *is* the decision.
- The plants journey composes page-firing decisions from species- and commodity-level refdata via predicates: the GMS-declaration page fires when `regulatory_authority === 'HMI' AND marketing_standard === 'GMS'`; the intended-use page fires when `propagation !== null`; and so on.

The journey's resolvers already encode the predicate (or the boolean read) for each case. The panel calls those resolvers directly with the selected commodity and renders the result. The same panel works for both journeys; the demo point - that one service answers "which pages fire?" regardless of underlying data shape - lands when the audience switches journey at `/journey-selection` and sees the same panel populated by very different config paths.

## Context

The commodity-config controller (`src/server/routes/explorer/commodity-config-controller.js`) currently:

1. Reads the active journey via `evaluationEngine.getJourney(journeyKey)`. The controller already has `journeyKey` in scope from `navContext(request)`.
2. Calls `refdataView(refdata)` to get `{ dimensions, details }`.
3. Calls `commodityKeys(refdata)` to populate the dropdown.
4. For the selected commodity, computes variance over each dimension and renders the page via `commodity-config.njk`.

Each journey exposes `resolvers.facts` (extractors `(notification) -> value`) and `resolvers.tests` (predicates `(factValue, refdata) -> { active, reason }`). Conditional obligations reference them by string in `condition.fact` and `condition.test`.

**The screen-status mechanic the panel relies on.** Per `engine/resolve-screens.js`:

- `extractScreenObligations` filters a screen's fields to those with an `obligationRef`. Presentational fields without an obligationRef are ignored for status derivation.
- A screen with NO referenced obligations is `complete` by default.
- A screen whose referenced obligations are ALL `inactive` becomes `notApplicable` and is dropped by `rollUpToSections`.
- If any referenced obligation is `unsatisfied`, `deferred`, or `satisfied`, the screen renders.

So the panel's claim "for this commodity, this page would appear" maps cleanly onto "is any of the screen's commodity-fact conditional obligations active?" *if and only if* the screen's only obligation-referencing fields point at commodity-fact conditional obligations. If a screen mixed a commodity-fact conditional with an always-required obligation, the always-required obligation would be `unsatisfied` and the screen would render regardless of the commodity. The §4 invariant test asserts this property holds for both journeys.

**Screens driven by commodity-fact conditional obligations** (verified against each journey's `journey.json` and `obligations.json`):

| Journey | Screen | Commodity-fact obligations referenced from the screen |
| --- | --- | --- |
| `eu-live-animals` | Animal identifiers | `animal-identification` |
| `eu-live-animals` | Additional details | `animal-certification`, `animal-weaning-status` |
| `eu-live-animals` | Permanent addresses for pets | `permanent-address` (plus one presentational field without `obligationRef`) |
| `eu-live-animals` | CPH number | `livestock-holding` |
| `eu-live-animals` | Transporter | `transporter-identification` |
| `chedpp-plants` | GMS declaration | `gms-declaration` |
| `chedpp-plants` | Variety and class | `variety-class` |
| `chedpp-plants` | Finished or propagated | `finished-or-propagated` |
| `chedpp-plants` | For test and trial | `test-and-trial` |
| `chedpp-plants` | Intended use | `intended-use` |
| `chedpp-plants` | Billing details | `billing-information` |

Two cases worth flagging:

- The animals **Additional details** screen has *two* obligations with different conditions. The screen appears if EITHER is active. The panel groups by screen and shows a single row with the combined Yes/No.
- The animals **Permanent addresses for pets** screen has one presentational field (`permanent-address-same-as-pds`) with no `obligationRef`. Per `extractScreenObligations`, presentational fields don't influence screen status, so the screen's presence is still determined by the single `permanent-address` obligation.

Purpose-fact conditional obligations (`transit-routing`, `transhipment-routing`) are deliberately excluded - they sit on the "Reason for importing" screen alongside always-required fields, so their condition drives field-level variance within an always-present page, not page presence.

`src/server/routes/explorer/config-utils.js` currently exports `buildMinimalNotification(purposeGroup, commodityKey, countryOfOrigin)`. The function is animals-shaped (it sets `species.name`), has no production callers (grep confirms: only `config-utils.test.js` references it), and was authored before the plants journey existed. It is dead code.

## Specification

### 1. New helper in the explorer layer

New file `src/server/routes/explorer/page-variance.js`. Two functions.

```
buildCommodityValue(journeyKey, commodityKey) -> object
```

A journey-aware builder that takes a commodity key (`code|speciesKey`) and returns the commodity object the journey's tests expect. The journey-awareness is one switch on `journeyKey`:

- `eu-live-animals` -> `{ id: code, species: { name: speciesName } }`. Animals tests read `commodity.id` and `commodity.species.name` (verified against `eu-live-animals/resolvers.js`'s `buildRefdataKey`).
- `chedpp-plants` -> `{ id: code, species: { eppoCode: speciesName } }`. Plants tests read `commodity.id` and `commodity.species.eppoCode` (verified against `chedpp-plants/resolvers.js`'s `lookupRouting`).

Throws `Error("buildCommodityValue: unknown journey '<journeyKey>'")` if the journey is not recognised. Fails loudly rather than returning an unusable shape.

```
computePageVariance(journey, journeyKey, commodityKey) -> Array<{ screenId, screenName, activates, drivers }>
```

`journey` is the adapter record from `getJourney(journeyKey)`. The journey key is passed in separately because the adapter does not carry it.

The function:

1. Returns `[]` if `commodityKey` is null or undefined.
2. Builds the commodity value via `buildCommodityValue(journeyKey, commodityKey)`.
3. Identifies commodity-fact conditional obligation ids: `obligations.filter(o => o.condition?.fact === 'commodity').map(o => o.id)`.
4. Walks `journey.journeyMap.sections[].screens[]`. For each screen, collects the field `obligationRef`s that are commodity-fact conditionals.
5. For each screen that has at least one such ref, computes the per-driver result by running `tests[obligation.condition.test](commodityValue, refdata)`.
6. Emits one entry per screen:

```js
{
  screenId: screen.id,
  screenName: screen.screenName,
  activates: drivers.some(d => d.active),
  drivers: [
    { id: obligation.id, name: obligation.name, active: boolean, reason: string },
    ...
  ]
}
```

`activates` is the OR of the drivers' `active` flags - the screen renders if any commodity-fact conditional on it is active.

No engine import. No `evaluate` call. No notification stub.

### 2. Controller integration

In `commodity-config-controller.js`, after the existing dimension/detail computation:

```js
import { computePageVariance } from './page-variance.js'
// ...
const pageVariance = computePageVariance(journey, journeyKey, selectedKey)
return h.view('explorer/commodity-config', {
  // ...existing context...
  pageVariance
})
```

One import, one new local, one new field in the view context. The existing flow is undisturbed.

### 3. Template

In `src/server/routes/explorer/commodity-config.njk`, add a new section after the existing details block, guarded by `pageVariance.length`:

```
{% if pageVariance and pageVariance.length %}
  <h2 class="govuk-heading-m">Pages this commodity drives</h2>
  <p class="govuk-body govuk-hint">
    Each row below corresponds to a page in the journey whose presence
    depends on commodity or species data. The Yes/No is computed by
    running the journey's resolver predicates against the selected
    commodity's refdata - it is not stored as a flag in the refdata
    file. For animals the predicate is usually a boolean lookup; for
    plants it is usually a compound predicate over several species
    fields.
  </p>

  <table class="govuk-table">
    <thead class="govuk-table__head">
      <tr class="govuk-table__row">
        <th class="govuk-table__header">Page</th>
        <th class="govuk-table__header">Triggered by this commodity?</th>
        <th class="govuk-table__header">Driver(s)</th>
      </tr>
    </thead>
    <tbody class="govuk-table__body">
      {% for s in pageVariance %}
        <tr class="govuk-table__row">
          <td class="govuk-table__cell">{{ s.screenName }}</td>
          <td class="govuk-table__cell">
            {% if s.activates %}
              <strong class="govuk-tag govuk-tag--green">Yes</strong>
            {% else %}
              <strong class="govuk-tag govuk-tag--grey">No</strong>
            {% endif %}
          </td>
          <td class="govuk-table__cell govuk-body-s">
            {% for d in s.drivers %}
              <div>{{ d.name }}: {{ d.reason }}</div>
            {% endfor %}
          </td>
        </tr>
      {% endfor %}
    </tbody>
  </table>
{% endif %}
```

Each driver renders on its own line in the cell. Single-driver screens show one line; multi-driver screens (the animals "Additional details" case) show one line per driver, with the screen's overall Yes/No reflecting the OR of the drivers.

### 4. Invariant test

The panel's claim "screen activates iff a commodity-fact driver is active" relies on the property that **every obligation-referencing field on a screen carrying a commodity-fact conditional points at a commodity-fact conditional obligation**. If a screen ever mixed a commodity-fact conditional with an always-required obligation, the always-required obligation would be `unsatisfied` under `resolveScreens`, the screen would render regardless of the commodity, and the panel's Yes/No would not match page presence.

New file `src/server/routes/explorer/page-variance-invariant.test.js`. For each registered journey:

```js
import { describe, test, expect, beforeAll } from 'vitest'
import { createServer } from '#server/server.js'

describe('page-variance invariant: every commodity-conditional screen is uniformly commodity-conditional', () => {
  let engine
  beforeAll(async () => {
    const server = await createServer()
    engine = server.app.evaluationEngine
  })

  test.each(['eu-live-animals', 'chedpp-plants'])('%s', (journeyKey) => {
    const journey = engine.getJourney(journeyKey)
    const commodityFactConditionalIds = new Set(
      journey.obligations
        .filter((o) => o.condition?.fact === 'commodity')
        .map((o) => o.id)
    )

    for (const section of journey.journeyMap.sections) {
      for (const screen of section.screens) {
        const refs = screen.fields
          .map((f) => f.obligationRef)
          .filter(Boolean)
        const hasCommodityFactConditional = refs.some((r) =>
          commodityFactConditionalIds.has(r)
        )
        if (!hasCommodityFactConditional) continue

        for (const ref of refs) {
          expect(commodityFactConditionalIds.has(ref)).toBe(true)
        }
      }
    }
  })
})
```

Two reads of the property:
- Presentational fields with no `obligationRef` are skipped (matching `extractScreenObligations`).
- Every other ref on a commodity-conditional screen must be a commodity-fact conditional. If a future obligation lands on such a screen without a commodity-fact condition, the test fails and forces the change author to either restructure the journey map or update the panel's claim.

### 5. Cleanup

`buildMinimalNotification` in `src/server/routes/explorer/config-utils.js` is deleted along with its `describe` block in `config-utils.test.js`. Grep before deletion shows only `config-utils.test.js` references; grep after shows zero. Cleanup happens in the same commit; it removes ~50 lines of dead code.

## Tests

`src/server/routes/explorer/page-variance.test.js` (new unit tests):

- **`buildCommodityValue`**:
  - For `'eu-live-animals'` and `'102|Bos taurus'`, returns `{ id: '102', species: { name: 'Bos taurus' } }`.
  - For `'chedpp-plants'` and `'0805108010|CIDAU'`, returns `{ id: '0805108010', species: { eppoCode: 'CIDAU' } }`.
  - For a PHSI-only plants key `'06042090|'`, returns `{ id: '06042090', species: { eppoCode: '' } }`.
  - Throws `Error("buildCommodityValue: unknown journey 'made-up-journey'")` for an unrecognised journey key.
- **`computePageVariance`**:
  - Returns `[]` for `commodityKey === null` or `undefined`.
  - Returns one entry per screen (not per obligation), grouped by `screenId`. Purpose-conditional obligations (`transit-routing`, `transhipment-routing`) do not appear.
  - For plants and `'0805108010|CIDAU'` (HMI+GMS), the entry for screen "GMS declaration" has `activates: true`, one driver, with `drivers[0].reason === 'HMI-inspected species with GMS marketing standard'` (verbatim from `chedpp-plants/resolvers.js:131`).
  - For plants and `'0709999090|DATME'` (JOINT+GMS), the "GMS declaration" entry has `activates: false`, one driver, with `drivers[0].reason === 'species is not HMI+GMS (no GMS declaration required)'` (verbatim from `chedpp-plants/resolvers.js:132`).
  - For animals and `'102|Bos taurus'`, the entry for screen "Additional details" has TWO drivers (`animal-certification`, `animal-weaning-status`) and `activates === (any of the drivers' active flags)`. The exact `active` values depend on routing-flag values for cattle in `eu-live-animals/refdata.json` - the test pins both.
  - For animals and `'102|Bos taurus'`, the entry for screen "CPH number" has `activates: true` (`cph_number: true` for cattle), one driver `livestock-holding`. The "Permanent addresses for pets" entry has `activates: false` (`permanent_address: false`), one driver. The "Transporter" entry has `activates: true` (`transporter_address: true`), one driver.

`src/server/routes/explorer/page-variance-invariant.test.js` (new contract test as per §4): asserts the every-obligation-conditional invariant for both journeys.

`src/server/routes/explorer/journey-switching.test.js` (extend the existing tests):

- After loading `/explorer/commodity-config?commodity=0805108010|CIDAU` under plants, the rendered HTML contains the hint paragraph beginning `'Each row below corresponds to a page'` and a row for `GMS declaration` marked `Yes`.

Existing tests confirmed unmodified:
- `engine/*.test.js` - no engine surface touched.
- Per-journey adapter tests - no adapter surface touched.
- The existing `journey-switching.test.js` plants assertions - the new section is purely additive.

## Non-functional requirements

- `npm test` green (modulo the pre-existing favicon failure).
- `npm run lint` clean.
- No new dependencies.
- No new files outside `src/server/routes/explorer/`.
- No imports from `src/server/engine/` added by the new code.

## Acceptance criteria

- [ ] New file `src/server/routes/explorer/page-variance.js` exports `buildCommodityValue` and `computePageVariance`.
- [ ] `buildCommodityValue` throws on an unknown journey key.
- [ ] `computePageVariance(journey, journeyKey, commodityKey)` takes the journey key explicitly and returns one entry per screen (grouped), not per obligation. Purpose-conditional obligations (transit, transhipment) do not appear in its output.
- [ ] `commodity-config-controller.js` threads the result into the view context as `pageVariance`, passing both `journey` and `journeyKey`.
- [ ] `commodity-config.njk` renders the panel (heading "Pages this commodity drives" + hint + table with screen / Yes-No / drivers columns) when `pageVariance.length > 0`, omits it otherwise.
- [ ] For plants HMI+GMS commodities, the "GMS declaration" row shows `Yes` with the verbatim resolver reason from `chedpp-plants/resolvers.js:131`. For JOINT+GMS, `No` with the verbatim reason from `chedpp-plants/resolvers.js:132`.
- [ ] For animals `102|Bos taurus`: "CPH number" Yes, "Permanent addresses for pets" No, "Transporter" Yes. "Additional details" shows two drivers and an OR'd Yes/No.
- [ ] The every-obligation-conditional invariant test passes for both journeys.
- [ ] `buildMinimalNotification` and its `describe` block are deleted. Grep returns zero matches.
- [ ] The new code imports nothing from `src/server/engine/`. Grep confirms.
- [ ] `npm test` green; `npm run lint` clean.

## Risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | The commodity-value builder is journey-aware (a switch on `journeyKey`). A third journey needs its commodity shape added. | The switch lives in one file in the explorer layer; not in the adapter contract. Adding a third journey is a one-paragraph extension. The grep "no `src/server/engine` imports in this file" doubles as a discipline check. |
| R2 | The helper bypasses the journey's `facts.commodity` extractor and constructs the commodity value directly. If a journey's commodity-fact tests ever started reading something the constructed value doesn't carry (e.g. a new `species.id` field), the panel would silently produce wrong results. | The constructed shape is documented inline in §1 and tied to specific resolver-internal lookups in both journeys (`buildRefdataKey`, `lookupRouting`). The unit tests pin exact `reason` strings, so a divergence between constructed-value and test expectation surfaces as a test failure rather than silent corruption. |
| R3 | A future obligation lands on a commodity-conditional screen with a non-commodity-fact condition (e.g. `purposeGroup`-driven), breaking the screen-presence claim. | §4 invariant test fails immediately, forcing the change author to either restructure the journey map or update the panel's claim. |
| R4 | The animals "Additional details" screen has two obligations with different conditions. The panel groups by screen so the row shows one Yes/No and two drivers, but a demo audience may still find it confusing. | The drivers cell shows each driver with its own reason on its own line. The OR semantics for the screen-level Yes/No follows the engine's actual `resolveScreens` behaviour - the panel does not invent a rule. Demo prose should call this out if the multi-driver case lands on the audience. |
| R5 | The hint paragraph is the only UI signal that values are derived. A reader who scrolls past it might still treat the Yes/No tags as stored flags. | The hint sits in `govuk-hint` styling immediately under the heading; tested by asserting the literal substring is in the rendered HTML. |

## Verification

```bash
TZ=UTC npm test
npm run lint

# Engine and adapter surfaces are not changed:
grep -rn "page-variance\|computePageVariance\|buildCommodityValue" src/server/engine src/server/journeys src/server/plugins
# Expected: zero matches.

# Old dead helper is gone:
grep -rn "buildMinimalNotification" src/
# Expected: zero matches.

# Manual smoke (start dev server, then in a browser):
# - /explorer/commodity-config?commodity=0805108010|CIDAU
#     -> GMS declaration: Yes, driver gms-declaration with reason
#        'HMI-inspected species with GMS marketing standard'
# - /explorer/commodity-config?commodity=0709999090|DATME
#     -> GMS declaration: No, driver with reason
#        'species is not HMI+GMS (no GMS declaration required)'
# - /explorer/commodity-config?commodity=06042090|
#     -> all rows: No
# Switch journey via /journey-selection to eu-live-animals:
# - /explorer/commodity-config?commodity=102|Bos taurus
#     -> CPH number: Yes
#     -> Permanent addresses for pets: No
#     -> Transporter: Yes
#     -> Additional details: shows two drivers, Yes if either is active
```

## What NOT to change

- `src/server/engine/` - untouched. No imports added; no exports changed.
- `src/server/journeys/*/index.js` - no new exports. The adapter contract is unchanged.
- `src/server/plugins/evaluation-engine/plugin.js` - no new guard, no new field on the engine facade.
- `obligations.json`, `journey.json`, `refdata.json` for any journey - data files unchanged.
- The existing dimensions and details sections of the commodity-config page - markup and behaviour untouched. The new panel is additive below them.

## Relationship to the other stories

- **Builds on Story 02** (journey-agnostic commodity-config view). Story 02 made the page render generically from a journey's refdata-view descriptor; this story adds a derived overlay computed locally, in the explorer layer, from the journey's existing resolver tests.
- **Builds on Story 03** (GMS-declaration predicate correction). The panel relies on the corrected `HMI AND GMS` predicate to surface meaningfully different answers for HMI+GMS vs JOINT+GMS commodities.
- **Does not block any future story.** A follow-on that annotates obligations with a `variance` field could refine the panel further; the panel itself works without it.
