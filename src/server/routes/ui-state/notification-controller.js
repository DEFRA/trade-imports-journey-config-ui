import { statusCodes } from '#server/common/constants/status-codes.js'
import {
  notificationSchema,
  emptyResponse
} from '#server/plugins/http-api/schemas.js'

/**
 * PUT /ui/session/notification — replace the current notification in
 * the UI session. The "in-memory database" of the SDUI demo per
 * design.md D16 + Q1 resolution: the browser fires this explicitly on
 * Save & Evaluate, sequentially before the engine call, so cross-page
 * state (tasklist, explorer, debug) can read the same notification
 * the user just typed.
 */
export const putNotification = {
  method: 'PUT',
  path: '/ui/session/notification',
  options: {
    description:
      'Replace the current notification in the UI session. The "in-memory database" of the SDUI demo.',
    tags: ['api', 'ui-state'],
    validate: { payload: notificationSchema },
    response: {
      schema: emptyResponse,
      status: {}
    }
  },
  handler(request, h) {
    request.yar.set('notification', request.payload ?? {})
    return h.response().code(statusCodes.noContent)
  }
}
