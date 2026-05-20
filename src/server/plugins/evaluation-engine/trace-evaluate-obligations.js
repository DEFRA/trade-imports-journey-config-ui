/**
 * Trace evaluator for obligations.
 *
 * Wraps the canonical evaluateObligations function to capture step-by-step
 * reasoning about how each obligation's status was determined.
 *
 * Core contract:
 * - Traced statuses must match canonical statuses (assertion-based safety net)
 * - Each obligation gets a trace object with steps array
 * - Terminal step type must match final status
 * - Summary provides counts and submittable flag
 */

import { evaluateObligations } from './evaluate-obligations.js'
import { resolvePath, isEmpty } from '../../engine/path.js'
import { OBLIGATION_STATUS } from '../../engine/types.js'

// ---------------------------------------------------------------------------
// Module 1: Trace Step Builders (Pure Functions)
// ---------------------------------------------------------------------------

/**
 * Build a deferred step (terminal).
 */
const buildDeferredStep = (reason) => ({
  step: 'deferred',
  reason
})

/**
 * Build an inactive step (terminal).
 */
const buildInactiveStep = (reason) => ({
  step: 'inactive',
  reason
})

/**
 * Build a satisfaction check step (terminal).
 */
const buildSatisfactionStep = (schemaPaths, missingPaths) => ({
  step: 'satisfaction-check',
  paths: schemaPaths.length,
  missing: missingPaths.length,
  pathDetails: schemaPaths.map((path) => ({
    path,
    satisfied: !missingPaths.includes(path)
  }))
})

/**
 * Build an action check step (terminal) for action-only obligations.
 */
const buildActionCheckStep = (satisfied) => ({
  step: 'action-check',
  satisfied,
  reason: satisfied
    ? 'action completed (submission)'
    : 'action pending (no submission date)'
})

/**
 * Build an extract-fact step (informational).
 */
const buildExtractFactStep = (fact, value) => ({
  step: 'extract-fact',
  fact,
  value
})

/**
 * Build an apply-test step (informational).
 */
const buildApplyTestStep = (test, result) => ({
  step: 'apply-test',
  test,
  result
})

// ---------------------------------------------------------------------------
// Module 2: Single Obligation Tracer
// ---------------------------------------------------------------------------

/**
 * Re-evaluate one obligation while capturing trace steps.
 *
 * Returns a traced obligation result with status and trace metadata.
 */
const traceObligation = (obligation, notification, refdata, resolvers) => {
  const { id, condition, schemaPaths } = obligation
  const steps = []
  const trace = {
    type: condition ? 'conditional' : 'unconditional',
    ...(condition && { condition }),
    steps
  }

  // --- Conditional obligations: resolve activation ---
  if (condition) {
    const { fact, test } = condition

    // Extract the fact
    const factExtractor = resolvers.facts[fact]
    if (!factExtractor) {
      throw new Error(
        `Obligation "${id}" references unknown fact: "${fact}". Register it in the facts object.`
      )
    }
    const factValue = factExtractor(notification)
    steps.push(buildExtractFactStep(fact, factValue))

    // Fact absent → deferred
    if (factValue === null || factValue === undefined) {
      const reason = `${fact} not yet provided`
      steps.push(buildDeferredStep(reason))
      return { id, status: OBLIGATION_STATUS.DEFERRED, reason, trace }
    }

    // Apply the test
    const testFn = resolvers.tests[test]
    if (!testFn) {
      throw new Error(
        `Obligation "${id}" references unknown test: "${test}". Register it in the tests object.`
      )
    }
    const resolution = testFn(factValue, refdata)
    steps.push(buildApplyTestStep(test, resolution))

    // Test failed → inactive
    if (!resolution.active) {
      const reason = resolution.reason
      steps.push(buildInactiveStep(reason))
      return { id, status: OBLIGATION_STATUS.INACTIVE, reason, trace }
    }
  }

  // --- Unconditional, or condition passed: check satisfaction ---
  const {
    steps: satisfactionSteps,
    status,
    missingPaths
  } = buildSatisfactionSteps(schemaPaths, notification, resolvers)

  steps.push(...satisfactionSteps)

  return { id, status, missingPaths, trace }
}

/**
 * Build satisfaction steps for an obligation.
 * Returns steps array, status, and missing paths without mutating input.
 */
const buildSatisfactionSteps = (schemaPaths, notification, resolvers) => {
  const steps = []

  // Action-only obligation (e.g. legal-declaration with empty schemaPaths)
  if (!schemaPaths || schemaPaths.length === 0) {
    const submissionDate = resolvePath(notification, resolvers.submissionDatePath)
    const isSatisfied = !isEmpty(submissionDate)
    steps.push(buildActionCheckStep(isSatisfied))
    return {
      steps,
      status: isSatisfied
        ? OBLIGATION_STATUS.SATISFIED
        : OBLIGATION_STATUS.UNSATISFIED,
      missingPaths: []
    }
  }

  // Standard path checking
  const missingPaths = schemaPaths.filter((path) => {
    const value = resolvePath(notification, path)
    return isEmpty(value)
  })

  steps.push(buildSatisfactionStep(schemaPaths, missingPaths))

  const status =
    missingPaths.length === 0
      ? OBLIGATION_STATUS.SATISFIED
      : OBLIGATION_STATUS.UNSATISFIED

  return { steps, status, missingPaths }
}

// ---------------------------------------------------------------------------
// Module 3: Status Equivalence Checker
// ---------------------------------------------------------------------------

/**
 * Assert that traced status matches canonical status.
 * Throws if mismatch detected (safety net for implementation errors).
 */
const assertEquivalence = (canonical, traced) => {
  if (traced.status !== canonical.status) {
    const traceSteps = traced.trace.steps.map((s) => s.step).join(' → ')
    const terminalStep = traced.trace.steps.at(-1)
    throw new Error(
      `traceEvaluateObligations: Status mismatch for "${traced.id}"\n` +
        `  Traced: ${traced.status}\n` +
        `  Canonical: ${canonical.status}\n` +
        `  Trace path: ${traceSteps}\n` +
        `  Terminal step: ${JSON.stringify(terminalStep)}`
    )
  }
}

// ---------------------------------------------------------------------------
// Module 4: Summary Calculator
// ---------------------------------------------------------------------------

/**
 * Calculate summary statistics from traced obligations.
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

// ---------------------------------------------------------------------------
// Module 5: Main Orchestrator
// ---------------------------------------------------------------------------

/**
 * Evaluate all obligations with trace capture.
 *
 * @param {object} notification - The notification object (fact store)
 * @param {Array} obligations - Array of obligation definitions
 * @param {object} refdata - Reference data (routing, content, definitions)
 * @returns {{
 *   obligations: Array<TracedObligation>,
 *   summary: Summary
 * }}
 */
export const traceEvaluateObligations = (
  notification,
  obligations,
  refdata,
  resolvers
) => {
  // Validate inputs
  if (!notification || typeof notification !== 'object') {
    throw new Error(
      'traceEvaluateObligations: notification must be a non-null object'
    )
  }
  if (!Array.isArray(obligations)) {
    throw new Error(
      'traceEvaluateObligations: obligations must be an array'
    )
  }
  if (!refdata || typeof refdata !== 'object') {
    throw new Error(
      'traceEvaluateObligations: refdata must be a non-null object'
    )
  }
  if (!resolvers || typeof resolvers !== 'object') {
    throw new Error(
      'traceEvaluateObligations: resolvers must be a non-null object'
    )
  }

  // Step 1: Get canonical results for equivalence assertion
  const canonical = evaluateObligations(notification, obligations, refdata, resolvers)

  // Build Map for O(1) lookup instead of O(n) find
  const canonicalMap = new Map(
    canonical.obligations.map((o) => [o.id, o])
  )

  // Step 2: Trace each obligation
  const traced = obligations.map((obligation) => {
    const tracedResult = traceObligation(obligation, notification, refdata, resolvers)
    const canonicalResult = canonicalMap.get(obligation.id)
    assertEquivalence(canonicalResult, tracedResult)
    return tracedResult
  })

  // Step 3: Calculate summary
  const summary = calculateSummary(traced)

  return { obligations: traced, summary }
}