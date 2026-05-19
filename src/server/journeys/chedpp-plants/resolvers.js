/**
 * CHEDPP (plants) journey resolvers.
 *
 * Schema-specific fact extractors and condition tests for the IPAFFS
 * notification structure (notification.partOne.* shape).
 *
 * These functions know how to navigate the IPAFFS notification schema
 * and the chedpp-plants refdata structure. No other module should
 * contain this knowledge.
 */

// ---------------------------------------------------------------------------
// Fact extractors
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
// Refdata key construction
// ---------------------------------------------------------------------------

/**
 * Build refdata lookup key from a commodity complement.
 *
 * CHEDPP uses commodityCode|eppoCode (parallel to EU live animals'
 * commodityID|speciesName). The eppoCode is the EPPO plant identifier.
 */
const buildRefdataKey = (commodity) => {
  const code = commodity.commodityID
  const eppo = commodity.eppoCode ?? ''
  return `${code}|${eppo}`
}

/**
 * Look up a value in a refdata table by commodity.
 *
 * Tries the exact key (commodityCode|eppoCode) first.
 * Falls back to commodity-only key (commodityCode|) for flags
 * that don't vary by species — e.g. requiresFinishedOrPropagated,
 * requiresTestAndTrial, propagation.
 */
const lookupRefdata = (table, commodity) => {
  const exactKey = buildRefdataKey(commodity)
  if (table[exactKey]) return table[exactKey]
  const fallbackKey = `${commodity.commodityID}|`
  return table[fallbackKey] ?? null
}

// ---------------------------------------------------------------------------
// Condition tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Test composition
// ---------------------------------------------------------------------------

/**
 * Compose two test functions with OR semantics.
 * Returns the first active result, or the last inactive result.
 */
const or = (testA, testB) => (factValue, refdata) => {
  const a = testA(factValue, refdata)
  if (a.active) return a
  const b = testB(factValue, refdata)
  if (b.active) return b
  return { active: false, reason: `${a.reason}; ${b.reason}` }
}

// ---------------------------------------------------------------------------
// Purpose predicates
// ---------------------------------------------------------------------------

const TRANSIT_PURPOSES = ['For Transit to 3rd Country']
const TRANSHIPMENT_PURPOSES = ['For Transhipment to']

const isTransit = (purposeGroup, _refdata) => ({
  active: TRANSIT_PURPOSES.includes(purposeGroup),
  reason: TRANSIT_PURPOSES.includes(purposeGroup)
    ? `purposeGroup "${purposeGroup}" is a transit purpose`
    : `purposeGroup "${purposeGroup}" is not a transit purpose`
})

const isTranshipment = (purposeGroup, _refdata) => ({
  active: TRANSHIPMENT_PURPOSES.includes(purposeGroup),
  reason: TRANSHIPMENT_PURPOSES.includes(purposeGroup)
    ? `purposeGroup "${purposeGroup}" is a transhipment purpose`
    : `purposeGroup "${purposeGroup}" is not a transhipment purpose`
})

const tests = {
  isTransit,
  isTranshipment,
  isTransitOrTranshipment: or(isTransit, isTranshipment),

  requiresGmsDeclaration: (commodity, refdata) => {
    const routing = lookupRefdata(refdata.routing, commodity)
    if (!routing) return { active: false, reason: 'no refdata routing for commodity' }
    return {
      active: routing.has_gms === true,
      reason: routing.has_gms
        ? 'commodity species requires GMS declaration (HMI + GMS marketing standard)'
        : 'commodity species does not require GMS declaration'
    }
  },

  requiresVarietyClass: (commodity, refdata) => {
    const routing = lookupRefdata(refdata.routing, commodity)
    if (!routing) return { active: false, reason: 'no refdata routing for commodity' }
    return {
      active: routing.has_varieties === true,
      reason: routing.has_varieties
        ? 'commodity species has registered varieties'
        : 'commodity species has no registered varieties'
    }
  },

  requiresFinishedOrPropagated: (commodity, refdata) => {
    const routing = lookupRefdata(refdata.routing, commodity)
    if (!routing) return { active: false, reason: 'no refdata routing for commodity' }
    return {
      active: routing.requires_finished_or_propagated === true,
      reason: routing.requires_finished_or_propagated
        ? 'commodity requires finished-or-propagated classification'
        : 'commodity does not require finished-or-propagated classification'
    }
  },

  requiresTestAndTrial: (commodity, refdata) => {
    const routing = lookupRefdata(refdata.routing, commodity)
    if (!routing) return { active: false, reason: 'no refdata routing for commodity' }
    return {
      active: routing.requires_test_and_trial === true,
      reason: routing.requires_test_and_trial
        ? 'commodity requires test-and-trial data'
        : 'commodity does not require test-and-trial data'
    }
  },

  requiresIntendedUse: (commodity, refdata) => {
    const routing = lookupRefdata(refdata.routing, commodity)
    if (!routing) return { active: false, reason: 'no refdata routing for commodity' }
    const hasPropagation = routing.propagation != null
    return {
      active: hasPropagation,
      reason: hasPropagation
        ? `commodity has propagation type "${routing.propagation}" — intended use required`
        : 'commodity has no propagation attribute — intended use not required'
    }
  },

  requiresBilling: (commodity, refdata) => {
    const routing = lookupRefdata(refdata.routing, commodity)
    if (!routing) return { active: false, reason: 'no refdata routing for commodity' }
    return {
      active: routing.requires_billing === true,
      reason: routing.requires_billing
        ? 'commodity requires billing information'
        : 'commodity does not require billing information'
    }
  }
}

// ---------------------------------------------------------------------------
// Submission date path
// ---------------------------------------------------------------------------

const submissionDatePath = 'notification.partOne.submissionDate'

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const resolvers = { facts, tests, submissionDatePath }

export {
  facts,
  tests,
  or,
  buildRefdataKey,
  lookupRefdata,
  TRANSIT_PURPOSES,
  TRANSHIPMENT_PURPOSES
}
