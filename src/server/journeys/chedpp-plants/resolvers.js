/**
 * CHEDPP (plants) journey resolvers.
 *
 * Schema-specific fact extractors and condition tests for the
 * chedpp-plants notification structure (see
 * `features/notification-shape/01-target-shape.md`) and the normalised
 * plants refdata (see `features/journey-switching/plants-refdata-model.md`).
 *
 * These functions know how to navigate the notification shape AND the
 * two-grain refdata structure (`commodities` + `species`). No other
 * module should contain this knowledge.
 */

// ---------------------------------------------------------------------------
// Fact extractors
// ---------------------------------------------------------------------------

const facts = {
  purposeGroup: (notification) => notification?.purpose?.group ?? null,

  commodity: (notification) => {
    // Preserves the single-commodity routing semantic: routing flags
    // are driven by the first commodity only. Multi-commodity routing
    // is a separate, deferred piece of work.
    const c = notification?.commodities?.[0]
    return c?.id ? c : null
  }
}

// ---------------------------------------------------------------------------
// Refdata key construction
// ---------------------------------------------------------------------------

/**
 * Build refdata lookup key from a commodity.
 *
 * CHEDPP uses commodityCode|eppoCode. The eppoCode is the EPPO plant
 * identifier and lives under `commodity.species.eppoCode` per the
 * notification shape.
 */
const buildRefdataKey = (commodity) => {
  const code = commodity.id
  const eppo = commodity.species?.eppoCode ?? ''
  return `${code}|${eppo}`
}

/**
 * Read-time merge over the two-grain refdata: reconstruct the
 * per-commodity routing object that the condition tests below consume.
 *
 * Species-grain fields (`varieties`) come from
 * `refdata.species[code|eppo]` if present. Commodity-grain flags
 * (`requires_test_and_trial`, `requires_finished_or_propagated`,
 * `propagation`) come from `refdata.commodities[code]`.
 *
 * For PHSI-only commodities the species row is absent: the lookup falls
 * back to the commodity entry only, with all species-derived booleans
 * false.
 *
 * `has_varieties` and `requires_billing` are derived at read time.
 * `requiresGmsDeclaration` reads the species record directly (see below):
 * the predicate is `regulatory_authority === 'HMI' && marketing_standard
 * === 'GMS'` per the verified IPAFFS rule — no stored flag.
 *
 * Returns null when neither a species nor a commodity entry exists.
 */
const lookupRouting = (refdata, commodity) => {
  const code = commodity.id
  const sp = refdata.species[buildRefdataKey(commodity)]
  const com = refdata.commodities[code]
  if (!sp && !com) return null
  return {
    has_varieties: (sp?.varieties?.length ?? 0) > 0,
    requires_finished_or_propagated:
      com?.requires_finished_or_propagated ?? false,
    requires_test_and_trial: com?.requires_test_and_trial ?? false,
    propagation: com?.propagation ?? null,
    requires_billing: sp != null
  }
}

/**
 * Look up the species record directly (or null when absent).
 * `requiresGmsDeclaration` reads it for `regulatory_authority` and
 * `marketing_standard`.
 */
const lookupSpecies = (refdata, commodity) =>
  refdata.species[buildRefdataKey(commodity)] ?? null

// ---------------------------------------------------------------------------
// Condition tests
// ---------------------------------------------------------------------------

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

  requiresGmsDeclaration: (commodity, refdata) => {
    // Verified IPAFFS predicate (see
    // features/journey-switching/gms-declaration-rule-investigation.md):
    // require the GMS declaration iff the species is HMI-inspected AND
    // covered by the General Marketing Standards. Read straight from
    // the species record — no stored flag.
    const sp = lookupSpecies(refdata, commodity)
    const active =
      sp?.regulatory_authority === 'HMI' && sp?.marketing_standard === 'GMS'
    return {
      active,
      reason: active
        ? 'HMI-inspected species with GMS marketing standard'
        : 'species is not HMI+GMS (no GMS declaration required)'
    }
  },

  requiresVarietyClass: (commodity, refdata) => {
    const routing = lookupRouting(refdata, commodity)
    if (!routing) {
      return { active: false, reason: 'no refdata routing for commodity' }
    }
    return {
      active: routing.has_varieties === true,
      reason: routing.has_varieties
        ? 'commodity species has registered varieties'
        : 'commodity species has no registered varieties'
    }
  },

  requiresFinishedOrPropagated: (commodity, refdata) => {
    const routing = lookupRouting(refdata, commodity)
    if (!routing) {
      return { active: false, reason: 'no refdata routing for commodity' }
    }
    return {
      active: routing.requires_finished_or_propagated === true,
      reason: routing.requires_finished_or_propagated
        ? 'commodity requires finished-or-propagated classification'
        : 'commodity does not require finished-or-propagated classification'
    }
  },

  requiresTestAndTrial: (commodity, refdata) => {
    const routing = lookupRouting(refdata, commodity)
    if (!routing) {
      return { active: false, reason: 'no refdata routing for commodity' }
    }
    return {
      active: routing.requires_test_and_trial === true,
      reason: routing.requires_test_and_trial
        ? 'commodity requires test-and-trial data'
        : 'commodity does not require test-and-trial data'
    }
  },

  requiresIntendedUse: (commodity, refdata) => {
    const routing = lookupRouting(refdata, commodity)
    if (!routing) {
      return { active: false, reason: 'no refdata routing for commodity' }
    }
    const hasPropagation = routing.propagation != null
    return {
      active: hasPropagation,
      reason: hasPropagation
        ? `commodity has propagation type "${routing.propagation}" — intended use required`
        : 'commodity has no propagation attribute — intended use not required'
    }
  },

  requiresBilling: (commodity, refdata) => {
    const routing = lookupRouting(refdata, commodity)
    if (!routing) {
      return { active: false, reason: 'no refdata routing for commodity' }
    }
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

const submissionDatePath = 'submittedAt'

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const resolvers = { facts, tests, submissionDatePath }

export {
  facts,
  tests,
  buildRefdataKey,
  lookupRouting,
  lookupSpecies,
  TRANSIT_PURPOSES,
  TRANSHIPMENT_PURPOSES
}
