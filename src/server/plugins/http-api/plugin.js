import { configRoutes } from './config-routes.js'

/**
 * HTTP API plugin — exposes journey configuration and evaluation
 * over /api/* URLs.
 *
 * Story 01 ships only GET /api/config/journeys. Stories 02 and 03
 * add the remaining /api/config/* and /api/engine/* routes.
 *
 * Route handlers delegate to `server.app.evaluationEngine` (registered
 * by the evaluation-engine plugin); they do not duplicate dispatch
 * logic.
 */
export const httpApi = {
  plugin: {
    name: 'http-api',
    dependencies: ['evaluation-engine'],
    register(server) {
      server.route(configRoutes)
    }
  }
}
