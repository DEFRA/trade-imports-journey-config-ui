import { obligations, scenarios } from '../../journeys/eu-live-animals/index.js'

/**
 * Extract value from notification using dot-notation path.
 * For `foo[]` segments, ALWAYS takes the first array element.
 *
 * Distinct from `engine/path.js#resolvePath`: the engine scans every
 * array element for any non-empty match (it's answering "is the
 * obligation satisfied by ANY element?"). This helper is building a
 * representative example fragment for the debug panel, so it needs a
 * deterministic single-element pick. Do not consolidate.
 *
 * @param {Object} notification - Notification object
 * @param {string} path - Dot-notation path (e.g., "purpose.group")
 * @returns {*} - Value at path, or undefined if not found
 */
const getValueAtPath = (notification, path) => {
  const parts = path.split('.')
  let current = notification

  for (const part of parts) {
    if (part.endsWith('[]')) {
      // Array path - take first element
      const arrayKey = part.slice(0, -2)
      current = current?.[arrayKey]?.[0]
    } else {
      current = current?.[part]
    }

    if (current === undefined) {
      return undefined
    }
  }

  return current
}

/**
 * Set value in object using dot-notation path, creating nested objects as needed.
 * Handles array notation like "commodities[]".
 *
 * @param {Object} target - Target object to mutate
 * @param {string} path - Dot-notation path
 * @param {*} value - Value to set
 * @returns {void}
 */
const setValueAtPath = (target, path, value) => {
  const parts = path.split('.')
  let current = target

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]

    if (part.endsWith('[]')) {
      // Array path - ensure array exists with at least one object
      const arrayKey = part.slice(0, -2)
      if (!current[arrayKey]) {
        current[arrayKey] = [{}]
      } else if (!Array.isArray(current[arrayKey])) {
        current[arrayKey] = [{}]
      } else if (current[arrayKey].length === 0) {
        current[arrayKey].push({})
      }
      current = current[arrayKey][0]
    } else {
      if (!current[part]) {
        current[part] = {}
      }
      current = current[part]
    }
  }

  const lastPart = parts[parts.length - 1]
  if (lastPart.endsWith('[]')) {
    const arrayKey = lastPart.slice(0, -2)
    current[arrayKey] = Array.isArray(value) ? value : [value]
  } else {
    current[lastPart] = value
  }
}

/**
 * Generate minimal notification fragments for all obligations.
 * For each obligation, extracts the minimal JSON fragment from a representative scenario.
 *
 * @returns {Object} - Map of obligation ID to { fragment, note? }
 */
export const generateObligationFragments = () => {
  const fragments = {}

  // Use import-cattle as the default scenario (most complete)
  const defaultScenario = scenarios['import-cattle']?.notification

  if (!defaultScenario) {
    throw new Error('import-cattle scenario not found')
  }

  for (const obligation of obligations) {
    const { id, schemaPaths } = obligation

    if (!schemaPaths || schemaPaths.length === 0) {
      // No schema paths (e.g., legal-declaration)
      fragments[id] = {
        fragment: {},
        note: 'This obligation has no schema paths defined.'
      }
      continue
    }

    // Build minimal fragment by extracting values for all schema paths.
    // The defensive prefix-strip handles any path still carrying the
    // legacy `notification.` prefix; new-shape paths have none.
    const fragment = {}
    const PREFIX = 'notification.'

    for (const schemaPath of schemaPaths) {
      const relativePath = schemaPath.startsWith(PREFIX)
        ? schemaPath.slice(PREFIX.length)
        : schemaPath
      const value = getValueAtPath(defaultScenario, relativePath)

      if (value !== undefined) {
        setValueAtPath(fragment, relativePath, value)
      }
    }

    // Check if fragment is empty (no values found)
    const isEmpty = Object.keys(fragment).length === 0

    if (isEmpty) {
      fragments[id] = {
        fragment: {},
        note: `No matching data in import-cattle scenario for paths: ${schemaPaths.join(', ')}`
      }
    } else {
      fragments[id] = {
        fragment
      }
    }
  }

  return fragments
}
