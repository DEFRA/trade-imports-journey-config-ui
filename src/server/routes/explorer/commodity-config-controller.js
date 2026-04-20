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
 * GET /explorer/commodity-config handler
 *
 * Renders the commodity configuration viewer page.
 * Shows routing flags, purpose options, identifiers, and quantity type
 * for a selected commodity, with visual indicators for common vs specific values.
 */
export const commodityConfigController = {
  handler(request, h) {
    const commodityKey = request.query.commodity

    const commodityOptions = toSelectItems(
      extractCommodityOptions(refdata),
      commodityKey,
      'Select a commodity'
    )

    // If no commodity selected, show page with just the dropdown
    if (!commodityKey) {
      return h.view('explorer/commodity-config', {
        pageTitle: 'Commodity Configuration',
        heading: 'Commodity Reference Data Configuration',
        currentPage: 'commodity-config',
        commodityOptions,
        selectedCommodity: null
      })
    }

    // Resolve configuration for selected commodity
    const config = resolveConfig(commodityKey)

    if (!config) {
      return h.view('explorer/commodity-config', {
        pageTitle: 'Commodity Configuration',
        heading: 'Commodity Reference Data Configuration',
        currentPage: 'commodity-config',
        commodityOptions,
        selectedCommodity: commodityKey,
        error: `No configuration found for commodity: ${commodityKey}`
      })
    }

    // Split commodity key for display
    const { commodityID, speciesName } = parseCommodityKey(commodityKey)

    // Annotate values with variance metadata
    const annotatedPurposes = annotateValues(
      config.purposeValues,
      variance.purposeFrequency,
      variance.totalCommodities
    )
    const annotatedIdentifiers = annotateValues(
      config.identifierValues,
      variance.identifierFrequency,
      variance.totalCommodities
    )
    // Transform routing flags into simple table rows
    const routingFlagRows = [
      {
        label: 'CPH Number',
        value: config.routing.cph_number
      },
      {
        label: 'Permanent Address',
        value: config.routing.permanent_address
      },
      {
        label: 'Transporter Address',
        value: config.routing.transporter_address
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
      config.purposeValues,
      variance.purposeFrequency
    )
    const absentIdentifiers = computeAbsentValues(
      variance.identifierSuperset,
      config.identifierValues,
      variance.identifierFrequency
    )

    return h.view('explorer/commodity-config', {
      pageTitle: 'Commodity Configuration',
      heading: 'Commodity Reference Data Configuration',
      currentPage: 'commodity-config',
      commodityOptions,
      selectedCommodity: commodityKey,
      commodityID,
      speciesName: speciesName || '(no species specified)',
      purposeSetName: config.purposeSetName,
      purposeCount: config.purposeValues.length,
      purposeTotal: variance.purposeSuperset.size,
      purposes: annotatedPurposes,
      absentPurposes,
      identifierSetName: config.identifierSetName,
      identifierCount: config.identifierValues.length,
      identifierTotal: variance.identifierSuperset.size,
      identifiers: annotatedIdentifiers,
      absentIdentifiers,
      routingFlagRows,
      quantityType: config.quantityType,
      totalCommodities: variance.totalCommodities
    })
  }
}
