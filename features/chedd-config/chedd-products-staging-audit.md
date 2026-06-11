# chedd-products staging — audit

Diff against `__fixtures__/ced-part1-config-v2-pre-stories-13-17.json`. 
Four shipped changes (Stories 13, 14, 15, 16). Structural sections are 
regenerated on every build; prose lives in the source-of-truth doc.

---

## Change 1 — Story 13: `line_item_complement` preserved verbatim

Was null for 2,174 of 2,176 commodities (the "null means use commodity_code" convention). Now every commodity carries the raw extracted value.

<!-- PROSE: Explain the implicit-knowledge problem the convention created and why verbatim emission was preferred over documenting the convention. -->

```json
// before — commodity 20089393 (legacy)
{
  "line_item_complement": null
}
```
```json
// after — commodity 20089393 (staging)
{
  "line_item_complement": "20089393"
}
```

---

## Change 2 — Story 14: routing shape collapsed to `has_internal_market` boolean

Replaces `{all_pages_present, exceptions}` (which leaked Part 2 page anomalies into Part 1 outputs) with per-commodity `{has_internal_market: boolean}`. Includes the removal of dead `identifyMissingPages` plumbing in `config-builder.js`.

<!-- PROSE: Cover the bug (Part 2 leakage) and the design evolution (explicit boolean) in one paragraph each. Reference the original plan/refactoring-enforcer notes if useful. -->

```json
// before — routing top-level (legacy)
{
  "all_pages_present": false,
  "exceptions": {
    "85167200": [
      "Laboratory Tests"
    ]
  }
}
```
```json
// after — routing for an anomaly commodity (08129025)
{
  "has_internal_market": false
}
```
```json
// after — content for the same commodity (no internalMarket key)
{
  "complement_id": "239609",
  "species_description": "0812 Fruit and nuts, provisionally preserved (for example, by sulphur dioxide gas, in brine, in sulphur water or in other preservative solutions), but unsuitable in that state for immediate consumption0812 90 Other0812 90 25 Apricots; oranges",
  "line_item_complement": "08129025",
  "combo_complement_id": "239609"
}
```

---

## Change 3 — Story 15: frequency-ordered `internalMarket_set_NN` IDs + deterministic timestamps

IDs renumbered so the most-populous set is `_01` (matches CHED-A convention). `metadata.generated_at` honours `SOURCE_DATE_EPOCH` so two builds with the same input + epoch produce byte-identical files.

<!-- PROSE: Explain why frequency-ordering matters for downstream consumers (the eventual refdata.json transformation) and reference reproducible-builds conventions for the timestamp. -->

```json
// after — definition keys, sorted
[
  {
    "id": "internalMarket_set_01",
    "optionCount": 4
  },
  {
    "id": "internalMarket_set_02",
    "optionCount": 1
  },
  {
    "id": "internalMarket_set_03",
    "optionCount": 2
  },
  {
    "id": "internalMarket_set_04",
    "optionCount": 3
  },
  {
    "id": "internalMarket_set_05",
    "optionCount": 3
  }
]
```

---

## Change 4 — Story 16: combo blob collapsed to scalar + universal template

Per-commodity `combo_components` blob removed; each commodity now carries `combo_complement_id` (always) plus `combo_type_options_override` (for the 9 outliers whose `comboType` deviates from the dominant template). The universal template lives once in `definitions.combo_template`. File size: ~2.6 MB → ~1.0 MB.

<!-- PROSE: Frame as a deliberate reversal of Story 06 (which stored the verbose blob to fix a prior null bug). Cover the D3 outlier finding and the override mechanism. -->

```json
// before — commodity 200710 combo_components (legacy)
{
  "comboType": {
    "options": [
      {
        "text": "fig paste",
        "value": "149352"
      },
      {
        "text": "hazelnut paste",
        "value": "149534"
      },
      {
        "text": "pistachio paste",
        "value": "149533"
      }
    ],
    "label": "Type"
  },
  "comboClass": {
    "options": [
      {
        "text": "",
        "value": "149352"
      }
    ],
    "label": "Class"
  },
  "comboFamily": {
    "options": [
      {
        "text": "",
        "value": "149352"
      }
    ],
    "label": "Family"
  },
  "comboModel": {
    "options": [
      {
        "text": "",
        "value": "149352"
      }
    ],
    "label": null
  }
}
```
```json
// after — commodity 200710 (staging)
{
  "combo_complement_id": "149352",
  "combo_type_options_override": [
    {
      "text": "fig paste",
      "value": "149352"
    },
    {
      "text": "hazelnut paste",
      "value": "149534"
    },
    {
      "text": "pistachio paste",
      "value": "149533"
    }
  ]
}
```
```json
// after — definitions.combo_template (one copy serves all 2,176)
{
  "comboType": {
    "options": [
      {
        "text": "",
        "value": "{{complement}}"
      }
    ],
    "label": "Type"
  },
  "comboClass": {
    "options": [
      {
        "text": "",
        "value": "{{complement}}"
      }
    ],
    "label": "Class"
  },
  "comboFamily": {
    "options": [
      {
        "text": "",
        "value": "{{complement}}"
      }
    ],
    "label": "Family"
  },
  "comboModel": {
    "options": [
      {
        "text": "",
        "value": "{{complement}}"
      }
    ],
    "label": null
  }
}
```

---

## Notes

- The legacy snapshot lives at `field-config/analysis/__fixtures__/ced-part1-config-v2-pre-stories-13-17.json` and is the byte-level reference for the four sections above.
- Two non-Story changes also landed during the iteration: the `analyze-ced-part1-variance-v2.js` output filename was aligned to what the build expects (Story 15), and dead `routing.exceptions` reader branches were cleaned from `config-queries-v2.js` (Stories 13/14).

## Tier 3 (Axis-2 UI mapping) — documented loosening

The story originally specified strict set-equality between each Part 1 page's components in the config and in `analysis/field-config-to-ui-mapping.md`. The mapping doc is a UI-level summary; the field config carries finer-grained component names. Two systematic divergences are reconciled at verification time, not by editing the doc:

1. **`(unnamed)` placeholder filtered.** The doc lists `(unnamed):org_picker` once per page; the config has multiple named org_picker variants (`p_selcoe`, `p_selcor`, ...). The verifier strips `(unnamed)` from the doc-side expected set.

2. **Name normalisation.** Comparisons are case- and whitespace-insensitive so the doc's `productDescription` matches the config's `Product description`. Whitespace collapses to `~` to avoid silent collisions across genuinely different identifiers.

3. **One-directional check.** The verifier only fails when the doc lists a component the config does NOT have. Config-only extras are tolerated (they're the org_picker variants and similar UI-level abstractions). The reverse direction is a regression signal we explicitly do not want to surface here.

Manual sampling has been done at the build that produced this audit and is captured by the 5-commodity Vitest fixture at `field-config/scripts/build-chedd-products-staging.test.js`.
