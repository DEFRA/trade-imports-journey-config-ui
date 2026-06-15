import { home } from '../routes/home/index.js'
import { journeySelection } from '../routes/journey-selection/index.js'
import { explorer } from '../routes/explorer/index.js'
import { health } from '../routes/health/index.js'
import { httpApi } from './http-api/plugin.js'
import { uiState } from '../routes/ui-state/index.js'
import { serveStaticFiles } from './serve-static-files.js'
import { config } from '#config/config.js'

export const router = {
  plugin: {
    name: 'router',
    async register(server) {
      // Health-check route. Used by platform to check if service is running, do not remove!
      await server.register([health])

      // Application specific routes, add your own routes here
      await server.register([
        home,
        journeySelection,
        explorer,
        httpApi,
        uiState
      ])

      // Static assets
      if (!config.get('isProduction') && !config.get('isTest')) {
        await (async () => {
          const createViteServer = (await import('vite')).createServer
          const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'custom'
          })

          await server.register({
            plugin: (await import('@defra/hapi-connect')).default,
            options: {
              path: '/public',
              middleware: [vite.middlewares]
            }
          })
        })()
      } else {
        server.register(serveStaticFiles)
      }
    }
  }
}
