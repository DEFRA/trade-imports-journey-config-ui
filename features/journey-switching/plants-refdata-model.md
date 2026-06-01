# Reference: The plants (CHEDPP) refdata model

This is a **reference document**, not a story. It captures the data
model behind `src/server/journeys/chedpp-plants/refdata.json` so the
normalisation + GMS-correction story
(`03-gms-correction-and-scenario-coverage.md`) and the
commodity-config display (`02-journey-agnostic-variance.md`) have a
shared, accurate mental model. It supersedes the earlier (mistaken)
"the plants `definitions` block is dead data" reading.

## Provenance

The file was produced by `build-chedpp-refdata.js` (in
`cdp-fieldconfig-analysis-frontend/data-analysis/field-config/scripts/`),
which reads source CSVs distilled from the IPAFFS
**commodity-code microservice** and flattens them into JSON. The deeper
analysis is in `chedpp-journey-investigation.md` and
`chedpp-runtime-data-exploration.md` (this folder).

The microservice keys its tables on **two different grains**, and that
distinction is the single most important fact about this data:

| Grain | Source tables | Facts |
|---|---|---|
| **commodity code** (8-digit, e.g. `0808108090`) | `commodity_group_commodity`, `commodity_configuration`, `commodity_attributes`, `commodity_class` | group; `requires_test_and_trial`; `requires_finished_or_propagated`; propagation; quality classes |
| **species** = `commodity_code\|eppo_code` (e.g. `0808108090\|MABSD`) | `inspection_responsibility`, `hmi_marketing`, `commodity_eppo_variety` | regulatory authority (PHSI/HMI/JOINT); marketing standard (GMS/SMS); validity period; varieties |

A commodity has many species; commodity-grain facts are shared by all of
a commodity's species.

## What each dimension drives in the real journey

From `chedpp-runtime-data-exploration.md`:

| Dimension | Grain | Journey effect |
|---|---|---|
| regulatory authority | species | GMS-declaration visibility; custom doc code; validity default |
| marketing standard | species | GMS-declaration page (HMI + GMS) |
| validity period | species | certificate validity calc |
| varieties + classes | species (varieties) / commodity (classes) | variety/class selection page when both present |
| group | commodity | package-type dropdown; gates propagation lookup |
| requires_finished_or_propagated | commodity | finished/propagating dropdown |
| requires_test_and_trial | commodity | test-and-trial field |
| propagation | commodity | intended-use (bulbs/plants) pages |

Distribution (production, from the exploration doc): **98.9% of species
are PHSI** (no marketing implications); only ~5,321 species across 152
commodities carry HMI/JOINT marketing data; varieties are very sparse
(~86 species, 37 commodities).

## The current flat shape, and why it's incoherent

`build-chedpp-refdata.js` builds six in-memory indexes at the two grains,
then **denormalises** them into three top-level keys:

```jsonc
{
  "routing":  { "<code>|<eppo>": { has_gms, has_varieties,
                                   requires_finished_or_propagated,
                                   requires_test_and_trial,
                                   propagation, requires_billing },
                "<code>|": { ...commodity-level fallback for PHSI-only } },
  "content":  { "<code>|<eppo>": { regulatory_authority,
                                   marketing_standard, validity_period } },
  "definitions": {
     "varieties": { "<code>|<eppo>": ["Cavendish", ...] },  // 50 entries, 26 distinct lists
     "groups":    { "<code>": "Fruit and nuts" },           // 482 codes -> 11 names
     "classes":   ["Extra Class","Class I","Class II"]       // hardcoded literal
  }
}
```

Problems this story fixes:

1. **Commodity-grain flags are copied onto every species row.**
   `requires_finished_or_propagated`, `requires_test_and_trial`,
   `propagation` are per-commodity but written into every `code|eppo`
   routing entry (build script lines 256–260). A commodity with 75
   species stores them 75 times.
2. **`has_gms` is a derived boolean, and a misnomer.**
   `has_gms = marketing_standard != null` — it's `true` for *SMS* too
   (92 cases), so it means "has a marketing standard," not "is GMS." The
   resolver treats it as the GMS-declaration trigger. Whether that is
   wrong (and what the correct rule is) is a ~92% activation question
   owned by `gms-declaration-rule-investigation.md` — **not** decided
   here. Normalisation preserves today's behaviour exactly.
3. **`has_varieties` is derived** — exactly `varieties[key]` presence
   (1:1 with the 50-entry table). Storing it duplicates a fact.
4. **`requires_billing` is a rule, not data** — constant `true` for
   species, `false` for the fallback row.
5. **`classes` is disconnected** — the per-commodity `commodity_class`
   mapping was dropped; `classes` is a static 3-value literal with no
   linkage to commodities, so the variety/class page data can't be
   reconstructed.

Net: `routing` is almost entirely *recomputable* from `content`,
`varieties`, and the commodity-grain flags. The redundancy is the
denormalisation, and one stored flag (`has_gms`) is wrong.

## Target normalised shape

Each fact stored once, at its grain; derived booleans removed:

```jsonc
{
  "_meta": { ... },
  "commodities": {                         // commodity-code grain
    "0808108090": {
      "group": "Fruit and nuts",
      "requires_test_and_trial": false,
      "requires_finished_or_propagated": false,
      "propagation": null,
      "classes": ["Extra Class", "Class I", "Class II"]  // restored linkage
    }
  },
  "species": {                             // code|eppo grain
    "0808108090|MABSD": {
      "regulatory_authority": "HMI",
      "marketing_standard": "GMS",
      "validity_period": "2",
      "varieties": ["Braeburn", "Cox", ...]
    }
  }
}
```

- PHSI-only commodities appear in `commodities` with no `species` rows
  (replacing the `code|` fallback hack).
- The GMS-declaration trigger is **derived at read time** from
  `marketing_standard` (and possibly `regulatory_authority`); its correct
  predicate is the subject of `gms-declaration-rule-investigation.md`.
  Normalisation keeps the current derivation (`marketing_standard != null`)
  so behaviour is unchanged until that investigation decides otherwise.
- `varieties: []`/absent ⇔ the old `has_varieties: false`.
- `classes` is per-commodity again (problem #5).

## How evaluation reads it (behaviour-preserving)

The only evaluation consumer is `chedpp-plants/resolvers.js`. Its
`lookupRefdata` currently returns one merged `routing` object via
`code|eppo` → `code|` fallback. Under the normalised shape it
**reconstructs that same object at read time** from the two tables —
moving the merge from build-time to read-time:

```js
const lookupRouting = (refdata, commodity) => {
  const code = commodity.id
  const eppo = commodity.species?.eppoCode ?? ''
  const sp = refdata.species[`${code}|${eppo}`]   // undefined for PHSI-only
  const com = refdata.commodities[code]
  if (!sp && !com) return null
  return {
    has_gms: sp?.marketing_standard != null,            // preserved as-is; correct rule under investigation
    has_varieties: (sp?.varieties?.length ?? 0) > 0,
    requires_finished_or_propagated: com?.requires_finished_or_propagated ?? false,
    requires_test_and_trial: com?.requires_test_and_trial ?? false,
    propagation: com?.propagation ?? null,
    requires_billing: sp != null
  }
}
```

The engine (`src/server/engine/*`) never inspects refdata — it passes it
opaquely to the journey's tests — so it does not change. The only other
shape-coupled change is relaxing the plugin's cross-journey startup guard
(which currently asserts every journey has `refdata.routing`) to be
journey-agnostic.

## What stays out of refdata

- The 480K PHSI-only species rows: they add no variance (just "this
  species exists and is PHSI"), so they are not enumerated — a commodity
  is PHSI-only when it has no `species` entries.
- Article 72 low-risk data: not modelled here (not consumed by the
  current obligations).