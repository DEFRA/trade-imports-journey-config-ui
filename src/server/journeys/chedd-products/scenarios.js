/**
 * Curated scenario fixtures for the chedd-products (CHED-D) journey.
 *
 * Each scenario is a COMPLETE notification in the CED notification shape
 * (see features/notification-shape/04-migrate-chedd-products.md) that
 * passes the evaluator with `submittable: true`, `unsatisfied: 0`,
 * `deferred: 0`.
 *
 * The 6 scenarios cover the obligation graph and the commodity variance
 * that matters for CHED-D:
 *
 *   import-wheat              — internal-market active (1001); all 18
 *                               obligations active.
 *   import-feed-prep          — anomaly 230990 (animal feed prep); no
 *                               internal market, intended-use inactive.
 *   import-refrigerator       — anomaly 84181020 (non-food); intended-use
 *                               inactive.
 *   import-fruit-paste        — combo-override outlier 200710 (3 explicit
 *                               combo-type options) + internal market.
 *   import-preserved-apricots — anomaly 08129025 (food-adjacent); a
 *                               second anomaly family.
 *   import-mixed              — multi-commodity (wheat + fruit paste);
 *                               routing driven by the first commodity.
 *
 * Anomaly scenarios OMIT `consignment.intendedFor` so the conditional
 * `intended-use` obligation resolves inactive — the notification stays
 * submittable (an inactive obligation is not unsatisfied or deferred).
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
 *
 * Named `buildCommodity` (not `commodity`) to keep the noun `commodity`
 * reserved for the runtime fact extracted by `resolvers.facts.commodity`.
 */
const buildCommodity = ({ id, description, complementId }) => ({
  id,
  description,
  complementId,
  complementName: description,
  parameters: { keyDataPair: [{ key: 'net_weight', data: '12000' }] }
})

/**
 * Assemble a complete CED notification. `intendedFor` is only set when
 * provided (omitted for anomaly commodities, where `intended-use` is
 * inactive) — conditional-spread avoids the empty-wrapper trap.
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
// Shared commodity definitions
// ---------------------------------------------------------------------------

const WHEAT = buildCommodity({
  id: '1001',
  description: '1001 Wheat and meslin',
  complementId: '151100'
})

const FEED_PREP = buildCommodity({
  id: '230990',
  description: '2309 Preparations of a kind used in animal feeding',
  complementId: '214300'
})

const REFRIGERATOR = buildCommodity({
  id: '84181020',
  description: '8418 Refrigerators, freezers and other refrigerating equipment',
  complementId: '233701'
})

const FRUIT_PASTE = buildCommodity({
  id: '200710',
  description: '2007 Homogenised fruit preparations (jams, pastes)',
  complementId: '149352'
})

const PRESERVED_APRICOTS = buildCommodity({
  id: '08129025',
  description: '0812 Fruit and nuts, provisionally preserved (apricots, oranges)',
  complementId: '239609'
})

// ---------------------------------------------------------------------------
// Scenario 1: Import – Wheat and meslin (internal-market active)
// 1001 has has_internal_market = true; all 18 obligations active.
// ---------------------------------------------------------------------------

export const importWheat = buildNotification({
  commodities: [WHEAT],
  intendedFor: 'human'
})

// ---------------------------------------------------------------------------
// Scenario 2: Import – Animal feed preparation (anomaly 230990)
// No internal market; intended-use inactive. 17 active.
// ---------------------------------------------------------------------------

export const importFeedPrep = buildNotification({
  commodities: [FEED_PREP]
})

// ---------------------------------------------------------------------------
// Scenario 3: Import – Refrigerator (anomaly 84181020, non-food)
// No internal market; intended-use inactive. 17 active.
// ---------------------------------------------------------------------------

export const importRefrigerator = buildNotification({
  commodities: [REFRIGERATOR]
})

// ---------------------------------------------------------------------------
// Scenario 4: Import – Homogenised fruit paste (combo outlier 200710)
// Internal market active AND carries an explicit combo-type override.
// ---------------------------------------------------------------------------

export const importFruitPaste = buildNotification({
  commodities: [FRUIT_PASTE],
  intendedFor: 'further'
})

// ---------------------------------------------------------------------------
// Scenario 5: Import – Preserved apricots (anomaly 08129025)
// A second anomaly family (food-adjacent). intended-use inactive.
// ---------------------------------------------------------------------------

export const importPreservedApricots = buildNotification({
  commodities: [PRESERVED_APRICOTS]
})

// ---------------------------------------------------------------------------
// Scenario 6: Import – Mixed (wheat + fruit paste)
// Multi-commodity; routing driven by the first commodity (wheat, which
// has internal market) so intended-use is active.
// ---------------------------------------------------------------------------

export const importMixed = buildNotification({
  commodities: [WHEAT, FRUIT_PASTE],
  intendedFor: 'human'
})

// ---------------------------------------------------------------------------
// Lookup map keyed by URL-safe scenario name.
//
// `import-wheat` is intentionally first: the debug page uses the first
// scenario as its representative example, and import-wheat exercises the
// richest path (all 18 obligations active).
// ---------------------------------------------------------------------------

export const scenarioMap = {
  'import-wheat': {
    notification: importWheat,
    label: 'Import – Wheat and meslin (internal-market active)'
  },
  'import-feed-prep': {
    notification: importFeedPrep,
    label: 'Import – Animal feed preparation (anomaly, no internal market)'
  },
  'import-refrigerator': {
    notification: importRefrigerator,
    label: 'Import – Refrigerator (anomaly, no internal market)'
  },
  'import-fruit-paste': {
    notification: importFruitPaste,
    label: 'Import – Homogenised fruit paste (combo-override outlier)'
  },
  'import-preserved-apricots': {
    notification: importPreservedApricots,
    label: 'Import – Preserved apricots (anomaly, no internal market)'
  },
  'import-mixed': {
    notification: importMixed,
    label: 'Import – Mixed (wheat + fruit paste, multi-commodity)'
  }
}
