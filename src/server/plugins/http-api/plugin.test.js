import { createServer } from '#server/server.js'
import { statusCodes } from '#server/common/constants/status-codes.js'

describe('#http-api plugin — GET /api/config/journeys', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('GET /api/config/journeys returns 200 with a journeys array envelope', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys'
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toMatchObject({ journeys: expect.any(Array) })
    // Joi response validation lives on the route; if it ever rejects
    // the handler's payload this assertion turns into a 500.
  })

  test('lists both registered journeys with keys eu-live-animals and chedpp-plants', async () => {
    const { result } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys'
    })

    const keys = result.journeys.map((j) => j.key)
    expect(keys).toEqual(
      expect.arrayContaining(['eu-live-animals', 'chedpp-plants'])
    )
    expect(keys).toHaveLength(2)
  })

  test.each([
    ['eu-live-animals', 23, 6],
    ['chedpp-plants', 28, 8]
  ])(
    'reports correct obligationCount and sectionCount for %s (expected %i obligations, %i sections)',
    async (key, obligationCount, sectionCount) => {
      const { result } = await server.inject({
        method: 'GET',
        url: '/api/config/journeys'
      })
      const entry = result.journeys.find((j) => j.key === key)
      expect(entry).toMatchObject({ key, obligationCount, sectionCount })
    }
  )

  test('each entry has exactly key, name, obligationCount, sectionCount and no extras', async () => {
    const { result } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys'
    })

    for (const entry of result.journeys) {
      expect(Object.keys(entry).sort()).toEqual([
        'key',
        'name',
        'obligationCount',
        'sectionCount'
      ])
    }
  })

  test('name falls back to key when journeyMap.name is absent', async () => {
    // Today, neither registered journey defines journeyMap.name, so the
    // fallback path is observable: name === key for both. When a future
    // journey sets a real name, this test will fail loudly and the
    // contract will evolve with it.
    const { result } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys'
    })

    for (const entry of result.journeys) {
      expect(entry.name).toBe(entry.key)
    }
  })

  test('endpoint is tagged "api" and "config" so it appears in the Swagger config group', () => {
    const route = server
      .table()
      .find((r) => r.path === '/api/config/journeys' && r.method === 'get')

    expect(route).toBeDefined()
    expect(route.settings.tags).toEqual(
      expect.arrayContaining(['api', 'config'])
    )
  })
})
