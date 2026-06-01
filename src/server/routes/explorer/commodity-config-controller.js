import { config } from '#config/config.js'
import { refdata } from '../../journeys/eu-live-animals/index.js'
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

// Pre-compute variance statistics once on module load
const variance = computeVariance(refdata)

/**
 * Resolve configuration for a commodity key.
 *
 * @param {string} commodityKey - e.g. "101|Equus caballus"
 * @returns {Object|null} Resolved configuration or null if not found
 */
const resolveConfig = (commodityKey) => {
  const contentEntry = refdata.content[commodityKey]
  const routingEntry = refdata.routing[commodityKey]

  if (!contentEntry) {
    return null
  }

  const purposeSetName = contentEntry.purpose
  const identifierSetName = contentEntry.identifiers
  const quantityTypeName = contentEntry.quantity

  const purposeValues = refdata.definitions.purpose_sets[purposeSetName] || []
  const identifierValues =
    refdata.definitions.identifier_sets[identifierSetName] || []
  const quantityType = refdata.definitions.quantity_types[quantityTypeName]

  return {
    routing: routingEntry || {
      cph_number: false,
      permanent_address: false,
      transporter_address: false
    },
    purposeSetName,
    purposeValues,
    identifierSetName,
    identifierValues,
    quantityType: quantityType || {
      id: 'unknown',
      label: 'Unknown',
      name: quantityTypeName
    }
  }
}

/**
 * Common view-context fields surfaced on every render.
 *
 * Page-level fields stay here; nav-partial fields defer to `navContext`
 * so the journey gating literal lives in one place.
 */
const baseViewContext = (journeyKey) => ({
  pageTitle: 'Commodity Configuration',
  heading: 'Commodity Reference Data Configuration',
  currentPage: 'commodity-config',
  ...navContext(journeyKey)
})

/**
 * GET /explorer/commodity-config handler
 *
 * Renders the commodity configuration viewer page for the eu-live-animals
 * journey. For any other configured journey, renders an explicit notice
 * (interim gate — story 02 generalises this view).
 */
export const commodityConfigController = {
  handler(request, h) {
    const journeyKey = config.get('journey')

    // §7 interim gate: commodity-config is animals-only until story 02
    // generalises the view. Render an explicit notice for other journeys
    // rather than the blank/broken variance output.
    if (journeyKey !== 'eu-live-animals') {
      return h.view('explorer/commodity-config', {
        ...baseViewContext(journeyKey),
        notAvailable: true,
        notice:
          'Commodity config is not available for this journey — ' +
          'see the commodity-config interoperability investigation.'
      })
    }

    const commodityKey = request.query.commodity

    const commodityOptions = toSelectItems(
      extractCommodityOptions(refdata),
      commodityKey,
      'Select a commodity'
    )

    // If no commodity selected, show page with just the dropdown
    if (!commodityKey) {
      return h.view('explorer/commodity-config', {
        ...baseViewContext(journeyKey),
        commodityOptions,
        selectedCommodity: null
      })
    }

    // Resolve configuration for selected commodity
    const commodityConfig = resolveConfig(commodityKey)

    if (!commodityConfig) {
      return h.view('explorer/commodity-config', {
        ...baseViewContext(journeyKey),
        commodityOptions,
        selectedCommodity: commodityKey,
        error: `No configuration found for commodity: ${commodityKey}`
      })
    }

    // Split commodity key for display
    const { commodityID, speciesName } = parseCommodityKey(commodityKey)

    // Annotate values with variance metadata
    const annotatedPurposes = annotateValues(
      commodityConfig.purposeValues,
      variance.purposeFrequency,
      variance.totalCommodities
    )
    const annotatedIdentifiers = annotateValues(
      commodityConfig.identifierValues,
      variance.identifierFrequency,
      variance.totalCommodities
    )
    // Transform routing flags into simple table rows
    const routingFlagRows = [
      {
        label: 'CPH Number',
        value: commodityConfig.routing.cph_number
      },
      {
        label: 'Permanent Address',
        value: commodityConfig.routing.permanent_address
      },
      {
        label: 'Transporter Address',
        value: commodityConfig.routing.transporter_address
      }
    ].map((flag) => [
      { text: flag.label },
      {
        html: flag.value
          ? '<strong class="govuk-tag govuk-tag--green">Enabled</strong>'
          : '<strong class="govuk-tag govuk-tag--grey">Disabled</strong>'
      }
    ])

    // Compute absent values (in superset but not in this commodity)
    const absentPurposes = computeAbsentValues(
      variance.purposeSuperset,
      commodityConfig.purposeValues,
      variance.purposeFrequency
    )
    const absentIdentifiers = computeAbsentValues(
      variance.identifierSuperset,
      commodityConfig.identifierValues,
      variance.identifierFrequency
    )

    return h.view('explorer/commodity-config', {
      ...baseViewContext(journeyKey),
      commodityOptions,
      selectedCommodity: commodityKey,
      commodityID,
      speciesName: speciesName || '(no species specified)',
      purposeSetName: commodityConfig.purposeSetName,
      purposeCount: commodityConfig.purposeValues.length,
      purposeTotal: variance.purposeSuperset.size,
      purposes: annotatedPurposes,
      absentPurposes,
      identifierSetName: commodityConfig.identifierSetName,
      identifierCount: commodityConfig.identifierValues.length,
      identifierTotal: variance.identifierSuperset.size,
      identifiers: annotatedIdentifiers,
      absentIdentifiers,
      routingFlagRows,
      quantityType: commodityConfig.quantityType,
      totalCommodities: variance.totalCommodities
    })
  }
}
