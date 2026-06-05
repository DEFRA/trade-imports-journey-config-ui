import {
  computeVariance,
  annotateValues,
  computeAbsentValues
} from './config-variance.js'
import {
  extractCommodityOptions,
  parseCommodityKey,
  toSelectItems
} from './config-utils.js'
import { navContext } from './nav-context.js'
import { computePageVariance } from './page-variance.js'
import { clientForRequest } from '#server/clients/journey-api-client.js'

const baseViewContext = (nav) => ({
  pageTitle: 'Commodity Configuration',
  heading: 'Commodity Reference Data Configuration',
  currentPage: 'commodity-config',
  ...nav
})

// Detail ids that describe commodity-level routing fields. These are
// surfaced as part of the commodity summary at the top of the page,
// not down in the regular details block. Each registered journey
// names its routing detail; the set is small and stable.
const ROUTING_DETAIL_IDS = new Set(['commodity_flags', 'routing'])

/**
 * Build the per-dimension view shown on the page: included values
 * (annotated common/specific + frequency) and the explicit excluded list.
 */
const buildDimensionView = (dimension, commodityKey, variance) => {
  const values = dimension.valuesFor(commodityKey)
  const { superset, frequency } = variance.byDimension[dimension.id]
  return {
    id: dimension.id,
    name: dimension.name,
    source: dimension.sourceFor?.(commodityKey) ?? null,
    count: values.length,
    total: superset.size,
    included: annotateValues(values, frequency, variance.totalCommodities),
    excluded: computeAbsentValues(superset, values, frequency)
  }
}

/**
 * GET /explorer/commodity-config handler.
 *
 * Reads the configured journey's refdata-view descriptor via the engine
 * facade and renders the page generically — same code path for every
 * registered journey. Two render concepts:
 *   - dimensions (variance-annotated value lists)
 *   - details    (labelled rows shown as-is, type-formatted in the template)
 */
export const commodityConfigController = {
  async handler(request, h) {
    const { evaluationEngine } = request.server.app
    const client = clientForRequest(request)
    const nav = await navContext(request)
    const { journeyKey } = nav

    // Mixed paths — deliberate. HTTP is exercised for the user-visible
    // "what does this commodity drive?" demo affordances (dropdown list
    // and per-commodity driver). The cross-commodity variance + page-
    // variance computations stay in-process because they aggregate over
    // every commodity at once and no HTTP endpoint exposes that
    // aggregation today. A future story can lift them.
    const journey = evaluationEngine.getJourney(journeyKey)
    const { refdata, refdataView } = journey
    const { dimensions, details } = refdataView(refdata)

    // HTTP: dropdown population — proves the API path serves the same
    // list the in-process commodityKeys does.
    const keys = await client.getCommodities(journeyKey)

    const selectedKey = request.query.commodity ?? null
    const commodityOptions = toSelectItems(
      extractCommodityOptions(keys),
      selectedKey,
      'Select a commodity'
    )

    if (!selectedKey) {
      return h.view('explorer/commodity-config', {
        ...baseViewContext(nav),
        commodityOptions,
        selectedCommodity: null
      })
    }

    // Invariant: the same `dimensions` array drives both computeVariance
    // and the per-dimension view build below, so byDimension[d.id] is
    // always defined when buildDimensionView reads it.
    const variance = computeVariance(dimensions, keys)
    const dimensionViews = dimensions.map((d) =>
      buildDimensionView(d, selectedKey, variance)
    )
    const detailViews = details.map((dt) => ({
      id: dt.id,
      name: dt.name,
      rows: dt.rowsFor(selectedKey)
    }))

    // The routing detail describes commodity-level facts that read
    // naturally next to the summary. The remaining details (varieties,
    // classes, quantity type, etc.) sit further down with the
    // variance-annotated dimensions.
    const routingDetail =
      detailViews.find((d) => ROUTING_DETAIL_IDS.has(d.id)) ?? null
    const otherDetails = detailViews.filter(
      (d) => !ROUTING_DETAIL_IDS.has(d.id)
    )

    const { commodityID, speciesName } = parseCommodityKey(selectedKey)
    const pageVariance = computePageVariance(journey, journeyKey, selectedKey)

    // HTTP: per-commodity driver — Story 02's new demo affordance.
    // Skip the fetch when commodityID is empty (a malformed
    // ?commodity= query): the client guard would throw, and we'd log
    // a warning on every such request — noisy for a deterministic
    // client-side validation miss. The page still renders without
    // the driver panel.
    let commodityDriver = null
    if (commodityID) {
      commodityDriver = await client
        .getCommodityDetail(journeyKey, commodityID, speciesName || undefined)
        .catch((error) => {
          request.logger.warn(
            { err: error, journeyKey, commodityID, speciesName },
            'commodity-config: per-commodity driver fetch failed; rendering without it'
          )
          return null
        })
    }

    return h.view('explorer/commodity-config', {
      ...baseViewContext(nav),
      commodityOptions,
      selectedCommodity: selectedKey,
      commodityID,
      speciesName: speciesName || '(no species)',
      totalCommodities: variance.totalCommodities,
      dimensionViews,
      routingDetail,
      otherDetails,
      pageVariance,
      commodityDriver
    })
  }
}
