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
