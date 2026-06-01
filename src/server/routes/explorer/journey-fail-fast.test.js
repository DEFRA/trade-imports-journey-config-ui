import { describe, test, expect, afterEach } from 'vitest'
import { createServer } from '../../server.js'
import { config } from '#config/config.js'

/**
 * Behaviour & intent (Story 01 §2):
 *   An unknown JOURNEY must fail fast at boot — the explorer plugin's
 *   register runs `listJourneys()` against the configured value and
 *   throws a clear error listing the known journeys.
 *
 *   Isolated in its own file so worker isolation contains any leak of
 *   the bad config value; the `try/finally` and `afterEach` are
 *   belt-and-braces.
 */

describe('Explorer fails fast on unknown JOURNEY', () => {
  afterEach(() => {
    config.set('journey', 'eu-live-animals')
  })

  test('createServer() rejects with a clear "Configured JOURNEY ... is not registered" message', async () => {
    try {
      config.set('journey', 'nope')
      await expect(createServer()).rejects.toThrow(
        /Configured JOURNEY "nope" is not registered\. Known journeys: /
      )
    } finally {
      config.set('journey', 'eu-live-animals')
    }
  })
})
