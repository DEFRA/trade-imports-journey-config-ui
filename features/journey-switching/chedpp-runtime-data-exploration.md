# CHEDPP Runtime Data Exploration Plan

**Context:** The CHEDPP journey investigation revealed that commodity-level variance is overwhelmingly runtime-driven, fetched from the `ipaffs-commoditycode-microservice` per `(commodityCode, eppoCode)` pair. This document plans how to explore that data to understand its structure and magnitude.

**Goal:** Answer three questions:

1. What is the **shape** of the runtime data? (What fields, what cardinalities, what relationships?)
2. What is the **magnitude**? (How many commodity codes, EPPO codes, combinations, varieties?)
3. What does it **drive** in the journey? (Which journey branches depend on which data dimensions?)

---

## What We Already Know

### The Data Model (from microservice codebase)

The commodity-code service has **8 core tables** relevant to CHEDPP:

| Table                       | Key                                            | Rows (test data) | Purpose                                                                   |
| --------------------------- | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------- |
| `inspection_responsibility` | `(commodity_code, eppo_code)`                  | 58               | Maps each commodity+species to PHSI/HMI/JOINT                             |
| `hmi_marketing`             | `(commodity_code, eppo_code, variety)`         | 67               | Marketing standard (GMS/SMS) + validity period per variety                |
| `commodity_eppo_variety`    | `(commodity_code, eppo_code, variety)`         | 450              | Which varieties exist for each commodity+species                          |
| `commodity_class`           | `(commodity_code, class)`                      | 82               | Quality classes (Extra Class, Class I, Class II) per commodity            |
| `commodity_configuration`   | `(commodity_code, type)`                       | 172              | Boolean flags: `requiresTestAndTrial`, `requiresFinishedOrPropagated`     |
| `commodity_group_commodity` | `(commodity_code, group_code)`                 | 468              | Maps commodities to groups (Vegetables, Fruit, Plants for Planting, etc.) |
| `commodity_attributes`      | `(commodity_code)`                             | 6                | Propagation type (bulb/plant) — very sparse                               |
| `article_72_commodities`    | `(commodity_code, eppo_code, commodity_group)` | 2,101            | Low-risk Article 72 lookup                                                |

Plus reference tables: `species` (1,008 rows), `commodity_nomenclature` (27,089 rows).

### The API Surface

Five APIs serve CHEDPP-relevant data to the notification frontend:

| API                                                   | Frontend call                     | Returns                                                                                  |
| ----------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /.../supplemental-data?speciesName=X`            | `getCommoditySupplementalData`    | `regulatoryAuthority`, `marketingStandard`, `validityPeriod`, `varieties[]`, `classes[]` |
| `GET /chedpp/commodity-configuration?commodityCodes=` | `getChedppCommodityConfiguration` | `requiresTestAndTrial`, `requiresFinishedOrPropagated` per commodity                     |
| `GET /chedpp/commodity-attributes?commodityCodes=`    | `getChedppCommodityAttributes`    | `propagation` (bulb/plant) per commodity                                                 |
| `GET /groups?commodityCodes=`                         | `getCommodityGroups`              | Group names per commodity                                                                |
| `POST /article-72`                                    | `getArticle72CommodityData`       | `isLowRiskArticle72` boolean                                                             |

### What Each Dimension Drives

| Dimension                              | Journey effect                                                            |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `regulatoryAuthority` (PHSI/HMI/JOINT) | Custom document code; GMS declaration visibility; validity period default |
| `marketingStandard` (GMS/SMS)          | GMS declaration page appears if any species has HMI + GMS                 |
| `validityPeriod`                       | Certificate validity calculation                                          |
| `varieties[]` + `classes[]`            | If both non-empty → variety/class selection page shown                    |
| `commodityGroups`                      | Gates propagation attribute lookup; populates package-type dropdown       |
| `requiresFinishedOrPropagated`         | Finished/propagating dropdown on bulk-details                             |
| `requiresTestAndTrial`                 | Test-and-trial field on bulk-details                                      |
| `propagation`                          | Routes to intended-use-bulbs/plants pages                                 |
| `lowRiskArticle72`                     | Affects BCP filtering and transport routing                               |

---

## Data Availability

A critical distinction: some data is **fully available in the repo**, and some is only represented by test fixtures.

### Fully available (data-upload files = production-ready datasets)

| Dataset                   | File                                                                         | Rows  | Complete?               |
| ------------------------- | ---------------------------------------------------------------------------- | ----- | ----------------------- |
| commodity_configuration   | `data-upload/commodity_configuration/commodity_configuration-IMTA-12483.dat` | 171   | Yes — bulk-loaded to DB |
| commodity_group_commodity | `data-upload/commodity_group/commodity_group_commodity-IMTA-9254.tab`        | 526   | Yes — bulk-loaded to DB |
| commodity_group           | `data-upload/commodity_group/commodity_group-IMTA-9254.tab`                  | 11    | Yes — 11 groups total   |
| article_72_commodities    | `data-upload/article_72_commodities/article_72_commodities-IMTA-14490.tab`   | 2,101 | Yes — bulk-loaded to DB |

### Test fixtures only (representative subset, not production)

| Dataset                   | File                                     | Rows  | What's missing                                 |
| ------------------------- | ---------------------------------------- | ----- | ---------------------------------------------- |
| inspection_responsibility | `test/.../inspection_responsibility.csv` | 58    | Only 3 commodity codes covered                 |
| hmi_marketing             | `test/.../hmi_marketing.csv`             | 67    | Only 3 commodity codes covered                 |
| commodity_eppo_variety    | `test/.../commodity_eppo_variety.csv`    | 450   | Only 31 commodity codes covered                |
| commodity_class           | `test/.../commodity_class.csv`           | 82    | Only ~30 commodity codes                       |
| commodity_attributes      | `test/.../commodity_attributes.csv`      | 6     | Only 6 entries — may be near-complete          |
| species                   | `test/.../species.csv`                   | 1,008 | Probably near-complete (EPPO codes are finite) |

**The gap:** The three tables that define CHEDPP's dominant runtime variance (`inspection_responsibility`, `hmi_marketing`, `commodity_eppo_variety`) are only available as test fixtures covering ~3 commodity codes. Production data is managed by an external sync process and isn't in this repo.

---

## Exploration Plan

### Phase 1: Load and Analyse What We Have

**Goal:** Enumerate the full CHEDPP commodity universe and characterise the static dimensions.

**What to load into DuckDB:**

1. `commodity_group_commodity` (526 rows) — the closest thing to a "list of all CHEDPP commodity codes"
2. `commodity_configuration` (171 rows) — test-and-trial / finished-or-propagated flags
3. `commodity_group` (11 rows) — group name lookup
4. `article_72_commodities` (2,101 rows) — Article 72 membership
5. `commodity_attributes` (6 rows) — propagation types

**Key queries:**

```sql
-- Q1: How many CHEDPP commodity codes and their group distribution?
SELECT cg.description as commodity_group, COUNT(*) as commodity_count
FROM commodity_group_commodity cgc
JOIN commodity_group cg ON cgc.commodity_group_code = cg.code
GROUP BY cg.description
ORDER BY commodity_count DESC;

-- Q2: Which commodity codes have configuration flags?
SELECT cc.commodity_code, cc.requires_test_and_trial, cc.requires_finished_or_propagated,
       cgc.name as group_assignment
FROM commodity_configuration cc
LEFT JOIN commodity_group_commodity cgc ON cc.commodity_code = cgc.traces_commodity_code
WHERE cc.type = 'CHED-PP';

-- Q3: Overlap between test-and-trial and finished-or-propagated
SELECT requires_test_and_trial, requires_finished_or_propagated, COUNT(*)
FROM commodity_configuration WHERE type = 'CHED-PP'
GROUP BY requires_test_and_trial, requires_finished_or_propagated;

-- Q4: Which commodity groups trigger the intended-use sub-journey?
-- (Plants for Planting and Seed & Tissue Culture are the gates)
SELECT ca.traces_commodity_code, ca.propagation, cgc.name
FROM commodity_attributes ca
JOIN commodity_group_commodity cgc ON ca.traces_commodity_code = cgc.traces_commodity_code;

-- Q5: Article 72 — distribution by commodity group
SELECT a72.commodity_group, COUNT(DISTINCT a72.commodity_code) as commodity_codes,
       COUNT(DISTINCT a72.eppo_code) as eppo_codes, COUNT(*) as total_entries
FROM article_72_commodities a72
GROUP BY a72.commodity_group
ORDER BY total_entries DESC;
```

**Expected output:** A complete picture of CHEDPP's static dimensions — commodity codes × groups × flags × Article 72 membership. This is the part that CAN go in a static config.

### Phase 2: Characterise the Supplemental Data Shape

**Goal:** Understand the structure and cardinality of the runtime supplemental data using the test fixtures.

**What to load:**

6. `inspection_responsibility` (58 rows)
7. `hmi_marketing` (67 rows)
8. `commodity_eppo_variety` (450 rows)
9. `commodity_class` (82 rows)

**Key queries:**

```sql
-- Q6: Shape of supplemental data per (commodity, eppo)
SELECT ir.traces_commodity_code, ir.eppo_code,
       ir.inspection_responsibility as reg_authority,
       hm.hmi_marketing_standard as mkt_standard,
       hm.certificate_validity_period as validity,
       COUNT(DISTINCT cev.variety) as variety_count
FROM inspection_responsibility ir
LEFT JOIN hmi_marketing hm
  ON ir.traces_commodity_code = hm.traces_commodity_code
  AND ir.eppo_code = hm.eppo_code
LEFT JOIN commodity_eppo_variety cev
  ON ir.traces_commodity_code = cev.traces_commodity_code
  AND ir.eppo_code = cev.eppo_code
GROUP BY ir.traces_commodity_code, ir.eppo_code,
         ir.inspection_responsibility, hm.hmi_marketing_standard,
         hm.certificate_validity_period
ORDER BY variety_count DESC;

-- Q7: Which (commodity, eppo) pairs have varieties? (triggers variety page)
SELECT traces_commodity_code, eppo_code, COUNT(*) as varieties
FROM commodity_eppo_variety
GROUP BY traces_commodity_code, eppo_code
ORDER BY varieties DESC;

-- Q8: Which (commodity, eppo) pairs have BOTH varieties AND classes? (triggers variety selection)
SELECT cev.traces_commodity_code, cev.eppo_code,
       COUNT(DISTINCT cev.variety) as varieties,
       COUNT(DISTINCT cc.class) as classes
FROM commodity_eppo_variety cev
JOIN commodity_class cc ON cev.traces_commodity_code = cc.traces_commodity_code
GROUP BY cev.traces_commodity_code, cev.eppo_code
HAVING varieties > 0 AND classes > 0;

-- Q9: Regulatory authority distribution
SELECT inspection_responsibility, COUNT(*) as entries,
       COUNT(DISTINCT traces_commodity_code) as commodities,
       COUNT(DISTINCT eppo_code) as species
FROM inspection_responsibility
GROUP BY inspection_responsibility;

-- Q10: How many species per commodity code?
SELECT traces_commodity_code, COUNT(DISTINCT eppo_code) as species_count
FROM inspection_responsibility
GROUP BY traces_commodity_code
ORDER BY species_count DESC;
```

**What this tells us:**

- The **cardinality pattern**: Does each commodity have 5 species or 500? The test data shows one commodity (`0808108090`, apples) with 55 species — so potentially large.
- The **variety depth**: The test data shows 60+ apple varieties for a single species (MABSD). If this pattern holds, the total variety space is in the thousands.
- The **regulatory authority distribution**: Test data shows PHSI dominates (56/58), with JOINT (2) and HMI (1) as minority cases. If this holds across all commodities, the GMS declaration page is triggered rarely.
- The **sparsity of the join**: Not every (commodity, eppo) has marketing standards or varieties. Some species have inspection responsibility only.

### Phase 3: Scale Estimation and Decision

After Phases 1-2, synthesise the findings:

| Question                                                  | Data source               | Expected answer |
| --------------------------------------------------------- | ------------------------- | --------------- |
| Total CHEDPP commodity codes                              | Phase 1, Q1               | ~500-600        |
| Codes with test-and-trial or finished-or-propagated flags | Phase 1, Q2               | ~172            |
| Codes in "Plants for Planting" or "Seed & Tissue Culture" | Phase 1, Q1               | ~91 (41 + 50)   |
| Estimated (commodity, eppo) pairs in production           | Phase 2, Q10 extrapolated | Thousands       |
| Estimated total varieties                                 | Phase 2, Q7 extrapolated  | Thousands       |
| Percentage of species with HMI regulatory authority       | Phase 2, Q9               | Small (~2%?)    |

**Decision point:** Based on these numbers, choose between:

1. **Partial static config** — Feasible for the 4 commodity-code-keyed dimensions. Quick to produce.
2. **Production data snapshot** — Needed if we want supplemental data coverage. Requires DB export.
3. **Accept runtime-only for supplemental data** — Model it as predicates in the journey config, not as enumerated data.

---

---

## Findings (Phases 1-2 Complete)

Phases 1 and 2 have been run against the data available in the repo. Results below.

### The CHEDPP Commodity Universe

**482 distinct commodity codes** across 11 groups (some codes appear in multiple groups, yielding 526 group assignments):

| Group                       | Commodity codes |
| --------------------------- | --------------- |
| Vegetables                  | 105             |
| Seed & Tissue Culture       | 99              |
| Fruit and nuts              | 96              |
| Wood and articles of wood   | 82              |
| Plants for Planting         | 65              |
| Machinery and vehicles      | 26              |
| Other vegetable products    | 21              |
| Grain                       | 17              |
| Cut Flowers and flower buds | 10              |
| Foliage                     | 3               |
| Other                       | 2               |

### Configuration Flags (Complete — 172 Codes)

Two mutually exclusive flag patterns:

| Pattern                                                           | Count | Effect                                        |
| ----------------------------------------------------------------- | ----- | --------------------------------------------- |
| `requiresTestAndTrial=true`, `requiresFinishedOrPropagated=false` | 110   | Test-and-trial field shown on bulk-details    |
| `requiresTestAndTrial=false`, `requiresFinishedOrPropagated=true` | 62    | Finished/propagating dropdown on bulk-details |

No commodity code has both flags. 310 commodity codes (482 - 172) have neither — they skip both fields entirely.

### Propagation Attributes (Tiny — 6 Codes)

Only 6 commodity codes have explicit propagation types (all in "Plants for Planting"):

| Code                                       | Propagation |
| ------------------------------------------ | ----------- |
| 06011010, 06011020                         | bulb        |
| 06012010, 0601209010, 06024000, 0602300010 | plant       |

The intended-use-bulbs and intended-use-plants pages are triggered by a very small subset of commodities.

### Article 72 Scale — The Biggest Dataset

**2,102 entries** across 85 commodity codes and 1,528 distinct EPPO codes:

| Group          | Commodities | EPPO codes | Entries |
| -------------- | ----------- | ---------- | ------- |
| Fruit and nuts | 38          | 956        | 1,286   |
| Vegetables     | 47          | 577        | 816     |

Species per commodity ranges dramatically: one commodity (`0810907590`) has **539 species**, while the average is **24.7**. The top commodity has a species-to-commodity ratio 22× the average.

### Supplemental Data Structure (from test fixtures)

**Critical finding: The supplemental data is extremely sparse.**

From the test fixture covering 3 commodity codes and 58 (commodity, species) pairs:

| What                                 | Count | Percentage |
| ------------------------------------ | ----- | ---------- |
| Total (commodity, species) pairs     | 58    | 100%       |
| PHSI regulatory authority            | 55    | 95%        |
| HMI or JOINT (GMS-relevant)          | 3     | 5%         |
| Species with marketing standard data | 3     | 5%         |
| Species with variety data            | ~7    | ~12%       |

**95% of species are PHSI-only.** For these, the supplemental data response is just `{ regulatoryAuthority: "PHSI" }` — no marketing standard, no validity period, no varieties, no classes. The complex sub-journeys (GMS declaration, variety selection) only trigger for the small minority with HMI or JOINT authority.

Variety counts where they exist are substantial: 66 varieties for one apple species (MABSD), 41 varieties for oranges (CIDSI). So the variety page, when triggered, is a real selection task, not a formality.

### Scale Extrapolation

| Dimension                        | Known        | Estimated production | Confidence                            |
| -------------------------------- | ------------ | -------------------- | ------------------------------------- |
| Total CHEDPP commodity codes     | 482          | **~500**             | High (production upload data)         |
| Total (commodity, species) pairs | 58 (test)    | **~12,000**          | Medium (482 codes × avg 25 species)   |
| Pairs triggering GMS/variety     | 3 of 58 (5%) | **~600**             | Low (sample is small)                 |
| Total varieties                  | 450 (test)   | **~5,000-10,000**    | Low (depends on HMI/JOINT prevalence) |
| Config flag coverage             | 172 of 482   | **172 (exact)**      | High (production upload data)         |

### What This Means for plants-config.json

Three tiers of data clarity:

**Tier 1 — Fully enumerable now (no API needed):**

- 482 commodity codes with group assignments
- 172 commodity codes with test-and-trial / finished-or-propagated flags
- 6 commodity codes with propagation attributes
- 2,102 Article 72 (commodity, eppo, group) entries

**Tier 2 — Enumerable with production DB export:**

- inspection_responsibility: Full (commodity, eppo) → regulatory authority mapping
- hmi_marketing: (commodity, eppo, variety) → marketing standard + validity period
- commodity_eppo_variety: (commodity, eppo) → variety list
- commodity_class: commodity → quality class list

**Tier 3 — Only knowable at runtime:**

- Nothing, actually. All the data is in the database. The question is whether we can get a snapshot.

**Revised assessment:** The findings doc said "runtime-only by design" for supplemental data. But having seen the database schema, this data IS static — it's loaded via bulk upload and sync processes. It just isn't available in a flat file in this repo. If we can get a CSV export of the three supplemental data tables from any environment, we can enumerate the complete CHEDPP variance surface.

---

## Recommended Next Step

**Get a CSV export of three tables from any non-production environment:**

1. `inspection_responsibility` — Full (commodity_code, eppo_code, authority) mapping
2. `hmi_marketing` — Full (commodity_code, eppo_code, variety, marketing_standard, validity) mapping
3. `commodity_eppo_variety` — Full (commodity_code, eppo_code, variety) mapping

With these three tables plus what we already have, the entire CHEDPP variance surface is enumerable. We can then produce a complete `plants-config.json` equivalent that covers ALL dimensions — not just the "partial static" version the findings doc described.

The data is static. It just happens to be served by an API rather than a flat file. Getting a snapshot makes it flat.

---

## Production Data Analysis (2026-04-20)

Production CSV exports were obtained for all three tables. Results below.

### Raw Scale

| Table                       | Rows    | Distinct commodity codes | Distinct EPPO codes |
| --------------------------- | ------- | ------------------------ | ------------------- |
| `inspection_responsibility` | 485,826 | 389                      | 42,990              |
| `hmi_marketing`             | 5,783   | 152                      | 3,317               |
| `commodity_eppo_variety`    | 548     | 37                       | 56                  |

The inspection_responsibility table is far larger than expected — **486K rows**. This is because a small number of "Plants for Planting" commodity codes each have tens of thousands of species mapped. One commodity code (`06029050`) maps to **41,971 species**.

### The Distribution is Extremely Skewed

Species per commodity code:

- **min=1, median=7, p75=27, p95=9,333, max=41,971, avg=1,249**

The top 10 commodity codes (all "Plants for Planting" or "Foliage") account for the vast majority of rows. The median commodity has just 7 species.

### Regulatory Authority: 98.9% PHSI

| Authority | (commodity, eppo) pairs | % of total | Commodity codes | EPPO codes |
| --------- | ----------------------- | ---------- | --------------- | ---------- |
| PHSI      | 480,505                 | 98.9%      | 238             | 42,990     |
| JOINT     | 4,874                   | 1.0%       | 105             | 3,127      |
| HMI       | 447                     | 0.1%       | 48              | 368        |

**237 commodities are PHSI-only** (no GMS/marketing implications at all). Only **2 commodities** have mixed authorities (different species mapped to different authorities).

### Authority by Commodity Group

| Group                 | PHSI only | HMI only | JOINT only | Mixed |
| --------------------- | --------- | -------- | ---------- | ----- |
| Plants for Planting   | 36        | 3        | 15         | —     |
| Seed & Tissue Culture | 79        | 1        | 7          | —     |
| Vegetables            | 36        | 11       | 43         | 1     |
| Fruit and nuts        | 16        | 26       | 40         | 1     |
| Cut Flowers           | 10        | —        | —          | —     |
| Foliage               | 3         | —        | —          | —     |
| Grain                 | 14        | —        | —          | —     |
| Wood                  | —         | —        | —          | —     |
| Machinery             | 26        | —        | —          | —     |

Key pattern: **Fruit and Vegetables** are where HMI/JOINT authority concentrates. Plants for Planting, Seed, Cut Flowers, Foliage, Grain, Wood, Machinery are overwhelmingly or exclusively PHSI.

### HMI Marketing: Sparse but Well-Structured

5,783 rows covering 5,321 distinct (commodity, eppo) pairs. Marketing standard distribution:

| Standard | Pairs         |
| -------- | ------------- |
| GMS      | 5,229 (98.3%) |
| SMS      | 92 (1.7%)     |

Validity period: **2 months** dominates (5,158 of 5,321 pairs = 97%).

**Only 1.1%** of all inspection_responsibility pairs have marketing data. It's exclusively the JOINT and HMI species — all 5,321 pairs with marketing data correspond to JOINT (4,874) or HMI (447) authority.

### GMS Declaration Trigger

The GMS declaration page appears when any species on the notification has HMI authority + GMS marketing standard:

- **409 (commodity, eppo) pairs** would trigger it
- Across **30 distinct commodity codes**

This is a tiny fraction of the total surface — 0.08% of all pairs.

### Varieties: Very Sparse

Only **548 rows** across 86 (commodity, eppo) pairs and 37 commodity codes. 209 distinct variety names. The variety/class selection page is triggered for a very small subset of fruit commodities (apples, oranges, pears).

### Coverage Gap

- 389 commodity codes appear in inspection_responsibility
- 482 commodity codes appear in commodity_group_commodity
- 39 commodity codes are in ir but NOT in commodity_group (may be newer additions)
- 132 commodity codes are in commodity_group but NOT in ir (Wood, Machinery, some Grain — these likely don't have phytosanitary species mappings)

### Revised Feasibility Assessment

The production data changes the picture significantly from what we estimated:

| Dimension                 | Test estimate | Production reality     |
| ------------------------- | ------------- | ---------------------- |
| (commodity, eppo) pairs   | ~12,000       | **485,826**            |
| PHSI-only pairs           | 95%           | **98.9%**              |
| Pairs with marketing data | 5%            | **1.1%**               |
| Pairs with variety data   | small         | **0.02%** (86 of 486K) |
| GMS-triggerable pairs     | —             | **409** (0.08%)        |

**A static config IS feasible, but the representation must handle the skew.** You can't put 486K rows in a flat file and call it a config — but you can represent the structure as:

1. **Commodity-level attributes** (482 codes): group, requiresTestAndTrial, requiresFinishedOrPropagated, propagation. This is the static layer that covers ~4 page-visibility decisions.

2. **Authority profile per commodity** (389 codes): PHSI-only / HMI-only / JOINT-only / Mixed. This tells you whether ANY species under that commodity could trigger GMS or have marketing implications — without enumerating every species.

3. **The HMI/JOINT detail** (5,321 pairs across 152 commodities): The actual (commodity, eppo) → authority + marketing standard + validity mapping. This is small enough to be a flat lookup.

4. **Variety data** (548 rows across 37 commodities): Tiny. Include verbatim.

The 480K PHSI-only rows add no information beyond "this species exists under this commodity and is PHSI". They drive species search/count but not page visibility or data variance.
