import { journeyController } from './journey-controller.js'
import { debugController } from './debug-controller.js'
import { tasklistController } from './tasklist-controller.js'
import { commodityConfigController } from './commodity-config-controller.js'
import { journeyPickerController } from './journey-picker-controller.js'

/**
 * Explorer plugin
 *
 * Provides routes for the obligation explorer — a set of views for
 * visualising and testing the obligation evaluation engine.
 *
 * Routes:
 * - GET /explorer - Journey configuration (landing page — scenario selection)
 * - GET /explorer/tasklist - Task list view (server-side rendered, uses session state)
 * - GET /explorer/debug - Evaluation debugger (client-side rendering with JS)
 * - GET /explorer/commodity-config - Commodity configuration viewer (refdata exploration)
 * - POST /explorer/journey - Switch the active journey (writes session, clears notification)
 *
 * NOTE: POST /explorer/debug/evaluate was deleted in Story 03. The
 * browser JS now POSTs directly to /api/engine/journeys/{key}/evaluate
 * for compute and PUT /ui/session/notification for state persistence.
 *
 * Story 06: this plugin no longer reads the in-process engine at
 * registration time. The configured `JOURNEY` env var is trusted; a
 * misconfigured journey surfaces on the first page render rather
 * than at boot. This preserves the lift-out invariant — the routes
 * are portable to a separate deployment.
 */
export const explorer = {
  plugin: {
    name: 'explorer',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/explorer',
          ...journeyController
        },
        {
          method: 'GET',
          path: '/explorer/tasklist',
          ...tasklistController
        },
        {
          method: 'GET',
          path: '/explorer/debug',
          ...debugController
        },
        {
          method: 'GET',
          path: '/explorer/commodity-config',
          ...commodityConfigController
        },
        {
          method: 'POST',
          path: '/explorer/journey',
          ...journeyPickerController
        }
      ])
    }
  }
}
