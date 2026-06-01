# Story: Journey-agnostic commodity-config (refdata-view for both journeys)

> **Prerequisite:** `03-gms-correction-and-scenario-coverage.md`
> (this story reads the normalised plants `{commodities, species,
> classes}` shape that 03's Phase A produces; 03 also corrects the
> resolver semantics that the variance this page displays will reflect).

## Goal

Make the commodity-config view render for **any registered journey** —
eu-live-animals and chedpp-plants today — by driving it off a small
per-journey **refdata-view descriptor** instead of the hardcoded animals
vocabulary. This removes the last journey-coupled view in the explorer,
so every explorer page works under any `JOURNEY` selection (see
`01-env-selected-journey.md`).

The descriptor has **two rendering concepts** — the fewest that render
both refdata structures without dropping any information today's animals
page shows:

- **dimension** — a *variance-annotated* value list (common/specific
  tagging + an explicit "excluded" list). Animals: Purpose, Identifiers.
  Plants: Regulatory authority, Marketing standard, Validity period,
  Commodity group.
- **detail** — a *labelled group of rows shown as-is*, no variance.
  Animals: Quantity type, Routing Flags. Plants: Commodity routing
  flags, Quality classes, Varieties.

## Why

commodity-config is the **only** explorer view that reads raw,
journey-specific refdata vocabulary. Everything else
(`journey`/`tasklist`/`debug`) renders from the engine's
journey-agnostic output (`EvaluationResult` / `Screen[]` / `Section[]`)
and switches journeys for free. The env-switch story (01) consequently
has to *gate commodity-config off* for non-animals journeys — an interim
hack. This story removes that gate by making the view itself
journey-agnostic.

The leverage: **most of the variance machinery is already generic.**
`classifyValue`, `annotateValues`, and `computeAbsentValues` in
`config-variance.js` take `(values[], frequencyMap, total)` and know
nothing about animals. Only `computeVariance` hardcodes the two animals
dimensions (purpose, identifiers) and their dereferencing rule. This
story breaks that single assumption and adds a generic "detail" block so
the non-variance information (quantity, routing flags) also renders for
any journey.

**Parity rule (settled with the user):** the page *may* change shape;
the only hard constraint is that **no information currently shown is
dropped**. So a label may be re-cased or a section re-ordered, but every
data point on the animals page today must still be present afterwards.

## Context

- `src/server/routes/explorer/config-variance.js`
  - `computeVariance(refdata)` — **animals-specific**: hardcodes
    `purpose` + `identifiers`, dereferencing `content[k].purpose` →
    `definitions.purpose_sets[name]`. Returns
    `{ purposeSuperset, purposeFrequency, identifierSuperset,
    identifierFrequency, totalCommodities }`.
  - `classifyValue` / `annotateValues` / `computeAbsentValues` —
    **already generic**; unchanged by this story.
  - `config-variance.test.js` covers `computeVariance` — updated for the
    new signature + return shape.
- `src/server/routes/explorer/commodity-config-controller.js`
  - Imports `refdata` from eu-live-animals directly (line 1) — the one
    remaining hard journey import after story 01.
  - Computes variance once at **module load** (line 14).
  - `resolveConfig` reads `content[k].{purpose, identifiers, quantity}`
    and dereferences via `definitions.{purpose_sets, identifier_sets,
    quantity_types}`.
  - `routingFlagRows` hardcodes the three animals flags with hand-written
    labels (`CPH Number`, `Permanent Address`, `Transporter Address`).
  - `quantityType` is `{ id, label, name }`.
- `src/server/routes/explorer/commodity-config.njk` — five hardcoded
  blocks: Commodity Summary (dl), Routing Flags (table), Purpose Options
  (variance list), Identifier Types (variance list), Quantity Type (dl).
  The macro extraction (§5) collapses these into the two generic blocks
  plus a journey-neutral summary.
- Refdata shapes:
  - **animals** (unchanged): `content[k]`: `purpose`, `identifiers`,
    `quantity` (each a *name* dereferenced via `definitions`);
    `definitions`: `purpose_sets`, `identifier_sets`, `quantity_types`;
    `routing[k]`: `cph_number`, `permanent_address`,
    `transporter_address` (booleans).
  - **plants** (post-Story 03 Phase A normalisation; see `plants-refdata-model.md`):
    `commodities[code]` carries commodity-grain facts —
    `group`, `requires_test_and_trial`,
    `requires_finished_or_propagated`, `propagation`, `classes`.
    `species[code|eppo]` carries species-grain —
    `regulatory_authority`, `marketing_standard`, `validity_period`,
    `varieties`. No `routing`/`content`/`definitions` keys; no stored
    `has_gms`/`has_varieties`/`requires_billing`.
  - **Validated dimension signal** (probe over ~5,300 plants species
    entries): `regulatory_authority` → JOINT 4874 / HMI 447 (HMI
    "specific" at 8.4%); `marketing_standard` → GMS 5229 / SMS 92 (SMS
    "specific" at 1.7%); `validity_period` → 5 distinct values that vary
    across commodities. `group` (commodity-grain) → 11 distinct values
    across 482 codes (Vegetables dominant). All four carry real
    common/specific signal — all four are dimensions.
- **Dropdown source.** `config-utils#extractCommodityOptions` currently
  reads `refdata.routing` keys (5,710 for plants in the old shape). The
  normalised plants refdata has no `routing`, so the dropdown source
  becomes a **per-journey concern** — see §4. Animals keeps the old
  shape, so animals' dropdown source is unchanged.

## Specification

### 1. The two descriptor shapes

```javascript
// A dimension: a variance-annotated value list.
dimension = {
  id: string,                       // stable key (used to key the variance map)
  name: string,                     // display heading, e.g. 'Purpose'
  valuesFor: (commodityKey) => string[],     // scalars become 1-element lists
  sourceFor?: (commodityKey) => string | null // optional provenance label
}

// A detail: a labelled group of rows shown as-is, no variance.
detail = {
  id: string,
  name: string,                     // section heading, e.g. 'Routing Flags'
  rowsFor: (commodityKey) => Array<{ label: string, value: boolean | string | number | null }>
}
```

Unifying rules:

- **Every dimension yields a list of values per commodity.** Animals'
  multi-valued sets stay lists; plants' scalars become 1-element lists.
  This bridges the set-dereference (animals) vs direct-scalar (plants)
  difference — and is why the descriptor must be a *function*, not config.
- **`sourceFor` is optional** and exists only so animals can keep showing
  the *set name* it currently displays (e.g. "standard_purposes"). Plants
  has no such indirection layer, so it omits `sourceFor`. Keeping it
  optional honours the no-information-dropped rule without inventing a
  fake "set name" for plants.
- **A detail's row `value` is rendered by runtime type** (§5): boolean →
  Enabled/Disabled tag; `null`/`undefined` → "Not provided"; string or
  number → text. This one concept covers animals' quantity object,
  animals' three boolean flags, and plants' six flags (including the
  non-boolean `propagation` string) without special-casing.

### 2. Each journey supplies its refdata-view

New `refdata-view.js` per journey (parallel to `resolvers.js`), exporting
a factory `refdataView(refdata) → { dimensions, details }`, re-exported
from the journey's `index.js`:

```javascript
// eu-live-animals/refdata-view.js
export const refdataView = (refdata) => {
  const { content, definitions, routing } = refdata
  return {
    dimensions: [
      { id: 'purpose', name: 'Purpose',
        valuesFor: (k) => definitions.purpose_sets[content[k].purpose] ?? [],
        sourceFor: (k) => content[k].purpose ?? null },
      { id: 'identifiers', name: 'Identifiers',
        valuesFor: (k) => definitions.identifier_sets[content[k].identifiers] ?? [],
        sourceFor: (k) => content[k].identifiers ?? null }
    ],
    details: [
      { id: 'quantity', name: 'Quantity type',
        rowsFor: (k) => {
          const qt = definitions.quantity_types[content[k].quantity]
          return [
            { label: 'Label', value: qt?.label ?? null },
            { label: 'Field name', value: qt?.name ?? null },
            { label: 'ID', value: qt?.id ?? null }
          ]
        } },
      { id: 'routing', name: 'Routing Flags',
        rowsFor: (k) => [
          { label: 'CPH Number', value: routing[k]?.cph_number ?? null },
          { label: 'Permanent Address', value: routing[k]?.permanent_address ?? null },
          { label: 'Transporter Address', value: routing[k]?.transporter_address ?? null }
        ] }
    ]
  }
}

// chedpp-plants/refdata-view.js  — reads Story 03's normalised shape
export const refdataView = (refdata) => {
  const { species, commodities } = refdata
  const codeOf = (k) => k.split('|')[0]
  const sp = (field) => (k) => [species[k]?.[field]].filter(Boolean)
  const com = (field) => (k) => [commodities[codeOf(k)]?.[field]].filter(Boolean)
  return {
    dimensions: [
      // species-grain
      { id: 'regulatory_authority', name: 'Regulatory authority',
        valuesFor: sp('regulatory_authority') },
      { id: 'marketing_standard', name: 'Marketing standard',
        valuesFor: sp('marketing_standard') },
      { id: 'validity_period', name: 'Validity period',
        valuesFor: sp('validity_period') },
      // commodity-grain (derived from the key's code segment)
      { id: 'group', name: 'Commodity group',
        valuesFor: com('group') }
    ],
    details: [
      { id: 'commodity_flags', name: 'Commodity routing',
        rowsFor: (k) => {
          const c = commodities[codeOf(k)]
          return [
            { label: 'Test and trial', value: c?.requires_test_and_trial ?? null },
            { label: 'Finished or propagated', value: c?.requires_finished_or_propagated ?? null },
            { label: 'Propagation type', value: c?.propagation ?? null }
          ]
        } },
      { id: 'classes', name: 'Quality classes',
        rowsFor: (k) => {
          const classes = commodities[codeOf(k)]?.classes ?? []
          return classes.length === 0
            ? [{ label: 'Classes', value: null }]
            : classes.map((c, i) => ({ label: `Class ${i + 1}`, value: c }))
        } },
      { id: 'varieties', name: 'Varieties',
        rowsFor: (k) => {
          const vs = species[k]?.varieties ?? []
          return vs.length === 0
            ? [{ label: 'Varieties', value: null }]
            : vs.map((v, i) => ({ label: `Variety ${i + 1}`, value: v }))
        } }
    ]
  }
}
```

Notes on the plants descriptor:

- **No `has_gms` / `has_varieties` / `requires_billing` shown.** Story 03
  dropped them as stored fields (derived at read time in Phase A) and
  removed `has_gms` even from the derived view as misleading in Phase B.
  Marketing-standard presence is already visible via the
  `marketing_standard` dimension; variety presence is visible via the
  `Varieties` detail.
- **Mixed grains.** Three dimensions read `species[k]` (species-grain);
  one (`group`) reads `commodities[codeOf(k)]` (commodity-grain). The
  variance machinery is grain-agnostic — the descriptor encodes the
  grain in `valuesFor`.
- **PHSI-only commodities** have no `species[k]` row. Their species-grain
  dimensions return `[]` (rendered as "empty included list" / all values
  in `excluded`), and the commodity-grain dimension/details still render
  from `commodities[code]`. This is the explicit-absence rule in action.

The factory closes over `refdata`; the functions then take just a
commodity key. The explorer reads the descriptor via
`getJourney(journeyKey).refdataView(journey.refdata)`.

### 3. Generalise `computeVariance`

```
computeVariance(refdata, dimensions) → {
  totalCommodities: number,
  byDimension: { [dimension.id]: { superset: Set<string>, frequency: Map<string, number> } }
}
```

Loop `dimensions`; for each commodity key, `dimension.valuesFor(key)` →
accumulate that dimension's superset + frequency. **Key `byDimension` by
dimension `id`** (stable), not display name (mutable, could collide).
Delete the hardcoded purpose/identifier blocks. `classifyValue` /
`annotateValues` / `computeAbsentValues` are untouched.

### 4. Controller drives off the descriptor

`commodity-config-controller.js`:

- Resolve the configured journey via the facade
  (`server.app.evaluationEngine.getJourney(journeyKey)`); **drop the
  direct eu-live-animals import**. `journeyKey` comes from
  `config.get('journey')` (story 01, §3).
- **Dropdown source becomes journey-aware.** `extractCommodityOptions`
  in `config-utils.js` currently reads `refdata.routing` keys — that
  shape no longer exists for plants. The journey's `refdata-view.js`
  exports a `commodityKeys(refdata) → string[]` function alongside
  `refdataView`:
  - Animals: `Object.keys(refdata.routing)` (unchanged behaviour).
  - Plants: union of `Object.keys(refdata.species)` (5,321 species
    keys) and the PHSI-only commodity codes from `Object.keys(refdata.commodities)`
    that have no species rows (~389 commodity-only entries) — total
    matches the 5,710 the old `routing` had, so the dropdown universe
    is preserved.
  `extractCommodityOptions` is rewritten to take this key list rather
  than read `refdata.routing` directly.
- `const { dimensions, details } = journey.refdataView(journey.refdata)`.
- `const variance = computeVariance(journey.refdata, dimensions)` —
  **per-request** (was module-load). Removes the module-load animals
  coupling; cheap even at plants' ~5,300 commodities (see R4).
- For the selected commodity key, build two generic arrays:

  ```javascript
  const dimensionViews = dimensions.map((d) => {
    const values = d.valuesFor(key)
    const { superset, frequency } = variance.byDimension[d.id]
    return {
      id: d.id, name: d.name,
      source: d.sourceFor?.(key) ?? null,
      count: values.length, total: superset.size,
      included: annotateValues(values, frequency, variance.totalCommodities),
      excluded: computeAbsentValues(superset, values, frequency)
    }
  })
  const detailViews = details.map((dt) => ({
    id: dt.id, name: dt.name, rows: dt.rowsFor(key)
  }))
  ```

- Commodity Summary becomes **journey-neutral**: commodity code + the
  second key segment (today's "Species name" is just the second half of
  the `code|x` key — generic). The set-name / quantity rows that the old
  summary duplicated now live in the dimension `source` line and the
  Quantity-type detail respectively (de-duplication, not a drop).

### 5. Template renders two reusable blocks

`commodity-config.njk`: extract two Nunjucks macros and loop the arrays.

- `dimensionBlock(d)` — heading `d.name`; if `d.source`, show it; an
  "N of M possible values" line; the **included** values list (each
  tagged common/specific with frequency when specific, exactly as today);
  and the **excluded** values list rendered explicitly. (This is the
  existing Purpose/Identifier markup, parameterised.)
- `detailBlock(dt)` — heading `dt.name`; a summary-list/table of
  `dt.rows`, each rendered by value type:
  - boolean `true` → green "Enabled" tag; `false` → grey "Disabled" tag
  - `null`/`undefined` → grey **"Not provided"** (explicit absence)
  - string/number → text

Loop `dimensionViews` through `dimensionBlock` and `detailViews` through
`detailBlock`. No hardcoded Purpose/Identifiers/Quantity/Routing markup
remains.

### 6. Explicit absence everywhere (no silent gaps)

Settled rule: **absence is always shown, never silently omitted.**

- **Dimensions** — the `excluded` list (superset − present) is always
  rendered when non-empty, so a value the journey *can* have but this
  commodity *lacks* is visible. (Already the behaviour; preserved.)
- **Details** — a row whose `value` is `null`/`undefined` renders
  "Not provided", not a blank cell and not a dropped row. This is why
  every `rowsFor` above coalesces missing data to `null` rather than
  skipping the row.

## Tests

Test selection per `.claude/skills/valuable-unit-tests/SKILL.md`. The
high-value cases:

- **`config-variance.test.js`** — update for the new
  `computeVariance(refdata, dimensions)` signature and the
  `byDimension` (keyed by id) return shape. Add a synthetic 2-dimension
  descriptor over a tiny hand-rolled refdata; assert superset + frequency
  per dimension id. The generic
  `annotateValues`/`computeAbsentValues`/`classifyValue` tests are
  unchanged.
- **Animals — no information dropped (parity).** Capture the
  commodity-config view-context for a representative commodity (cattle
  `102|Bos taurus`) **before** the refactor (step-0 baseline). After:
  assert the view-context still carries every pre-refactor data point —
  Purpose values + classifications, Identifier values + classifications,
  the quantity type's `label`/`name`/`id`, and the three routing flags
  with their states. Re-arrangement is allowed; loss is not. (Makes R1
  falsifiable.)
- **Plants renders** — with chedpp-plants (via `config.set('journey',
  'chedpp-plants')` per story 01's mechanism), commodity-config renders
  the three plants dimensions (Regulatory authority, Marketing standard,
  Validity period) and the Routing Flags detail (6 rows), with **no blank
  sections** and no error.
- **Scalar dimension** — a plants dimension renders a 1-element annotated
  value list (the scalar), not a crash or empty list.
- **Detail value formatting** — assert the three render kinds: a boolean
  `true`/`false` row → Enabled/Disabled; a `null` row → "Not provided";
  the plants `propagation` string row → its text value. This is the
  explicit-absence guard.
- **Routing generality** — the Routing Flags detail shows the journey's
  own flags (3 rows for animals, 6 for plants).

Don't re-test the already-generic annotate/classify/absent functions
beyond their existing coverage.

## Non-functional requirements

- `npm test` green (modulo the pre-existing favicon failure).
- **Animals commodity-config drops no information** — same Purpose/
  Identifiers dimensions with the same common/specific classification,
  the same quantity-type fields, and the same routing flags as today.
  Layout/label-casing may change; data may not be lost.
- chedpp-plants commodity-config renders without blanks or errors.
- `npm run lint` clean; no new dependencies.
- Engine, plugin, journey maps, obligations, resolvers — untouched.
  Journey adapters gain only a `refdata-view.js` + an index re-export.

## Acceptance criteria

- [ ] `computeVariance(refdata, dimensions)` loops a supplied dimension
  list and returns `byDimension` keyed by dimension **id**; no hardcoded
  purpose/identifier blocks remain.
- [ ] Each journey exports `refdataView(refdata) → { dimensions, details }`
  and `commodityKeys(refdata) → string[]`, re-exported from `index.js`:
  - **animals:** Purpose + Identifiers dimensions; Quantity type + Routing
    Flags details; `commodityKeys = Object.keys(refdata.routing)`.
  - **plants:** Regulatory authority + Marketing standard + Validity
    period + Commodity group dimensions; Commodity routing + Quality
    classes + Varieties details; `commodityKeys` = union of species keys
    and PHSI-only commodity codes.
- [ ] `commodity-config-controller.js` resolves journey data via the
  facade; **no direct journey import remains**
  (`grep -rn "journeys/eu-live-animals\|journeys/chedpp-plants"
  src/server/routes/` → zero).
- [ ] `extractCommodityOptions` takes the journey's commodity-key list
  rather than reading `refdata.routing` directly.
- [ ] `commodity-config.njk` renders via two macros (`dimensionBlock`,
  `detailBlock`) looping the descriptor's arrays; no hardcoded
  Purpose/Identifiers/Quantity/Routing markup remains.
- [ ] **Quantity type is preserved** on the animals page (as a detail).
- [ ] Plants' restored `classes` linkage is surfaced (Quality classes
  detail) and `varieties` is surfaced (Varieties detail) — neither was
  visible before the normalisation.
- [ ] No `has_gms` / `has_varieties` / `requires_billing` appears in
  the plants descriptor or template — those were dropped by Story 03
  (Phase A removed the stored fields; Phase B removed `has_gms`
  entirely as misnamed).
- [ ] Explicit absence: dimension `excluded` values and `null` detail
  rows both render visibly ("Not provided"), never silently omitted.
- [ ] Animals commodity-config drops no information — verified for
  `102|Bos taurus` against the step-0 baseline.
- [ ] Plants commodity-config renders non-blank for a representative
  commodity.
- [ ] Story 01's commodity-config gate (`showCommodityConfig` hide +
  "not available" notice) **and its gate tests** are removed — the view
  now works for all journeys, so the nav item shows for every journey.
- [ ] `config-variance.test.js` updated; full `npm test` green.

## Risks and pre-emptive mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | The generalised view drops information from the animals page (the high-value existing behaviour). | Step-0 baseline: capture the `102\|Bos taurus` view-context before the refactor; assert every pre-refactor data point (purpose/identifier values + classifications, quantity label/name/id, three routing flags) is still present after. Layout may change; data may not be lost. |
| R2 | A `false` boolean flag is mistaken for "absent" and shown as "Not provided", or a genuinely-missing value is shown as "Disabled". | The detail renderer must distinguish `false` (→ Disabled) from `null`/`undefined` (→ Not provided). The detail-value-formatting test pins all three kinds (true/false/null) plus the string case. |
| R3 | Plants "variance" over scalar dimensions trends "common" because most commodities share a value. | Not a blocker — it's honest data (HMI is specific at 8.4%, SMS at 1.7%; validity_period genuinely varies across 5 values). The view demonstrates the mechanism. The 30% `classifyValue` threshold was tuned for animals value-sets; per-journey threshold tuning is out of scope. |
| R4 | `computeVariance` moves from module-load to per-request; plants has ~5,300 content entries. | Per-request variance over ~5k keys × a few dimensions is cheap (ms). Confirm with a quick timing check; if ever a concern, memoise per journey key. |
| R5 | The descriptor functions reach into refdata structure — a journey-shape coupling, just relocated. | Correct and intended: the journey is the right owner of "how my refdata exposes dimensions and details." It lives in the journey adapter (`refdata-view.js`), beside `resolvers.js`, not in the engine or the shared view. |
| R6 | Collapsing the old Commodity Summary rows (set names, quantity) looks like dropped info. | It is de-duplication, not a drop: set names move to the dimension `source` line; quantity moves to the Quantity-type detail. The R1 baseline assertion proves nothing is lost. |

## Verification

```bash
TZ=UTC npx vitest run src/server/routes/explorer/config-variance.test.js
npm test
# Expected: green + 1 pre-existing favicon failure.

# No direct journey import left in the explorer:
grep -rn "journeys/eu-live-animals\|journeys/chedpp-plants" src/server/routes/
# Expected: zero hits.

# Animals (default):
npm run dev
#   /explorer/commodity-config → pick 102|Bos taurus → Purpose + Identifiers
#   dimensions render as today; Quantity type detail (label/name/id) and the
#   three routing flags render; nothing from the old page is missing.

# Plants:
JOURNEY=chedpp-plants npm run dev
#   /explorer/commodity-config → pick a commodity (species or PHSI-only):
#   Regulatory authority, Marketing standard, Validity period, Commodity
#   group dimensions render; Commodity routing (test_and_trial /
#   finished_or_propagated / propagation), Quality classes, and Varieties
#   details render; PHSI-only entries show species-grain dimensions as
#   "Not provided"; nav item present (no "not available" notice).
```

## What NOT to change

- The engine (`src/server/engine/*`) — untouched.
- The plugin — untouched.
- The already-generic `classifyValue` / `annotateValues` /
  `computeAbsentValues` — untouched.
- `journey` / `tasklist` / `debug` views — never coupled to raw refdata;
  this story is commodity-config only.
- Don't tune the `classifyValue` threshold per journey — out of scope.
- Don't add variance to the routing flags — they stay a detail (as-is),
  matching today's behaviour.

## Relationship to the other stories

- **`03-gms-correction-and-scenario-coverage.md` — hard prereq.**
  This story reads the `{commodities, species, classes}` shape that
  03's Phase A produces. It also benefits from 03's Phase B corrected
  predicate so the variance the page displays matches the activation
  the engine computes. Cannot land until 03 has.
- **`01-env-selected-journey.md` — supersedes its §7 gate.** This story
  **supersedes** story 01's commodity-config gate **and removes its
  gate tests** (the "not available" notice + nav-hidden assertions).
  Land order between 01 and 02 is flexible:
  - 01 then 02: 01 ships with the gate; 02 removes the gate and its tests.
  - 02 then 01: commodity-config is already journey-agnostic, so 01 drops
    §7 entirely and never writes the gate tests.
  Either way 01 is journey-selection plumbing; 02 is the view refactor.
  Both thread `journeyKey` + `showCommodityConfig` per story 01 §6 —
  after 02, `showCommodityConfig` is `true` for all journeys and can be
  retired.