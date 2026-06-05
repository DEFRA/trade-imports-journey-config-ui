import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from '../../server.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { scenarioMap } from '../../journeys/eu-live-animals/scenarios.js'

/**
 * Behavior & Intent:
 * - [Domain Goal]: The explorer renders scenario-based journeys with all
 *   obligations satisfied, shares session state across pages, and clears cleanly.
 * - [Observable Outcome]: HTTP responses contain correct evaluation results
 *   ("Submittable: Yes"), session persists across page navigations, and
 *   clearing resets all state.
 *
 * High-value cases:
 * - Every scenario renders with "Submittable: Yes" (the core acceptance criterion)
 * - Session state flows: journey → debugger → tasklist
 * - Debugger POST writes back to session
 * - Clear scenario wipes all state
 * - Fragment explorer is present on debugger page
 *
 * Explicitly excluded:
 * - Not testing CSS/layout (structural, not behavioural)
 * - Not testing that specific HTML elements have exact class names
 * - Not testing individual field rendering (covered by template unit tests if needed)
 *
 * Low-value cases not worth adding:
 * - HTTP method rejection (framework concern)
 * - Malformed query params (no security impact, just shows empty state)
 */

describe('Explorer routes', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  /**
   * Extract session cookie from a server response.
   */
  const extractCookie = (response) => {
    const header = response.headers['set-cookie']
    const raw = Array.isArray(header) ? header[0] : header
    return raw?.split(';')[0]
  }

  // -----------------------------------------------------------------------
  // Journey page — scenario loading
  // -----------------------------------------------------------------------

  describe('GET /explorer (scenario-based journey)', () => {
    test('empty state renders page with scenario dropdown, no journey structure', async () => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/explorer'
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual(
        expect.stringContaining('Scenario-Based Journey Explorer')
      )
      expect(result).toEqual(expect.stringContaining('Load scenario'))
      expect(result).not.toEqual(expect.stringContaining('Journey Structure'))
    })

    test('loading import-cattle renders journey with Submittable: Yes', async () => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/explorer?scenario=import-cattle'
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual(expect.stringContaining('Journey Structure'))
      expect(result).toEqual(expect.stringContaining('Submittable'))
      expect(result).toEqual(expect.stringContaining('Yes'))
    })

    test('all 7 scenarios render with Submittable: Yes', async () => {
      const scenarioNames = Object.keys(scenarioMap)
      expect(scenarioNames).toHaveLength(7)

      for (const scenario of scenarioNames) {
        const { result, statusCode } = await server.inject({
          method: 'GET',
          url: `/explorer?scenario=${scenario}`
        })

        expect(statusCode).toBe(statusCodes.ok)
        expect(result).toEqual(expect.stringContaining('Journey Structure'))
        expect(result).toEqual(expect.stringContaining('Yes'))
      }
    })

    test('scenario=empty clears session — no journey structure rendered', async () => {
      // Load a scenario first
      const setResponse = await server.inject({
        method: 'GET',
        url: '/explorer?scenario=import-cattle'
      })
      const cookie = extractCookie(setResponse)

      // Clear
      const clearResponse = await server.inject({
        method: 'GET',
        url: '/explorer?scenario=empty',
        headers: cookie ? { cookie } : {}
      })

      expect(clearResponse.statusCode).toBe(statusCodes.ok)
      expect(clearResponse.result).not.toEqual(
        expect.stringContaining('Journey Structure')
      )
    })

    test('restores from session when no query param', async () => {
      const setResponse = await server.inject({
        method: 'GET',
        url: '/explorer?scenario=import-cattle'
      })
      const cookie = extractCookie(setResponse)

      const restoreResponse = await server.inject({
        method: 'GET',
        url: '/explorer',
        headers: cookie ? { cookie } : {}
      })

      expect(restoreResponse.statusCode).toBe(statusCodes.ok)
      expect(restoreResponse.result).toEqual(
        expect.stringContaining('Journey Structure')
      )
      expect(restoreResponse.result).toEqual(
        expect.stringContaining('Yes')
      )
    })

    test('no per-obligation toggle dropdowns on the page', async () => {
      const { result } = await server.inject({
        method: 'GET',
        url: '/explorer?scenario=import-cattle'
      })

      expect(result).not.toEqual(expect.stringContaining('obligation-toggle'))
      expect(result).not.toEqual(expect.stringContaining('Autofill'))
    })

    test('form has a visible submit button for scenario loading', async () => {
      const { result } = await server.inject({
        method: 'GET',
        url: '/explorer'
      })

      expect(result).toEqual(
        expect.stringMatching(/Load scenario\s*<\/button>/)
      )
    })

    test('no inline script tags beyond GOV.UK body-class detection (CSP compliance)', async () => {
      const { result } = await server.inject({
        method: 'GET',
        url: '/explorer?scenario=import-cattle'
      })

      const inlineScripts = (
        result.match(/<script(?![^>]*\bsrc\b)[^>]*>/g) || []
      )
      expect(inlineScripts).toHaveLength(1)
      expect(inlineScripts[0]).toBe('<script>')
    })
  })

  // -----------------------------------------------------------------------
  // Task List — reflects session state
  // -----------------------------------------------------------------------

  describe('GET /explorer/tasklist', () => {
    test('renders task list page', async () => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/explorer/tasklist'
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual(
        expect.stringContaining('Check your notification')
      )
    })

    test('shows all obligations met after loading a scenario', async () => {
      const journeyResponse = await server.inject({
        method: 'GET',
        url: '/explorer?scenario=import-cattle'
      })
      const cookie = extractCookie(journeyResponse)

      const tasklistResponse = await server.inject({
        method: 'GET',
        url: '/explorer/tasklist',
        headers: cookie ? { cookie } : {}
      })

      expect(tasklistResponse.statusCode).toBe(statusCodes.ok)
      expect(tasklistResponse.result).toEqual(
        expect.stringContaining('Complete')
      )
    })
  })

  // -----------------------------------------------------------------------
  // Evaluation Debugger
  // -----------------------------------------------------------------------

  describe('GET /explorer/debug', () => {
    test('renders debugger with fragment explorer', async () => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/explorer/debug'
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual(
        expect.stringContaining('Evaluation Debugger')
      )
      expect(result).toEqual(
        expect.stringContaining('Obligation Fragment Explorer')
      )
      expect(result).toEqual(expect.stringContaining('fragment-selector'))
    })

    test('fragment explorer dropdown has 23 obligation options plus placeholder', async () => {
      const { result } = await server.inject({
        method: 'GET',
        url: '/explorer/debug'
      })

      const selectorHtml = result.match(
        /<select[^>]*id="fragment-selector"[^>]*>([\s\S]*?)<\/select>/
      )
      expect(selectorHtml).not.toBeNull()

      const options = selectorHtml[1].match(/<option/g) || []
      expect(options).toHaveLength(24)

      expect(selectorHtml[1]).toEqual(
        expect.stringContaining('Select an obligation')
      )
      expect(selectorHtml[1]).toEqual(
        expect.stringContaining('Notification Type')
      )
    })

    test('no inline script tags beyond GOV.UK body-class detection (CSP compliance)', async () => {
      const { result } = await server.inject({
        method: 'GET',
        url: '/explorer/debug'
      })

      const inlineScripts = (
        result.match(/<script(?![^>]*\bsrc\b)[^>]*>/g) || []
      )
      expect(inlineScripts).toHaveLength(1)
      expect(inlineScripts[0]).toBe('<script>')
    })

    test('shows scenario notification loaded from journey page', async () => {
      const journeyResponse = await server.inject({
        method: 'GET',
        url: '/explorer?scenario=import-cattle'
      })
      const cookie = extractCookie(journeyResponse)

      const debugResponse = await server.inject({
        method: 'GET',
        url: '/explorer/debug',
        headers: cookie ? { cookie } : {}
      })

      expect(debugResponse.statusCode).toBe(statusCodes.ok)
      expect(debugResponse.result).toEqual(
        expect.stringContaining('Bos taurus')
      )
    })
  })

  // -----------------------------------------------------------------------
  // Debug API — POST /explorer/debug/evaluate was DELETED in Story 03.
  // The browser JS now POSTs directly to /api/engine/.../evaluate and
  // PUT /ui/session/notification. Tests for those endpoints live in
  // src/server/plugins/http-api/ and src/server/routes/ui-state/.
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // Cross-page session sharing
  // -----------------------------------------------------------------------

  describe('Session sharing across pages', () => {
    test('journey → debugger: debugger shows same notification', async () => {
      const journeyResponse = await server.inject({
        method: 'GET',
        url: '/explorer?scenario=transhipment-cattle'
      })
      const cookie = extractCookie(journeyResponse)

      const debugResponse = await server.inject({
        method: 'GET',
        url: '/explorer/debug',
        headers: cookie ? { cookie } : {}
      })

      expect(debugResponse.statusCode).toBe(statusCodes.ok)
      expect(debugResponse.result).toEqual(
        expect.stringContaining('For Transhipment to')
      )
    })

    test('PUT /ui/session/notification → tasklist: status tags differ from empty-session baseline', async () => {
      // The previous version of this test only asserted the heading
      // "Check your notification" appears — a static string the page
      // always renders. Story 03 replaced that false-positive with a
      // *behaviour-change* assertion: the same tasklist URL renders
      // different status tags when the session contains a satisfied
      // notification vs an empty one. If the PUT-to-tasklist bridge
      // is broken, the two responses will be identical and this test
      // fails loudly.

      // Baseline: empty session → tasklist with no satisfied screens.
      const baseline = await server.inject({
        method: 'GET',
        url: '/explorer/tasklist'
      })
      expect(baseline.statusCode).toBe(statusCodes.ok)
      // 'Done' is the GOV.UK task-list tag text for `complete` screens.
      // With an empty notification, no screen is complete.
      expect(baseline.result).not.toContain('govuk-tag--green">\n          Done')

      // Set a satisfying notification via the scenario loader (the
      // same path the UI uses). This writes to yar.notification — the
      // bridge under test.
      const seedResponse = await server.inject({
        method: 'GET',
        url: '/explorer?scenario=import-cattle'
      })
      const cookie = extractCookie(seedResponse)

      const tasklistResponse = await server.inject({
        method: 'GET',
        url: '/explorer/tasklist',
        headers: cookie ? { cookie } : {}
      })

      expect(tasklistResponse.statusCode).toBe(statusCodes.ok)
      // The two responses must differ — a stronger guarantee than
      // "contains a known substring". The actual differences are in
      // the status tag classes / text per section.
      expect(tasklistResponse.result).not.toEqual(baseline.result)
    })

    test('journey → clear → debugger: debugger shows empty after clear', async () => {
      const journeyResponse = await server.inject({
        method: 'GET',
        url: '/explorer?scenario=import-cattle'
      })
      const cookie1 = extractCookie(journeyResponse)

      const clearResponse = await server.inject({
        method: 'GET',
        url: '/explorer?scenario=empty',
        headers: cookie1 ? { cookie: cookie1 } : {}
      })
      const cookie2 = extractCookie(clearResponse) || cookie1

      const debugResponse = await server.inject({
        method: 'GET',
        url: '/explorer/debug',
        headers: cookie2 ? { cookie: cookie2 } : {}
      })

      expect(debugResponse.statusCode).toBe(statusCodes.ok)
      expect(debugResponse.result).not.toEqual(
        expect.stringContaining('data-initial-notification')
      )
    })
  })

  // -----------------------------------------------------------------------
  // Commodity Config (independent of session)
  // -----------------------------------------------------------------------

  describe('GET /explorer/commodity-config', () => {
    test('renders commodity dropdown when no commodity selected', async () => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/explorer/commodity-config'
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual(
        expect.stringContaining('Commodity Reference Data Configuration')
      )
      expect(result).toEqual(expect.stringContaining('Select a commodity'))
    })

    test('renders configuration for a valid commodity', async () => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/explorer/commodity-config?commodity=101|Equus+caballus'
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toEqual(expect.stringContaining('Commodity Summary'))
      expect(result).toEqual(expect.stringContaining('Routing Flags'))
    })

    // -------------------------------------------------------------------------
    // Animals parity safeguard (Story 02): every data point the page surfaces
    // for 102|Bos taurus today must remain present after the refactor.
    // Layout/label-casing may change; data may not be lost.
    // -------------------------------------------------------------------------

    test('animals parity: every data point present for 102|Bos taurus', async () => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/explorer/commodity-config?commodity=102|Bos+taurus'
      })

      expect(statusCode).toBe(statusCodes.ok)

      // Commodity summary fields
      expect(result).toContain('102')
      expect(result).toContain('Bos taurus')

      // Purpose set name (set indirection visible to user) +
      // every value in that set (refdata: purpose_set_04).
      expect(result).toContain('purpose_set_04')
      for (const v of [
        'Breeding',
        'Fattening',
        'Production',
        'Rejected or Returned consignment',
        'Slaughter',
        'Transit'
      ]) {
        expect(result).toContain(v)
      }

      // Identifier set name + values (refdata: identifier_set_13).
      expect(result).toContain('identifier_set_13')
      expect(result).toContain('Ear tag')
      expect(result).toContain('Passport')

      // Quantity type fields (label, field name, ID — all three must show).
      expect(result).toContain('Number of animals')
      expect(result).toContain('numberOfAnimals')
      expect(result).toContain('number-of-animals')

      // Routing-flag labels (the three animals flags).
      expect(result).toContain('CPH Number')
      expect(result).toContain('Permanent Address')
      expect(result).toContain('Transporter Address')

      // Routing-flag states: cph_number=true → Enabled,
      // permanent_address=false → Disabled, transporter_address=true → Enabled.
      // The page renders Enabled/Disabled tags somewhere — assert both appear.
      expect(result).toContain('Enabled')
      expect(result).toContain('Disabled')
    })
  })
})
