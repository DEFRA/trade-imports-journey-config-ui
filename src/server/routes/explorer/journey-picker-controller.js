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
    // Story 06: no in-process fallback. An HTTP failure surfaces as
    // 500. On loopback that's honest — if the API is wedged the
    // server can't serve the page anyway.
    const journeys = await client.listJourneys()
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
