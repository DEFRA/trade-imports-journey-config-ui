import { statusCodes } from '../../common/constants/status-codes.js'

/**
 * POST /explorer/journey
 *
 * Runtime journey switch. Validates the target against
 * `listJourneys()`, writes `yar.journey`, and **zeros** the
 * session notification (so cross-journey state can't bleed across
 * the switch). Always redirects to `/explorer` — trusting the
 * Referer header here would open an open-redirect path on a route
 * that mutates session.
 */
export const journeyPickerController = {
  handler(request, h) {
    const { evaluationEngine } = request.server.app
    const target = request.payload?.journey
    const known = evaluationEngine.listJourneys()

    if (!target || !known.includes(target)) {
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
