import { config } from '#config/config.js'
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
 */
export const explorer = {
  plugin: {
    name: 'explorer',
    register(server) {
      // Fail fast if the configured JOURNEY is not registered with the engine.
      // Journey *selection* is an explorer concern; the engine stays
      // selection-agnostic. The evaluation-engine plugin registers before the
      // router (and therefore before us), so server.app.evaluationEngine is
      // already bound by the time we run.
      const configured = config.get('journey')
      const known = server.app.evaluationEngine.listJourneys()
      if (!known.includes(configured)) {
        throw new Error(
          `Configured JOURNEY "${configured}" is not registered. ` +
            `Known journeys: ${known.join(', ')}`
        )
      }

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
