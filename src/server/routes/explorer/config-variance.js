/**
 * Variance computation for commodity configuration refdata.
 *
 * Computes which values are common across all commodities vs specific to
 * particular commodity groups, enabling visual highlighting in the UI.
 */

/**
 * Compute variance statistics across all commodities in refdata.
 *
 * Returns frequency maps for purpose values, identifier values, and routing
 * flag majorities. These are used to visually distinguish common values from
 * commodity-specific ones.
 *
 * @param {Object} refdata - The eu-live-animals-refdata.json object
 * @returns {Object} Variance statistics
 */
export const computeVariance = (refdata) => {
  const { routing, content, definitions } = refdata
  const commodityKeys = Object.keys(content)
  const totalCommodities = commodityKeys.length

  // Compute purpose superset and frequency
  const purposeFrequency = new Map()
  const purposeSuperset = new Set()

  for (const key of commodityKeys) {
    const purposeSetName = content[key].purpose
    const purposeValues = definitions.purpose_sets[purposeSetName] || []

    for (const value of purposeValues) {
      purposeSuperset.add(value)
      purposeFrequency.set(value, (purposeFrequency.get(value) || 0) + 1)
    }
  }

  // Compute identifier superset and frequency
  const identifierFrequency = new Map()
  const identifierSuperset = new Set()

  for (const key of commodityKeys) {
    const identifierSetName = content[key].identifiers
    const identifierValues =
      definitions.identifier_sets[identifierSetName] || []

    for (const value of identifierValues) {
      identifierSuperset.add(value)
      identifierFrequency.set(value, (identifierFrequency.get(value) || 0) + 1)
    }
  }

  return {
    purposeSuperset,
    purposeFrequency,
    identifierSuperset,
    identifierFrequency,
    totalCommodities
  }
}

/**
 * Classify a value as common or specific based on its frequency.
 *
 * Common values appear in >= 30% of commodities.
 * Specific values appear in < 30% of commodities.
 *
 * @param {number} frequency - How many commodities include this value
 * @param {number} total - Total number of commodities
 * @returns {'common'|'specific'} Classification
 */
export const classifyValue = (frequency, total) => {
  const threshold = 0.3
  return frequency / total >= threshold ? 'common' : 'specific'
}

/**
 * Annotate a list of values with frequency and common/specific classification.
 *
 * Generic function used for both purpose values and identifier values.
 *
 * @param {Array<string>} values - Values for this commodity
 * @param {Map<string, number>} frequencyMap - Value → commodity count
 * @param {number} totalCommodities - Total commodity count for threshold calc
 * @returns {Array<Object>} Annotated values with classification
 */
export const annotateValues = (values, frequencyMap, totalCommodities) => {
  return values.map((value) => {
    const frequency = frequencyMap.get(value) || 0
    return {
      value,
      frequency,
      classification: classifyValue(frequency, totalCommodities)
    }
  })
}

/**
 * Compute values present in the superset but absent from the given list.
 *
 * @param {Set<string>} superset - All known values across all commodities
 * @param {Array<string>} included - Values present for this commodity
 * @param {Map<string, number>} frequencyMap - Value → commodity count
 * @returns {Array<Object>} Absent values with frequency
 */
export const computeAbsentValues = (superset, included, frequencyMap) => {
  const includedSet = new Set(included)
  return Array.from(superset)
    .filter((value) => !includedSet.has(value))
    .map((value) => ({
      value,
      frequency: frequencyMap.get(value) || 0
    }))
}

