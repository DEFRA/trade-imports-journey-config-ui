/**
 * Curated scenario fixtures for the obligation explorer.
 *
 * Each scenario is a COMPLETE notification JSON in the journey's
 * notification shape (see `features/notification-shape/01-target-shape.md`)
 * that passes the evaluator with `submittable: true`, `unsatisfied: 0`,
 * `deferred: 0`.
 *
 * The 7 scenarios cover the full obligation graph:
 * - 4 routing flag combinations (none, transporter, CPH+transporter, permAddr+transporter)
 * - 2 purpose groups (import, transhipment)
 * - 1 multi-commodity scenario
 *
 * All derived from the verified `cattleSatisfied` base notification.
 */

// ---------------------------------------------------------------------------
// Shared fragment builders (Party, Place, Address)
// ---------------------------------------------------------------------------

/**
 * Build a Party-shaped object (name + nested address). Used for
 * consignor / consignee / importer / transporter / packer.
 *
 * @param {string} name - Trading name prefix; result is `${name} Ltd`
 * @param {string} country - ISO country code
 */
const party = (name, country) => ({
  name: `${name} Ltd`,
  address: { country }
})

/**
 * Build a Place-shaped object (name + address). Used for the
 * destination.
 *
 * @param {string} name - Facility name
 * @param {object} addressFields - Fields of the Address fragment
 */
const place = (name, addressFields) => ({
  name,
  address: addressFields
})

// ---------------------------------------------------------------------------
// Documents (veterinary + accompanying)
// ---------------------------------------------------------------------------

const veterinaryDoc = {
  reference: 'VET-DOC-12345',
  issueDate: '2024-12-20',
  establishments: [
    { approvalNumber: 'FR-01-123', name: 'Origin Farm', country: 'FR' }
  ]
}

const accompanyingDocs = [
  {
    type: 'Health Certificate',
    reference: 'HC-2024-001',
    issueDate: '2024-12-20',
    attachmentId: 'attach-001'
  }
]

// ---------------------------------------------------------------------------
// Transporter (Party with approvalNumber)
// ---------------------------------------------------------------------------

const transporterBlock = {
  name: 'Test Transport Ltd',
  address: { country: 'FR' },
  approvalNumber: 'FR-TRANS-001'
}

// ---------------------------------------------------------------------------
// Commodity entry builder
// ---------------------------------------------------------------------------

/**
 * Build a commodity entry with full species taxonomy.
 * Returns a partial commodity — merge with `parameterSet(...)` to
 * produce a complete entry with parameters + identifiers.
 */
const commodity = ({
  id,
  speciesName,
  typeName,
  type,
  cls,
  family,
  nomination
}) => ({
  id,
  species: {
    name: speciesName,
    nomination,
    typeName,
    type,
    class: cls,
    family
  }
})

/**
 * Build the parameters + identifiers fragment for a commodity.
 * Merge with a `commodity(...)` result via object spread.
 *
 * @param {string} identifierData - Animal identifier (ear tag, microchip, etc.)
 * @param {number} count - Number of animals
 * @param {Object|null} permanentAddr - Optional permanent address (Address fragment)
 */
const parameterSet = (identifierData, count, permanentAddr = null) => {
  const identifier = { data: identifierData }
  if (permanentAddr) {
    identifier.permanentAddress = permanentAddr
  }
  return {
    parameters: {
      keyDataPair: [{ key: 'number_of_animals', data: String(count) }]
    },
    identifiers: [identifier]
  }
}

// ---------------------------------------------------------------------------
// Shared commodity definitions (species-only; merge with parameterSet)
// ---------------------------------------------------------------------------

const CATTLE = commodity({
  id: '102',
  speciesName: 'Bos taurus',
  typeName: 'Bovine',
  type: 'Cattle',
  cls: 'Mammals',
  family: 'Bovidae',
  nomination: 'Domestic cattle'
})

const SEMEN = commodity({
  id: '5119985',
  speciesName: 'Bos taurus',
  typeName: 'Bovine',
  type: 'Cattle',
  cls: 'Mammals',
  family: 'Bovidae',
  nomination: 'Domestic cattle semen'
})

const OWLS = commodity({
  id: '1063100',
  speciesName: 'Strigiformes',
  typeName: 'Bird',
  type: 'Owls',
  cls: 'Aves',
  family: 'Strigidae',
  nomination: 'Owls'
})

const CATS = commodity({
  id: '1061900',
  speciesName: 'Felis catus',
  typeName: 'Feline',
  type: 'Cats',
  cls: 'Mammals',
  family: 'Felidae',
  nomination: 'Domestic cat'
})

const GOATS = commodity({
  id: '10420',
  speciesName: 'Capra hircus',
  typeName: 'Caprine',
  type: 'Goats',
  cls: 'Mammals',
  family: 'Bovidae',
  nomination: 'Domestic goat'
})

// ---------------------------------------------------------------------------
// Standard contacts (shared across scenarios)
// ---------------------------------------------------------------------------

const nominatedContacts = [
  {
    name: 'John Smith',
    email: 'john.smith@example.com',
    telephone: '+44 1234 567890'
  }
]

// ---------------------------------------------------------------------------
// buildNotification — assembles a complete notification from
// scenario-specific parts. Optional fields are only set when their
// input is truthy (R2 mitigation: avoid empty wrapper objects).
// ---------------------------------------------------------------------------

const buildNotification = ({
  purposeGroup,
  subPurpose = 'Breeding',
  commodities,
  cphNumber = null,
  transporter = null,
  exitBIP = null,
  portOfExit = null
}) => ({
  type: 'CVEDA',
  submittedAt: '2024-12-30T12:00:00Z',
  origin: {
    country: 'FR',
    region: 'Normandy'
  },
  purpose: {
    group: purposeGroup,
    subPurpose,
    ...(exitBIP && { exitBIP })
  },
  commodities,
  parties: {
    consignor: party('Test Consignor', 'FR'),
    consignee: party('Test Consignee', 'GB'),
    importer: party('Test Importer', 'GB'),
    ...(transporter && { transporter })
  },
  destination: place('Test Farm', {
    line1: '123 Test Lane',
    city: 'Test City',
    postalCode: 'TE1 1ST',
    country: 'GB'
  }),
  entry: {
    bcp: 'GBLHR1',
    arrivalDate: '2024-12-31T10:00:00Z',
    ...(portOfExit && { portOfExit })
  },
  documents: {
    veterinary: veterinaryDoc,
    accompanying: accompanyingDocs
  },
  contacts: nominatedContacts,
  ...(cphNumber && { consignment: { cph: cphNumber } })
})

// ---------------------------------------------------------------------------
// Scenario 1: Import – Semen
// Routing: NONE (no CPH, no perm addr, no transporter)
// Active: 17 obligations
// ---------------------------------------------------------------------------

export const importSemen = buildNotification({
  purposeGroup: 'For Import',
  commodities: [{ ...SEMEN, ...parameterSet('SEMEN-BATCH-001', 100) }]
})

// ---------------------------------------------------------------------------
// Scenario 2: Import – Owls
// Routing: transporter only
// Active: 18 obligations
// ---------------------------------------------------------------------------

export const importOwls = buildNotification({
  purposeGroup: 'For Import',
  commodities: [{ ...OWLS, ...parameterSet('OWL-RING-A001', 2) }],
  transporter: transporterBlock
})

// ---------------------------------------------------------------------------
// Scenario 3: Import – Cattle
// Routing: CPH + transporter
// Active: 19 obligations
// ---------------------------------------------------------------------------

export const importCattle = buildNotification({
  purposeGroup: 'For Import',
  commodities: [{ ...CATTLE, ...parameterSet('UK123456789012', 10) }],
  cphNumber: '12/345/6789',
  transporter: transporterBlock
})

// ---------------------------------------------------------------------------
// Scenario 4: Import – Cats
// Routing: permanent address + transporter
// Active: 19 obligations
// ---------------------------------------------------------------------------

export const importCats = buildNotification({
  purposeGroup: 'For Import',
  commodities: [
    {
      ...CATS,
      ...parameterSet('MICROCHIP-CAT-001', 3, {
        line1: '42 Whiskers Lane',
        city: 'Catford',
        postalCode: 'CA1 1CT',
        country: 'GB'
      })
    }
  ],
  transporter: transporterBlock
})

// ---------------------------------------------------------------------------
// Scenario 5: Transhipment – Semen
// Routing: NONE + transit-routing
// Active: 18 obligations
// ---------------------------------------------------------------------------

export const transhipmentSemen = buildNotification({
  purposeGroup: 'For Transhipment to',
  commodities: [{ ...SEMEN, ...parameterSet('SEMEN-BATCH-002', 100) }],
  exitBIP: 'GBLHR1',
  portOfExit: 'GBLHR1'
})

// ---------------------------------------------------------------------------
// Scenario 6: Transhipment – Cattle
// Routing: CPH + transporter + transit-routing (maximal path)
// Active: 20 obligations
// ---------------------------------------------------------------------------

export const transhipmentCattle = buildNotification({
  purposeGroup: 'For Transhipment to',
  commodities: [{ ...CATTLE, ...parameterSet('UK123456789012', 10) }],
  cphNumber: '12/345/6789',
  transporter: transporterBlock,
  exitBIP: 'GBLHR1',
  portOfExit: 'GBLHR1'
})

// ---------------------------------------------------------------------------
// Scenario 7: Import – Mixed Livestock (cattle + goat)
// Routing: CPH + transporter (from first commodity)
// Active: 19 obligations, 2 commodities
// ---------------------------------------------------------------------------

export const importMixedLivestock = buildNotification({
  purposeGroup: 'For Import',
  commodities: [
    { ...CATTLE, ...parameterSet('UK123456789012', 10) },
    { ...GOATS, ...parameterSet('UK987654321098', 5) }
  ],
  cphNumber: '12/345/6789',
  transporter: transporterBlock
})

// ---------------------------------------------------------------------------
// Lookup map keyed by URL-safe scenario name
// ---------------------------------------------------------------------------

// `import-cattle` is intentionally first: the debug page's
// obligation-fragment generator uses the first scenario as its
// representative example, and `import-cattle` exercises the richest
// path (CPH + transporter + cattle commodity) — so most obligations
// resolve to real fragments rather than empty notes.
export const scenarioMap = {
  'import-cattle': {
    notification: importCattle,
    label: 'Import – Cattle (+ CPH + transporter)'
  },
  'import-semen': {
    notification: importSemen,
    label: 'Import – Semen (minimal path)'
  },
  'import-owls': {
    notification: importOwls,
    label: 'Import – Owls (+ transporter)'
  },
  'import-cats': {
    notification: importCats,
    label: 'Import – Cats (+ permanent address + transporter)'
  },
  'transhipment-semen': {
    notification: transhipmentSemen,
    label: 'Transhipment – Semen (+ transit routing)'
  },
  'transhipment-cattle': {
    notification: transhipmentCattle,
    label: 'Transhipment – Cattle (maximal path)'
  },
  'import-mixed-livestock': {
    notification: importMixedLivestock,
    label: 'Import – Mixed Livestock (multi-commodity)'
  }
}
