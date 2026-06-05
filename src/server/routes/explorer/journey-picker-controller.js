import { statusCodes } from '../../common/constants/status-codes.js'
import {
  clientForRequest,
  extractJourneyKey
} from '#server/clients/journey-api-client.js'

/**
 * POST /explorer/journey
 *
 * Runtime journey switch. Validates the target against the HTTP
 * journey list (Story 02 — proves the architecture through one
 * additional loopback fetch before the 302), writes `yar.journey`,
 * and **zeros** the session notification (so cross-journey state
 * can't bleed across the switch). Always redirects to `/explorer`
 * — trusting the Referer header here would open an open-redirect
 * path on a route that mutates session.
 */
export const journeyPickerController = {
  async handler(request, h) {
    const client = clientForRequest(request)
    const target = request.payload?.journey
    // Same loopback-failure tolerance as navContext: a 500 from the API
    // must not turn a journey-switch POST into a 500 of its own. Fall
    // back to the in-process facade for validation; the user still
    // gets a clean response.
    const journeys = await client.listJourneys().catch((error) => {
      request.logger.warn(
        { err: error },
        'journey-picker: listJourneys over HTTP failed; falling back to in-process facade for target validation'
      )
      return request.server.app.evaluationEngine.listJourneys()
    })
    const knownKeys = journeys.map(extractJourneyKey)

    if (!target || !knownKeys.includes(target)) {
      // Force text/plain so attacker-controlled `target` can't render
      // as HTML on Hapi's default response content-type.
      return h
        .response(`Unknown journey "${target}"`)
        .type('text/plain')
        .code(statusCodes.badRequest)
    }

    request.yar.set('journey', target)
    request.yar.set('notification', null) // zero-on-change

    return h.redirect('/explorer')
  }
}
