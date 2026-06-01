import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from '../../server.js'
import { config } from '#config/config.js'
import { statusCodes } from '../../common/constants/status-codes.js'

/**
 * Behaviour & intent (Story 01 — env-selected journey):
 *   With JOURNEY=chedpp-plants set in config, the explorer must serve the
 *   plants journey end-to-end: plants scenarios in the dropdown, plants
 *   screens in the rendered journey structure / task list, and zero
 *   leakage of animals-only content. Commodity-config is gated off (with
 *   an explicit notice) for non-animals.
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
    // Nav indicator shows the active journey
    expect(result).toEqual(expect.stringContaining('chedpp-plants'))
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
  // T3 — Commodity-config interim gate
  // ---------------------------------------------------------------------------

  test('GET /explorer/commodity-config renders the "not available" notice and the nav link is suppressed', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/explorer/commodity-config'
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toEqual(
      expect.stringContaining(
        'Commodity config is not available for this journey'
      )
    )
    // The nav link (and the commodity selection form) reference
    // `/explorer/commodity-config` — under the gate they must not appear.
    expect(result).not.toEqual(
      expect.stringContaining('href="/explorer/commodity-config"')
    )
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
