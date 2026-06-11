# Investigation: the real GMS-declaration rule (CHEDPP)

> **Preflight analysis task — not a bug-fix, not an implementation.** The
> correct behaviour is currently unknown; this task establishes it from
> authoritative IPAFFS source and _recommends a course of action_. Any
> code/refdata change is downstream of (and decided by) this analysis.
> Parallel to `chedpp-journey-investigation.md` /
> `chedpp-runtime-data-exploration.md`.

## Goal

Establish, from authoritative IPAFFS source, the exact condition under
which the **GMS declaration** page/obligation applies for a CHEDPP
notification — including the field(s) it depends on and how it aggregates
across multiple species/commodities — and recommend how our resolver and
normalised refdata should encode it.

## Why

Our implementation and our own analysis **disagree by ~92%**:

- **Current implementation.** `build-chedpp-refdata.js` sets
  `has_gms = marketing_standard != null`; `resolvers.js#requiresGmsDeclaration`
  activates `gms-declaration` on `has_gms === true`. That is `true` for
  **all ~5,321** marketing-bearing species (GMS _and_ SMS; HMI _and_
  JOINT). Yet the resolver's own reason string says "(HMI + GMS marketing
  standard)" — the code contradicts its own stated intent.
- **Our exploration claim.** `chedpp-runtime-data-exploration.md` states
  the page "appears when any species on the notification has **HMI
  authority + GMS marketing standard**" — **~409** pairs across 30
  commodity codes.

Until this is resolved we cannot know whether the current broad behaviour
is a bug or deliberate permissiveness, and we must not "fix" it on a
guess. The choice changes which notifications require a GMS declaration —
a real regulatory outcome. Distribution for scale: GMS 5,229 / SMS 92;
HMI 447 / JOINT 4,874 / PHSI 480,505; HMI+GMS ≈ 409.

## Framing: confirm-and-decide, not investigate-from-scratch

`chedpp-runtime-data-exploration.md` already **claims** the rule is "HMI
authority + GMS marketing standard." Treat that as the leading hypothesis.
The job here is to **confirm it against authoritative source and decide
the course of action** — not to redo the data exploration. Start by
auditing what that doc already established and fill only the gap: the
source-code visibility predicate.

**Authority:** the rule the **live IPAFFS service actually applies**
(source code / runtime behaviour), not a policy-document interpretation.

## What we already know (hypotheses to confirm, not conclusions)

- The trigger likely depends on **two** fields — `regulatoryAuthority`
  and `marketingStandard` — supplied per `(commodityCode, eppoCode)` by a
  `supplemental-data` API (microservice TBC — see "Where to look").
- It is likely **notification-level / "any species"** (one qualifying
  species turns the page on), not per-commodity — confirm.
- The exploration doc's "HMI + GMS" is itself an analysis claim, not yet
  traced to the visibility code.
- The predicate may **not** live solely in `ipaffs-frontend-notification`
  — it could sit in the commodity-code microservice or a shared rules
  layer. Don't assume one repo; confirm the source is present and on a
  relevant version before trusting it.

## Where to look (source repos)

| Repo                                                                   | Role here                                                                                   | What to read                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/Users/benoit/projects/defra/imports/ipaffs-frontend-notification`    | **Authority for the visibility predicate.**                                                 | GMS-declaration handler under `service/src/routes/handlers/importer/` (e.g. `gms*`/`goods_movement*`); its entry in `service/src/routes/next_page_routing_tables/routing_table_default.js`; the supplemental-data integration client. See the key-files table in `chedpp-journey-investigation.md`.                                               |
| `/Users/benoit/projects/defra/imports/ipaffs-fieldconfig-microservice` | **Supplemental-data source** — holds `dbo_inspection_responsibility` / `dbo_hmi_marketing`. | The `supplemental-data` endpoint: does it return _raw_ `regulatoryAuthority` + `marketingStandard`, or a _precomputed_ GMS flag? **Resolve the microservice ambiguity:** `build-chedpp-refdata.js` referenced a `commoditycode` microservice, but the CSVs live here — confirm which one actually serves the live `getCommoditySupplementalData`. |
| `/Users/benoit/projects/defra/cdp-fieldconfig-analysis-frontend`       | **Our assumptions only — not the authority.**                                               | `build-chedpp-refdata.js` (our `has_gms = marketing_standard != null` derivation) and the two `chedpp-*` analysis docs. Use to gap-analyse, not to decide.                                                                                                                                                                                        |

## Investigation tasks

1. **Find the GMS-declaration page visibility predicate.** Locate the
   handler / routing-table condition that includes or skips the GMS
   declaration page for CHEDPP. Record the exact boolean: which fields,
   which values, any/all-species semantics. Cite file + lines.
2. **Confirm the supplemental-data contract.** What `getCommoditySupplementalData`
   returns for `regulatoryAuthority` / `marketingStandard`, and how the
   frontend combines them into the visibility decision.
3. **Aggregation semantics.** For multi-species / multi-commodity
   notifications, does _any_ qualifying species trigger the page, or is
   it per-commodity? Map the recommendation onto our **known** single
   commodity-drives-routing simplification (`resolvers.js`
   `facts.commodity` uses `commodities[0]`) — respect/flag it; do **not**
   take on multi-commodity routing here (separately deferred).
4. **Validate the derived predicate two ways:**
   - aggregate: it reproduces a plausible activation rate vs the known
     distribution (HMI+GMS ≈ 409 / ~5,321 marketing pairs);
   - **known-answer:** name 2–3 specific species and state whether the
     real service triggers the page — e.g. apples `0808108090|MABSD`
     (HMI+GMS, expect trigger) and a specific **JOINT+GMS** species
     (expect…?) and an **SMS** species — and check the predicate agrees.

## Deliverables

1. **The documented rule** — the precise predicate + aggregation
   semantics, cited to source files/lines (authoritative, not inferred).
2. **Gap analysis** — current `has_gms` (any marketing standard) vs the
   real rule: which species are wrongly included/excluded, with counts.
3. **Recommended course of action**, chosen from:
   - **(a) Correct the resolver predicate** — derive activation from the
     normalised refdata's `regulatory_authority` + `marketing_standard`
     directly (no stored `has_gms`); specify the exact predicate.
   - **(b) Model an explicit flag** in refdata if the rule needs data not
     derivable from authority+standard.
   - **(c) Accept current behaviour** as intended permissiveness (with the
     evidence that justifies it).
     For whichever is chosen: the **scenario re-pin impact** (which of the
     seven committed scenarios change `(satisfied, inactive)` and why), so
     the downstream change is sized before it starts.

## Relationship to the other stories

- **Independent of Story 03's Phase A (normalisation) — conditionally.**
  Story 03's Phase A preserves current behaviour exactly
  (`has_gms = marketing_standard != null`) and does not wait on this, so
  they can run in parallel **provided** the correct rule is computable
  from fields the normalised `species` table retains
  (`regulatory_authority` + `marketing_standard`). If this investigation
  finds the rule needs data Story 03's Phase A doesn't keep, that is a **feedback
  into the shape** — call it out, don't assume independence.
- **Feeds** the eventual `has_gms` correction (decided here) and the
  read-time derivation in `plants-refdata-model.md`. If the recommendation
  is (a)/(b), a small follow-up change implements it against the already
  normalised refdata and re-pins the affected scenarios.

## Done when (acceptance)

- [ ] The GMS-declaration predicate is documented **cited to specific
      source files + lines** (or, if not code-traceable, the authoritative
      source named and the limitation stated).
- [ ] The gap vs current `has_gms` is quantified (who is wrongly
      included/excluded, with counts).
- [ ] The 2–3 known-answer checks (task 4) are recorded with expected vs
      predicted outcomes.
- [ ] A single recommended course of action (a/b/c) is stated, with the
      **per-scenario re-pin impact** for the seven committed scenarios.
- [ ] Any shape feedback into Story 03's Phase A is explicitly flagged (or "none").
- [ ] Findings recorded in the `## Findings` section below.

## Findings

### 1. The predicate (verbatim, cited)

The page is gated by `requiresGmsConfirmation` in
`/Users/benoit/projects/defra/imports/ipaffs-frontend-notification/service/src/utils/chedpp.js`
**lines 21–28**:

```javascript
const requiresGmsConfirmation = (commodities) => {
  const complementParameterSets = _.get(
    commodities,
    'complementParameterSet',
    []
  )
  return (
    complementParameterSets.filter(
      (complementParameterSet) =>
        _.get(complementParameterSet, 'keyDataPair', []).some(
          (keyDataPair) =>
            keyDataPair.key === REGULATORY_AUTHORITY &&
            keyDataPair.data === regulatoryAuthorities.HMI
        ) &&
        complementParameterSet.keyDataPair.some(
          (keyDataPair) =>
            keyDataPair.key === MARKETING_STANDARD &&
            keyDataPair.data === marketingStandards.GMS
        )
    ).length > 0
  )
}
```

Consumed by `getChedppNextPage` in
`.../service/src/routes/handlers/importer/consignment_details.js:265–269`.

**Rule:** the GMS declaration page is shown iff **any species** on the
notification has BOTH `regulatory_authority === 'HMI'` AND
`marketing_standard === 'GMS'`. Aggregation is `filter(...).length > 0`
— **any-species**, not per-commodity.

This is option **(a)** from the brief. Verified against IPAFFS test
fixtures (`service/test/utils/chedpp_test.js:62–97`): JOINT+GMS,
JOINT+SMS, HMI+SMS, and PHSI all return `false`.

### 2. Microservice contract — raw fields only

Owned by **`ipaffs-commoditycode-microservice`** (a separate repo from
`ipaffs-fieldconfig-microservice`, which only holds the source CSVs).
This resolves the ambiguity in the brief.

Endpoint:
`GET /{certType}/commodity-code/{commodityCode}/supplemental-data?eppoCodes=...`
returning `List<SupplementaryDataDtoV2>` with `regulatoryAuthority`
(`HMI`/`PHSI`/`JOINT`), `marketingStandard` (`GMS`/`SMS`),
`validityPeriod`, `varieties`, `classes`
(`.../resource/CommodityCodeResource.java:121–206`;
`.../dto/SupplementaryDataDtoV2.java:17–29`).

`SupplementaryDataDtoV2Transformer` (`...:12–20`) is a 1:1 builder — no
derived flag. Grep across the service confirms no `gmsRequired` /
`requiresGms` / `hasGms` / `isHmi` boolean is computed server-side.
**The GMS decision is entirely the frontend's; the service ships raw
fields.**

### 3. Gap vs our current behaviour

| Measure                  | current (`has_gms = marketing_standard != null`) | correct (`HMI && GMS`)               |
| ------------------------ | ------------------------------------------------ | ------------------------------------ |
| Activating species-pairs | **5,321** (all GMS + all SMS, all authorities)   | **409** (HMI+GMS only)               |
| Wrongly-activating       | —                                                | 4,912 (all 4,874 JOINT + 38 HMI+SMS) |
| % over-trigger           | —                                                | ~92.3%                               |

The current behaviour is broadly permissive — it activates for every
marketing-bearing species. The correct behaviour fires only on HMI+GMS,
which is ~7.7% of current activations.

### 4. Known-answer results (vs current refdata)

| Species                                   | Refdata authority + standard | Currently fires? | Correct rule fires? | Notes                                                                                                                      |
| ----------------------------------------- | ---------------------------- | ---------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 0808108090 / MABSD (apples)               | **JOINT + SMS**              | yes              | **no**              | `scenarios.js` calls this an "HMI commodity" — the _comment is wrong_ against the committed refdata.                       |
| 07096010 / CPSAN (peppers)                | **JOINT + SMS**              | yes              | **no**              | The `importPeppers` scenario explicitly overrides notification keyDataPair to `JOINT`+`SMS` — consistent with the refdata. |
| PHSI-only species (e.g. 06042090 / RSVSS) | n/a (fallback row)           | no               | no                  | Falls back to commodity-level fallback; no species row.                                                                    |
| (positive HMI+GMS anchor)                 | —                            | —                | —                   | **No HMI+GMS species is exercised by any committed scenario.** Gap to close in the follow-up.                              |

### 5. Scenario re-pin impact (concrete)

| Scenario                 | Commodity (refdata)          | gms-declaration today | gms-declaration after fix | Pin change? |
| ------------------------ | ---------------------------- | --------------------- | ------------------------- | ----------- |
| `import-phsi-ornamental` | 06042090 / RSVSS PHSI        | inactive              | inactive                  | no          |
| `import-apples`          | 0808108090 / MABSD JOINT+SMS | **active**            | **inactive**              | **yes**     |
| `import-peppers`         | 07096010 / CPSAN JOINT+SMS   | **active**            | **inactive**              | **yes**     |
| `import-bulbs`           | 06011010 / HYAOR PHSI        | inactive              | inactive                  | no          |
| `import-seeds`           | 1209999910 / AKTOR PHSI      | inactive              | inactive                  | no          |
| `transit-plants`         | PHSI_ORNAMENTAL PHSI         | inactive              | inactive                  | no          |
| `transhipment-plants`    | PHSI_ORNAMENTAL PHSI         | inactive              | inactive                  | no          |

So the follow-up must re-pin **apples and peppers** (`gms-declaration`
flips active → inactive: `satisfied -1`, `inactive +1` for each), and
add a new **HMI+GMS scenario** so the corrected GMS path is genuinely
covered (none of the seven currently exercise it).

### 6. Recommended course of action — **(a) correct the resolver predicate**

- Replace the read-time derivation in `chedpp-plants/resolvers.js` with
  `gms = species?.regulatory_authority === 'HMI' && species?.marketing_standard === 'GMS'`,
  computed from the **normalised** `species[code|eppo]` table. Both
  fields are retained by Story 03's Phase A → **no shape feedback to Story 03's Phase A**.
- Rename / inline the `has_gms` lookup-routing field; the flag's stored
  meaning was already going away in Story 03's Phase A (derived).
- Re-pin **`import-apples`** and **`import-peppers`** scenarios:
  `gms-declaration` moves from active-satisfied → inactive
  (`satisfied -1`, `inactive +1`).
- **Add a new HMI+GMS scenario** (the GMS path is otherwise untested
  under the corrected rule). Pick a real HMI+GMS species from the
  refdata (409 candidates) or override `regulatory_authority`/
  `marketing_standard` in the notification fixture to `HMI`+`GMS`.
- The `commodities[0]` simplification in `facts.commodity` is preserved
  — the real rule is any-species; we apply the predicate to a single
  commodity. Multi-commodity any-species remains the separately-deferred
  routing concern.

### 7. Shape feedback to Story 03's Phase A

**None.** The predicate is computable from `regulatory_authority` +
`marketing_standard`, both kept in `species`. Independence holds.

### 8. Side-finding worth flagging

The `scenarios.js` comment on `APPLES` ("HMI commodity", line 11
and the docstring on `APPLES`) is **factually wrong against the
committed refdata** (apples MABSD is `JOINT+SMS`). The
`build-chedpp-refdata.js` post-build assertion only checked
`has_gms === true`, which is satisfied by SMS under the buggy
derivation — so the test passed but didn't catch the comment/data
mismatch. Worth correcting the comment as part of the follow-up.

## What this is NOT

- Not a code or refdata change — analysis + a decision only.
- Not a `/bug-fix` — the correct behaviour is undetermined until this
  completes; there is no known-correct assertion to write first.
- Not a re-run of the broader journey investigation — scope is the GMS
  declaration trigger only.
