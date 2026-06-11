import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest'

// Module-spy on the journey-api-client so navContext tests can override
// listJourneys per-test. Default delegate is set in beforeEach.
vi.mock('#server/clients/journey-api-client.js', async () => {
  const actual = await vi.importActual('#server/clients/journey-api-client.js')
  return {
    ...actual,
    clientForRequest: vi.fn()
  }
})

import { currentJourneyKey, navContext } from './nav-context.js'
import {
  clientForRequest,
  ApiError
} from '#server/clients/journey-api-client.js'
import { config } from '#config/config.js'

/**
 * Behaviour & intent (Story 06):
 *   `currentJourneyKey` reads the session value and returns it, or
 *   falls back to the boot default if absent/empty. No validation —
 *   stale-session keys flow downstream where they surface as page
 *   render failures (acceptable per the lift-out principle:
 *   feedback_ui_http_first.md).
 *
 *   `navContext` fetches the journey list over HTTP. There is NO
 *   in-process fallback — an HTTP failure surfaces as a thrown error,
 *   and the page returns 500 honestly.
 */

const stubRequest = (session = null) => ({
  yar: {
    get: (key) => (key === 'journey' ? session : null)
  },
  server: { info: { uri: 'http://localhost:3001' } },
  headers: {}
})

describe('currentJourneyKey', () => {
  afterEach(() => {
    config.set('journey', 'eu-live-animals')
  })

  test('returns the session value when present', () => {
    config.set('journey', 'eu-live-animals')
    expect(currentJourneyKey(stubRequest('chedpp-plants'))).toBe(
      'chedpp-plants'
    )
  })

  test.each([null, undefined, ''])(
    'falls back to config default when session value is %p',
    (session) => {
      config.set('journey', 'chedpp-plants')
      expect(currentJourneyKey(stubRequest(session))).toBe('chedpp-plants')
    }
  )

  test('returns a stale session value verbatim (no validation)', () => {
    // Story 06 deliberately drops the stale-session guard. A session
    // pointing at an unregistered journey is returned as-is; failure
    // surfaces downstream (picker / explorer pages) where it has
    // meaningful UI to report it.
    config.set('journey', 'eu-live-animals')
    expect(currentJourneyKey(stubRequest('removed-journey'))).toBe(
      'removed-journey'
    )
  })
})

describe('navContext', () => {
  beforeEach(() => {
    // Default: clientForRequest returns a fake client whose listJourneys
    // returns a known list. Per-test overrides via mockImplementation.
    clientForRequest.mockImplementation(() => ({
      listJourneys: async () => [
        { key: 'eu-live-animals', name: 'eu-live-animals' },
        { key: 'chedpp-plants', name: 'chedpp-plants' }
      ]
    }))
  })

  afterEach(() => {
    clientForRequest.mockReset()
  })

  test('returns { journeyKey, journeyOptions } with selected wired from the session', async () => {
    config.set('journey', 'eu-live-animals')
    const result = await navContext(stubRequest('chedpp-plants'))

    expect(result).toEqual({
      journeyKey: 'chedpp-plants',
      journeyOptions: [
        { value: 'eu-live-animals', text: 'eu-live-animals', selected: false },
        { value: 'chedpp-plants', text: 'chedpp-plants', selected: true }
      ]
    })
  })

  test('throws when listJourneys rejects — no silent fallback', async () => {
    // Story 06: the in-process engine fallback is removed. A
    // loopback HTTP failure must surface, not be swallowed.
    clientForRequest.mockImplementation(() => ({
      listJourneys: () =>
        Promise.reject(new ApiError(500, 'GET', 'http://x/journeys', 'boom'))
    }))

    await expect(navContext(stubRequest('eu-live-animals'))).rejects.toThrow(
      ApiError
    )
  })
})
