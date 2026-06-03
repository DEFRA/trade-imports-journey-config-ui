import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from '../../server.js'
import { config } from '#config/config.js'
import { statusCodes } from '../../common/constants/status-codes.js'

/**
 * Behaviour & intent (Stories 01 + 02):
 *   With JOURNEY=chedpp-plants set in config, the explorer must serve the
 *   plants journey end-to-end: plants scenarios in the dropdown, plants
 *   screens in the rendered journey structure / task list, and zero
 *   leakage of animals-only content. Commodity-config is journey-agnostic
 *   (Story 02 dropped Story 01's interim gate); the page renders the
 *   plants refdata-view's dimensions + details for every plants commodity.
 *
 *   These tests are deliberately isolated from `index.test.js` (which
 *   covers the default-journey path) so the config flip is contained.
 */

describe('Explorer with JOURNEY=chedpp-plants', () => {
  let server

  beforeAll(async () => {
    config.set('journey', 'chedpp-plants')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    if (server) {
      await server.stop({ timeout: 0 })
    }
    config.set('journey', 'eu-live-animals')
  })

  const extractCookie = (response) => {
    const header = response.headers['set-cookie']
    const raw = Array.isArray(header) ? header[0] : header
    return raw?.split(';')[0]
  }

  // ---------------------------------------------------------------------------
  // T1 — Non-default journey drives the explorer end-to-end
  // ---------------------------------------------------------------------------

  test('GET /explorer?scenario=import-apples renders plants journey (plants-only screen + scenario label; no animals leakage)', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/explorer?scenario=import-apples'
    })

    expect(statusCode).toBe(statusCodes.ok)
    // Plants-only screen name (verified absent from animals journey.json)
    expect(result).toEqual(expect.stringContaining('Packer'))
    // Plants scenario label in the dropdown
    expect(result).toEqual(expect.stringContaining('Import – Apples'))
    // Animals-only screen name must NOT leak through
    expect(result).not.toEqual(expect.stringContaining('CPH number'))
    // Nav indicator shows the active journey — tightened from loose
    // 'chedpp-plants' substring (Story 05): use the full indicator
    // markup so markup drift forces a test update rather than
    // silently re-passing on an incidental match.
    expect(result).toEqual(
      expect.stringContaining('Journey: <strong>chedpp-plants</strong>')
    )
  })

  test('GET /explorer/tasklist renders plants task list when session holds a plants scenario', async () => {
    const journeyResponse = await server.inject({
      method: 'GET',
      url: '/explorer?scenario=import-apples'
    })
    const cookie = extractCookie(journeyResponse)

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/explorer/tasklist',
      headers: cookie ? { cookie } : {}
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toEqual(expect.stringContaining('Packer'))
    expect(result).not.toEqual(expect.stringContaining('CPH number'))
  })

  // ---------------------------------------------------------------------------
  // Commodity-config is journey-agnostic now (Story 02) — the previous
  // interim "not available" gate has been removed; the page renders
  // properly for plants.
  // ---------------------------------------------------------------------------

  test('GET /explorer/commodity-config renders the plants page (all dimensions + details, no gate)', async () => {
    // Use a known HMI+GMS species — it has all four plants dimensions
    // populated plus commodity classes.
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/explorer/commodity-config?commodity=0805108010|CIDAU'
    })

    expect(statusCode).toBe(statusCodes.ok)

    // Old gate must be gone.
    expect(result).not.toEqual(
      expect.stringContaining(
        'Commodity config is not available for this journey'
      )
    )
    // Nav link is present again.
    expect(result).toEqual(
      expect.stringContaining('href="/explorer/commodity-config"')
    )

    // All four plants dimensions appear as section headings.
    expect(result).toContain('Regulatory authority')
    expect(result).toContain('Marketing standard')
    expect(result).toContain('Validity period')
    expect(result).toContain('Commodity group')

    // Three plants details appear.
    expect(result).toContain('Commodity routing')
    expect(result).toContain('Quality classes')
    expect(result).toContain('Varieties')

    // Species-grain dimension values surfaced for this HMI+GMS species.
    expect(result).toContain('HMI')
    expect(result).toContain('GMS')
    // Commodity group surfaced (0805108010 → Fruit and nuts).
    expect(result).toContain('Fruit and nuts')

    // Animals-only labels must NOT leak.
    expect(result).not.toContain('CPH Number')
    expect(result).not.toContain('purpose_set_')
  })

  test('detail block formats value-by-type (Disabled / Not provided / text)', async () => {
    // Apples 0808108090|MABSD: all commodity flags false, propagation
    // null, has both varieties and classes — exercises three of the
    // four render kinds in one request (Enabled is covered by the
    // animals parity test).
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/explorer/commodity-config?commodity=0808108090|MABSD'
    })

    expect(statusCode).toBe(statusCodes.ok)
    // Boolean false → "Disabled" tag.
    expect(result).toContain('Disabled')
    // null (propagation) → "Not provided".
    expect(result).toContain('Not provided')
    // Variety + class strings rendered as text.
    expect(result).toContain('Braeburn')
    expect(result).toContain('Extra Class')
  })

  test('GET /explorer/commodity-config (PHSI-only commodity) renders explicit absence for species-grain dimensions', async () => {
    // PHSI-only commodity — represented by the `code|` fallback key
    // format. Species-grain dimensions render explicit absence ("0 of
    // N possible values" + excluded list); commodity-grain group +
    // commodity details still render.
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/explorer/commodity-config?commodity=06042090|'
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Commodity Summary')
    // Commodity-grain group dimension still rendered.
    expect(result).toContain('Commodity group')
    // Species-grain dimensions render "0 of N possible values" because
    // the PHSI commodity has no species row → empty included list.
    expect(result).toContain('0 of')
    // And the excluded list still surfaces what *other* species have —
    // e.g. JOINT is in the regulatory_authority superset, so it
    // appears in the Excluded section here.
    expect(result).toContain('JOINT')
  })

  // ---------------------------------------------------------------------------
  // T4 — Scenario-param mismatch on a journey that doesn't own it
  // ---------------------------------------------------------------------------

  test('GET /explorer?scenario=import-cattle (an animals scenario) under plants renders the empty state, not a crash', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/explorer?scenario=import-cattle'
    })

    expect(statusCode).toBe(statusCodes.ok)
    // Mirrors the existing "scenario=empty clears session" assertion style:
    // when no notification is loaded, the journey-structure block is absent.
    expect(result).not.toEqual(expect.stringContaining('Journey Structure'))
  })
})
