# Story 02: Derive the CHED-D notification shape from IPAFFS

## Goal

The CHED-D notification ontology — the shape obligations and scenarios are written against — is derived from the canonical IPAFFS schema and recorded as a migration doc that extends the shared shallow shape. After this story an obligations author has an unambiguous path table: which notification path each CED field maps to, with the one open reconciliation (the internal-market field) resolved. This story produces a design artifact, not application code.

## Why

The journey's `obligations.json` and `scenarios.js` speak a _notification_ ontology, distinct from the field-config ontology of the staging artifact. The other two journeys derived their shapes from IPAFFS into `features/notification-shape/01-target-shape.md`; CHED-D follows the same basis (decided: derive from IPAFFS, not invent). Doing this as its own story resolves the single biggest unknown before any obligation is authored, so story 03 can proceed without guesswork.

Rejected during design (recorded so they aren't re-litigated): inventing a fresh CED shape without reconciling to IPAFFS; modelling the combo as four fields (`type/class/family/model`) — the canonical `CommodityComplement` carries a single `complementID`, so combo collapses to one path.

## Context

- The shared shape and its path-translation table: `features/notification-shape/01-target-shape.md`; the two existing migration docs `02-migrate-eu-live-animals.md` and `03-migrate-chedpp-plants.md` are the template for this story's output.
- Canonical source: the IPAFFS notification schema — the `Purpose` representation (`internalMarketPurpose`), `Commodities` (`commodityIntendedFor`, `numberOfPackages`, `totalGrossWeight`, `totalNetWeight`, `countryOfOrigin`, `regionOfOrigin`), `CommodityComplement` (`complementID`, `complementName`, `commodityDescription`), `ComplementParameterSet` (`keyDataPair`), and the `InternalMarketPurpose` enumeration.
- CED field inventory: the "CHED-D (CED)" Part-1 field-config→UI mapping, cross-checked against the staging artifact's varying fields.

## Specification

Write `features/notification-shape/04-migrate-chedd-products.md`, mirroring docs `02`/`03`: a CED path-translation table (IPAFFS canonical field → shallow path), the net-new leaves, and a worked example CED notification.

Confirmed mapping (from the canonical classes):

| CED concept                    | IPAFFS canonical field                                                    | Shallow path                                             |
| ------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| Intended-for / internal market | `Purpose.internalMarketPurpose` **or** `Commodities.commodityIntendedFor` | `purpose.subPurpose` (existing) — RECONCILE              |
| Commodity complement ("combo") | `CommodityComplement.complementID` (+ `complementName`)                   | `commodities[].complementId` (+ `.complementName`) — NEW |
| Product description            | `CommodityComplement.commodityDescription`                                | `commodities[].description` — NEW                        |
| Packages / gross / net         | `Commodities.numberOfPackages` / `totalGrossWeight` / `totalNetWeight`    | `consignment.*` (existing)                               |
| Per-line-item net weight       | `ComplementParameterSet.keyDataPair`                                      | `commodities[].parameters.keyDataPair` (existing)        |
| Origin country / region        | `Commodities.countryOfOrigin` / `regionOfOrigin`                          | `origin.country` / `origin.region` (existing)            |

Resolve the one reconciliation: read the `Purpose` and `Commodities.commodityIntendedFor` definitions (and the `CommodityIntention` type) and the relevant CED validation rules, and diff their value sets against the staging `internalMarket_set_*` options ("Feedingstuff", "Human consumption", "Further process", "Other"). Record the decision: which path the conditional `intended-purpose` obligation targets (`purpose.subPurpose` vs a commodity-level field) and which value vocabulary the scenarios use, with a one-line justification citing the class/validator consulted. Set the notification discriminator `type: "CED"` (the IPAFFS `document_type`).

Two flags to record explicitly in the doc. (1) **Shared-path smell:** `purpose.subPurpose` is the leading target, but `eu-live-animals` already writes IPAFFS `internalMarketPurpose` there with a different value vocabulary — two journeys writing distinct vocabularies to one path is a smell, so the reconciliation may instead choose a commodity-level path; decide and justify either way. No cross-journey code reads `purpose.subPurpose` generically (verified — it appears only in `eu-live-animals`'s own `obligations.json` schemaPath and `scenarios.js`), so the smell is latent, not active; record that finding. (2) **Possible 4th leaf:** CED's `/commodity/details` carries per-line-item `countryOrigin`/`regionOrigin`; if multi-origin consignments are real, `commodities[].origin` becomes a 4th new leaf — otherwise single-origin (`origin.country`/`origin.region`) is the safe default, matching animals/plants.

Net new leaves to the shared shape: `commodities[].complementId`, `commodities[].complementName` (optional), `commodities[].description`. Everything else reuses existing shared paths. No engine change — `engine/path.js#resolvePath` already walks these.

## Tests

None in application code — this story produces a design artifact, not behaviour. The paths it defines are exercised by stories 03 and 04. If a machine-readable example notification is embedded in the doc, it must be a valid instance of the shape the table describes.

## Acceptance Criteria

- [ ] `features/notification-shape/04-migrate-chedd-products.md` exists, mirroring the structure of `02`/`03`.
- [ ] Every CED field from the mapping doc's Part-1 section has a row in the path table.
- [ ] The internal-market reconciliation is resolved, with a one-line justification citing the IPAFFS class/validator consulted.
- [ ] If `purpose.subPurpose` is the chosen path, the doc records that no code reads it generically (the smell is latent).
- [ ] The net-new leaves are listed explicitly and confirmed absent from `01-target-shape.md`.
- [ ] A worked example CED notification is included and is internally consistent with the table.

## Verification

Documentation story — reviewed by reading. Confirm the IPAFFS schema
representations consulted (`Purpose`, `Commodities`, `CommodityComplement`,
`ComplementParameterSet`, `InternalMarketPurpose`) are each recorded in the
path table with the field they contribute.

## What NOT to change

`01-target-shape.md` and the existing migration docs `02`/`03` — this story adds `04`, it does not edit the others. No application code, no `obligations.json`, no `refdata.json`. The internal-market reconciliation is resolved here, not carried into story 03 as an open question.
