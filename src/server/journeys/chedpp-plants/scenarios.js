/**
 * Curated scenario fixtures for the CHEDPP obligation explorer.
 *
 * Each scenario is a COMPLETE notification JSON in the journey's
 * notification shape (see `features/notification-shape/01-target-shape.md`)
 * that passes the evaluator with `submittable: true`, `unsatisfied: 0`,
 * `deferred: 0` against the journey's resolvers + refdata.
 *
 * The 10 scenarios cover the obligation graph plus the full
 * authority × marketing-standard variance:
 *
 *   import-phsi-ornamental — PHSI-only commodity (minimal path).
 *   import-apples           — JOINT+SMS species WITH varieties + billing
 *                             (apples MABSD; exercises variety/class).
 *   import-peppers          — JOINT+SMS species, no varieties, billing.
 *   import-bulbs            — bulb commodity (propagation +
 *                             finished-or-propagated + intended-use).
 *   import-seeds            — test-and-trial commodity.
 *   transit-plants          — transit purpose (transit routing active).
 *   transhipment-plants     — transhipment purpose.
 *   import-hmi-gms          — HMI+GMS species (the only cell that
 *                             fires the GMS declaration page).
 *   import-hmi-sms          — HMI+SMS species (HMI inspection, no GMS).
 *   import-joint-gms        — JOINT+GMS species (JOINT routing, no GMS).
 *
 * Refdata lookup paths:
 *   import-phsi-ornamental / -bulbs / -seeds / transit / transhipment →
 *     PHSI fallback (no `species[code|eppo]` row; resolver falls back
 *     to `commodities[code]`).
 *   import-apples / -peppers / -hmi-gms / -hmi-sms / -joint-gms →
 *     exact species row (`species[code|eppo]`).
 *
 * All commodity codes are 10-digit TRACES format. EPPO codes are real
 * values from the refdata.
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
 *
 * Named `buildCommodity` (not `commodity`) to keep the noun
 * `commodity` reserved for the runtime fact extracted by
 * `resolvers.facts.commodity` — same domain word, different
 * meanings, kept disambiguated at the source.
 */
const buildCommodity = ({
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
const PHSI_ORNAMENTAL = buildCommodity({
  id: '06042090',
  eppoCode: 'RSVSS',
  speciesName: 'Rosa (Rose)',
  speciesId: 'RSVSS',
  nomination: 'Rosa sp.'
})

/**
 * Non-PHSI commodity with marketing standard AND registered varieties.
 * Apples (0808108090) with EPPO MABSD → exact species key hit.
 * Refdata species: regulatory_authority=JOINT, marketing_standard=SMS,
 *                  validity_period=7, varieties present.
 */
const APPLES = buildCommodity({
  id: '0808108090',
  eppoCode: 'MABSD',
  speciesName: 'Malus domestica',
  speciesId: 'MABSD',
  nomination: 'Apple'
})

/**
 * Non-PHSI commodity with marketing standard but NO varieties.
 * Sweet peppers (07096010) with EPPO CPSAN → exact species key hit.
 * Refdata species: regulatory_authority=JOINT, marketing_standard=SMS,
 *                  validity_period=6, no varieties.
 */
const PEPPERS = buildCommodity({
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
const BULBS = buildCommodity({
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
const SEEDS = buildCommodity({
  id: '1209999910',
  eppoCode: 'AKTOR',
  speciesName: 'Actinidia (Kiwi seeds)',
  speciesId: 'AKTOR',
  nomination: 'Kiwi seeds'
})

// ---------------------------------------------------------------------------
// Authority × marketing-standard variance scenarios.
// These species are real refdata picks chosen to cover each cell of the
// authority × standard variance (see the README + Story 03 Phase B).
// All three are no-varieties to keep the GMS signal focused (the
// variety/class page is a separate concern, exercised elsewhere).
// ---------------------------------------------------------------------------

/**
 * HMI + GMS species (the canonical positive case for the GMS declaration
 * page). 0805108010|CIDAU = Citrus aurantium (bitter orange) in
 * "Fruit and nuts".
 */
const HMI_GMS = buildCommodity({
  id: '0805108010',
  eppoCode: 'CIDAU',
  speciesName: 'Citrus aurantium',
  speciesId: 'CIDAU',
  nomination: 'Bitter orange'
})

/**
 * HMI + SMS species — HMI inspection, but Specific Marketing Standards
 * apply, so the GMS declaration page does NOT fire. 08059000|CIDAL.
 */
const HMI_SMS = buildCommodity({
  id: '08059000',
  eppoCode: 'CIDAL',
  speciesName: 'Citrus deliciosa',
  speciesId: 'CIDAL',
  nomination: 'Mediterranean mandarin'
})

/**
 * JOINT + GMS species — JOINT routing, so even with GMS the page does
 * NOT fire (the JOINT custom-doc-code flow handles it). 0709999090|DATME.
 */
const JOINT_GMS = buildCommodity({
  id: '0709999090',
  eppoCode: 'DATME',
  speciesName: 'Datura metel',
  speciesId: 'DATME',
  nomination: 'Other vegetable'
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
// Scenario 2: Import – Apples (variety/class + JOINT+SMS + billing)
//
// Apples (0808108090|MABSD) is JOINT+SMS in the refdata, so the GMS
// declaration page does NOT fire. The variety/class page DOES — apples
// MABSD has registered varieties, so requiresVarietyClass is active.
// ---------------------------------------------------------------------------

export const importApples = buildNotification({
  commodities: [
    {
      ...APPLES,
      ...parameterSet([
        ...baseKeyDataPairs,
        { key: 'variety', data: 'Braeburn' },
        { key: 'class', data: 'Class I' },
        { key: 'regulatory_authority', data: 'JOINT' },
        { key: 'marketing_standard', data: 'SMS' },
        { key: 'validity_period', data: '7' }
      ])
    }
  ],
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
// Scenario 6: Import – Peppers (JOINT+SMS, no varieties, billing)
//
// JOINT+SMS → GMS declaration page does NOT fire. No varieties either.
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
// Scenario 8: Import – HMI+GMS (the only cell where the GMS declaration
// page fires; canonical positive case).
// ---------------------------------------------------------------------------

export const importHmiGms = buildNotification({
  commodities: [
    {
      ...HMI_GMS,
      ...parameterSet([
        ...baseKeyDataPairs,
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
// Scenario 9: Import – HMI+SMS (HMI inspection but Specific Marketing
// Standards — GMS declaration does NOT fire).
// ---------------------------------------------------------------------------

export const importHmiSms = buildNotification({
  commodities: [
    {
      ...HMI_SMS,
      ...parameterSet([
        ...baseKeyDataPairs,
        { key: 'regulatory_authority', data: 'HMI' },
        { key: 'marketing_standard', data: 'SMS' },
        { key: 'validity_period', data: '5' }
      ])
    }
  ],
  billing: billingBlock
})

// ---------------------------------------------------------------------------
// Scenario 10: Import – JOINT+GMS (JOINT routing — GMS declaration does
// NOT fire despite the GMS marketing standard; routed via the JOINT
// custom-doc-code flow in IPAFFS).
// ---------------------------------------------------------------------------

export const importJointGms = buildNotification({
  commodities: [
    {
      ...JOINT_GMS,
      ...parameterSet([
        ...baseKeyDataPairs,
        { key: 'regulatory_authority', data: 'JOINT' },
        { key: 'marketing_standard', data: 'GMS' },
        { key: 'validity_period', data: '2' }
      ])
    }
  ],
  billing: billingBlock
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
    label: 'Import – Apples (JOINT+SMS + varieties + billing, exact species key)'
  },
  'import-peppers': {
    notification: importPeppers,
    label: 'Import – Peppers (JOINT+SMS, no varieties, billing, exact species key)'
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
  },
  'import-hmi-gms': {
    notification: importHmiGms,
    label: 'Import – HMI+GMS (variance: GMS declaration active)'
  },
  'import-hmi-sms': {
    notification: importHmiSms,
    label: 'Import – HMI+SMS (variance: HMI inspection, no GMS declaration)'
  },
  'import-joint-gms': {
    notification: importJointGms,
    label: 'Import – JOINT+GMS (variance: JOINT routing, no GMS declaration)'
  }
}
