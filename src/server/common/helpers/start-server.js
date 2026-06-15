import { createServer } from '../../server.js'
import { config } from '../../../config/config.js'

async function startServer() {
  const server = await createServer()
  await server.start()

  // Make the running URL discoverable to in-process HTTP clients (the
  // journey-api-client uses loopback fetch). In tests, vitest's
  // globalSetup populates API_BASE_URL before convict loads, so this
  // branch is dead code under test; in production it falls back to
  // server.info.uri so the platform doesn't need to pre-configure
  // API_BASE_URL.
  //
  // Note: convict.set is deliberately mutated at runtime here — the
  // platform can't know its bound port until server.start() returns.
  // This is the only post-validation mutation of convict in the
  // codebase; everywhere else config is read-only.
  if (!config.get('apiBaseUrl')) {
    config.set('apiBaseUrl', server.info.uri)
  }

  server.logger.info('Server started successfully')
  server.logger.info(
    `Access your frontend on http://localhost:${config.get('port')}`
  )

  return server
}

export { startServer }
