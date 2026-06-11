import path from 'path'
import hapi from '@hapi/hapi'
import Scooter from '@hapi/scooter'
import Inert from '@hapi/inert'
import Vision from '@hapi/vision'
import HapiSwagger from 'hapi-swagger'

import { router } from './plugins/router.js'
import { evaluationEngine } from './plugins/evaluation-engine/plugin.js'
import { config } from '#config/config.js'
import { pulse } from './plugins/pulse.js'
import { catchAll } from './common/helpers/errors.js'
import { nunjucksConfig } from '#config/nunjucks/nunjucks.js'
import { setupProxy } from './common/helpers/proxy/setup-proxy.js'
import { requestTracing } from './plugins/request-tracing.js'
import { requestLogger } from './plugins/request-logger.js'
import { sessionCache } from './plugins/session-cache.js'
import { getCacheEngine } from './common/helpers/session-cache/cache-engine.js'
import { secureContext } from '@defra/hapi-secure-context'
import { contentSecurityPolicy } from './plugins/content-security-policy.js'
import { metrics } from '@defra/cdp-metrics'

export async function createServer() {
  setupProxy()
  const server = hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        }
      },
      files: {
        relativeTo: path.resolve(config.get('root'), '.public')
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    },
    cache: [
      {
        name: config.get('session.cache.name'),
        engine: getCacheEngine(config.get('session.cache.engine'))
      }
    ],
    state: {
      strictHeader: false
    }
  })
  await server.register([
    requestLogger,
    requestTracing,
    metrics,
    secureContext,
    pulse,
    sessionCache,
    Inert, // Inert + Vision must register before HapiSwagger; both are also relied on by the static-files plugin (Inert) and Nunjucks rendering (Vision via nunjucksConfig).
    Vision,
    nunjucksConfig,
    Scooter,
    contentSecurityPolicy,
    evaluationEngine, // Must register before router so routes can access server.app.evaluationEngine
    {
      plugin: HapiSwagger,
      options: {
        info: {
          title: 'Journey Configuration & Evaluation',
          version: '0.1.0',
          description:
            'Two HTTP namespaces over the journey-evaluation engine: /api/config/* (read-only journey configuration) and /api/engine/* (pure compute). Plus /ui/session/* for UI state ("the in-memory database" of the SDUI demo). See features/http-api/design.md for the full design.'
        },
        tags: [
          { name: 'config', description: 'Read-only journey configuration' },
          {
            name: 'engine',
            description: 'Evaluate notifications against journeys'
          },
          {
            name: 'ui-state',
            description:
              'UI session state (the "in-memory database" of the SDUI demo)'
          }
        ],
        grouping: 'tags',
        documentationPath: '/documentation'
      }
    },
    router // Register all the controllers/routes defined in src/server/router.js
  ])

  server.ext('onPreResponse', catchAll)

  return server
}
