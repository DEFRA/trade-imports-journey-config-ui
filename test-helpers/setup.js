import { createServer } from '#server/server.js'

/**
 * Vitest globalSetup hook. Boots one Hapi server per test run on
 * `PORT` (default 3001 via package.json test scripts), populates
 * `process.env.API_BASE_URL` so loopback clients (journey-api-client)
 * can find the running URL, and stops the server on teardown.
 *
 * All test files share this server. Existing route tests that use
 * `createServer() + initialize() + server.inject(...)` continue to
 * spin up their own short-lived in-memory servers; this helper only
 * services tests that need a real listening port (e.g. controllers
 * that fetch via the HTTP client).
 */
export default async function setup() {
  process.env.PORT ||= '3001'
  const server = await createServer()
  await server.start()
  process.env.API_BASE_URL = server.info.uri

  return async () => {
    await server.stop({ timeout: 1000 })
  }
}
