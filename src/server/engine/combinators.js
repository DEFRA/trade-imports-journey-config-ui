/**
 * Universal combinators over ConditionTest values.
 *
 * Public engine surface — owns the protocol.md §5.5 contract.
 *
 * Five higher-order functions that take ConditionTest values and
 * return a new ConditionTest. The engine treats the result as an
 * ordinary test. No imports — pure HOFs over the contract.
 *
 *   ConditionTest = (factValue, refdata) → { active, reason }
 */

/**
 * Disjunction. Evaluates tests left-to-right; on the first active
 * result, returns that result verbatim (object identity preserved).
 * If no test is active, returns a synthetic inactive result whose
 * reason joins every test's reason with `'; '`.
 *
 * @param {...import('./types.js').ConditionTest} tests
 * @returns {import('./types.js').ConditionTest}
 */
export const or = (...tests) => {
  if (tests.length === 0) {
    throw new Error('or/and requires at least one test')
  }
  return (factValue, refdata) => {
    const reasons = []
    for (const test of tests) {
      const result = test(factValue, refdata)
      if (result.active) return result
      reasons.push(result.reason)
    }
    return { active: false, reason: reasons.join('; ') }
  }
}

/**
 * Conjunction. Mirror of `or` for `active: false` short-circuit.
 *
 * @param {...import('./types.js').ConditionTest} tests
 * @returns {import('./types.js').ConditionTest}
 */
export const and = (...tests) => {
  if (tests.length === 0) {
    throw new Error('or/and requires at least one test')
  }
  return (factValue, refdata) => {
    const reasons = []
    for (const test of tests) {
      const result = test(factValue, refdata)
      if (!result.active) return result
      reasons.push(result.reason)
    }
    return { active: true, reason: reasons.join('; ') }
  }
}

/**
 * Negation. Inverts `active`; wraps `reason` as `not (<inner>)`.
 *
 * @param {import('./types.js').ConditionTest} test
 * @returns {import('./types.js').ConditionTest}
 */
export const not = (test) => {
  if (typeof test !== 'function') {
    throw new Error('not requires a ConditionTest')
  }
  return (factValue, refdata) => {
    const inner = test(factValue, refdata)
    return { active: !inner.active, reason: `not (${inner.reason})` }
  }
}

/**
 * Constant ConditionTest that is always active.
 *
 * @param {string} [reason='always active']
 * @returns {import('./types.js').ConditionTest}
 */
export const always =
  (reason = 'always active') =>
  () => ({
    active: true,
    reason
  })

/**
 * Constant ConditionTest that is always inactive.
 *
 * @param {string} [reason='always inactive']
 * @returns {import('./types.js').ConditionTest}
 */
export const never =
  (reason = 'always inactive') =>
  () => ({
    active: false,
    reason
  })
