/**
 * CHED-D (chedd-products) journey resolvers.
 *
 * Schema-specific fact extractors and condition tests for the CED
 * notification shape (see features/notification-shape/04-migrate-chedd-products.md).
 *
 * Single-grain: refdata is keyed by bare commodity code (CHED-D has no
 * species axis), so lookups use `commodity.id` raw — there is no
 * `${code}|species` key and no `${code}|` fallback (unlike
 * eu-live-animals, which keys on a second axis).
 */

// ---------------------------------------------------------------------------
// Fact extractors
// ---------------------------------------------------------------------------

const facts = {
  commodity: (notification) => {
    // Single-commodity routing semantic: routing flags are driven by the
    // first commodity only. Multi-commodity routing is deferred.
    const c = notification?.commodities?.[0]
    return c?.id ? c : null
  }
}

// ---------------------------------------------------------------------------
// Refdata lookup (bare commodity code — no pipe fallback)
// ---------------------------------------------------------------------------

const lookupRouting = (refdata, commodity) =>
  refdata.routing[commodity.id] ?? null

// ---------------------------------------------------------------------------
// Condition tests
// ---------------------------------------------------------------------------

const tests = {
  requiresInternalMarket: (commodity, refdata) => {
    const routing = lookupRouting(refdata, commodity)
    if (!routing) {
      return { active: false, reason: 'no refdata routing for commodity' }
    }
    const flag = routing.has_internal_market === true
    return {
      active: flag,
      reason: flag
        ? 'commodity is intended for the internal market'
        : 'commodity has no internal-market section (anomaly commodity)'
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

export { facts, tests, lookupRouting }
