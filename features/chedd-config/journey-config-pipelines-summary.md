# Journey Config Pipelines — Summary

How we arrive at the "journey config" that feeds the obligation engine, per CHED type. This document collects the strategies used to get from raw source data to compact, structured representations of each journey.

The picture is mixed: only **one** CHED type currently has a clean, small JSON ready for the obligation engine. The others are at various stages between raw data and that goal.

---

## Part 1 — The Mechanical Process: The Round-Trip Pipeline

The general-purpose pipeline we built lives in `data-analysis/features/normalisation/`. It was designed to take field config JSON blobs and prove we could decompose them into a normalised relational schema **without losing information**. The whole approach hinges on round-tripping: extract → normalise → reconstruct → verify byte-identical against the source.

### Stages

```
vnet-data.csv  ──►  DuckDB (in-memory)  ──►  raw JSON + signatures
                          │
                          ▼
                  Postgres normalised schema
                  (source_configs → pages →
                   sections → components,
                   plus variant_groups for
                   commodity variance)
                          │
                          ▼
                  Reconstructed JSON
                          │
                          ▼
                  Byte-identical match? ✓
```

1. **CSV → in-memory DuckDB.** The `vnet-data.csv` (3,254 rows, all cert types combined) is imported via `field-config/storage/duckdb-client.js`. DuckDB gives us SQL over the raw blobs without standing up a real database — useful for ad-hoc per-cert-type extraction.
2. **Extract per cert type.** Scripts like `extract-chedpp.js`, `extract-cveda-single.js`, `extract-cvedp-single.js`, `extract-ced-single.js` pull rows by `certificate_type` and `commodity_code`, parse the JSON in the `data` column, and emit a **signature file**. Signatures are flat strings (`PageName|Position|SectionName|ComponentName:ComponentType`) — small enough to diff, complete enough to prove structural equivalence.
3. **Migrate into Postgres.** `migrate-*.js` scripts insert pages, sections, components, and (where relevant) variant groups into the normalised schema (`data-analysis/db/migrations/001_schema.sql`, v3.1, per-config storage).
4. **Reconstruct JSON.** `reconstruct-*.js` queries Postgres and rebuilds the original JSON shape.
5. **Verify.** `verify-*.js` compares signatures and full JSON. Any divergence halts the pipeline. Where source structure had subtle quirks (e.g. unnamed sections), we added flags like `had_name_in_source` to preserve them exactly.

The story sequence is in `data-analysis/features/normalisation/stories/README.md`.

### What this pipeline gives us

A **provably lossless** path from raw field config to a queryable, structured form. Once a cert type has been round-tripped, we have confidence that any further reduction (deduplication, journey synthesis, small-JSON extraction) is operating on a faithful representation of the source.

What it does **not** automatically give us is the compact, journey-shaped JSON the obligation engine actually wants. That's a separate reduction step on top — and we've only done it cleanly for one cert type so far.

---

## Part 2 — What We Found About Each CHED Type

### CHED-D (CED) — Part 1 compressed to a deterministic 1 MB staging artifact

**Source:** 2,176 rows in `vnet-data.csv`, one per commodity code.
**Pipeline path:** Hybrid — DuckDB-backed extraction + variance analysis (the round-trip-style infrastructure) → in-place builder that emits a normalised v2 JSON → 3-tier post-build verification.
**Status:** **Done for Part 1.** Output is `output/chedd-products-staging.json` — **1.06 MB**, deterministic, byte-identical to `output/ced-part1-config-v2.json` (same builder, named differently for downstream use). Audit doc regenerated each build at `output/chedd-products-staging-audit.md`.

CHED-D is the cert type where the field config story is most "true": every commodity has its own row, those rows really do differ, and the differences matter. The variance analysis in `data-analysis/features/ced-extraction/` shows that of CHED-D's Part 1 components, 31 are universal across all 2,176 rows and 7 vary in well-defined ways. The staging artifact stores those facts as a universal layer + a per-commodity layer:

```
chedd-products-staging.json (1.06 MB, 2,176 commodities)
│
├── metadata             ~ 2 KB    cert_type, version, varying/universal names, generated_at
├── pages                ~ 2 KB    Part 1 page skeleton (Commodity, Purpose, References,
├── components           ~ 5 KB ─┐     Traders, Transport, Consignment)
├── section_components   ~ 1 KB ─┤
├── universal_data       ~ 0 KB ─┤  ⟵ universal layer (~11 KB total)
├── definitions          ~ 3 KB ─┘     5 × internalMarket_set_NN (frequency-ordered)
│                                      + 1 × combo_template ({{complement}} placeholder)
│
├── routing             ~ 93 KB    routing[code].has_internal_market: boolean (per commodity)
│
└── content            ~ 825 KB    per-commodity (the irreducible 78%):
                                     {  internalMarket: "internalMarket_set_NN"    (ref)
                                     ,  combo_complement_id: "..."                 (scalar)
                                     ,  combo_type_options_override: [...]         (9 outliers)
                                     ,  line_item_complement: "..."                (verbatim)
                                     ,  species_description: "..."                 (free text)
                                     ,  complement_id: "..."                       (scalar) }
```

**Why this isn't 24 KB like CHED-A.** CHED-A's commodities carry ~3 boolean flags each; CHED-D's carry substantive per-commodity facts (species description, line item complement, four complement IDs). The 825 KB content section is the irreducible floor — every byte is per-commodity data that cannot be deduped. The universal layer (pages, components, definitions, combo_template) sits at ~11 KB total: that's the actual compression dividend.

#### Data model — how the sections reference each other

```
┌─ UNIVERSAL LAYER (stored once, ~11 KB) ─────────────────────────────────────┐
│                                                                             │
│  pages.<P>.sections.<S> ── lists ──► { name, position }                     │
│                                          │                                  │
│                              "name" is a key in ↓                           │
│                                                                             │
│  components.<name>             ◄─── universal components (most)             │
│   → { label, type, options?, values? }                                      │
│                                                                             │
│  section_components.<name>.<P:S>  ◄─── components that vary by section      │
│   → { label, type, options?, values? }                                      │
│                                                                             │
│  universal_data.line_item_packages   ◄─── the universal wrapper around the  │
│                                          per-commodity line-item complement │
│                                                                             │
│  definitions:                                                               │
│    internalMarket_set_01..05  → { values: [...] }   (5 frequency-ordered)   │
│    combo_template             → { comboType / Class / Family / Model        │
│                                    each: { label, options: [               │
│                                      { text:"", value:"{{complement}}" }   │
│                                    ] } }                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                              ▲                  ▲
                              │                  │
                              │ string reference │ template + scalar substitution
                              │ "internalMarket_ │ (and override for 9 outliers)
                              │  set_NN"         │
                              │                  │
┌─ PER-COMMODITY LAYER (2,176× rows, ~918 KB) ─┴──────────────────────────────┐
│                                                                             │
│  content[code]                                                              │
│   ├ internalMarket                ──► definitions.internalMarket_set_NN     │
│   │   (absent on 31 anomaly commodities — that absence drives routing)      │
│   ├ combo_complement_id           ──► definitions.combo_template.*          │
│   │                                   (substituted into `{{complement}}`)   │
│   ├ combo_type_options_override?  ──► overrides combo_template.comboType    │
│   │                                   .options (for the 9 D3 outliers)      │
│   ├ line_item_complement              (verbatim, no dedup convention)       │
│   ├ species_description               (free text, per-commodity)            │
│   └ complement_id                     (scalar)                              │
│                                                                             │
│  routing[code]                                                              │
│   └ has_internal_market: boolean                                            │
│         === ('internalMarket' in content[code])    [invariant by build]     │
└─────────────────────────────────────────────────────────────────────────────┘

Cardinality:
   pages           : 6      (Commodity, Purpose, References, Traders, Transport, Consignment)
   components      : ~31    (universal name → definition)
   internalMarket_*: 5      (option-set IDs, ordered by usage count)
   combo_template  : 1      (the four combo component shells)
   content/routing : 2,176  (one per commodity code)
```

The three reader-time reconstructions a consumer has to know about:

1. **internalMarket option set:** read `content[code].internalMarket` → that string is a key in `definitions`. Look it up to get the values array.
2. **Combo components (the four `combo*`):** read `definitions.combo_template[name]` for label + option shell; substitute `content[code].combo_complement_id` into the option's `value` field. For commodity `code` in the outlier set, use `content[code].combo_type_options_override` as the comboType options instead.
3. **routing.has_internal_market:** mirrors `'internalMarket' in content[code]`. Both reflect the same source fact; redundancy is intentional so downstream consumers can use either.

All three reconstructions are encapsulated in `field-config/analysis/config-queries-v2.js`'s public API — downstream consumers should call `queryLabel`/`queryOptions` rather than reach into the JSON directly.

The five shipped stories that produced this:

- **Story 13** (`line_item_complement` verbatim) — removed the implicit "null means use commodity code" convention; every commodity carries the raw value.
- **Story 14** (routing redesign) — replaced `{all_pages_present, exceptions}` (which leaked Part 2 page names into Part 1 outputs) with per-commodity `{has_internal_market: boolean}`.
- **Story 15** (frequency-ordered set IDs) — `internalMarket_set_01` is now the most-used set; `SOURCE_DATE_EPOCH` is honoured for byte-identical builds.
- **Story 16** (combo collapse) — `combo_components` blobs (2.65 MB → 1.06 MB) replaced by `combo_complement_id` scalar + universal `definitions.combo_template`, with a `combo_type_options_override` for the 9 outlier commodities D3 found.
- **Story 17** (staging artifact + verification + audit) — named output, 3-tier post-build verification (internal completeness, variance cross-check, Axis-2 UI mapping), regenerable audit doc.

The story files live in `data-analysis/features/ced-extraction/stories/` (numbered 13–17).

### CHED-PP — Field config nearly empty, journey defers to microservice DB

**Source:** 1 row in `vnet-data.csv` (commodity code `00`, universal plant-health config) **plus** 8 tables exported from the `ipaffs-commoditycode-microservice`.
**Pipeline path:** Round-trip pipeline used as a **baseline** to prove the schema (Stories 02–07), then a separate refdata builder for the runtime data.
**Status:** Round-trip complete for the field config (trivially — it's one row). A separate `build-chedpp-refdata.js` reads the microservice CSV exports (`dbo_inspection_responsibility.csv`, `dbo_hmi_marketing.csv`, `dbo_commodity_eppo_variety.csv`, etc.) and produces `refdata.json` for the obligation engine.

The framing "CHED-PP defers entirely to another database" is essentially correct **if you mean the journey behaviour**. Field config contributes the page skeleton (10 pages, 88 components) but commodity-level variance — which authority inspects, what marketing standards apply, which varieties exist — is all keyed by `(commodity_code, eppo_code)` and lives in the commodity-code microservice. See `features/chedpp-runtime-data-exploration.md` for the table-by-table breakdown.

### CHED-A (CVEDA) — Reference-data-driven, with IMP fossil borrowing

**Source:** 89 rows in `vnet-data.csv`, **but** the real input is `reference-data-table.xlsx` (the Confluence-exported policy spreadsheet, 67 commodities) combined with IMP field configs (the "long-dead" IMP journey from before July 2022).
**Pipeline path:** A **custom assembler**, not the round-trip pipeline. Lives in `data-analysis/reference-data/live-animals/`.
**Status:** Complete. Output is `output/eu-live-animals-config.json` — **24 KB**, the smallest and cleanest journey JSON we've produced.

The CHED-A pipeline is qualitatively different from the others. The modules in `reference-data/live-animals/` tell the story:

- `imp-refdata-reader.js` — read the legacy IMP configs that CHED-A still borrows from (CPH number, permanent address, animal identifiers — the five features inherited from IMP on 1 July 2022).
- `imp-commodity-grouper.js` — group commodities by structural similarity.
- `imp-baseline-extractor.js` — pull the universal baseline.
- `option-set-deduplicator.js` — collapse repeated option sets (the `im_set_01`...`im_set_05` definitions visible in `output/ced-definitions.json` are the same idea applied earlier).
- `config-assembler.js` — produce the final small JSON.
- `config-validator.js` — sanity-check the result.

The resulting file has 67 commodity entries keyed by `commodityCode|species`, each carrying just the few boolean flags that actually vary (`cph_number`, `permanent_address`, `transporter_address`). That's the shape the obligation engine wants.

This is the proof that the small-JSON outcome is achievable **when a domain-aware assembler is written**. The round-trip pipeline alone won't produce it.

### CHED-P (CVEDP) — Not processed

**Source:** 918 rows in `vnet-data.csv`.
**Pipeline path:** Round-trip pipeline used for a **single config only** (Story 09). No mass migration. No variance analysis. No small JSON.
**Status:** Open. We know the schema round-trips for one CVEDP config (it has the variant-array pattern the schema was extended to handle), but we have no picture of how CVEDP's 918 rows actually vary or whether they collapse the same way CHED-D's do.

---

## Part 3 — Did We Shrink Each Dataset to a Small JSON?

This is the table that probably matters most to the team.

| CHED type          | Rows in field config | Strategy attempted                                                                 | Small JSON produced?                                                                                  | Size                 |
| ------------------ | -------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------- |
| **CHED-A** (CVEDA) | 89                   | Confluence Excel + IMP refdata → domain-aware assembler                            | **Yes** (`output/eu-live-animals-config.json`)                                                        | **24 KB**            |
| **CHED-PP**        | 1                    | Round-trip baseline + separate microservice refdata builder                        | **Yes** for the refdata (`refdata.json` via `build-chedpp-refdata.js`); field config is already 1 row | Small (refdata file) |
| **CHED-D** (CED)   | 2,176                | DuckDB extraction + variance analysis + in-place collapse pipeline (Stories 13–17) | **Yes for Part 1** (`output/chedd-products-staging.json`). Part 2 (inspector pages) not yet done.     | **1.06 MB** (Part 1) |
| **CHED-P** (CVEDP) | 918                  | Single round-trip only                                                             | **No**                                                                                                | —                    |

### Direct answer to "did we ever do the CHED-D shrinkage conversion?"

**Yes, for Part 1.** Stories 13–17 collapse the 2,176 Part 1 configs into `output/chedd-products-staging.json` (1.06 MB, deterministic) plus a regenerable audit doc. The compression dividend is concentrated in the universal layer (~11 KB carries the page skeleton + components + 5 internal-market option sets + the combo template) and the routing flags (~93 KB). The remaining 825 KB is the per-commodity content floor — every byte is genuinely per-commodity data with no further dedup possible without losing information.

The 40× size gap vs CHED-A's 24 KB is honest, not a failure: CHED-A's commodities carry ~3 boolean flags each, CHED-D's carry substantive per-commodity facts (species description, line item complement, four complement IDs). The two cert types ended up with different shapes because they have different inputs.

**Part 2 (inspector pages: Acceptance, Checks, Control Authority, Laboratory Tests, Refusal) is not yet compressed.** The build pipeline supports `partFilter: 'two'`, but Part 2 has its own structural quirks (the one config-missing-the-Lab-Tests-page anomaly, the section-aware Acceptance pages) that need a similar five-story pass.

---

## Part 4 — How These Pipelines Feed the Obligation Engine

The obligation engine consumes **journey-shaped JSON**, not raw field config. The mapping looks roughly like this:

- **CHED-A:** `output/eu-live-animals-config.json` (and `features/obligations/cheda-journey-complete.json`, 78 KB) — direct, small, ready.
- **CHED-PP:** Field config skeleton (10 pages) + runtime lookups against the commodity microservice refdata. The obligation engine has to consult both at runtime.
- **CHED-D:** Part 1 has a compact staging artifact at `output/chedd-products-staging.json` (1.06 MB). It still needs a final transformation step into the modern obligation engine's 3-file shape (`journey.json` / `obligations.json` / `refdata.json`) — the staging artifact is the precursor, not the final form. Part 2 (inspector) is not yet compressed.
- **CHED-P:** Not yet feeding the obligation engine in any reduced form.

---

## Open Questions and Next Steps

1. **CHED-D Part 2.** Run the same five-story pattern (verbatim values, routing redesign, frequency-ordered IDs, blob collapse, staging output) over the inspector pages. Anomalies are different (commodity `85167200` is missing the entire Lab Tests page) but the pipeline supports `partFilter: 'two'`.
2. **CHED-D → target shape.** Transform `chedd-products-staging.json` into the modern obligation engine's `refdata.json` + author `journey.json` and `obligations.json`. The mapping doc (`analysis/field-config-to-ui-mapping.md`) is the bridge for `journey.json`.
3. **CHED-P.** Decide whether CVEDP's 918 rows justify the round-trip + variance + assembler pipeline, or whether (like CHED-PP) most variance lives elsewhere and field config is mostly a skeleton. The Story 13–17 pattern transfers directly if the data warrants it.
4. **Why the asymmetry?** CHED-A got a domain-aware assembler because the input (Excel + IMP fossils) demanded one. CHED-D needed five focused stories on top of the existing variance pipeline to reach a similar (if larger) outcome. The lesson is that round-tripping is necessary but not sufficient — a per-cert-type assembler is what produces the obligation-engine-shaped output, and the assembler can be small (Story 17's driver is ~80 lines) when the variance work is already done.

---

## Reference Locations

| What                                | Where                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Round-trip pipeline scripts         | `data-analysis/field-config/scripts/extract-*.js`, `migrate-*.js`, `reconstruct-*.js`, `verify-*.js` |
| Normalised schema                   | `data-analysis/db/migrations/001_schema.sql`                                                         |
| Story sequence and status           | `data-analysis/features/normalisation/stories/README.md`                                             |
| CHED-D variance analysis            | `data-analysis/features/ced-extraction/`                                                             |
| CHED-D staging driver               | `data-analysis/field-config/scripts/build-chedd-products-staging.js`                                 |
| CHED-D staging output               | `data-analysis/output/chedd-products-staging.json` (1.06 MB)                                         |
| CHED-D staging audit                | `data-analysis/output/chedd-products-staging-audit.md` (regenerated each build)                      |
| CHED-D Stories 13–17                | `data-analysis/features/ced-extraction/stories/13-17-*.md`                                           |
| CHED-D verifiers                    | `data-analysis/field-config/analysis/staging/`                                                       |
| CHED-A assembler                    | `data-analysis/reference-data/live-animals/`                                                         |
| CHED-PP refdata builder             | `data-analysis/field-config/scripts/build-chedpp-refdata.js`                                         |
| CHED-PP runtime data context        | `data-analysis/features/chedpp-runtime-data-exploration.md`                                          |
| Source CSV (all cert types)         | `analysis/data/vnet-data.csv`                                                                        |
| CHED-PP runtime CSVs                | `analysis/data/dbo_*.csv`                                                                            |
| Reference-data spreadsheet (CHED-A) | Exported from Confluence as `reference-data-table.xlsx`                                              |
| Obligation engine inputs            | `data-analysis/features/obligations/*.json`                                                          |
