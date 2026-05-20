/**
 * Compatibility shim — Story 04 (branch-by-abstraction).
 *
 * The canonical evaluator now lives at `engine/evaluate.js` with the
 * adapter-form signature `evaluate(notification, adapter)`. This file
 * adapts the old positional signature
 * `evaluateObligations(notification, obligations, refdata, resolvers)`
 * so the trace evaluator and the existing test suite continue to work
 * unchanged. The path utilities are re-exported here as belt-and-braces:
 * Story 03 already moved their canonical home to `engine/path.js`, but
 * any consumer that still imports them from this module keeps working.
 *
 * Slated for deletion in Story 07 once all callers point at the
 * `engine/*` modules directly.
 */
import { evaluate } from '../../engine/evaluate.js'

export const evaluateObligations = (
  notification,
  obligations,
  refdata,
  resolvers
) =>
  evaluate(notification, {
    obligations,
    refdata,
    journeyResolver: resolvers
  })

export { resolvePath, isEmpty } from '../../engine/path.js'
