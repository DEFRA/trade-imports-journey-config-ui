/**
 * Curated scenario fixtures for the CHEDPP obligation explorer.
 *
 * Each scenario is a COMPLETE notification JSON that passes the evaluator
 * with `submittable: true`, `unsatisfied: 0`, `deferred: 0`.
 *
 * The 7 scenarios cover the full obligation graph:
 * - 1 minimal path (PHSI-only commodity, fallback key only)
 * - 1 GMS + varieties path (exact species key, HMI commodity)
 * - 1 GMS without varieties path (exact species key, JOINT authority)
 * - 1 propagation path (bulb commodity, fallback, finished-or-propagated + intended-use)
 * - 1 test-and-trial path (seeds, fallback)
 * - 1 transit path (transit-routing active)
 * - 1 transhipment path (transhipment-routing active)
 *
 * Refdata lookup paths:
 *   Scenarios 1, 4, 5, 6, 7 → fallback key (commodityCode|)
 *   Scenarios 2, 3            → exact species key (commodityCode|eppoCode)
 *
 * All commodity codes are 10-digit TRACES format. EPPO codes are real
 * values from dbo_inspection_responsibility.csv.
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
  address: {
    addressLine1: '1 Test Street',
    city: 'Test City',
    postalZipCode: 'TE1 1ST',
    countryISOCode: country
  }
})

/**
 * Build a commodity complement entry.
 * @param {Object} opts
 * @param {string} opts.commodityID - Commodity code
 * @param {string} opts.eppoCode - EPPO plant species code
 * @param {string} opts.speciesName - Human-readable species name
 * @param {string} opts.speciesID - Species identifier
 * @param {string} opts.speciesNomination - Species nomination
 * @param {string} opts.description - Commodity description
 * @param {string} opts.complementName - Lowest granularity name
 */
const commodity = ({
  commodityID,
  eppoCode,
  speciesName,
  speciesID,
  speciesNomination,
  description,
  complementName
}) => ({
  commodityID,
  commodityDescription: description,
  complementID: 1,
  complementName,
  eppoCode,
  speciesName,
  speciesID,
  speciesNomination,
  uniqueComplementID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
})

/**
 * Build a complement parameter set with keyDataPair entries.
 * @param {Array<{key: string, data: string}>} keyDataPairs
 */
const parameterSet = (keyDataPairs) => ({
  complementID: 1,
  speciesID: '1',
  uniqueComplementID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  keyDataPair: keyDataPairs
})

/**
 * Standard keyDataPair entries for basic commodity details.
 */
const baseKeyDataPairs = [
  { key: 'netweight', data: '1000' },
  { key: 'number_package', data: '10' },
  { key: 'type_package', data: 'Box' },
  { key: 'quantity', data: '500' },
  { key: 'type_quantity', data: 'Stems' },
  { key: 'commodity_group', data: 'Fruits' }
]

/**
 * Accompanying documents block.
 */
const accompanyingDocuments = [
  {
    documentType: 'phytosanitaryCertificate',
    documentReference: 'PHYTO-2024-001',
    documentIssueDate: '2024-12-20',
    attachmentId: 'attach-001'
  }
]

// ---------------------------------------------------------------------------
// Shared commodity definitions
// ---------------------------------------------------------------------------

/**
 * PHSI-only commodity: no HMI/GMS, no varieties, no propagation.
 * Pure PHSI species have no species-level entry in refdata routing —
 * falls back to commodity-level key (06042090|) with all flags false.
 *
 * 06042090 is a PHSI-only ornamental plant commodity.
 * RSVSS is a real EPPO code for Rosa sp. from inspection_responsibility.
 */
const PHSI_ORNAMENTAL = commodity({
  commodityID: '06042090',
  eppoCode: 'RSVSS',
  speciesName: 'Rosa (Rose)',
  speciesID: 'RSVSS',
  speciesNomination: 'Rosa sp.',
  description: 'Fresh cut roses',
  complementName: 'Rose'
})

/**
 * Non-PHSI commodity with marketing standard AND registered varieties.
 * Apples (0808108090) with EPPO MABSD → exact species key hit.
 * Refdata: has_gms=true, has_varieties=true, requires_billing=true.
 * Content: JOINT authority, SMS standard, 67 registered varieties.
 */
const APPLES = commodity({
  commodityID: '0808108090',
  eppoCode: 'MABSD',
  speciesName: 'Malus domestica',
  speciesID: 'MABSD',
  speciesNomination: 'Apple',
  description: 'Fresh apples',
  complementName: 'Apples'
})

/**
 * Non-PHSI commodity with marketing standard but NO varieties.
 * Sweet peppers (07096010) with EPPO CPSAN → exact species key hit.
 * Refdata: has_gms=true, has_varieties=false, requires_billing=true.
 * Content: JOINT authority, SMS standard.
 *
 * This is the dominant non-PHSI pattern: 5,179 of 5,321 species entries
 * have GMS but no varieties. Tests the GMS-without-varieties path that
 * apples cannot reach.
 */
const PEPPERS = commodity({
  commodityID: '07096010',
  eppoCode: 'CPSAN',
  speciesName: 'Capsicum annuum',
  speciesID: 'CPSAN',
  speciesNomination: 'Sweet pepper',
  description: 'Fresh sweet peppers',
  complementName: 'Sweet peppers'
})

/**
 * Bulb commodity with propagation attribute.
 * 06011010 → propagation: 'bulb', requires_finished_or_propagated: true.
 * All species for this commodity are PHSI — falls back to commodity key
 * (06011010|). HYAOR is a real EPPO code for Hyacinthus orientalis.
 */
const BULBS = commodity({
  commodityID: '06011010',
  eppoCode: 'HYAOR',
  speciesName: 'Hyacinthus orientalis',
  speciesID: 'HYAOR',
  speciesNomination: 'Hyacinth bulbs',
  description: 'Bulbs of hyacinths',
  complementName: 'Hyacinth bulbs'
})

/**
 * Commodity requiring test-and-trial data.
 * 1209999910 → requires_test_and_trial: true.
 * All species for this commodity are PHSI — falls back to commodity key
 * (1209999910|). AKTOR is a real EPPO code from inspection_responsibility.
 */
const SEEDS = commodity({
  commodityID: '1209999910',
  eppoCode: 'AKTOR',
  speciesName: 'Actinidia (Kiwi seeds)',
  speciesID: 'AKTOR',
  speciesNomination: 'Kiwi seeds',
  description: 'Seeds of kiwi for sowing',
  complementName: 'Kiwi seeds'
})

// ---------------------------------------------------------------------------
// Shared partOne base
// ---------------------------------------------------------------------------

const basePartOne = {
  submissionDate: '2024-12-30T12:00:00Z',
  commodities: {
    countryOfOrigin: 'NL',
    consignedCountry: 'NL',
    totalNetWeight: 1000,
    totalGrossWeight: 1200,
    numberOfPackages: 10,
    temperature: 'Ambient'
  },
  consignor: address('Test Consignor', 'NL'),
  consignee: address('Test Consignee', 'GB'),
  importer: address('Test Importer', 'GB'),
  packer: address('Test Packer', 'NL'),
  placeOfDestination: address('Test Destination', 'GB'),
  contactDetails: {
    name: 'Jane Smith',
    telephone: '+44 1234 567890',
    email: 'jane.smith@example.com'
  },
  nominatedContacts: [
    {
      name: 'John Smith',
      email: 'john.smith@example.com',
      telephone: '+44 1234 567891'
    }
  ],
  pointOfEntry: 'GBFXT1',
  pointOfEntryControlPoint: 'GBFXT1-CP1',
  arrivalDate: '2024-12-31',
  arrivalTime: '10:00',
  meansOfTransportFromEntryPoint: {
    type: 'Road Vehicle',
    document: 'CMR-12345',
    id: 'AB12 CDE'
  },
  sealsContainers: [
    {
      sealNumber: 'SEAL-001',
      containerNumber: 'CNTR-001',
      officialSeal: false
    }
  ],
  isGVMSRoute: false,
  provideCtcMrn: 'NO',
  importerLocalReferenceNumber: 'IMP-REF-2024-001',
  veterinaryInformation: {
    accompanyingDocuments
  }
}

/**
 * Build a complete CHEDPP notification from scenario-specific parts.
 */
const buildNotification = ({
  purposeGroup = 'For Import',
  forImportOrAdmission = 'Definitive import',
  commodityComplements,
  complementParameterSets,
  gmsDeclarationAccepted = null,
  billingInformation = null,
  exitBIP = null,
  thirdCountry = null,
  finalBIP = null,
  thirdCountryTranshipment = null,
  transitThirdCountries = null
}) => {
  const purpose = { purposeGroup, forImportOrAdmission }
  if (exitBIP) purpose.exitBIP = exitBIP
  if (thirdCountry) purpose.thirdCountry = thirdCountry
  if (finalBIP) purpose.finalBIP = finalBIP
  if (thirdCountryTranshipment) purpose.thirdCountryTranshipment = thirdCountryTranshipment
  if (transitThirdCountries) purpose.transitThirdCountries = transitThirdCountries

  const commodities = {
    ...basePartOne.commodities,
    commodityComplement: commodityComplements,
    complementParameterSet: complementParameterSets
  }
  if (gmsDeclarationAccepted != null) {
    commodities.gmsDeclarationAccepted = gmsDeclarationAccepted
  }

  const partOne = {
    ...basePartOne,
    purpose,
    commodities
  }

  if (billingInformation) partOne.billingInformation = billingInformation

  return {
    type: 'CHEDPP',
    status: 'SUBMITTED',
    partOne
  }
}

// ---------------------------------------------------------------------------
// Scenario 1: Import – PHSI ornamental (minimal path)
// Refdata: fallback key (06042090|) — all flags false
// Commodity-conditionals: all inactive (PHSI-only, no species entry)
// Active obligations: 20 unconditional only
// ---------------------------------------------------------------------------

export const importPhsiTimber = buildNotification({
  commodityComplements: [PHSI_ORNAMENTAL],
  complementParameterSets: [parameterSet(baseKeyDataPairs)]
})

// ---------------------------------------------------------------------------
// Scenario 2: Import – Apples (GMS + varieties + billing)
// Exact species key: 0808108090|MABSD → has_gms=true, has_varieties=true
// Commodity-conditionals: gms-declaration, variety-class, billing active
// Active obligations: 20 unconditional + 3 commodity-conditional = 23
// ---------------------------------------------------------------------------

export const importApples = buildNotification({
  commodityComplements: [APPLES],
  complementParameterSets: [
    parameterSet([
      ...baseKeyDataPairs,
      { key: 'variety', data: 'Braeburn' },
      { key: 'class', data: 'Class I' },
      { key: 'regulatory_authority', data: 'HMI' },
      { key: 'marketing_standard', data: 'GMS' },
      { key: 'validity_period', data: '2' }
    ])
  ],
  gmsDeclarationAccepted: true,
  billingInformation: {
    isConfirmed: true,
    emailAddress: 'billing@example.com',
    phoneNumber: '+44 1234 567892',
    contactName: 'Billing Contact',
    postalAddress: {
      addressLine1: '1 Billing Street',
      cityOrTown: 'London',
      postalCode: 'EC1 1AA'
    }
  }
})

// ---------------------------------------------------------------------------
// Scenario 3: Import – Bulbs (propagation + finished-or-propagated)
// Refdata: fallback key (06011010|) — requires_finished_or_propagated=true,
//          propagation='bulb' (→ intended-use active)
// Commodity-conditionals: finished-or-propagated, intended-use active
// Active obligations: 20 unconditional + 2 commodity-conditional = 22
// ---------------------------------------------------------------------------

export const importBulbs = buildNotification({
  commodityComplements: [BULBS],
  complementParameterSets: [
    parameterSet([
      ...baseKeyDataPairs,
      { key: 'finished_or_propagated', data: 'propagation' },
      { key: 'propagation', data: 'bulb' }
    ])
  ]
})

// ---------------------------------------------------------------------------
// Scenario 4: Import – Seeds (test-and-trial)
// Refdata: fallback key (1209999910|) — requires_test_and_trial=true
// Commodity-conditionals: test-and-trial active
// Active obligations: 20 unconditional + 1 commodity-conditional = 21
// ---------------------------------------------------------------------------

export const importSeeds = buildNotification({
  commodityComplements: [SEEDS],
  complementParameterSets: [
    parameterSet([
      ...baseKeyDataPairs,
      { key: 'for_test_and_trial', data: 'true' },
      { key: 'requires_test_and_trial_data', data: 'true' }
    ])
  ]
})

// ---------------------------------------------------------------------------
// Scenario 5: Transit – Plants
// Refdata: fallback key (PHSI ornamental)
// Purpose-conditional: transit-routing active, transhipment-routing inactive
// Active obligations: 20 unconditional + 1 purpose-conditional = 21
// ---------------------------------------------------------------------------

export const transitPlants = buildNotification({
  purposeGroup: 'For Transit to 3rd Country',
  commodityComplements: [PHSI_ORNAMENTAL],
  complementParameterSets: [parameterSet(baseKeyDataPairs)],
  exitBIP: 'GBFXT1',
  thirdCountry: 'US',
  transitThirdCountries: ['FR', 'DE']
})

// ---------------------------------------------------------------------------
// Scenario 6: Import – Peppers (GMS without varieties + billing)
// Exact species key: 07096010|CPSAN → has_gms=true, has_varieties=false
// Commodity-conditionals: gms-declaration, billing active; variety-class INACTIVE
// Active obligations: 20 unconditional + 2 commodity-conditional = 22
// This is the dominant non-PHSI pattern (5,179 of 5,321 species entries).
// ---------------------------------------------------------------------------

export const importPeppers = buildNotification({
  commodityComplements: [PEPPERS],
  complementParameterSets: [
    parameterSet([
      ...baseKeyDataPairs,
      { key: 'regulatory_authority', data: 'JOINT' },
      { key: 'marketing_standard', data: 'SMS' },
      { key: 'validity_period', data: '6' }
    ])
  ],
  gmsDeclarationAccepted: true,
  billingInformation: {
    isConfirmed: true,
    emailAddress: 'billing@example.com',
    phoneNumber: '+44 1234 567892',
    contactName: 'Billing Contact',
    postalAddress: {
      addressLine1: '1 Billing Street',
      cityOrTown: 'London',
      postalCode: 'EC1 1AA'
    }
  }
})

// ---------------------------------------------------------------------------
// Scenario 7: Transhipment – Plants
// Refdata: fallback key (PHSI ornamental)
// Purpose-conditional: transhipment-routing active, transit-routing inactive
// Active obligations: 20 unconditional + 1 purpose-conditional = 21
// ---------------------------------------------------------------------------

export const transhipmentPlants = buildNotification({
  purposeGroup: 'For Transhipment to',
  commodityComplements: [PHSI_ORNAMENTAL],
  complementParameterSets: [parameterSet(baseKeyDataPairs)],
  finalBIP: 'GBFXT1',
  thirdCountryTranshipment: 'US'
})

// ---------------------------------------------------------------------------
// Lookup map keyed by URL-safe scenario name
// ---------------------------------------------------------------------------

export const scenarioMap = {
  'import-phsi-ornamental': {
    notification: importPhsiTimber,
    label: 'Import – PHSI Ornamental (minimal path, fallback key)'
  },
  'import-apples': {
    notification: importApples,
    label: 'Import – Apples (GMS + varieties + billing, exact species key)'
  },
  'import-peppers': {
    notification: importPeppers,
    label: 'Import – Peppers (GMS without varieties + billing, exact species key)'
  },
  'import-bulbs': {
    notification: importBulbs,
    label: 'Import – Bulbs (propagation + finished-or-propagated, fallback key)'
  },
  'import-seeds': {
    notification: importSeeds,
    label: 'Import – Seeds (test-and-trial, fallback key)'
  },
  'transit-plants': {
    notification: transitPlants,
    label: 'Transit – Plants (transit routing, fallback key)'
  },
  'transhipment-plants': {
    notification: transhipmentPlants,
    label: 'Transhipment – Plants (transhipment routing, fallback key)'
  }
}
