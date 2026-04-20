/**
 * Notification builder utilities.
 *
 * These functions live in the FRONTEND package — they write to the notification
 * object. The evaluation engine (obligation-analysis-pipeline) is read-only
 * and must never be modified to include write logic.
 */

/**
 * Set a value at a dot-path in a nested object, creating intermediate
 * objects/arrays as needed. Mutates and returns the object.
 *
 * Supports array index notation: "foo[0].bar" creates foo as an array.
 *
 * @param {Object} obj - The object to mutate
 * @param {string} path - Dot-separated path (e.g., "partOne.commodities.countryOfOrigin")
 * @param {*} value - Value to set
 * @returns {Object} The mutated object
 */
export const setPath = (obj, path, value) => {
  const segments = path.split('.')
  let current = obj

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]
    const match = seg.match(/^(.+)\[(\d+)\]$/)

    if (match) {
      const [, key, idx] = match
      if (!current[key]) current[key] = []
      if (!current[key][idx]) current[key][idx] = {}
      current = current[key][idx]
    } else {
      if (!current[seg] || typeof current[seg] !== 'object') {
        current[seg] = {}
      }
      current = current[seg]
    }
  }

  // Handle array index on the final segment
  const lastSeg = segments[segments.length - 1]
  const lastMatch = lastSeg.match(/^(.+)\[(\d+)\]$/)

  if (lastMatch) {
    const [, key, idx] = lastMatch
    if (!current[key]) current[key] = []
    current[key][idx] = value
  } else {
    current[lastSeg] = value
  }

  return obj
}

/**
 * Apply form field values to a notification object using the field-path mapping.
 *
 * Skips fields not in the mapping and empty string values.
 * Mutates the notification in place.
 *
 * @param {Object} notification - The notification object to mutate
 * @param {Object} formData - Form field values keyed by fieldName
 * @param {Object} mapping - fieldName → notification path mapping
 * @returns {Object} The mutated notification
 */
export const applyFormFields = (notification, formData, mapping) => {
  for (const [fieldName, value] of Object.entries(formData)) {
    const path = mapping[fieldName]
    if (!path) continue
    if (value === '' || value === undefined || value === null) continue
    setPath(notification, path, value)
  }
  return notification
}
