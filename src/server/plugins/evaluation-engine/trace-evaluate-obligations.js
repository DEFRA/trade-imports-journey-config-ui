/**
 * Compatibility shim for the engine refactor (story 05).
 *
 * The canonical implementation lives at `engine/evaluate-with-trace.js`
 * with the protocol §5.2 adapter-shaped signature
 * `evaluateWithTrace(notification, adapter)`. This shim adapts the legacy
 * positional signature `(notification, obligations, refdata, resolvers)`
 * used by the Hapi plugin facade and existing tests until story 07
 * switches every caller across.
 */
import { evaluateWithTrace } from '#server/engine/evaluate-with-trace.js'

export const traceEvaluateObligations = (
  notification,
  obligations,
  refdata,
  resolvers
) =>
  evaluateWithTrace(notification, {
    obligations,
    refdata,
    journeyResolver: resolvers
  })