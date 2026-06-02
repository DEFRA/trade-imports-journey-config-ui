import { statusCodes } from '../../common/constants/status-codes.js'
import { currentJourneyKey } from './nav-context.js'

/**
 * POST /explorer/debug/evaluate handler
 *
 * Accepts a notification JSON and runs the trace evaluator to return
 * obligations with their statuses and evaluation trace.
 * Also stores the notification in the session for cross-page sharing.
 *
 * Uses the evaluation engine via server.app.evaluationEngine.
 */
export const evaluateController = {
  handler(request, h) {
    const { evaluationEngine } = request.server.app
    const journeyKey = currentJourneyKey(request)

    try {
      const { notification } = request.payload || {}
      const notificationObj = notification || {}

      // Store in session for cross-page sharing
      request.yar.set('notification', notificationObj)

      const result = evaluationEngine.evaluate(journeyKey, notificationObj)
      return h.response(result).code(statusCodes.ok)
    } catch (error) {
      request.logger.error({ err: error }, 'Obligation evaluation failed')

      return h
        .response({
          error: 'Evaluation failed',
          message:
            'Unable to evaluate obligations. Please check your notification format.'
        })
        .code(statusCodes.internalServerError)
    }
  }
}
