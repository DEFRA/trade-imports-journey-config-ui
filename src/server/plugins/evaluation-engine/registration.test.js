/**
 * Plugin registration smoke test.
 *
 * Behaviour & risks (≤5 lines):
 *   With two journeys registered (eu-live-animals + chedpp-plants),
 *   both must pass validateJourney at startup, listJourneys must
 *   return both keys, and the evaluate facade must route by key.
 *   Risks: adapter shape mismatch for either journey, accidental
 *   coupling between journey modules, key-routing regression.
 *
 * No mocks. Boots the full server so the real Hapi registration
 * path exercises the plugin.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from '../../server.js'
import { scenarioMap as chedppScenarios } from '../../journeys/chedpp-plants/scenarios.js'

describe('evaluation-engine plugin registration', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  it('listJourneys() returns both registered keys (order-independent)', () => {
    const keys = server.app.evaluationEngine.listJourneys()
    expect(keys.sort()).toEqual(['chedpp-plants', 'eu-live-animals'])
  })

  it('evaluate("chedpp-plants", {}) returns an EvaluationResult without throwing', () => {
    const result = server.app.evaluationEngine.evaluate('chedpp-plants', {})

    expect(result).toMatchObject({
      obligations: expect.any(Array),
      summary: expect.objectContaining({
        satisfied: expect.any(Number),
        unsatisfied: expect.any(Number),
        deferred: expect.any(Number),
        inactive: expect.any(Number),
        total: expect.any(Number),
        submittable: expect.any(Boolean)
      })
    })
    expect(result.obligations.length).toBe(result.summary.total)
  })

  it('evaluate("chedpp-plants", <committed scenario>) yields summary.submittable === true', () => {
    const { notification } = chedppScenarios['import-apples']
    const result = server.app.evaluationEngine.evaluate(
      'chedpp-plants',
      notification
    )
    expect(result.summary.submittable).toBe(true)
    expect(result.summary.unsatisfied).toBe(0)
    expect(result.summary.deferred).toBe(0)
  })

  it('evaluate("eu-live-animals", {}) still works after chedpp-plants registration (regression)', () => {
    const result = server.app.evaluationEngine.evaluate('eu-live-animals', {})
    expect(result).toMatchObject({
      obligations: expect.any(Array),
      summary: expect.objectContaining({
        total: expect.any(Number),
        submittable: false
      })
    })
  })
})
