/**
 * Traced obligation evaluation.
 *
 * Public engine surface — owns the protocol.md §5.2 contract:
 *
 *   evaluateWithTrace(notification, adapter) → EvaluationResult
 *
 * Same return shape as `evaluate` (§5.1) with a `trace: Trace` field added
 * to each EvaluatedObligation. Composes `evaluate` to obtain the canonical
 * statuses, then re-walks the obligations capturing step-by-step trace
 * metadata; throws on any traced/canonical status divergence (safety net).
 */
import { evaluate } from './evaluate.js'
import { resolvePath, isEmpty } from './path.js'
import { OBLIGATION_STATUS } from './types.js'

/**
 * @param {object} notification
 * @param {import('./types.js').JourneyAdapter} adapter
 * @returns {import('./types.js').EvaluationResult}
 */
export const evaluateWithTrace = (notification, adapter) => {
  const canonical = evaluate(notification, adapter)
  const { obligations, refdata, journeyResolver } = adapter

  const canonicalById = new Map(canonical.obligations.map((o) => [o.id, o]))

  const traced = obligations.map((obligation) => {
    const result = traceObligation(obligation, notification, refdata, journeyResolver)
    assertEquivalence(canonicalById.get(obligation.id), result)
    return result
  })

  return { obligations: traced, summary: canonical.summary }
}

const traceObligation = (obligation, notification, refdata, journeyResolver) => {
  const { id, condition, schemaPaths } = obligation
  const steps = []
  const trace = condition
    ? { type: 'conditional', condition, steps }
    : { type: 'unconditional', steps }

  if (condition) {
    const conditionResult = traceCondition(
      id,
      condition,
      notification,
      refdata,
      journeyResolver,
      steps
    )
    if (conditionResult) return { ...conditionResult, trace }
  }

  return { ...traceSatisfaction(id, schemaPaths, notification, journeyResolver, steps), trace }
}

const traceCondition = (id, condition, notification, refdata, journeyResolver, steps) => {
  const { fact, test } = condition

  const factExtractor = journeyResolver.facts[fact]
  if (!factExtractor) {
    throw new Error(`Obligation "${id}" references unknown fact: "${fact}"`)
  }

  const factValue = factExtractor(notification)
  steps.push({ step: 'extract-fact', fact, value: factValue })

  if (factValue === null || factValue === undefined) {
    const reason = `${fact} not yet provided`
    steps.push({ step: 'deferred', reason })
    return { id, status: OBLIGATION_STATUS.DEFERRED, reason }
  }

  const testFn = journeyResolver.tests[test]
  if (!testFn) {
    throw new Error(`Obligation "${id}" references unknown test: "${test}"`)
  }

  const resolution = testFn(factValue, refdata)
  steps.push({ step: 'apply-test', test, result: resolution })

  if (!resolution.active) {
    const reason = resolution.reason
    steps.push({ step: 'inactive', reason })
    return { id, status: OBLIGATION_STATUS.INACTIVE, reason }
  }

  return null
}

const traceSatisfaction = (id, schemaPaths, notification, journeyResolver, steps) => {
  if (!schemaPaths || schemaPaths.length === 0) {
    const submissionDate = resolvePath(notification, journeyResolver.submissionDatePath)
    const satisfied = !isEmpty(submissionDate)
    steps.push({
      step: 'action-check',
      satisfied,
      reason: satisfied
        ? 'action completed (submission)'
        : 'action pending (no submission date)'
    })
    return {
      id,
      status: satisfied ? OBLIGATION_STATUS.SATISFIED : OBLIGATION_STATUS.UNSATISFIED,
      missingPaths: []
    }
  }

  const missingPaths = schemaPaths.filter((path) =>
    isEmpty(resolvePath(notification, path))
  )

  steps.push({
    step: 'satisfaction-check',
    paths: schemaPaths.length,
    missing: missingPaths.length,
    pathDetails: schemaPaths.map((path) => ({
      path,
      satisfied: !missingPaths.includes(path)
    }))
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

const assertEquivalence = (canonical, traced) => {
  if (canonical.status !== traced.status) {
    throw new Error(
      `Status mismatch for "${traced.id}": Traced: ${traced.status}, Canonical: ${canonical.status}`
    )
  }
}