# CHED-D (chedd-products) notification shape

> **Status:** Derivation, not migration. Unlike `02`/`03` (which rewrote an _existing_ journey's `obligations.json` from the old IPAFFS `notification.partOne.*` paths to the shape in `01-target-shape.md`), CHED-D is a **new** journey with no prior obligations. This document is the **source-of-truth path table** that story `features/chedd-config/03-journey-live.md` authors `chedd-products/obligations.json`, `resolvers.js`, and `scenarios.js` from. Derived from the canonical IPAFFS schema (`imports/ipaffs-imports-notification-schema/notification-schema-java`) and the CHED-D Part-1 field-config→UI mapping (`cdp-fieldconfig-analysis-frontend/analysis/field-config-to-ui-mapping.md`).

## What CHED-D is

CHED-D (CED) is food and feed of **non-animal origin**. Its notification reuses the shared transport/party/document boilerplate but carries **none** of the animal concerns — no `documents.veterinary`, no `commodities[].species` taxonomy or `identifiers`, no `parties.transporter`, no `consignment.cph` / `animalsCertifiedAs`. Its distinctive fields are a per-consignment "intended for" use, a commodity complement ("combo") selection, a free-text product description, and package/weight totals.

The `type` discriminator is **`"CED"`** (the IPAFFS `document_type`).

## Resolved: "commodity intended for" → `consignment.intendedFor`

This is the one open question story 02 existed to settle. The CHED-D field config's `internalMarket` radio ("I.18 Commodity intended for") has options `feedingstuff` / `human` / `further` / `other`. It maps to **IPAFFS `Commodities.commodityIntendedFor`** (type `CommodityIntention`), **not** `Purpose.internalMarketPurpose`:

- **Exact value match.** `CommodityIntention` = `HUMAN("human")`, `FEEDINGSTUFF("feedingstuff")`, `FURTHER("further")`, `OTHER("other")` — identical to the staging set values. `InternalMarketPurpose` uses a different vocabulary ("Human Consumption", "Animal Feeding Stuff", …) and has **no** `further` value at all.
- **CED-specific validation.** `Commodities.commodityIntendedFor` is `@NotNull` for `NotificationHighRiskEuCedFieldValidation` and `NotificationSingleCedValidation` — both CED groups. `Purpose.internalMarketPurpose` validates under the unrelated `PurposeForInternalMarket` group — it is the animals `subPurpose` field.

So CHED-D's "intended for" is a **consignment-level** field (one per notification, a sibling of the weight/package totals on the IPAFFS `Commodities` object), mapped to **`consignment.intendedFor`**. This deliberately does **not** reuse animals' `purpose.subPurpose`: the two journeys keep distinct paths with distinct vocabularies, so the story-02 shared-path smell is avoided outright. Value vocabulary: `human` | `feedingstuff` | `further` | `other`.

## Net-new leaves (extend `01-target-shape.md`)

Four leaves CHED-D adds to the shared shape, all confirmed **absent** from `01-target-shape.md`:

| New path                       | Type                                             | From (IPAFFS)                                             | Why here                                                                                           |
| ------------------------------ | ------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `consignment.intendedFor`      | enum `human`\|`feedingstuff`\|`further`\|`other` | `Commodities.commodityIntendedFor` (`CommodityIntention`) | Shipment-wide use; sibling of the consignment totals. Distinct from animals' `purpose.subPurpose`. |
| `commodities[].complementId`   | string                                           | `CommodityComplement.complementID`                        | The selected commodity complement ("combo"). Per-line-item.                                        |
| `commodities[].complementName` | string (optional)                                | `CommodityComplement.complementName`                      | Human label for the complement.                                                                    |
| `commodities[].description`    | string (free text)                               | `CommodityComplement.commodityDescription`                | CED's per-line-item product description.                                                           |

Everything else reuses shared paths. **No engine change** — `engine/path.js#resolvePath` already walks these.

## Path translation — CHED-D Part 1

The source-of-truth for `chedd-products/obligations.json` `schemaPaths`. CHED-D Part-1 field-config components → IPAFFS canonical → new shallow path.

### Shared (reused from `01-target-shape.md`)

| CHED-D field-config                                              | IPAFFS path                                                | New path                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| (notification type)                                              | `documentType`                                             | `type` (`"CED"`)                              |
| `localReferenceNumber`                                           | `partOne.importerLocalReferenceNumber`                     | `importerLocalRef`                            |
| `countryOfOrigin`                                                | `partOne.commodities.countryOfOrigin`                      | `origin.country`                              |
| `regionOfOrigin`                                                 | `partOne.commodities.regionOfOrigin`                       | `origin.region`                               |
| `commodityCode`                                                  | `partOne.commodities.commodityComplement[].commodityID`    | `commodities[].id`                            |
| `purpose` (Purpose page radio)                                   | `partOne.purpose.purposeGroup`                             | `purpose.group`                               |
| `numberPackages`                                                 | `partOne.commodities.numberOfPackages`                     | `consignment.numberOfPackages`                |
| `productGrossWeight`                                             | `partOne.commodities.totalGrossWeight`                     | `consignment.totalGrossWeight`                |
| `productNetWeight`                                               | `partOne.commodities.totalNetWeight`                       | `consignment.totalNetWeight`                  |
| `subtotalNetWeights[0]` / `identificationCommodity` (line items) | `partOne.commodities.complementParameterSet[].keyDataPair` | `commodities[].parameters.keyDataPair`        |
| `accompanyingDocument[0].documentNumber`                         | `partOne.…accompanyingDocuments[].documentReference`       | `documents.accompanying[].reference`          |
| `accompanyingDocument[0].dateOfIssue`                            | `partOne.…accompanyingDocuments[].documentIssueDate`       | `documents.accompanying[].issueDate`          |
| `meansOfTransport*` (to port of entry)                           | `partOne.meansOfTransportFromEntryPoint`                   | `entry.transportType`                         |
| `arrivalDate`                                                    | `partOne.arrivalDate`                                      | `entry.arrivalDate`                           |
| `arrivalTime`                                                    | `partOne.arrivalTime`                                      | `entry.arrivalTime`                           |
| (point of entry)                                                 | `partOne.pointOfEntry`                                     | `entry.bcp`                                   |
| `Consignor`                                                      | `partOne.consignor`                                        | `parties.consignor`                           |
| `Consignee`                                                      | `partOne.consignee`                                        | `parties.consignee`                           |
| `Importer`                                                       | `partOne.importer`                                         | `parties.importer`                            |
| Place of Destination                                             | `partOne.placeOfDestination`                               | `destination`                                 |
| nominated contacts                                               | `partOne.nominatedContacts[]`                              | `contacts[]`                                  |
| (submission marker)                                              | `partOne.submissionDate`                                   | `submittedAt` (resolver `submissionDatePath`) |

### CHED-D-specific (the new leaves)

| CHED-D field-config                                       | IPAFFS path                                                                   | New path                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `internalMarket` ("intended for")                         | `partOne.commodities.commodityIntendedFor`                                    | `consignment.intendedFor`                                       |
| `productDescription`                                      | `partOne.commodities.commodityComplement[].commodityDescription`              | `commodities[].description`                                     |
| `comboType` / `comboClass` / `comboFamily` / `comboModel` | `partOne.commodities.commodityComplement[].complementID` (+ `complementName`) | `commodities[].complementId` (+ `commodities[].complementName`) |

### Dropped (animals/plants-only — NOT in CHED-D Part 1)

`documents.veterinary.*`, `commodities[].species.*` (taxonomy), `commodities[].identifiers[]`, `parties.transporter`, `parties.packer`, `consignment.cph`, `consignment.animalsCertifiedAs`, `consignment.includeNonAblactedAnimals`, `purpose.subPurpose`, `purpose.exitBIP` / transit fields (CHED-D Part 1 has no transit components in the mapping), `declarations.gmsAccepted`, `commodities[].species.eppoCode`.

### UI-only (no obligation)

These CHED-D field-config components carry **no** notification obligation (matching how the existing journeys treat operational fields): `(unnamed):org_picker` (establishment pickers), `sealContainer[].sealNumber` / `containerNumber` (would be `sealsContainers[]` if ever captured), `departDate` / `departTime`, and the after-BCP transport leg `meansOfTransportABC.*`. Story 03's `journey.json` may render them, but they get no `obligationRef`. (Per-line-item `countryOrigin`/`regionOrigin` on `/commodity/details` collapse onto the consignment-level `origin.country`/`origin.region` — single-origin is the default; a `commodities[].origin` leaf would only be needed if multi-origin CED consignments are real.)

## How story 03 consumes this

- **`obligations.json`** — `schemaPaths` come from the tables above. The CHED-D-specific `intended-use` obligation targets **`consignment.intendedFor`** and is **conditional** (`fact: commodity`, `test: requiresInternalMarket`) — active only when the (first) commodity's refdata says `has_internal_market`. The complement ("combo") obligation targets `commodities[].complementId` (+ `commodities[].complementName`); the product-description obligation targets `commodities[].description`; the packages-and-weights obligation targets the `consignment.*` totals + `commodities[].parameters.keyDataPair`.
- **`resolvers.js`** — `facts.commodity` = `commodities[0]`; `tests.requiresInternalMarket` reads `refdata.routing[id].has_internal_market` (unchanged by this doc). `submissionDatePath = 'submittedAt'`.
- **`scenarios.js`** — notifications in this shape: `type: "CED"`, `consignment.intendedFor` **set** on internal-market commodities and **omitted** on the 31 anomalies so the conditional resolves inactive (and the notification is still submittable).

> **Naming note for story 03:** the earlier draft assumed `purpose.subPurpose` / an obligation named `intended-purpose`. With the reconciliation resolved to a consignment-level path, the obligation is better named `intended-use` (or `commodity-intended-for`) and its schemaPath is `consignment.intendedFor`. The resolver test (`requiresInternalMarket`, reading the commodity's refdata flag) is unchanged.

## Worked example — CED notification (`import-wheat`, code `1001`, internal-market active)

```jsonc
{
  "type": "CED",
  "submittedAt": "2026-04-11T10:00:00Z",
  "origin": { "country": "FR", "region": "FR-21" },
  "importerLocalRef": "REF-CED-001",
  "commodities": [
    {
      "id": "1001",
      "description": "1001 Wheat and meslin",
      "complementId": "151100",
      "complementName": "Wheat",
      "parameters": {
        "keyDataPair": [{ "key": "net_weight", "data": "12000" }]
      }
    }
  ],
  "consignment": {
    "intendedFor": "human",
    "numberOfPackages": 240,
    "totalGrossWeight": 12500,
    "totalNetWeight": 12000
  },
  "parties": {
    "importer": { "name": "Test Importer", "address": { "country": "GB" } },
    "consignor": { "name": "Test Consignor", "address": { "country": "FR" } },
    "consignee": { "name": "Test Consignee", "address": { "country": "GB" } }
  },
  "destination": { "name": "Mill Co", "address": { "country": "GB" } },
  "entry": {
    "bcp": "GBLHR1",
    "arrivalDate": "2026-04-15",
    "arrivalTime": "10:00",
    "transportType": "Road"
  },
  "documents": {
    "accompanying": [
      {
        "type": "Commercial Invoice",
        "reference": "INV-2026-1001",
        "issueDate": "2026-04-10"
      }
    ]
  },
  "contacts": [{ "name": "Jane Doe", "email": "jane@example.com" }]
}
```

For an anomaly commodity (e.g. `84181020`), `consignment.intendedFor` is **omitted** — the `intended-use` obligation then resolves inactive (its `requiresInternalMarket` test returns `active: false`) and the notification is still submittable with `unsatisfied: 0`, `deferred: 0`.
