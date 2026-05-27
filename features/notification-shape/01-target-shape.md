# Notification Shape — Target Design

> **Status:** Design proposal. Prerequisite for the per-journey migration
> stories (animals + plants). Treat this as a working draft — iterate
> before any code touches the codebase.

## Goal

Define a single notification shape that:

1. Holds both the eu-live-animals and chedpp-plants journeys cleanly,
   sharing fragments where the concept is identical and extending where
   it differs.
2. Is **shallower** than the current IPAFFS shape (no `partOne` wrapper;
   most paths 2–3 levels deep instead of 4–5).
3. Uses **named fragments** for cross-journey concepts (`Party`, `Address`,
   `Commodity`, `Document`) so a third journey could reuse them without
   re-inventing.
4. Stays compatible with the engine's `resolvePath` + `[]` array semantics
   (no engine changes).

This document does NOT plan the migration — that lives in the per-journey
story documents derived from this design.

---

## Overlap analysis (from `00-deep-dive.md`)

| Category | Count | Treatment |
|---|---|---|
| Identical paths in both journeys | 15 | **Shared fragments / shared top-level keys.** These are the load-bearing case for a common base. |
| Animals-only paths | 20 | Top-level keys when the concept could plausibly recur in another journey; under a `vet` extension when truly domain-specific. |
| Plants-only paths | 23 | Same principle. |

The shared set covers all the "transport boilerplate" — parties,
addresses, point of entry, arrival date, purpose, type, basic commodity
fields, contacts. The domain-specific sets are mostly extra commodity
attributes (taxonomy for animals; EPPO codes for plants) and
domain-specific document/declaration concerns.

---

## Top-level shape

```jsonc
{
  // Identity
  "type": "CVEDA" | "CHEDPP",
  "submittedAt": "<ISO 8601 date-time>",

  // Origin of the consignment
  "origin": {
    "country": "<ISO 3166-1 alpha-2>",
    "region": "<string>",            // animals: regionOfOrigin
    "consignedCountry": "<ISO>"      // plants: consignedCountry
  },

  // Purpose / regime
  "purpose": {
    "group": "<string>",             // purposeGroup
    "subPurpose": "<string>",        // animals: internalMarketPurpose
    "exitBIP": "<string>",           // shared
    "finalBIP": "<string>",          // plants
    "forImportOrAdmission": "<...>", // plants
    "thirdCountry": "<...>",         // plants
    "thirdCountryTranshipment": "<...>",
    "transitThirdCountries": [<...>]
  },

  // Commodities (array; multi-commodity supported)
  "commodities": [
    {
      "id": "<commodityID>",
      "species": {
        "name": "<scientific name>",       // shared
        "nomination": "<...>",             // shared
        // animals extensions:
        "class": "<...>",                  // speciesClass
        "family": "<...>",                 // speciesFamilyName
        "type": "<...>",                   // speciesType
        "typeName": "<...>",               // speciesTypeName
        // plants extensions:
        "eppoCode": "<...>",
        "speciesId": "<...>"
      },
      "parameters": {                       // complementParameterSet[0]
        "keyDataPair": [ {...} ]
      },
      // animals only:
      "identifiers": [ { "data": "<...>", "permanentAddress": Address } ],
      // plants only (commodity-level — see below):
      // (none specific; weights and packages are consignment-level)
    }
  ],

  // Consignment-level attributes that describe the shipment as a whole
  // (not per-commodity).
  "consignment": {
    "numberOfPackages": <int>,            // plants
    "totalGrossWeight": <number>,         // plants
    "totalNetWeight": <number>,           // plants
    "animalsCertifiedAs": "<...>",        // animals
    "includeNonAblactedAnimals": <bool>,  // animals
    "cph": "<...>"                        // animals: County Parish Holding number
  },

  // Parties involved
  "parties": {
    "importer": Party,                     // shared
    "consignor": Party,                    // shared
    "consignee": Party,                    // shared
    "transporter": Party,                  // animals
    "packer": Party                        // plants
  },

  // Where it's going
  "destination": Place,                    // placeOfDestination

  // How it's coming in
  "entry": {
    "bcp": "<...>",                        // pointOfEntry
    "bcpControlPoint": "<...>",            // plants: pointOfEntryControlPoint
    "portOfExit": "<...>",                 // animals
    "arrivalDate": "<ISO date>",           // shared
    "arrivalTime": "<HH:MM>",              // plants
    "transportType": "<...>",              // plants: meansOfTransportFromEntryPoint
    "isGVMS": <bool>                       // plants
  },

  // Documents accompanying the consignment
  "documents": {
    "veterinary": {                        // animals
      "reference": "<...>",
      "issueDate": "<ISO>",
      "establishments": [
        { "approvalNumber": "<...>" }
      ]
    },
    "accompanying": [                      // shared, structure differs
      { "type": "<...>", "reference": "<...>",
        "issueDate": "<ISO>", "attachmentId": "<...>" }
    ]
  },

  // Contacts (nominated contact for this notification)
  "contacts": [ Contact ],                 // nominatedContacts

  // Plants-only root-level IDs/flags. Kept at root because they are not
  // a related concept group (decision: don't bundle).
  "importerLocalRef": "<...>",             // plants
  "ctcMrn": <bool>,                        // plants: provideCtcMrn

  // Declarations / boolean attestations
  "declarations": {
    "gmsAccepted": <bool>                  // plants
  },

  // Plants-only extras
  "sealsContainers": [ {...} ],
  "billing": {...}
}
```

---

## Shared fragments

```jsonc
// A person / company / organisation that can be addressed.
// Used for importer, consignor, consignee, packer, transporter.
Party = {
  "name": "<trader name>",
  "companyName": "<optional>",
  "address": Address,
  "email": "<optional>",
  "telephone": "<optional>",
  "approvalNumber": "<optional>"           // transporter
}

// A physical address. Used in Party and Place.
Address = {
  "line1": "<...>",
  "line2": "<optional>",
  "line3": "<optional>",
  "city": "<...>",
  "postalCode": "<...>",
  "country": "<ISO 3166-1 alpha-2>"
}

// A delivery location. Identical to Party in shape, semantically a "place"
// rather than a "party". Kept as a separate name for journey-map clarity;
// shares the Address fragment.
Place = {
  "name": "<facility name>",
  "address": Address,
  "telephone": "<optional>",
  "email": "<optional>"
}

// A contact person for the notification.
Contact = {
  "name": "<...>",
  "email": "<...>",
  "telephone": "<optional>"
}

// An accompanying document (health cert, invoice, etc.).
Document = {
  "type": "<doc type>",
  "reference": "<doc reference>",
  "issueDate": "<ISO date>",
  "attachmentId": "<optional>"
}
```

---

## Path translation — complete inventory

This is the **canonical translation** used by the migration stories
(`02-migrate-eu-live-animals.md` and `03-migrate-chedpp-plants.md`).
58 distinct paths across both journeys: 15 shared, 20 animals-only,
23 plants-only.

This table is the **source of truth** for the `obligations.json`
rewrite in each journey. Author from this; review for typos before
any code touches `obligations.json`.

### Shared paths (15 — identical in both journeys)

| Old IPAFFS path | New path |
|---|---|
| `notification.type` | `type` |
| `notification.partOne.arrivalDate` | `entry.arrivalDate` |
| `notification.partOne.commodities.commodityComplement[].commodityID` | `commodities[].id` |
| `notification.partOne.commodities.commodityComplement[].speciesName` | `commodities[].species.name` |
| `notification.partOne.commodities.commodityComplement[].speciesNomination` | `commodities[].species.nomination` |
| `notification.partOne.commodities.complementParameterSet[].keyDataPair` | `commodities[].parameters.keyDataPair` |
| `notification.partOne.commodities.countryOfOrigin` | `origin.country` |
| `notification.partOne.consignee` | `parties.consignee` |
| `notification.partOne.consignor` | `parties.consignor` |
| `notification.partOne.importer` | `parties.importer` |
| `notification.partOne.nominatedContacts[]` | `contacts[]` |
| `notification.partOne.placeOfDestination` | `destination` |
| `notification.partOne.pointOfEntry` | `entry.bcp` |
| `notification.partOne.purpose.exitBIP` | `purpose.exitBIP` |
| `notification.partOne.purpose.purposeGroup` | `purpose.group` |

### Animals-only paths (20)

| Old IPAFFS path | New path |
|---|---|
| `notification.partOne.cphNumber` | `consignment.cph` |
| `notification.partOne.portOfExit` | `entry.portOfExit` |
| `notification.partOne.transporter` | `parties.transporter` |
| `notification.partOne.commodities.regionOfOrigin` | `origin.region` |
| `notification.partOne.commodities.animalsCertifiedAs` | `consignment.animalsCertifiedAs` |
| `notification.partOne.commodities.includeNonAblactedAnimals` | `consignment.includeNonAblactedAnimals` |
| `notification.partOne.purpose.internalMarketPurpose` | `purpose.subPurpose` |
| `notification.partOne.commodities.commodityComplement[].speciesClass` | `commodities[].species.class` |
| `notification.partOne.commodities.commodityComplement[].speciesFamilyName` | `commodities[].species.family` |
| `notification.partOne.commodities.commodityComplement[].speciesType` | `commodities[].species.type` |
| `notification.partOne.commodities.commodityComplement[].speciesTypeName` | `commodities[].species.typeName` |
| `notification.partOne.commodities.complementParameterSet[].identifiers[].data` | `commodities[].identifiers[].data` |
| `notification.partOne.commodities.complementParameterSet[].identifiers[].permanentAddress` | `commodities[].identifiers[].permanentAddress` |
| `notification.partOne.veterinaryInformation.veterinaryDocument` | `documents.veterinary.reference` |
| `notification.partOne.veterinaryInformation.veterinaryDocumentIssueDate` | `documents.veterinary.issueDate` |
| `notification.partOne.veterinaryInformation.establishmentsOfOrigin[].approvalNumber` | `documents.veterinary.establishments[].approvalNumber` |
| `notification.partOne.veterinaryInformation.accompanyingDocuments[].documentType` | `documents.accompanying[].type` |
| `notification.partOne.veterinaryInformation.accompanyingDocuments[].documentReference` | `documents.accompanying[].reference` |
| `notification.partOne.veterinaryInformation.accompanyingDocuments[].documentIssueDate` | `documents.accompanying[].issueDate` |
| `notification.partOne.veterinaryInformation.accompanyingDocuments[].attachmentId` | `documents.accompanying[].attachmentId` |

### Plants-only paths (23)

| Old IPAFFS path | New path |
|---|---|
| `notification.partOne.arrivalTime` | `entry.arrivalTime` |
| `notification.partOne.billingInformation` | `billing` |
| `notification.partOne.commodities.commodityComplement[].eppoCode` | `commodities[].species.eppoCode` |
| `notification.partOne.commodities.commodityComplement[].speciesID` | `commodities[].species.id` |
| `notification.partOne.commodities.consignedCountry` | `origin.consignedCountry` |
| `notification.partOne.commodities.gmsDeclarationAccepted` | `declarations.gmsAccepted` |
| `notification.partOne.commodities.numberOfPackages` | `consignment.numberOfPackages` |
| `notification.partOne.commodities.totalGrossWeight` | `consignment.totalGrossWeight` |
| `notification.partOne.commodities.totalNetWeight` | `consignment.totalNetWeight` |
| `notification.partOne.contactDetails` | `contactDetails` |
| `notification.partOne.importerLocalReferenceNumber` | `importerLocalRef` |
| `notification.partOne.isGVMSRoute` | `entry.isGVMS` |
| `notification.partOne.meansOfTransportFromEntryPoint` | `entry.transportType` |
| `notification.partOne.packer` | `parties.packer` |
| `notification.partOne.pointOfEntryControlPoint` | `entry.bcpControlPoint` |
| `notification.partOne.provideCtcMrn` | `ctcMrn` |
| `notification.partOne.purpose.finalBIP` | `purpose.finalBIP` |
| `notification.partOne.purpose.forImportOrAdmission` | `purpose.forImportOrAdmission` |
| `notification.partOne.purpose.thirdCountry` | `purpose.thirdCountry` |
| `notification.partOne.purpose.thirdCountryTranshipment` | `purpose.thirdCountryTranshipment` |
| `notification.partOne.purpose.transitThirdCountries` | `purpose.transitThirdCountries` |
| `notification.partOne.sealsContainers[]` | `sealsContainers[]` |
| `notification.partOne.veterinaryInformation.accompanyingDocuments[]` | `documents.accompanying[]` |

### Special case — `submissionDatePath` (resolver export, not a schemaPath)

| Old | New |
|---|---|
| `'notification.partOne.submissionDate'` | `'submittedAt'` |

### Note on `contactDetails` vs `contacts[]` (plants)

chedpp-plants has *two* contact-related obligations referencing
distinct paths:

- `notification.partOne.contactDetails` (singular object) → `contactDetails`
- `notification.partOne.nominatedContacts[]` (array) → `contacts[]`

Both map to distinct new-shape paths; `contactDetails` is
plants-specific (singular), `contacts[]` is shared (array).

### Depth comparison

| Stat | IPAFFS shape | New shape |
|---|---|---|
| Median path depth | 4 | 2 |
| Max path depth (non-array) | 5 | 4 |
| Deepest array-traversing path | 7 segments | 4 segments |

The deepest old path is
`notification.partOne.commodities.complementParameterSet[0].identifiers[0].permanentAddress.addressLine1`
— seven segments with two array layers. New equivalent is
`commodities[].identifiers[].permanentAddress.line1` — four segments,
two array layers. Engine `resolvePath` already handles `[]` chains, so
no engine change is needed.

---

## Two complete examples

### Example: cattle import

```jsonc
{
  "type": "CVEDA",
  "submittedAt": "2026-04-11T10:00:00Z",
  "origin": {
    "country": "FR",
    "region": "FR-75"
  },
  "purpose": {
    "group": "For Import",
    "subPurpose": "Permanent Import"
  },
  "commodities": [
    {
      "id": "102",
      "species": {
        "name": "Bos taurus",
        "nomination": "Species",
        "class": "Mammals",
        "family": "Bovidae",
        "type": "Bovine",
        "typeName": "Cattle"
      },
      "identifiers": [
        { "data": "GB123456789012" }
      ]
    }
  ],
  "consignment": {
    "animalsCertifiedAs": "...",
    "cph": "CPH12/345/6789"
  },
  "parties": {
    "importer":  { "name": "Test Importer",  "address": { "city": "...", "country": "GB" } },
    "consignor": { "name": "Test Consignor", "address": { "city": "...", "country": "FR" } },
    "consignee": { "name": "Test Consignee", "address": { "city": "...", "country": "GB" } },
    "transporter": {
      "name": "Test Transport Ltd",
      "address": { "country": "FR" },
      "approvalNumber": "FR-TRANS-001"
    }
  },
  "destination": {
    "name": "Test Farm",
    "address": { "city": "...", "country": "GB" }
  },
  "entry": {
    "bcp": "GBLHR1",
    "arrivalDate": "2026-04-15"
  },
  "documents": {
    "veterinary": {
      "reference": "CERT123",
      "issueDate": "2026-04-10",
      "establishments": [ { "approvalNumber": "FR12345" } ]
    },
    "accompanying": [
      { "type": "HEALTH_CERTIFICATE", "reference": "CERT123",
        "issueDate": "2026-04-10", "attachmentId": "ATT123" }
    ]
  },
  "contacts": [
    { "name": "John Doe", "email": "john@example.com", "telephone": "+44…" }
  ]
}
```

### Example: plants import (apples)

```jsonc
{
  "type": "CHEDPP",
  "submittedAt": "2026-04-11T10:00:00Z",
  "origin": {
    "country": "ES",
    "consignedCountry": "ES"
  },
  "purpose": {
    "group": "For Import",
    "forImportOrAdmission": "..."
  },
  "commodities": [
    {
      "id": "0808",
      "species": {
        "name": "Malus domestica",
        "nomination": "Apple",
        "eppoCode": "MABSD"
      }
    }
  ],
  "consignment": {
    "numberOfPackages": 100,
    "totalGrossWeight": 2000,
    "totalNetWeight": 1800
  },
  "parties": {
    "importer":  { "name": "...", "address": { "country": "GB" } },
    "consignor": { "name": "...", "address": { "country": "ES" } },
    "consignee": { "name": "...", "address": { "country": "GB" } },
    "packer":    { "name": "Packer Co", "address": { "country": "ES" } }
  },
  "destination": {
    "name": "Distribution Centre",
    "address": { "country": "GB" }
  },
  "entry": {
    "bcp": "GBLHR1",
    "bcpControlPoint": "GBLHR1",
    "arrivalDate": "2026-04-15",
    "arrivalTime": "10:00",
    "isGVMS": false,
    "transportType": "Road"
  },
  "documents": {
    "accompanying": [ {...} ]
  },
  "contacts": [ {...} ],
  "importerLocalRef": "REF-001",
  "declarations": {
    "gmsAccepted": true
  }
}
```

---

## Design choices worth flagging

### 1. `Place` reuses `Address` but is named distinctly

A delivery location is not a party. Keeping `Place` as its own fragment
(with its own `name` and `address`) signals that semantically — even
though structurally it looks similar to `Party` minus the optional
`approvalNumber`. If we ever add place-specific fields (loading dock,
opening hours, security details) they have a home.

### 2. Array of commodities, not single

Both journeys today have a `commodityComplement[]` array, though most
existing logic only inspects `[0]`. Mixed-livestock scenarios use the
array. Keep `commodities[]` as the universal container. Single-commodity
notifications are arrays of length 1.

### 3. `consignment` block for shipment-wide totals

Animals' `commodities.regionOfOrigin` / `animalsCertifiedAs` /
`includeNonAblactedAnimals` and plants' `numberOfPackages` /
`totalGrossWeight` etc. are *consignment-level*, not commodity-level
(they describe the whole shipment regardless of which commodities are in
it). Promoting them to a `consignment` block separates these from
per-commodity attributes.

### 4. `purpose` is the kitchen sink

Purpose has lots of journey-specific sub-fields. The plant fields
(`forImportOrAdmission`, `thirdCountry`, `transitThirdCountries`, etc.)
are kept as siblings under `purpose` rather than nested under a
`purpose.transit` block — they all relate to "why is this consignment
coming in, where is it going". Could be revisited if the list grows.

### 5. `submittedAt` at top level (was `submissionDatePath`)

The current `submissionDatePath` resolver export points to
`notification.partOne.submissionDate`. New shape promotes it to
top-level `submittedAt`. Resolvers updated accordingly; engine
unchanged.

### 6. Casing: camelCase

Matches the current convention. `submittedAt`, `arrivalDate`,
`countryOfOrigin` (now `origin.country`), `pointOfEntry` (now `entry.bcp`).

### 7. NO `notification.` envelope

The current `notification.partOne.*` prefix is dropped. Top-level keys
are the notification's actual fields. `engine/path.js#resolvePath`
already strips a leading `notification.` if present, so legacy paths
in `schemaPaths` could still resolve during migration — but the
expectation is that paths are rewritten cleanly without the prefix.

### 8. `documents.veterinary` is animals-specific

Plants' `veterinaryInformation.accompanyingDocuments[]` overlaps in
intent with animals' set. Both go into `documents.accompanying[]` with
the same `Document` shape. The animals-specific veterinary header
(`document` reference + issue date + establishments) lives at
`documents.veterinary` and is absent for plants.

---

## Design decisions (resolved)

1. **`Place` vs `Party`** — **kept separate.** They share the `Address`
   fragment but are distinct fragment definitions. A delivery location
   is not a party; if `Place` ever grows place-specific fields (opening
   hours, geocode, loading dock), it has a home.

2. **`consignment` block name** — **kept as `consignment`.**

3. **`animalsCertifiedAs` placement** — **under `consignment`.** It
   describes the whole shipment, not a per-commodity attribute.

4. **`cph` placement** — **under `consignment`.** Moved from
   `references.cph`. The CPH (County Parish Holding) number identifies
   the destination holding for the whole consignment, so it sits
   alongside `animalsCertifiedAs` and the plants weight/package totals
   as consignment-level data.

5. **Plant-specific top-level extras (`sealsContainers`, `billing`)** —
   **kept at root.** They're not deeply domain-specific (`sealsContainers`
   is just transport seals; `billing` is invoice/billing info), and
   nesting them under a `plants` block would imply more domain coupling
   than there actually is.

## Design decisions (resolved, second pass)

6. **`commodities` array vs single object** — **always an array**,
   length 1 for single-commodity. Matches existing IPAFFS conventions
   and the engine's `[]` traversal handles it directly.

7. **`references` block** — **eliminated.** After `cph` moved to
   `consignment`, the block held only `importerLocalRef` and `ctcMrn`,
   which aren't a related concept group. Both fields move to root level
   as siblings of `type`, `submittedAt`, etc. No bundle.

8. **Backwards-compat with persisted state** — **non-issue.** The
   process is stateless: Hapi `yar` session is in-memory; no DB, no
   audit log, no file persistence of notifications. Restart wipes any
   in-flight session. No transform script needed.

---

## What this design buys us

- **Median path depth drops from 4 to 2.** Most obligations get 1- or
  2-segment `schemaPaths` (`origin.country`, `parties.importer`).
- **Cross-journey shared fragments** mean a third journey would reuse
  `Party`, `Address`, `Place`, `Contact`, `Document` without re-design.
- **Clear domain extensions** — `documents.veterinary` for animals,
  `declarations.gmsAccepted` / `consignment.numberOfPackages` etc. for
  plants. The shape declares "this part is shared" vs "this part is
  domain-specific" by structure.
- **No engine changes.** All paths resolve via the existing
  `engine/path.js`; the `[]` array semantics are preserved.
- **Authoring affordance.** Obligations become readable without IPAFFS
  context — `schemaPaths: ["parties.consignor.address.country"]` reads
  unambiguously.

---

## Next step

Sign off the design (or push back on the open questions above), then
two migration stories follow — one per journey — using this shape as
the target and the deep dive's inventory as the touch list.
