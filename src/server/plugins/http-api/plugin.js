import { configRoutes } from './config-routes.js'
import { engineRoutes } from './engine-routes.js'

/**
 * HTTP API plugin — exposes journey configuration and evaluation
 * over /api/* URLs.
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
      server.route([...configRoutes, ...engineRoutes])
    }
  }
}
