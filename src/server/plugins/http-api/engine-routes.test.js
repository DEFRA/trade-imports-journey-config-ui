import { describe, test, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createServer } from '#server/server.js'
import { statusCodes } from '#server/common/constants/status-codes.js'
import { stripTrace } from './engine-routes.js'

// ---- pure helper unit tests ----

describe('stripTrace', () => {
  test('removes trace from each obligation but keeps the rest', () => {
    const result = {
      obligations: [
        {
          id: 'a',
          status: 'satisfied',
          missingPaths: [],
          trace: { steps: [{ step: 'extract-fact' }] }
        }
      ],
      summary: { satisfied: 1 }
    }
    expect(stripTrace(result)).toEqual({
      obligations: [{ id: 'a', status: 'satisfied', missingPaths: [] }],
      summary: { satisfied: 1 }
    })
  })

  test('is idempotent when no obligation has trace', () => {
    const result = {
      obligations: [{ id: 'x', status: 'unsatisfied' }],
      summary: { unsatisfied: 1 }
    }
    expect(stripTrace(result)).toEqual(result)
  })

  test('does not mutate the input', () => {
    const result = {
      obligations: [{ id: 'a', status: 'satisfied', trace: { steps: [] } }],
      summary: {}
    }
    const snapshot = structuredClone(result)
    stripTrace(result)
    expect(result).toEqual(snapshot)
  })
})

// ---- route integration tests ----

describe('#http-api plugin — POST /api/engine/journeys/{key}/evaluate', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  const inject = (path, payload) =>
    server.inject({
      method: 'POST',
      url: path,
      payload,
      headers: { 'content-type': 'application/json' }
    })

  test.each([['eu-live-animals'], ['chedpp-plants']])(
    'returns { obligations, summary } without trace by default for %s',
    async (key) => {
      const { result, statusCode } = await inject(
        `/api/engine/journeys/${key}/evaluate`,
        {}
      )
      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toMatchObject({
        obligations: expect.any(Array),
        summary: expect.any(Object)
      })
      // No obligation should carry a trace field when withTrace is omitted.
      for (const o of result.obligations) {
        expect(o).not.toHaveProperty('trace')
      }
    }
  )

  test('attaches trace.steps[] to every obligation when withTrace=true', async () => {
    const { result, statusCode } = await inject(
      '/api/engine/journeys/eu-live-animals/evaluate?withTrace=true',
      {}
    )
    expect(statusCode).toBe(statusCodes.ok)
    expect(result.obligations.length).toBeGreaterThan(0)
    for (const o of result.obligations) {
      expect(o.trace).toBeDefined()
      expect(o.trace.steps).toEqual(expect.any(Array))
    }
  })

  test.each([
    ['true', true],
    ['false', false],
    ['0', false],
    ['anything', false]
  ])('treats ?withTrace=%s as trace=%s', async (raw, traceExpected) => {
    const { result } = await inject(
      `/api/engine/journeys/eu-live-animals/evaluate?withTrace=${raw}`,
      {}
    )
    const hasTrace = result.obligations.some((o) => 'trace' in o)
    expect(hasTrace).toBe(traceExpected)
  })

  test('summary contains the load-bearing keys with numeric values and a boolean submittable', async () => {
    const { result } = await inject(
      '/api/engine/journeys/eu-live-animals/evaluate',
      {}
    )
    expect(result.summary).toMatchObject({
      satisfied: expect.any(Number),
      unsatisfied: expect.any(Number),
      deferred: expect.any(Number),
      inactive: expect.any(Number),
      total: expect.any(Number),
      submittable: expect.any(Boolean)
    })
  })

  test('accepts empty body {} and returns a well-formed envelope', async () => {
    const { result, statusCode } = await inject(
      '/api/engine/journeys/chedpp-plants/evaluate',
      {}
    )
    expect(statusCode).toBe(statusCodes.ok)
    expect(result.obligations.length).toBeGreaterThan(0)
    expect(result.summary.total).toBe(result.obligations.length)
  })

  test('returns 404 for an unknown journey key', async () => {
    const { statusCode } = await inject(
      '/api/engine/journeys/unknown-journey/evaluate',
      {}
    )
    expect(statusCode).toBe(statusCodes.notFound)
  })
})

describe('#http-api plugin — POST /api/engine/journeys/{key}/screens', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  const inject = (path) =>
    server.inject({
      method: 'POST',
      url: path,
      payload: {},
      headers: { 'content-type': 'application/json' }
    })

  test.each([['eu-live-animals'], ['chedpp-plants']])(
    'returns { screens: Screen[] } for %s',
    async (key) => {
      const { result, statusCode } = await inject(
        `/api/engine/journeys/${key}/screens`
      )
      expect(statusCode).toBe(statusCodes.ok)
      expect(result.screens).toEqual(expect.any(Array))
      expect(result.screens.length).toBeGreaterThan(0)
    }
  )

  test('no screen contains a trace field anywhere', async () => {
    const { result } = await inject(
      '/api/engine/journeys/eu-live-animals/screens'
    )
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('"trace"')
  })

  test('ignores withTrace=true (screens shape is identical with or without)', async () => {
    const without = await inject('/api/engine/journeys/eu-live-animals/screens')
    const withQs = await inject(
      '/api/engine/journeys/eu-live-animals/screens?withTrace=true'
    )
    expect(withQs.result).toEqual(without.result)
  })

  test('returns 404 for unknown journey', async () => {
    const { statusCode } = await inject('/api/engine/journeys/nope/screens')
    expect(statusCode).toBe(statusCodes.notFound)
  })
})

describe('#http-api plugin — POST /api/engine/journeys/{key}/sections', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  const inject = (path) =>
    server.inject({
      method: 'POST',
      url: path,
      payload: {},
      headers: { 'content-type': 'application/json' }
    })

  test.each([['eu-live-animals'], ['chedpp-plants']])(
    'returns { sections, summary } for %s',
    async (key) => {
      const { result, statusCode } = await inject(
        `/api/engine/journeys/${key}/sections`
      )
      expect(statusCode).toBe(statusCodes.ok)
      expect(result.sections).toEqual(expect.any(Array))
      expect(result.summary).toBeDefined()
    }
  )

  test('summary matches /evaluate for the same body', async () => {
    const evaluate = await server.inject({
      method: 'POST',
      url: '/api/engine/journeys/eu-live-animals/evaluate',
      payload: {},
      headers: { 'content-type': 'application/json' }
    })
    const sections = await inject('/api/engine/journeys/eu-live-animals/sections')
    expect(sections.result.summary).toEqual(evaluate.result.summary)
  })

  test('sections never contain trace', async () => {
    const { result } = await inject(
      '/api/engine/journeys/chedpp-plants/sections'
    )
    expect(JSON.stringify(result.sections)).not.toContain('"trace"')
  })

  test('returns 404 for unknown journey', async () => {
    const { statusCode } = await inject('/api/engine/journeys/nope/sections')
    expect(statusCode).toBe(statusCodes.notFound)
  })
})

describe('#http-api plugin — engine route registration', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test.each([
    '/api/engine/journeys/{key}/evaluate',
    '/api/engine/journeys/{key}/screens',
    '/api/engine/journeys/{key}/sections'
  ])('%s declares payload.maxBytes = 5 MB', (path) => {
    const route = server
      .table()
      .find((r) => r.path === path && r.method === 'post')
    expect(route).toBeDefined()
    expect(route.settings.payload.maxBytes).toBe(5 * 1024 * 1024)
  })

  test.each([
    '/api/engine/journeys/{key}/evaluate',
    '/api/engine/journeys/{key}/screens',
    '/api/engine/journeys/{key}/sections'
  ])('%s is tagged "api" and "engine"', (path) => {
    const route = server
      .table()
      .find((r) => r.path === path && r.method === 'post')
    expect(route).toBeDefined()
    expect(route.settings.tags).toEqual(
      expect.arrayContaining(['api', 'engine'])
    )
  })
})

describe('#http-api plugin — strict status-enum drift guard', () => {
  let server
  let originalEvaluate

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
    originalEvaluate = server.app.evaluationEngine.evaluate
  })

  afterEach(() => {
    server.app.evaluationEngine.evaluate = originalEvaluate
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Joi response schema rejects an obligation status outside the four-value enum (-> 500)', async () => {
    server.app.evaluationEngine.evaluate = () => ({
      obligations: [
        { id: 'x', status: 'BOGUS', missingPaths: [], trace: { steps: [] } }
      ],
      summary: {
        satisfied: 0,
        unsatisfied: 0,
        deferred: 0,
        inactive: 0,
        total: 1,
        submittable: false
      }
    })

    const { statusCode } = await server.inject({
      method: 'POST',
      url: '/api/engine/journeys/eu-live-animals/evaluate',
      payload: {},
      headers: { 'content-type': 'application/json' }
    })
    expect(statusCode).toBe(statusCodes.internalServerError)
  })
})
