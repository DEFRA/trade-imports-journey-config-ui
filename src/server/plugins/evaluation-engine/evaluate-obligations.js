/**
 * Obligation evaluation runtime.
 *
 * Pure function:
 *   (notification, obligations, refdata, resolvers) -> obligationState
 *
 * Generic loop — knows nothing about any particular notification schema.
 * All schema-specific work is delegated to the journey's `resolvers`
 * (facts, tests, submissionDatePath).
 */
import { OBLIGATION_STATUS } from '../../engine/types.js'

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
  if (typeof value === 'boolean') return false
  if (typeof value === 'number') return false
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    return Object.keys(value).length === 0
  }
  return false
}

// ---------------------------------------------------------------------------
// Main evaluation
// ---------------------------------------------------------------------------

/**
 * Reduce evaluated obligations to a Summary per protocol.md §5.1.
 *
 * Invariants:
 *   satisfied + unsatisfied + deferred + inactive === total
 *   submittable === (unsatisfied === 0 && deferred === 0)
 *
 * Mirrored verbatim from trace-evaluate-obligations.js so the two
 * evaluator paths produce identical summaries for the same inputs.
 * Story 04 (engine/evaluate.js) consolidates the calculation into one
 * shared source.
 */
const calculateSummary = (obligations) => {
  const counts = obligations.reduce(
    (acc, o) => {
      acc[o.status]++
      return acc
    },
    {
      [OBLIGATION_STATUS.SATISFIED]: 0,
      [OBLIGATION_STATUS.UNSATISFIED]: 0,
      [OBLIGATION_STATUS.DEFERRED]: 0,
      [OBLIGATION_STATUS.INACTIVE]: 0
    }
  )

  const submittable = obligations.every(
    (o) =>
      o.status === OBLIGATION_STATUS.SATISFIED ||
      o.status === OBLIGATION_STATUS.INACTIVE
  )

  return {
    ...counts,
    total: obligations.length,
    submittable
  }
}

/**
 * Evaluate all obligations against the current notification state.
 *
 * @param {object} notification - The notification object (fact store)
 * @param {Array} obligations - Array of obligation definitions
 * @param {object} refdata - Reference data (journey-specific shape)
 * @param {object} resolvers - { facts, tests, submissionDatePath }
 * @returns {{ obligations: Array<{ id, status, missingPaths?, reason? }>, summary: Summary }}
 */
const evaluateObligations = (notification, obligations, refdata, resolvers) => {
  const evaluated = obligations.map((obligation) => {
    const { id, condition, schemaPaths } = obligation

    // --- Conditional obligations: resolve activation ---
    if (condition) {
      const { fact, test } = condition

      // Extract the fact
      const factExtractor = resolvers.facts[fact]
      if (!factExtractor) {
        throw new Error(`Obligation "${id}" references unknown fact: "${fact}". Register it in the facts object.`)
      }
      const factValue = factExtractor(notification)

      // Fact absent → deferred
      if (factValue === null || factValue === undefined) {
        return { id, status: OBLIGATION_STATUS.DEFERRED, reason: `${fact} not yet provided` }
      }

      // Apply the test
      const testFn = resolvers.tests[test]
      if (!testFn) {
        throw new Error(`Obligation "${id}" references unknown test: "${test}". Register it in the tests object.`)
      }
      const resolution = testFn(factValue, refdata)

      // Test failed → inactive
      if (!resolution.active) {
        return { id, status: OBLIGATION_STATUS.INACTIVE, reason: resolution.reason }
      }
    }

    // --- Unconditional, or condition passed: check satisfaction ---
    return evaluateSatisfaction(id, schemaPaths, notification, resolvers)
  })

  const summary = calculateSummary(evaluated)
  return { obligations: evaluated, summary }
}

/**
 * Check whether an obligation's schema paths are all populated.
 */
const evaluateSatisfaction = (id, schemaPaths, notification, resolvers) => {
  // Action-only obligation (e.g. legal-declaration with empty schemaPaths)
  if (!schemaPaths || schemaPaths.length === 0) {
    const submissionDate = resolvePath(notification, resolvers.submissionDatePath)
    if (!isEmpty(submissionDate)) {
      return { id, status: OBLIGATION_STATUS.SATISFIED, missingPaths: [] }
    }
    return { id, status: OBLIGATION_STATUS.UNSATISFIED, missingPaths: [] }
  }

  const missingPaths = schemaPaths.filter((path) => {
    const value = resolvePath(notification, path)
    return isEmpty(value)
  })

  return {
    id,
    status:
      missingPaths.length === 0
        ? OBLIGATION_STATUS.SATISFIED
        : OBLIGATION_STATUS.UNSATISFIED,
    missingPaths
  }
}

export { evaluateObligations, resolvePath, isEmpty }
