/**
 * Curated scenario fixtures for the obligation explorer.
 *
 * Each scenario is a COMPLETE notification JSON that passes the evaluator
 * with `submittable: true`, `unsatisfied: 0`, `deferred: 0`.
 *
 * The 7 scenarios cover the full obligation graph:
 * - 4 routing flag combinations (none, transporter, CPH+transporter, permAddr+transporter)
 * - 2 purpose groups (import, transhipment)
 * - 1 multi-commodity scenario
 *
 * All derived from the verified `cattleSatisfied` base notification.
 */

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/**
 * Base address structure reused across scenarios.
 * @param {string} prefix - Name prefix for the entity
 * @param {string} country - ISO country code
 */
const address = (prefix, country) => ({
  companyName: `${prefix} Ltd`,
  country
})

/**
 * Standard veterinary information block.
 */
const veterinaryInfo = {
  veterinaryDocument: 'VET-DOC-12345',
  veterinaryDocumentIssueDate: '2024-12-20',
  establishmentsOfOrigin: [
    {
      approvalNumber: 'FR-01-123',
      name: 'Origin Farm',
      country: 'FR'
    }
  ],
  accompanyingDocuments: [
    {
      documentType: 'Health Certificate',
      documentReference: 'HC-2024-001',
      documentIssueDate: '2024-12-20',
      attachmentId: 'attach-001'
    }
  ]
}

/**
 * Standard transport information block.
 */
const transporterBlock = {
  companyName: 'Test Transport Ltd',
  country: 'FR',
  approvalNumber: 'FR-TRANS-001'
}

/**
 * Build a commodity complement entry with full taxonomy.
 */
const commodity = ({
  id,
  speciesName,
  typeName,
  type,
  cls,
  family,
  nomination,
  description,
  count
}) => ({
  commodityID: id,
  speciesName,
  speciesTypeName: typeName,
  speciesType: type,
  speciesClass: cls,
  speciesFamilyName: family,
  speciesNomination: nomination,
  commodityDescription: description,
  animalsCertified: count
})

/**
 * Build a complement parameter set entry.
 * @param {string} identifierData - Animal identifier (ear tag, microchip, etc.)
 * @param {number} count - Number of animals
 * @param {Object|null} permanentAddr - Optional permanent address
 */
const parameterSet = (identifierData, count, permanentAddr = null) => {
  const identifier = { data: identifierData }
  if (permanentAddr) {
    identifier.permanentAddress = permanentAddr
  }
  return {
    keyDataPair: [{ key: 'number_of_animals', data: String(count) }],
    identifiers: [identifier]
  }
}

// ---------------------------------------------------------------------------
// Shared commodity definitions
// ---------------------------------------------------------------------------

const CATTLE = commodity({
  id: '102',
  speciesName: 'Bos taurus',
  typeName: 'Bovine',
  type: 'Cattle',
  cls: 'Mammals',
  family: 'Bovidae',
  nomination: 'Domestic cattle',
  description: 'Live cattle',
  count: 10
})

const SEMEN = commodity({
  id: '5119985',
  speciesName: 'Bos taurus',
  typeName: 'Bovine',
  type: 'Cattle',
  cls: 'Mammals',
  family: 'Bovidae',
  nomination: 'Domestic cattle semen',
  description: 'Bovine semen',
  count: 100
})

const OWLS = commodity({
  id: '1063100',
  speciesName: 'Strigiformes',
  typeName: 'Bird',
  type: 'Owls',
  cls: 'Aves',
  family: 'Strigidae',
  nomination: 'Owls',
  description: 'Live owls',
  count: 2
})

const CATS = commodity({
  id: '1061900',
  speciesName: 'Felis catus',
  typeName: 'Feline',
  type: 'Cats',
  cls: 'Mammals',
  family: 'Felidae',
  nomination: 'Domestic cat',
  description: 'Live domestic cats',
  count: 3
})

const GOATS = commodity({
  id: '10420',
  speciesName: 'Capra hircus',
  typeName: 'Caprine',
  type: 'Goats',
  cls: 'Mammals',
  family: 'Bovidae',
  nomination: 'Domestic goat',
  description: 'Live domestic goats',
  count: 5
})

// ---------------------------------------------------------------------------
// Shared partOne base (everything except commodity-specific and purpose-specific)
// ---------------------------------------------------------------------------

const basePartOne = {
  submissionDate: '2024-12-30T12:00:00Z',
  commodities: {
    countryOfOrigin: 'FR',
    regionOfOrigin: 'Normandy',
    totalGrossWeight: 5000,
    numberOfPackages: 1
  },
  consignor: address('Test Consignor', 'FR'),
  consignee: address('Test Consignee', 'GB'),
  importer: address('Test Importer', 'GB'),
  placeOfDestination: {
    name: 'Test Farm',
    addressLine1: '123 Test Lane',
    city: 'Test City',
    postalCode: 'TE1 1ST',
    country: 'GB'
  },
  pointOfEntry: 'GBLHR1',
  pointOfEntryControlPoint: 'GBLHR1',
  arrivalDate: '2024-12-31T10:00:00Z',
  estimatedArrivalDate: '2024-12-31',
  meansOfTransport: {
    type: 'Road',
    document: 'ABC123'
  },
  veterinaryInformation: veterinaryInfo,
  nominatedContacts: [
    {
      name: 'John Smith',
      email: 'john.smith@example.com',
      telephone: '+44 1234 567890'
    }
  ],
  accompaniedByCommercialDocument: true,
  commercialDocumentType: 'Invoice',
  commodityIntendedFor: 'HUMAN_CONSUMPTION'
}

/**
 * Build a complete notification from scenario-specific parts.
 */
const buildNotification = ({
  purposeGroup,
  internalMarketPurpose = 'Breeding',
  commodityComplements,
  complementParameterSets,
  cphNumber = null,
  transporter = null,
  exitBIP = null,
  portOfExit = null
}) => {
  const purpose = { purposeGroup, internalMarketPurpose }
  if (exitBIP) purpose.exitBIP = exitBIP

  const partOne = {
    ...basePartOne,
    purpose,
    commodities: {
      ...basePartOne.commodities,
      commodityComplement: commodityComplements,
      complementParameterSet: complementParameterSets
    }
  }

  if (transporter) partOne.transporter = transporter
  if (cphNumber) partOne.cphNumber = cphNumber
  if (portOfExit) partOne.portOfExit = portOfExit

  return {
    type: 'CVEDA',
    status: 'SUBMITTED',
    partOne
  }
}

// ---------------------------------------------------------------------------
// Scenario 1: Import – Semen
// Routing: NONE (no CPH, no perm addr, no transporter)
// Active: 17 obligations
// ---------------------------------------------------------------------------

export const importSemen = buildNotification({
  purposeGroup: 'For Import',
  commodityComplements: [SEMEN],
  complementParameterSets: [parameterSet('SEMEN-BATCH-001', 100)]
})

// ---------------------------------------------------------------------------
// Scenario 2: Import – Owls
// Routing: transporter only
// Active: 18 obligations
// ---------------------------------------------------------------------------

export const importOwls = buildNotification({
  purposeGroup: 'For Import',
  commodityComplements: [OWLS],
  complementParameterSets: [parameterSet('OWL-RING-A001', 2)],
  transporter: transporterBlock
})

// ---------------------------------------------------------------------------
// Scenario 3: Import – Cattle
// Routing: CPH + transporter
// Active: 19 obligations
// ---------------------------------------------------------------------------

export const importCattle = buildNotification({
  purposeGroup: 'For Import',
  commodityComplements: [CATTLE],
  complementParameterSets: [parameterSet('UK123456789012', 10)],
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
  commodityComplements: [CATS],
  complementParameterSets: [
    parameterSet('MICROCHIP-CAT-001', 3, {
      addressLine1: '42 Whiskers Lane',
      city: 'Catford',
      postalCode: 'CA1 1CT',
      country: 'GB'
    })
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
  commodityComplements: [SEMEN],
  complementParameterSets: [parameterSet('SEMEN-BATCH-002', 100)],
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
  commodityComplements: [CATTLE],
  complementParameterSets: [parameterSet('UK123456789012', 10)],
  cphNumber: '12/345/6789',
  transporter: transporterBlock,
  exitBIP: 'GBLHR1',
  portOfExit: 'GBLHR1'
})

// ---------------------------------------------------------------------------
// Scenario 7: Import – Mixed Livestock (cattle + goat)
// Routing: CPH + transporter (from first commodity)
// Active: 19 obligations, 2 commodity complements
// ---------------------------------------------------------------------------

export const importMixedLivestock = buildNotification({
  purposeGroup: 'For Import',
  commodityComplements: [CATTLE, GOATS],
  complementParameterSets: [
    parameterSet('UK123456789012', 10),
    parameterSet('UK987654321098', 5)
  ],
  cphNumber: '12/345/6789',
  transporter: transporterBlock
})

// ---------------------------------------------------------------------------
// Lookup map keyed by URL-safe scenario name
// ---------------------------------------------------------------------------

export const scenarioMap = {
  'import-semen': {
    notification: importSemen,
    label: 'Import – Semen (minimal path)'
  },
  'import-owls': {
    notification: importOwls,
    label: 'Import – Owls (+ transporter)'
  },
  'import-cattle': {
    notification: importCattle,
    label: 'Import – Cattle (+ CPH + transporter)'
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
