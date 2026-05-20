/**
 * Canonical obligation evaluation.
 *
 * Public engine surface — owns the protocol.md §5.1 contract:
 *
 *   evaluate(notification, adapter) → EvaluationResult
 *
 * Pure: schema-specific knowledge lives in `adapter.journeyResolver`
 * (facts, tests, submissionDatePath). The evaluator itself is generic
 * and knows nothing about any particular notification shape.
 */
import { OBLIGATION_STATUS } from './types.js'
import { resolvePath, isEmpty } from './path.js'

const isNonNullObject = (value) =>
  value !== null && typeof value === 'object'

/**
 * Evaluate all obligations against the current notification state.
 *
 * @param {object} notification
 * @param {import('./types.js').JourneyAdapter} adapter
 * @returns {import('./types.js').EvaluationResult}
 */
export const evaluate = (notification, adapter) => {
  if (!isNonNullObject(notification)) {
    throw new Error('notification must be a non-null object')
  }
  if (!isNonNullObject(adapter)) {
    throw new Error('adapter must be a non-null object')
  }
  if (!Array.isArray(adapter.obligations)) {
    throw new Error('adapter.obligations must be an array')
  }

  const { obligations, refdata, journeyResolver } = adapter

  const evaluated = obligations.map((obligation) =>
    evaluateOne(obligation, notification, refdata, journeyResolver)
  )

  return {
    obligations: evaluated,
    summary: calculateSummary(evaluated)
  }
}

const evaluateOne = (obligation, notification, refdata, journeyResolver) => {
  const { id, condition, schemaPaths } = obligation

  if (condition) {
    const conditional = resolveCondition(
      id,
      condition,
      notification,
      refdata,
      journeyResolver
    )
    if (conditional) return conditional
  }

  return evaluateSatisfaction(id, schemaPaths, notification, journeyResolver)
}

/**
 * Resolve a conditional obligation's activation.
 *
 * Returns a terminal result (deferred / inactive) when the condition
 * short-circuits, or `null` to indicate the obligation is active and
 * should proceed to satisfaction.
 */
const resolveCondition = (id, condition, notification, refdata, journeyResolver) => {
  const { fact, test } = condition

  const factExtractor = journeyResolver.facts[fact]
  if (!factExtractor) {
    throw new Error(
      `Obligation "${id}" references unknown fact: "${fact}"`
    )
  }

  const factValue = factExtractor(notification)
  if (factValue === null || factValue === undefined) {
    return {
      id,
      status: OBLIGATION_STATUS.DEFERRED,
      reason: `${fact} not yet provided`
    }
  }

  const testFn = journeyResolver.tests[test]
  if (!testFn) {
    throw new Error(
      `Obligation "${id}" references unknown test: "${test}"`
    )
  }

  const resolution = testFn(factValue, refdata)
  if (!resolution.active) {
    return { id, status: OBLIGATION_STATUS.INACTIVE, reason: resolution.reason }
  }

  return null
}

/**
 * Check whether an obligation's schema paths are all populated. For
 * action-only obligations (empty schemaPaths) the submission date acts
 * as the satisfaction signal.
 */
const evaluateSatisfaction = (id, schemaPaths, notification, journeyResolver) => {
  if (!schemaPaths || schemaPaths.length === 0) {
    const submissionDate = resolvePath(
      notification,
      journeyResolver.submissionDatePath
    )
    const status = isEmpty(submissionDate)
      ? OBLIGATION_STATUS.UNSATISFIED
      : OBLIGATION_STATUS.SATISFIED
    return { id, status, missingPaths: [] }
  }

  const missingPaths = schemaPaths.filter((path) =>
    isEmpty(resolvePath(notification, path))
  )

  return {
    id,
    status:
      missingPaths.length === 0
        ? OBLIGATION_STATUS.SATISFIED
        : OBLIGATION_STATUS.UNSATISFIED,
    missingPaths
  }
}

/**
 * Aggregate per-obligation results into a Summary per protocol.md §5.1.
 *
 * Invariants:
 *   satisfied + unsatisfied + deferred + inactive === total
 *   submittable === (unsatisfied === 0 && deferred === 0)
 *     ↳ equivalently: every obligation is SATISFIED or INACTIVE.
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
