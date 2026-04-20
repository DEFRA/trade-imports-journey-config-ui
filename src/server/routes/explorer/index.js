import { journeyController } from './journey-controller.js'
import { debugController } from './debug-controller.js'
import { evaluateController } from './api-controller.js'
import { tasklistController } from './tasklist-controller.js'
import { commodityConfigController } from './commodity-config-controller.js'

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
 * - POST /explorer/debug/evaluate - Evaluate notification and return traced obligations
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
          path: '/explorer/debug/evaluate',
          ...evaluateController
        }
      ])
    }
  }
}
