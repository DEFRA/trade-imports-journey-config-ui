/**
 * Curated scenario fixtures for the CHEDPP obligation explorer.
 *
 * Each scenario is a COMPLETE notification JSON in the journey's
 * notification shape (see `features/notification-shape/01-target-shape.md`)
 * that passes the evaluator with `submittable: true`, `unsatisfied: 0`,
 * `deferred: 0`.
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
// Shared fragment builders (Party, Address)
// ---------------------------------------------------------------------------

/**
 * Build a Party-shaped object (name + nested address). Used for
 * consignor / consignee / importer / packer / destination — chedpp-plants'
 * destination shares the Party shape (unlike animals, where the
 * destination address differs from the parties').
 */
const party = (name, country) => ({
  name: `${name} Ltd`,
  address: {
    line1: '1 Test Street',
    city: 'Test City',
    postalCode: 'TE1 1ST',
    country
  }
})

// ---------------------------------------------------------------------------
// Commodity entry builder
// ---------------------------------------------------------------------------

/**
 * Build a commodity entry with species details.
 * Returns a partial commodity — merge with `parameterSet(...)` to
 * produce a complete entry with parameters.
 */
const commodity = ({
  id,
  eppoCode,
  speciesName,
  speciesId,
  nomination
}) => ({
  id,
  species: {
    name: speciesName,
    nomination,
    eppoCode,
    id: speciesId
  }
})

/**
 * Build the parameters fragment for a commodity. Plants don't have
 * identifiers; only the keyDataPair list.
 */
const parameterSet = (keyDataPairs) => ({
  parameters: { keyDataPair: keyDataPairs }
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

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const accompanyingDocs = [
  {
    type: 'phytosanitaryCertificate',
    reference: 'PHYTO-2024-001',
    issueDate: '2024-12-20',
    attachmentId: 'attach-001'
  }
]

// ---------------------------------------------------------------------------
// Shared commodity definitions (species-only; merge with parameterSet)
// ---------------------------------------------------------------------------

/**
 * PHSI-only commodity: no HMI/GMS, no varieties, no propagation.
 * Pure PHSI species have no species-level entry in refdata routing —
 * falls back to commodity-level key (06042090|) with all flags false.
 */
const PHSI_ORNAMENTAL = commodity({
  id: '06042090',
  eppoCode: 'RSVSS',
  speciesName: 'Rosa (Rose)',
  speciesId: 'RSVSS',
  nomination: 'Rosa sp.'
})

/**
 * Non-PHSI commodity with marketing standard AND registered varieties.
 * Apples (0808108090) with EPPO MABSD → exact species key hit.
 * Refdata: has_gms=true, has_varieties=true, requires_billing=true.
 */
const APPLES = commodity({
  id: '0808108090',
  eppoCode: 'MABSD',
  speciesName: 'Malus domestica',
  speciesId: 'MABSD',
  nomination: 'Apple'
})

/**
 * Non-PHSI commodity with marketing standard but NO varieties.
 * Sweet peppers (07096010) with EPPO CPSAN → exact species key hit.
 * Refdata: has_gms=true, has_varieties=false, requires_billing=true.
 */
const PEPPERS = commodity({
  id: '07096010',
  eppoCode: 'CPSAN',
  speciesName: 'Capsicum annuum',
  speciesId: 'CPSAN',
  nomination: 'Sweet pepper'
})

/**
 * Bulb commodity with propagation attribute.
 * 06011010 → propagation: 'bulb', requires_finished_or_propagated: true.
 * All species for this commodity are PHSI — falls back to commodity key
 * (06011010|).
 */
const BULBS = commodity({
  id: '06011010',
  eppoCode: 'HYAOR',
  speciesName: 'Hyacinthus orientalis',
  speciesId: 'HYAOR',
  nomination: 'Hyacinth bulbs'
})

/**
 * Commodity requiring test-and-trial data.
 * 1209999910 → requires_test_and_trial: true.
 * All species for this commodity are PHSI — falls back to commodity key
 * (1209999910|).
 */
const SEEDS = commodity({
  id: '1209999910',
  eppoCode: 'AKTOR',
  speciesName: 'Actinidia (Kiwi seeds)',
  speciesId: 'AKTOR',
  nomination: 'Kiwi seeds'
})

// ---------------------------------------------------------------------------
// Standard contacts (shared across scenarios)
// ---------------------------------------------------------------------------

const contactDetails = {
  name: 'Jane Smith',
  telephone: '+44 1234 567890',
  email: 'jane.smith@example.com'
}

const nominatedContacts = [
  {
    name: 'John Smith',
    email: 'john.smith@example.com',
    telephone: '+44 1234 567891'
  }
]

// ---------------------------------------------------------------------------
// Seal/container record
// ---------------------------------------------------------------------------

const sealsContainers = [
  {
    sealNumber: 'SEAL-001',
    containerNumber: 'CNTR-001',
    officialSeal: false
  }
]

// ---------------------------------------------------------------------------
// Billing fragment (used by scenarios that need billingInformation)
// ---------------------------------------------------------------------------

const billingBlock = {
  isConfirmed: true,
  emailAddress: 'billing@example.com',
  phoneNumber: '+44 1234 567892',
  contactName: 'Billing Contact',
  postalAddress: {
    line1: '1 Billing Street',
    city: 'London',
    postalCode: 'EC1 1AA'
  }
}

// ---------------------------------------------------------------------------
// buildNotification — assembles a complete notification from
// scenario-specific parts. Optional fields use conditional-spread to
// avoid empty wrapper objects (R2 mitigation).
// ---------------------------------------------------------------------------

const buildNotification = ({
  purposeGroup = 'For Import',
  forImportOrAdmission = 'Definitive import',
  commodities,
  gmsDeclarationAccepted = null,
  billing = null,
  exitBIP = null,
  thirdCountry = null,
  finalBIP = null,
  thirdCountryTranshipment = null,
  transitThirdCountries = null
}) => ({
  type: 'CHEDPP',
  submittedAt: '2024-12-30T12:00:00Z',
  origin: {
    country: 'NL',
    consignedCountry: 'NL'
  },
  purpose: {
    group: purposeGroup,
    forImportOrAdmission,
    ...(exitBIP && { exitBIP }),
    ...(thirdCountry && { thirdCountry }),
    ...(finalBIP && { finalBIP }),
    ...(thirdCountryTranshipment && { thirdCountryTranshipment }),
    ...(transitThirdCountries && { transitThirdCountries })
  },
  commodities,
  consignment: {
    totalNetWeight: 1000,
    totalGrossWeight: 1200,
    numberOfPackages: 10
  },
  parties: {
    consignor: party('Test Consignor', 'NL'),
    consignee: party('Test Consignee', 'GB'),
    importer: party('Test Importer', 'GB'),
    packer: party('Test Packer', 'NL')
  },
  destination: party('Test Destination', 'GB'),
  entry: {
    bcp: 'GBFXT1',
    bcpControlPoint: 'GBFXT1-CP1',
    arrivalDate: '2024-12-31',
    arrivalTime: '10:00',
    transportType: 'Road Vehicle',
    isGVMS: false
  },
  documents: {
    accompanying: accompanyingDocs
  },
  contacts: nominatedContacts,
  contactDetails,
  sealsContainers,
  ctcMrn: 'NO',
  importerLocalRef: 'IMP-REF-2024-001',
  ...(gmsDeclarationAccepted != null && {
    declarations: { gmsAccepted: gmsDeclarationAccepted }
  }),
  ...(billing && { billing })
})

// ---------------------------------------------------------------------------
// Scenario 1: Import – PHSI ornamental (minimal path)
// Refdata: fallback key (06042090|) — all flags false
// Commodity-conditionals: all inactive (PHSI-only, no species entry)
// ---------------------------------------------------------------------------

export const importPhsiOrnamental = buildNotification({
  commodities: [{ ...PHSI_ORNAMENTAL, ...parameterSet(baseKeyDataPairs) }]
})

// ---------------------------------------------------------------------------
// Scenario 2: Import – Apples (GMS + varieties + billing)
// ---------------------------------------------------------------------------

export const importApples = buildNotification({
  commodities: [
    {
      ...APPLES,
      ...parameterSet([
        ...baseKeyDataPairs,
        { key: 'variety', data: 'Braeburn' },
        { key: 'class', data: 'Class I' },
        { key: 'regulatory_authority', data: 'HMI' },
        { key: 'marketing_standard', data: 'GMS' },
        { key: 'validity_period', data: '2' }
      ])
    }
  ],
  gmsDeclarationAccepted: true,
  billing: billingBlock
})

// ---------------------------------------------------------------------------
// Scenario 3: Import – Bulbs (propagation + finished-or-propagated)
// ---------------------------------------------------------------------------

export const importBulbs = buildNotification({
  commodities: [
    {
      ...BULBS,
      ...parameterSet([
        ...baseKeyDataPairs,
        { key: 'finished_or_propagated', data: 'propagation' },
        { key: 'propagation', data: 'bulb' }
      ])
    }
  ]
})

// ---------------------------------------------------------------------------
// Scenario 4: Import – Seeds (test-and-trial)
// ---------------------------------------------------------------------------

export const importSeeds = buildNotification({
  commodities: [
    {
      ...SEEDS,
      ...parameterSet([
        ...baseKeyDataPairs,
        { key: 'for_test_and_trial', data: 'true' },
        { key: 'requires_test_and_trial_data', data: 'true' }
      ])
    }
  ]
})

// ---------------------------------------------------------------------------
// Scenario 5: Transit – Plants
// ---------------------------------------------------------------------------

export const transitPlants = buildNotification({
  purposeGroup: 'For Transit to 3rd Country',
  commodities: [{ ...PHSI_ORNAMENTAL, ...parameterSet(baseKeyDataPairs) }],
  exitBIP: 'GBFXT1',
  thirdCountry: 'US',
  transitThirdCountries: ['FR', 'DE']
})

// ---------------------------------------------------------------------------
// Scenario 6: Import – Peppers (GMS without varieties + billing)
// ---------------------------------------------------------------------------

export const importPeppers = buildNotification({
  commodities: [
    {
      ...PEPPERS,
      ...parameterSet([
        ...baseKeyDataPairs,
        { key: 'regulatory_authority', data: 'JOINT' },
        { key: 'marketing_standard', data: 'SMS' },
        { key: 'validity_period', data: '6' }
      ])
    }
  ],
  gmsDeclarationAccepted: true,
  billing: billingBlock
})

// ---------------------------------------------------------------------------
// Scenario 7: Transhipment – Plants
// ---------------------------------------------------------------------------

export const transhipmentPlants = buildNotification({
  purposeGroup: 'For Transhipment to',
  commodities: [{ ...PHSI_ORNAMENTAL, ...parameterSet(baseKeyDataPairs) }],
  finalBIP: 'GBFXT1',
  thirdCountryTranshipment: 'US'
})

// ---------------------------------------------------------------------------
// Lookup map keyed by URL-safe scenario name
// ---------------------------------------------------------------------------

export const scenarioMap = {
  'import-phsi-ornamental': {
    notification: importPhsiOrnamental,
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
