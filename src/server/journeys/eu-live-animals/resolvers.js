/**
 * EU Live Animals journey resolvers.
 *
 * Schema-specific fact extractors and condition tests for the IPAFFS
 * notification structure (notification.partOne.* shape).
 *
 * These functions know how to navigate the IPAFFS notification schema
 * and the eu-live-animals refdata structure. No other module should
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
// Condition tests
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
  buildRefdataKey,
  lookupRefdata,
  TRANSIT_PURPOSES,
  IDENTIFIER_NONE
}
