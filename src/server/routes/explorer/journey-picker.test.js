import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from '../../server.js'
import { statusCodes } from '../../common/constants/status-codes.js'

/**
 * Behaviour & intent (Stories 04 + 05):
 *
 *   POST /explorer/journey is the user-facing journey switch. It must:
 *   (1) validate the target against listJourneys();
 *   (2) write the session journey and zero the session notification
 *       on success (so animals state can't bleed into plants);
 *   (3) always redirect to /explorer (never the referer — closes an
 *       open-redirect path on a session-mutating route);
 *   (4) reject unknown or missing targets with 400;
 *   (5) zero notification even on a same-journey POST (Story 05 §3).
 *
 *   And (Story 05): the picker form lives on /journey-selection; every
 *   explorer page renders an active-journey text indicator so users
 *   know which journey is loaded without the picker on the page.
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
    // Indicator reflects the new active journey.
    expect(result).toEqual(
      expect.stringContaining('Journey: <strong>chedpp-plants</strong>')
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

    // Session journey wasn't clobbered — indicator on /explorer still
    // reports animals.
    const { result } = await server.inject({
      method: 'GET',
      url: '/explorer',
      headers: cookie ? { cookie } : {}
    })
    expect(result).toEqual(
      expect.stringContaining('Journey: <strong>eu-live-animals</strong>')
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
    expect(beforeDebug.result).toEqual(expect.stringContaining('Bos taurus'))

    // Switch to plants — zero-on-change should wipe yar.notification.
    const switchResponse = await postJourney('chedpp-plants', cookie)
    const switchedCookie = extractCookie(switchResponse) ?? cookie

    const afterDebug = await server.inject({
      method: 'GET',
      url: '/explorer/debug',
      headers: switchedCookie ? { cookie: switchedCookie } : {}
    })

    expect(afterDebug.statusCode).toBe(statusCodes.ok)
    expect(afterDebug.result).not.toEqual(expect.stringContaining('Bos taurus'))
  })

  // ---------------------------------------------------------------------------
  // Same-journey POST also zeroes notification (Story 05 §3)
  // ---------------------------------------------------------------------------

  test('same-journey POST also clears yar.notification', async () => {
    // Load animals scenario — populates yar.notification with cattle.
    const journeyResponse = await server.inject({
      method: 'GET',
      url: '/explorer?scenario=import-cattle'
    })
    const cookie = extractCookie(journeyResponse)

    // The debug page wraps the loaded notification in a
    // `data-initial-notification="..."` attribute that's only
    // emitted when `initialNotification` is truthy. That attribute
    // is the clean signal — `Bos taurus` substring is unreliable
    // here because it also appears in scenario-derived obligation
    // fragments, regardless of session state.
    const beforeDebug = await server.inject({
      method: 'GET',
      url: '/explorer/debug',
      headers: cookie ? { cookie } : {}
    })
    expect(beforeDebug.result).toEqual(
      expect.stringContaining('data-initial-notification=')
    )

    // POST the SAME journey (no actual switch) — handler still zeroes.
    const sameJourneyPost = await postJourney('eu-live-animals', cookie)
    expect(sameJourneyPost.statusCode).toBe(302)
    const switchedCookie = extractCookie(sameJourneyPost) ?? cookie

    const afterDebug = await server.inject({
      method: 'GET',
      url: '/explorer/debug',
      headers: switchedCookie ? { cookie: switchedCookie } : {}
    })

    expect(afterDebug.statusCode).toBe(statusCodes.ok)
    // Attribute is gone because initialNotification is now null.
    expect(afterDebug.result).not.toEqual(
      expect.stringContaining('data-initial-notification=')
    )
  })

  // ---------------------------------------------------------------------------
  // Picker lives on the Journey Selection page (Story 05 §2)
  // ---------------------------------------------------------------------------

  test('picker form is present on /journey-selection', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/journey-selection'
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toEqual(
      expect.stringContaining('action="/explorer/journey"')
    )
  })

  // ---------------------------------------------------------------------------
  // Picker is NOT on explorer pages; indicator IS (Story 05 §3)
  // ---------------------------------------------------------------------------

  test.each([
    '/explorer',
    '/explorer/tasklist',
    '/explorer/debug',
    '/explorer/commodity-config'
  ])(
    'explorer page %s shows the journey indicator and no picker form',
    async (path) => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: path
      })

      expect(statusCode).toBe(statusCodes.ok)
      // Default journey (no session) is eu-live-animals. The literal
      // markup substring catches the specific regression a controller
      // that forgets to spread navContext would create — the indicator
      // would render as empty `<strong></strong>` and this assertion
      // fails.
      expect(result).toEqual(
        expect.stringContaining('Journey: <strong>eu-live-animals</strong>')
      )
      // The picker form must NOT appear on explorer pages anymore.
      expect(result).not.toEqual(
        expect.stringContaining('action="/explorer/journey"')
      )
    }
  )

  // ---------------------------------------------------------------------------
  // Story 03: journey-key round-trip
  // ---------------------------------------------------------------------------

  test('after switching to plants, /explorer/debug carries data-journey-key="chedpp-plants" and the engine API returns plants-specific obligations', async () => {
    const switchResponse = await postJourney('chedpp-plants')
    const cookie = extractCookie(switchResponse)

    // (1) The debug page surfaces the active journey to the browser JS
    // via the data-journey-key attribute. Without this, the engine
    // fetch wouldn't know which journey to address.
    const debugResponse = await server.inject({
      method: 'GET',
      url: '/explorer/debug',
      headers: cookie ? { cookie } : {}
    })
    expect(debugResponse.statusCode).toBe(statusCodes.ok)
    expect(debugResponse.result).toEqual(
      expect.stringContaining('data-journey-key="chedpp-plants"')
    )

    // (2) The engine API on the active journey returns a plants-specific
    // obligation id that doesn't exist for animals. This proves the
    // round-trip wired the right journey end-to-end.
    const evalResponse = await server.inject({
      method: 'POST',
      url: '/api/engine/journeys/chedpp-plants/evaluate',
      payload: {},
      headers: { 'content-type': 'application/json' }
    })
    expect(evalResponse.statusCode).toBe(statusCodes.ok)
    const ids = evalResponse.result.obligations.map((o) => o.id)
    expect(ids).toContain('transhipment-routing')
  })
})
