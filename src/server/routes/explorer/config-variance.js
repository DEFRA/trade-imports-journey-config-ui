/**
 * Variance computation for commodity-config refdata views.
 *
 * Generic across journeys: the caller supplies an array of variance
 * dimensions (each with an `id` and a `valuesFor(commodityKey)` function)
 * plus the journey's refdata + commodity keys; this module accumulates
 * frequency and superset for every dimension without knowing what
 * "purpose" or "marketing standard" means.
 *
 * The classification (`common` / `specific`) and the per-commodity
 * include/exclude helpers were already journey-agnostic and stay
 * unchanged.
 */

/**
 * Compute variance statistics for the supplied dimensions across all
 * commodities. Each dimension closes over its own refdata, so this
 * function only needs the dimension descriptors plus the key list.
 *
 * @param {Array<{ id: string, valuesFor: (commodityKey: string) => string[] }>} dimensions
 * @param {string[]} commodityKeys - The keys to iterate (the journey
 *   decides what counts as a "commodity" — species keys, fallback
 *   keys, etc.).
 * @returns {{ totalCommodities: number, byDimension: Object<string, { superset: Set<string>, frequency: Map<string, number> }> }}
 */
export const computeVariance = (dimensions, commodityKeys) => {
  const byDimension = {}
  for (const dimension of dimensions) {
    byDimension[dimension.id] = {
      superset: new Set(),
      frequency: new Map()
    }
  }

  for (const key of commodityKeys) {
    for (const dimension of dimensions) {
      const values = dimension.valuesFor(key)
      const bucket = byDimension[dimension.id]
      for (const value of values) {
        bucket.superset.add(value)
        bucket.frequency.set(value, (bucket.frequency.get(value) || 0) + 1)
      }
    }
  }

  return {
    totalCommodities: commodityKeys.length,
    byDimension
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
 * Annotate a list of values with frequency and common/specific
 * classification. Generic — used per-dimension.
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
