import { config } from '#config/config.js'
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

const baseViewContext = (journeyKey) => ({
  pageTitle: 'Commodity Configuration',
  heading: 'Commodity Reference Data Configuration',
  currentPage: 'commodity-config',
  ...navContext(journeyKey)
})

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
  handler(request, h) {
    const { evaluationEngine } = request.server.app
    const journeyKey = config.get('journey')
    const journey = evaluationEngine.getJourney(journeyKey)
    const { refdata, refdataView, commodityKeys } = journey
    const { dimensions, details } = refdataView(refdata)
    const keys = commodityKeys(refdata)

    const selectedKey = request.query.commodity ?? null
    const commodityOptions = toSelectItems(
      extractCommodityOptions(keys),
      selectedKey,
      'Select a commodity'
    )

    if (!selectedKey) {
      return h.view('explorer/commodity-config', {
        ...baseViewContext(journeyKey),
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

    const { commodityID, speciesName } = parseCommodityKey(selectedKey)

    return h.view('explorer/commodity-config', {
      ...baseViewContext(journeyKey),
      commodityOptions,
      selectedCommodity: selectedKey,
      commodityID,
      speciesName: speciesName || '(no species)',
      totalCommodities: variance.totalCommodities,
      dimensionViews,
      detailViews
    })
  }
}
