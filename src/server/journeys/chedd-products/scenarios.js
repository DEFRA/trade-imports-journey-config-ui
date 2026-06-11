/**
 * Curated scenario fixtures for the chedd-products (CHED-D) journey.
 *
 * Each scenario is a COMPLETE notification in the CED notification shape
 * (see features/notification-shape/04-migrate-chedd-products.md) that
 * passes the evaluator with `submittable: true`, `unsatisfied: 0`,
 * `deferred: 0`.
 *
 * These two are the representative pair story 03 ships to prove the
 * journey is live; story 04 keeps them verbatim and appends the
 * exhaustive set (anomaly families, combo-outlier, multi-commodity).
 */

// ---------------------------------------------------------------------------
// Shared fragment builders
// ---------------------------------------------------------------------------

const party = (name, country) => ({ name: `${name} Ltd`, address: { country } })

const place = (name, country) => ({ name, address: { country } })

const accompanyingDocs = [
  {
    type: 'Commercial Invoice',
    reference: 'INV-2026-001',
    issueDate: '2026-04-10',
    attachmentId: 'attach-001'
  }
]

const nominatedContacts = [
  { name: 'Jane Doe', email: 'jane.doe@example.com', telephone: '+44 1234 567890' }
]

/**
 * Build a commodity line item in the CED notification shape. The
 * `complementId` mirrors the commodity's refdata `combo_complement_id`.
 */
const commodity = ({ id, description, complementId }) => ({
  id,
  description,
  complementId,
  complementName: description,
  parameters: { keyDataPair: [{ key: 'net_weight', data: '12000' }] }
})

/**
 * Assemble a complete CED notification. `intendedFor` is only set when
 * provided (omitted for anomaly commodities, where `intended-use` is
 * inactive) — the R2 wrapper-object trap is avoided by spreading it
 * conditionally.
 */
const buildNotification = ({ commodities, intendedFor = null }) => ({
  type: 'CED',
  submittedAt: '2026-04-11T10:00:00Z',
  origin: { country: 'FR', region: 'FR-21' },
  importerLocalRef: 'REF-CED-001',
  purpose: { group: 'For Import' },
  commodities,
  consignment: {
    numberOfPackages: 240,
    totalGrossWeight: 12500,
    totalNetWeight: 12000,
    ...(intendedFor && { intendedFor })
  },
  parties: {
    consignor: party('Test Consignor', 'FR'),
    consignee: party('Test Consignee', 'GB'),
    importer: party('Test Importer', 'GB')
  },
  destination: place('Test Mill', 'GB'),
  entry: {
    bcp: 'GBLHR1',
    arrivalDate: '2026-04-15',
    arrivalTime: '10:00',
    transportType: 'Road'
  },
  documents: { accompanying: accompanyingDocs },
  contacts: nominatedContacts
})

// ---------------------------------------------------------------------------
// Scenario 1: Import – Wheat and meslin (internal-market active)
// Commodity 1001 has has_internal_market = true, so `intended-use`
// fires and consignment.intendedFor must be present. All 18 active.
// ---------------------------------------------------------------------------

export const importWheat = buildNotification({
  commodities: [
    commodity({
      id: '1001',
      description: '1001 Wheat and meslin',
      complementId: '151100'
    })
  ],
  intendedFor: 'human'
})

// ---------------------------------------------------------------------------
// Scenario 2: Import – Refrigerator (anomaly, no internal market)
// Commodity 84181020 has has_internal_market = false, so `intended-use`
// is inactive and consignment.intendedFor is omitted. 17 active.
// ---------------------------------------------------------------------------

export const importRefrigerator = buildNotification({
  commodities: [
    commodity({
      id: '84181020',
      description: '8418 Refrigerators',
      complementId: '233701'
    })
  ]
})

// ---------------------------------------------------------------------------
// Lookup map keyed by URL-safe scenario name
// ---------------------------------------------------------------------------

export const scenarioMap = {
  'import-wheat': {
    notification: importWheat,
    label: 'Import – Wheat and meslin (internal-market active)'
  },
  'import-refrigerator': {
    notification: importRefrigerator,
    label: 'Import – Refrigerator (anomaly, no internal market)'
  }
}
