/**
 * Obligation evaluation runtime.
 *
 * Pure function: (notification, obligations, refdata) -> obligationState
 *
 * Evaluates each obligation against the current notification state,
 * resolving conditional obligations via the fact/test contract and refdata,
 * and checking satisfaction by verifying schema paths have non-empty values.
 */

// ---------------------------------------------------------------------------
// Fact extractors — the condition contract's "read" side
// ---------------------------------------------------------------------------

const facts = {
  purposeGroup: (notification) =>
  notification?.partOne?.purpose?.purposeGroup ?? null,

  commodity: (notification) => {
    const c = notification?.partOne?.commodities?.commodityComplement?.[0]
    return c?.commodityID ? c : null
  }
}

// ---------------------------------------------------------------------------
// Path resolution helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a dot-path (with optional [] array markers) against a notification
 * object. Returns the value at the path, or undefined if any segment is
 * missing.
 *
 * Array paths: a segment ending with [] means "look inside each array element
 * for the remaining path". We check whether the array has at least one element
 * where the remaining path is non-empty.
 */
const resolvePath = (obj, path) => {
  // Strip leading "notification." prefix — the object IS the notification
  const stripped = path.startsWith('notification.')
    ? path.slice('notification.'.length)
    : path

  const segments = stripped.split('.')
  let current = obj

  for (let i = 0; i < segments.length; i++) {
    if (current == null) return undefined

    const seg = segments[i]

    // Handle array marker: "foo[]"
    if (seg.endsWith('[]')) {
      const key = seg.slice(0, -2)
      const arr = current[key]
      if (!Array.isArray(arr) || arr.length === 0) return undefined

      // If this is the last segment, return the array itself
      const remaining = segments.slice(i + 1)
      if (remaining.length === 0) return arr

      // Check if at least one array element has a non-empty value at the
      // remaining path
      const remainingPath = remaining.join('.')
      const values = arr.map((item) => resolvePath(item, remainingPath))
      const hasValue = values.some((v) => !isEmpty(v))
      return hasValue ? values.find((v) => !isEmpty(v)) : undefined
    }

    current = current[seg]
  }

  return current
}

/**
 * Check if a value is "empty" per the spec rules:
 * - undefined, null -> empty
 * - "" -> empty
 * - [] -> empty
 * - {} (no populated fields) -> empty
 * - false is NOT empty (boolean false is a valid value)
 */
const isEmpty = (value) => {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value === ''
  if (typeof value === 'boolean') return false // false is a valid value
  if (typeof value === 'number') return false
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    return Object.keys(value).length === 0
  }
  return false
}

// ---------------------------------------------------------------------------
// Refdata key resolution (internal — never referenced by obligations)
// ---------------------------------------------------------------------------

const buildRefdataKey = (commodity) => {
  const code = commodity.commodityID
  const species = commodity.speciesName ?? ''
  return `${code}|${species}`
}

const lookupRefdata = (table, commodity) => {
  const exactKey = buildRefdataKey(commodity)
  if (table[exactKey]) return table[exactKey]
  const fallbackKey = `${commodity.commodityID}|`
  return table[fallbackKey] ?? null
}

// ---------------------------------------------------------------------------
// Test implementations — the condition contract's "evaluate" side
// ---------------------------------------------------------------------------

const TRANSIT_PURPOSES = [
  'For Transhipment to',
  'For Transit to 3rd Country'
]

const IDENTIFIER_NONE = 'NONE'

const tests = {
  isTransit: (purposeGroup, _refdata) => ({
    active: TRANSIT_PURPOSES.includes(purposeGroup),
    reason: TRANSIT_PURPOSES.includes(purposeGroup)
      ? `purposeGroup "${purposeGroup}" is a transit purpose`
      : `purposeGroup "${purposeGroup}" is not a transit purpose`
  }),

  requiresIdentification: (commodity, refdata) => {
    const content = lookupRefdata(refdata.content, commodity)
    if (!content) return { active: false, reason: 'no refdata content for commodity' }
    const idRef = content.identifiers
    const idSet = refdata.definitions?.identifier_sets?.[idRef]
    if (!idSet) return { active: false, reason: `identifier set ${idRef} not found` }
    const isNone = idSet.length === 1 && idSet[0] === IDENTIFIER_NONE
    return {
      active: !isNone,
      reason: isNone
        ? `identifier set ${idRef} is NONE`
        : `identifier set ${idRef} requires identification`
    }
  },

  requiresCertification: (commodity, refdata) => {
    const routing = lookupRefdata(refdata.routing, commodity)
    if (!routing) return { active: false, reason: 'no refdata routing for commodity' }
    const flag = routing.has_certified_as === true
    return {
      active: flag,
      reason: flag ? 'commodity requires certification' : 'commodity does not require certification'
    }
  },

  requiresWeaningStatus: (commodity, refdata) => {
    const routing = lookupRefdata(refdata.routing, commodity)
    if (!routing) return { active: false, reason: 'no refdata routing for commodity' }
    const flag = routing.has_unweaned === true
    return {
      active: flag,
      reason: flag ? 'commodity requires weaning status' : 'commodity does not require weaning status'
    }
  },

  requiresPermanentAddress: (commodity, refdata) => {
    const routing = lookupRefdata(refdata.routing, commodity)
    if (!routing) return { active: false, reason: 'no refdata routing for commodity' }
    return {
      active: routing.permanent_address === true,
      reason: routing.permanent_address
        ? 'commodity requires permanent address'
        : 'commodity does not require permanent address'
    }
  },

  requiresCphNumber: (commodity, refdata) => {
    const routing = lookupRefdata(refdata.routing, commodity)
    if (!routing) return { active: false, reason: 'no refdata routing for commodity' }
    return {
      active: routing.cph_number === true,
      reason: routing.cph_number
        ? 'commodity requires CPH number'
        : 'commodity does not require CPH number'
    }
  },

  requiresTransporter: (commodity, refdata) => {
    const routing = lookupRefdata(refdata.routing, commodity)
    if (!routing) return { active: false, reason: 'no refdata routing for commodity' }
    return {
      active: routing.transporter_address === true,
      reason: routing.transporter_address
        ? 'commodity requires transporter identification'
        : 'commodity does not require transporter identification'
    }
  }
}

// ---------------------------------------------------------------------------
// Main evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate all obligations against the current notification state.
 *
 * @param {object} notification - The notification object (fact store)
 * @param {Array} obligations - Array of obligation definitions
 * @param {object} refdata - Reference data (routing, content, definitions)
 * @returns {{ obligations: Array<{ id, status, missingPaths?, reason? }> }}
 */
const evaluateObligations = (notification, obligations, refdata) => {
  const evaluated = obligations.map((obligation) => {
    const { id, condition, schemaPaths } = obligation

    // --- Conditional obligations: resolve activation ---
    if (condition) {
      const { fact, test } = condition

      // Extract the fact
      const factExtractor = facts[fact]
      if (!factExtractor) {
        throw new Error(`Obligation "${id}" references unknown fact: "${fact}". Register it in the facts object.`)
      }
      const factValue = factExtractor(notification)

      // Fact absent → deferred
      if (factValue === null || factValue === undefined) {
        return { id, status: 'deferred', reason: `${fact} not yet provided` }
      }

      // Apply the test
      const testFn = tests[test]
      if (!testFn) {
        throw new Error(`Obligation "${id}" references unknown test: "${test}". Register it in the tests object.`)
      }
      const resolution = testFn(factValue, refdata)

      // Test failed → inactive
      if (!resolution.active) {
        return { id, status: 'inactive', reason: resolution.reason }
      }
    }

    // --- Unconditional, or condition passed: check satisfaction ---
    return evaluateSatisfaction(id, schemaPaths, notification)
  })

  return { obligations: evaluated }
}

/**
 * Check whether an obligation's schema paths are all populated.
 */
const evaluateSatisfaction = (id, schemaPaths, notification) => {
  // Action-only obligation (e.g. legal-declaration with empty schemaPaths)
  if (!schemaPaths || schemaPaths.length === 0) {
    // Check submission date as conventional satisfaction marker
    const submissionDate = notification?.partOne?.submissionDate
    if (!isEmpty(submissionDate)) {
      return { id, status: 'satisfied', missingPaths: [] }
    }
    return { id, status: 'unsatisfied', missingPaths: [] }
  }

  const missingPaths = schemaPaths.filter((path) => {
    const value = resolvePath(notification, path)
    return isEmpty(value)
  })

  return {
    id,
    status: missingPaths.length === 0 ? 'satisfied' : 'unsatisfied',
    missingPaths
  }
}

export {
  evaluateObligations,
  facts,
  tests,
  buildRefdataKey,
  lookupRefdata,
  resolvePath,
  isEmpty,
  TRANSIT_PURPOSES,
  IDENTIFIER_NONE
}
