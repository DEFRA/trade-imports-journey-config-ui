import { statusCodes } from '#server/common/constants/status-codes.js'

// Returns the journey adapter for `key`, or null if not registered.
// Avoids the try/catch dance around the facade's throw-on-unknown.
export const lookupJourney = (engine, key) =>
  engine.listJourneys().includes(key) ? engine.getJourney(key) : null

// 404 with the standard error envelope. Centralised so every handler
// renders the same shape.
export const notFound = (h, message) =>
  h
    .response({ error: 'Not Found', message })
    .code(statusCodes.notFound)

// All per-journey routes share the same opening dance: read {key} from
// params, resolve the journey or 404. Extracting it leaves each handler
// with only its journey-specific work.
export const withJourney = (request, h, work) => {
  const { key } = request.params
  const journey = lookupJourney(request.server.app.evaluationEngine, key)
  if (!journey) return notFound(h, `Unknown journey: "${key}"`)
  return work(journey, request, h)
}

// Joi failAction shared by routes whose params validation rejects the
// pipe character. Produces a stable, user-facing 400 envelope so we
// don't leak Joi's internal "fails to match the no-pipe pattern"
// language or break the route's declared response shape.
export const noPipeParamFailAction = (_request, h, err) => {
  const detail = err.details?.[0]
  const message =
    detail?.type === 'string.pattern.name'
      ? `${detail.path?.[0] ?? 'parameter'} must not contain the | character`
      : 'Invalid parameters'
  return h
    .response({ error: 'Bad Request', message })
    .code(statusCodes.badRequest)
    .takeover()
}
