import { describe, test, expect, afterEach } from 'vitest'
import { currentJourneyKey } from './nav-context.js'
import { config } from '#config/config.js'

/**
 * Behaviour & intent (Story 04 §1):
 *   `currentJourneyKey` is the single source for "what journey is
 *   this request being served as?". Session value wins when present
 *   and registered; otherwise the boot default (`config.get('journey')`)
 *   wins.
 *
 *   The fallback is load-bearing for the stale-session case — a
 *   `yar.journey` value pointing at a journey that's been removed
 *   from `listJourneys()` (e.g. registry change between sessions)
 *   must degrade gracefully to the boot default rather than crash
 *   `getJourney` downstream. Integration tests can't easily simulate
 *   a stale session against a real engine, so the unit test is the
 *   only place this branch is covered.
 */

const stubRequest = ({ session = null, known = ['eu-live-animals', 'chedpp-plants'] } = {}) => ({
  yar: {
    get: (key) => (key === 'journey' ? session : null)
  },
  server: {
    app: {
      evaluationEngine: {
        listJourneys: () => known
      }
    }
  }
})

describe('currentJourneyKey', () => {
  afterEach(() => {
    config.set('journey', 'eu-live-animals')
  })

  test('returns session value when set and registered', () => {
    config.set('journey', 'eu-live-animals')
    const request = stubRequest({ session: 'chedpp-plants' })

    expect(currentJourneyKey(request)).toBe('chedpp-plants')
  })

  test('falls back to config when no session value is set', () => {
    config.set('journey', 'chedpp-plants')
    const request = stubRequest({ session: null })

    expect(currentJourneyKey(request)).toBe('chedpp-plants')
  })

  test('falls back to config when the session names an unregistered journey (stale session)', () => {
    // Simulates a session cookie carried across a registry change —
    // the named journey no longer appears in listJourneys(). The
    // resolver must degrade to the boot default, not crash later.
    config.set('journey', 'eu-live-animals')
    const request = stubRequest({
      session: 'old-removed-journey',
      known: ['eu-live-animals', 'chedpp-plants']
    })

    expect(currentJourneyKey(request)).toBe('eu-live-animals')
  })
})
