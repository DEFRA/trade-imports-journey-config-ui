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
- _absent_ — no marketing standard applies (always the case for
  PHSI-only species).

The **GMS declaration** page is where the importer attests:
_"this consignment complies with the General Marketing Standards."_
IPAFFS asks for it only when the rules apply (HMI authority) **and**
the General set is the one that applies (GMS, not SMS).

## Variance and outcome

Counts are production species-pair counts (each row = a distinct
`(commodity_code, eppo_code)` combination).

| Authority | Marketing standard | Production pairs | GMS page fires? | Notes                                                                                                                                                 |
| --------- | ------------------ | ---------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| PHSI      | — (absent)         | ~480,505         | no              | Phyto-only baseline. No marketing process.                                                                                                            |
| HMI       | GMS                | **409**          | **yes**         | **The only combination that fires the GMS page.**                                                                                                     |
| HMI       | SMS                | 38               | no              | HMI inspects, but the _Specific_ rules apply — handled outside the GMS declaration.                                                                   |
| JOINT     | GMS                | 4,820            | no              | Both authorities inspect, but the GMS page is gated strictly on `HMI`, not `JOINT`. JOINT cases route through the JOINT custom-doc-code flow instead. |
| JOINT     | SMS                | 54               | no              | Same JOINT routing; Specific standard not via GMS declaration.                                                                                        |

**Totals.** Marketing-bearing pairs: 5,321 (HMI 447 + JOINT 4,874).
PHSI baseline: ~480,505. Only **409** species-pairs (~30 commodity
codes) actually trigger the GMS declaration page.

## The non-obvious bit

It is tempting to read "HMI is involved" as "HMI **or** JOINT," since
JOINT _includes_ HMI inspection. The verified IPAFFS predicate is
**strict-equal `HMI`**, not "any HMI involvement." JOINT cases — even
JOINT+GMS — route through a different document-code path
(`HMI`/`JOINT`/`EU` CHEDPP custom-doc codes in
`ipaffs-frontend-notification/service/src/utils/chedpp.js`), not the
GMS declaration page.

## Implementation history

Pre-Story-03 the adapter's GMS-declaration predicate was the
over-permissive `marketing_standard != null` derivation, which fired
for **all 5,321** marketing-bearing species — every row of the table
above except PHSI. Story 03 Phase B replaced it with the verified
predicate `regulatory_authority === 'HMI' && marketing_standard ===
'GMS'`, which fires for the **409** HMI+GMS pairs only (a ~92 %
correction, almost entirely removing the JOINT majority). The flag is
no longer stored — `requiresGmsDeclaration` reads the species record
directly.

See:

- `features/journey-switching/gms-declaration-rule-investigation.md` —
  the verified IPAFFS rule (citations) + gap analysis + scenario re-pin
  impact.
- `features/journey-switching/03-gms-correction-and-scenario-coverage.md` —
  Story 03. Phase A normalised the refdata to its two-grain shape
  behaviour-preservingly; Phase B applied the predicate correction and
  added the three missing variance scenarios.
- `features/journey-switching/plants-refdata-model.md` — the data model
  these definitions live in.

## Scrutinising the scenarios

There are ten committed scenarios in `scenarios.js` (`scenarioMap`):
five PHSI fallback paths (`import-phsi-ornamental`, `import-bulbs`,
`import-seeds`, `transit-plants`, `transhipment-plants`), two
`JOINT+SMS` (`import-apples`, `import-peppers`), and three exercising
the remaining variance cells (`import-hmi-gms` — the only one that
fires GMS declaration, `import-hmi-sms`, `import-joint-gms`). Together
they cover every cell of the authority × standard table above.

Programmatic scrutiny today:

```bash
TZ=UTC npx vitest run src/server/journeys/chedpp-plants/scenarios.test.js
```

Visual scrutiny in the explorer: from any explorer page (`/explorer`,
`/explorer/tasklist`, `/explorer/debug`, `/explorer/commodity-config`)
use the **journey picker** in the nav to switch to `chedpp-plants` —
the scenario dropdown reloads with the plant scenarios. The picker
writes the journey into the session and zeros the current
notification, so animals state can't bleed across the switch.

`JOURNEY=chedpp-plants npm run dev` remains the boot default (and the
CI / unattended source of truth); it makes plants the journey for any
request that doesn't already carry a session value.
