import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from '../../server.js'
import { statusCodes } from '../../common/constants/status-codes.js'

/**
 * Behaviour & intent (Story 04 §Tests):
 *
 *   POST /explorer/journey is the user-facing journey switch. It must:
 *   (1) validate the target against listJourneys();
 *   (2) write the session journey and zero the session notification
 *       on success (so animals state can't bleed into plants);
 *   (3) always redirect to /explorer (never the referer — closes an
 *       open-redirect path on a session-mutating route);
 *   (4) reject unknown or missing targets with 400.
 *
 *   And the picker partial must appear on every explorer page —
 *   regression guard against a controller forgetting to thread the
 *   nav-context fields.
 */

describe('POST /explorer/journey (runtime picker)', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  const extractCookie = (response) => {
    const header = response.headers['set-cookie']
    const raw = Array.isArray(header) ? header[0] : header
    return raw?.split(';')[0]
  }

  const postJourney = (journey, cookie) =>
    server.inject({
      method: 'POST',
      url: '/explorer/journey',
      payload: { journey },
      headers: cookie ? { cookie } : {}
    })

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  test('valid target → 302 to /explorer; subsequent GET reflects the new journey', async () => {
    const switchResponse = await postJourney('chedpp-plants')

    expect(switchResponse.statusCode).toBe(302)
    expect(switchResponse.headers.location).toBe('/explorer')

    const cookie = extractCookie(switchResponse)
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/explorer',
      headers: cookie ? { cookie } : {}
    })

    expect(statusCode).toBe(statusCodes.ok)
    // Plants scenarios appear in the dropdown after the switch.
    expect(result).toEqual(expect.stringContaining('Import – Apples'))
    // Picker option for chedpp-plants is marked selected.
    expect(result).toMatch(
      /<option[^>]*value="chedpp-plants"[^>]*selected/
    )
  })

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  test('unknown target → 400; session unchanged', async () => {
    // Drive a known starting state (animals) via session.
    const seed = await postJourney('eu-live-animals')
    expect(seed.statusCode).toBe(302)
    const cookie = extractCookie(seed)

    const badResponse = await postJourney('not-a-journey', cookie)
    expect(badResponse.statusCode).toBe(statusCodes.badRequest)

    // Session journey wasn't clobbered — GET /explorer still shows animals.
    const { result } = await server.inject({
      method: 'GET',
      url: '/explorer',
      headers: cookie ? { cookie } : {}
    })
    expect(result).toMatch(
      /<option[^>]*value="eu-live-animals"[^>]*selected/
    )
  })

  test('missing target → 400', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/explorer/journey',
      payload: {}
    })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })

  test('non-object payload (raw string body) → 400 without crashing', async () => {
    // Guards `request.payload?.journey` against payloads Hapi parses
    // as something other than an object (a raw string body here).
    // Optional chaining + falsy check should keep this path safe.
    const response = await server.inject({
      method: 'POST',
      url: '/explorer/journey',
      payload: 'not an object',
      headers: { 'content-type': 'text/plain' }
    })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })

  test('400 response is text/plain (no HTML reflection of attacker input)', async () => {
    const response = await postJourney('<script>alert(1)</script>')

    expect(response.statusCode).toBe(statusCodes.badRequest)
    expect(response.headers['content-type']).toMatch(/^text\/plain/)
  })

  // ---------------------------------------------------------------------------
  // Zero-on-change: cross-journey state cannot bleed across the switch
  // ---------------------------------------------------------------------------

  test('switching journeys clears yar.notification (no animals state in plants render)', async () => {
    // Load an animals scenario — populates yar.notification with cattle.
    const journeyResponse = await server.inject({
      method: 'GET',
      url: '/explorer?scenario=import-cattle'
    })
    const cookie = extractCookie(journeyResponse)

    // Confirm the animals notification is in session — the debug page
    // dumps the raw notification JSON so the species name surfaces.
    const beforeDebug = await server.inject({
      method: 'GET',
      url: '/explorer/debug',
      headers: cookie ? { cookie } : {}
    })
    expect(beforeDebug.result).toEqual(
      expect.stringContaining('Bos taurus')
    )

    // Switch to plants — zero-on-change should wipe yar.notification.
    const switchResponse = await postJourney('chedpp-plants', cookie)
    const switchedCookie = extractCookie(switchResponse) ?? cookie

    const afterDebug = await server.inject({
      method: 'GET',
      url: '/explorer/debug',
      headers: switchedCookie ? { cookie: switchedCookie } : {}
    })

    expect(afterDebug.statusCode).toBe(statusCodes.ok)
    expect(afterDebug.result).not.toEqual(
      expect.stringContaining('Bos taurus')
    )
  })

  // ---------------------------------------------------------------------------
  // Picker is reachable from every explorer page
  // ---------------------------------------------------------------------------

  test.each([
    '/explorer',
    '/explorer/tasklist',
    '/explorer/debug',
    '/explorer/commodity-config'
  ])('picker form is present on %s', async (path) => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: path
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toEqual(
      expect.stringContaining('action="/explorer/journey"')
    )
  })
})
