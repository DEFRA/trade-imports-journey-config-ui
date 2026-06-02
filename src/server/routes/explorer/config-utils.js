/**
 * Utility functions for commodity configuration
 *
 * This module provides helper functions for building notifications and extracting
 * commodity options from reference data.
 */

/**
 * Parse a commodity key into its constituent parts.
 *
 * Commodity keys are in the format "commodityID|speciesName" where speciesName
 * may be absent (just the pipe delimiter with no species).
 *
 * @param {string|null} commodityKey - Key in format "commodityID|speciesName" or null
 * @returns {{commodityID: string, speciesName: string}} Parsed components (empty strings if null)
 */
export const parseCommodityKey = (commodityKey) => {
  const [commodityID = '', speciesName = ''] = (commodityKey || '|').split('|')
  return { commodityID, speciesName }
}

/**
 * Build a minimal notification from purpose group, commodity key, and optional country.
 *
 * The minimal notification includes only the data needed for obligation evaluation:
 * - purposeGroup (drives transit/import conditional logic)
 * - commodity (drives species-specific routing flags)
 * - countryOfOrigin (drives consignment-origin obligation)
 *
 * @param {string} purposeGroup - Purpose group value (e.g., "For Import")
 * @param {string} commodityKey - Commodity key in format "commodityID|speciesName"
 * @param {string|null} [countryOfOrigin] - ISO 3166-1 alpha-2 country code
 * @returns {Object} Minimal notification structure
 */
export const buildMinimalNotification = (
  purposeGroup,
  commodityKey,
  countryOfOrigin = null
) => {
  const { commodityID, speciesName } = parseCommodityKey(commodityKey)

  const notification = {
    type: 'IMPv2',
    purpose: { group: purposeGroup },
    commodities: [
      {
        id: commodityID,
        species: { name: speciesName || undefined }
      }
    ]
  }

  if (countryOfOrigin) {
    notification.origin = { country: countryOfOrigin }
  }

  return notification
}

/**
 * Format a parsed commodity key as a human-readable label.
 *
 * Single source of truth for how commodities appear in dropdowns,
 * breadcrumbs, and headings across the application.
 *
 * @param {{commodityID: string, speciesName: string}} parsed - Output from parseCommodityKey
 * @returns {string} Display label (e.g. "0101 – Equus caballus" or "0101 (no species)")
 */
export const formatCommodityLabel = ({ commodityID, speciesName }) =>
  speciesName
    ? `${commodityID} – ${speciesName}`
    : `${commodityID} (no species)`

/**
 * Build commodity options from a list of commodity keys.
 *
 * Journey-aware: the journey adapter is responsible for deciding what
 * counts as a commodity for the dropdown (animals → routing keys; plants
 * → species keys + PHSI-only commodity-only entries). This helper just
 * formats and sorts.
 *
 * @param {string[]} commodityKeys - Keys (e.g. "code|eppo" or "code|")
 * @returns {Array<Object>} Commodity options for the dropdown
 */
export const extractCommodityOptions = (commodityKeys) =>
  commodityKeys
    .map((key) => {
      const parsed = parseCommodityKey(key)
      return { value: key, ...parsed, label: formatCommodityLabel(parsed) }
    })
    .sort((a, b) => a.label.localeCompare(b.label))

/**
 * Build Nunjucks govukSelect items from options list, with a placeholder
 * and the selected value pre-selected.
 *
 * @param {Array<{value: string, label: string}>} options
 * @param {string|null} selectedValue
 * @param {string} placeholder
 * @returns {Array<Object>} Items for govukSelect macro
 */
export const toSelectItems = (options, selectedValue, placeholder) => [
  { value: '', text: placeholder, selected: !selectedValue },
  ...options.map((opt) => ({
    value: opt.value,
    text: opt.label,
    selected: opt.value === selectedValue
  }))
]
