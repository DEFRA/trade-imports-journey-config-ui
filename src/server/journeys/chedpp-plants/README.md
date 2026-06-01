# CHEDPP (plants) journey

The journey adapter for IPAFFS CHEDPP (Common Health Entry Document —
Plants & Plant Products). Files in this directory:

- `obligations.json` — the obligation set.
- `resolvers.js` — fact extractors + condition tests; reads `refdata`.
- `journey.json` — screens / sections / field map.
- `refdata.json` — per-commodity and per-species reference data.
- `scenarios.js` / `scenarios.test.js` — committed scenarios + regression net.

The engine is journey-agnostic; this adapter encapsulates everything
plant-specific.

---

## Key concepts (the part that catches people out)

**`regulatoryAuthority`** — which inspectorate is responsible for a
`(commodity, species)` pair.

- **PHSI** — Plant Health & Seed Inspectorate. Phytosanitary only (pests
  / diseases). No marketing angle.
- **HMI** — Horticultural Marketing Inspectorate. Checks marketing-rules
  compliance (labelling, quality, presentation).
- **JOINT** — Both PHSI and HMI inspect.

**`marketingStandard`** — which set of marketing rules applies
(meaningful only where HMI is involved).

- **GMS** — General Marketing Standards. The baseline covering most
  produce.
- **SMS** — Specific Marketing Standards. Product-specific, tighter
  rules for certain commodities (apples, pears, citrus, etc.).
- *absent* — no marketing standard applies (always the case for
  PHSI-only species).

The **GMS declaration** page is where the importer attests:
*"this consignment complies with the General Marketing Standards."*
IPAFFS asks for it only when the rules apply (HMI authority) **and**
the General set is the one that applies (GMS, not SMS).

## Variance and outcome

Counts are production species-pair counts (each row = a distinct
`(commodity_code, eppo_code)` combination).

| Authority | Marketing standard | Production pairs | GMS page fires? | Notes |
|---|---|---|---|---|
| PHSI | — (absent) | ~480,505 | no | Phyto-only baseline. No marketing process. |
| HMI | GMS | **409** | **yes** | **The only combination that fires the GMS page.** |
| HMI | SMS | 38 | no | HMI inspects, but the *Specific* rules apply — handled outside the GMS declaration. |
| JOINT | GMS | 4,820 | no | Both authorities inspect, but the GMS page is gated strictly on `HMI`, not `JOINT`. JOINT cases route through the JOINT custom-doc-code flow instead. |
| JOINT | SMS | 54 | no | Same JOINT routing; Specific standard not via GMS declaration. |

**Totals.** Marketing-bearing pairs: 5,321 (HMI 447 + JOINT 4,874).
PHSI baseline: ~480,505. Only **409** species-pairs (~30 commodity
codes) actually trigger the GMS declaration page.

## The non-obvious bit

It is tempting to read "HMI is involved" as "HMI **or** JOINT," since
JOINT *includes* HMI inspection. The verified IPAFFS predicate is
**strict-equal `HMI`**, not "any HMI involvement." JOINT cases — even
JOINT+GMS — route through a different document-code path
(`HMI`/`JOINT`/`EU` CHEDPP custom-doc codes in
`ipaffs-frontend-notification/service/src/utils/chedpp.js`), not the
GMS declaration page.

## Current implementation vs the correct rule

The current adapter derives `has_gms = marketing_standard != null`,
which fires for **all 5,321** marketing-bearing species — every row of
the table above except PHSI. The correct predicate fires for **409**
(HMI+GMS only) — a ~92 % over-trigger, almost entirely the JOINT
majority.

The correction is deliberately out of scope for the data-normalisation
work. See:

- `features/journey-switching/gms-declaration-rule-investigation.md` —
  the verified IPAFFS rule (citations) + gap analysis + recommended
  course of action + the scenario re-pin impact.
- `features/journey-switching/03-gms-correction-and-scenario-coverage.md` —
  Story 03; Phase A normalises the refdata behaviour-preservingly
  (retains `regulatory_authority` + `marketing_standard` for downstream
  derivation), Phase B applies the corrected predicate and broadens the
  scenarios.
- `features/journey-switching/plants-refdata-model.md` — the data
  model these definitions live in.

## Scrutinising the scenarios

There are seven committed scenarios in `scenarios.js`
(`scenarioMap`): five PHSI fallback paths and two `JOINT+SMS`
(`import-apples`, `import-peppers`). **None** currently exercises an
`HMI+GMS` species, so the genuine positive-GMS path is not yet covered
— closing that gap is part of the follow-up.

Programmatic scrutiny today:

```bash
TZ=UTC npx vitest run src/server/journeys/chedpp-plants/scenarios.test.js
```

Visual scrutiny in the explorer requires
`features/journey-switching/01-env-selected-journey.md` to land first
(the explorer is presently hardcoded to `eu-live-animals`); after that,
`JOURNEY=chedpp-plants npm run dev` exposes these scenarios under
`/explorer`, `/explorer/tasklist`, `/explorer/debug`.
