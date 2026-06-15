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

  test('lists all three registered journeys', async () => {
    const { result } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys'
    })

    const keys = result.journeys.map((j) => j.key)
    expect(keys).toEqual(
      expect.arrayContaining([
        'eu-live-animals',
        'chedpp-plants',
        'chedd-products'
      ])
    )
    expect(keys).toHaveLength(3)
  })

  test.each([
    ['eu-live-animals', 23, 6],
    ['chedpp-plants', 28, 8],
    ['chedd-products', 18, 6]
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

describe('#http-api plugin — GET /api/config/journeys/{key}', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test.each([
    ['eu-live-animals', 23],
    ['chedpp-plants', 28],
    ['chedd-products', 18]
  ])(
    'returns 200 with full journey body (refdata stripped) for %s',
    async (key, obligationCount) => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: `/api/config/journeys/${key}`
      })
      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toMatchObject({
        key,
        obligations: expect.any(Array),
        journeyMap: expect.any(Object),
        scenarios: expect.any(Object)
      })
      expect(result.obligations).toHaveLength(obligationCount)
      // refdata MUST NOT appear in the response.
      expect(result).not.toHaveProperty('refdata')
    }
  )

  test('returns 404 for an unknown journey key', async () => {
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/unknown-journey'
    })
    expect(statusCode).toBe(statusCodes.notFound)
  })
})

describe('#http-api plugin — GET /api/config/journeys/{key}/refdata (bulk)', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('returns 200 with the journey-specific refdata as a JSON object (animals)', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/eu-live-animals/refdata'
    })
    expect(statusCode).toBe(statusCodes.ok)
    // Assert by known animal fixture key, not full equality (size).
    expect(result).toHaveProperty('routing')
    expect(result).toHaveProperty('content')
    expect(result.routing).toHaveProperty('102|')
  })

  test('returns 200 with the journey-specific refdata as a JSON object (plants)', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/chedpp-plants/refdata'
    })
    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toHaveProperty('commodities')
    expect(result).toHaveProperty('species')
    expect(Object.keys(result.commodities).length).toBeGreaterThan(100)
  })

  test('returns 404 for an unknown journey key', async () => {
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/unknown/refdata'
    })
    expect(statusCode).toBe(statusCodes.notFound)
  })

  test('route omits response.schema (bulk endpoint) but keeps status[500] error schema', () => {
    const route = server
      .table()
      .find(
        (r) =>
          r.path === '/api/config/journeys/{key}/refdata' && r.method === 'get'
      )
    expect(route).toBeDefined()
    // Hapi compiles `response.schema` into `route.settings.response.schema`;
    // when omitted, it's null/undefined. The 500 status schema is the only
    // validation we want for this endpoint.
    expect(route.settings.response?.schema).toBeFalsy()
    expect(route.settings.response?.status?.['500']).toBeDefined()
  })
})

describe('#http-api plugin — GET /api/config/journeys/{key}/refdata-view', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('with no query params, returns metadata-only dimensions and details', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/eu-live-animals/refdata-view'
    })
    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toMatchObject({
      dimensions: expect.any(Array),
      details: expect.any(Array)
    })
    // Metadata-only: each entry has id+name but no values/rows.
    for (const d of result.dimensions) {
      expect(d).toHaveProperty('id')
      expect(d).toHaveProperty('name')
      expect(d).not.toHaveProperty('values')
    }
    for (const d of result.details) {
      expect(d).toHaveProperty('id')
      expect(d).toHaveProperty('name')
      expect(d).not.toHaveProperty('rows')
    }
  })

  test('with commodity+species, returns resolved values and rows (plain data, no functions)', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/eu-live-animals/refdata-view?commodity=1063100&species=Strigiformes'
    })
    expect(statusCode).toBe(statusCodes.ok)
    expect(result.dimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'purpose', values: expect.any(Array) })
      ])
    )
    expect(result.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'routing', rows: expect.any(Array) })
      ])
    )
    // None of the values/rows should be functions or undefined.
    for (const d of result.dimensions) {
      expect(typeof d.values).not.toBe('function')
    }
  })

  test('with commodity only, runs closures against the species-agnostic key', async () => {
    // Animals: '102|' is species-agnostic; closures must resolve against
    // that composite key when species is absent.
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/eu-live-animals/refdata-view?commodity=102'
    })
    expect(statusCode).toBe(statusCodes.ok)
    expect(result.dimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'purpose', values: expect.any(Array) })
      ])
    )
  })

  test('returns 400 when species is provided without commodity', async () => {
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/eu-live-animals/refdata-view?species=Strigiformes'
    })
    expect(statusCode).toBe(statusCodes.badRequest)
  })

  test('returns 404 for an unknown journey key', async () => {
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/unknown/refdata-view'
    })
    expect(statusCode).toBe(statusCodes.notFound)
  })
})

describe('#http-api plugin — GET /api/config/journeys/{key}/commodities', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test.each([
    ['eu-live-animals', 67],
    ['chedpp-plants', 5690],
    ['chedd-products', 2176]
  ])('returns { commodities: [...] } for %s', async (key, minLength) => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: `/api/config/journeys/${key}/commodities`
    })
    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toMatchObject({ commodities: expect.any(Array) })
    expect(result.commodities.length).toBe(minLength)
  })

  test('returns 404 for an unknown journey key', async () => {
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/unknown/commodities'
    })
    expect(statusCode).toBe(statusCodes.notFound)
  })
})

describe('#http-api plugin — GET /api/config/journeys/{key}/commodities/{code}', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('returns commodity-level driver for a known PHSI-only plants code', async () => {
    // Plants: '10011100' is a PHSI-only commodity (has commodity row, no species rows).
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/chedpp-plants/commodities/10011100'
    })
    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toMatchObject({
      group: expect.any(String),
      requiresTestAndTrial: expect.any(Boolean)
    })
    expect(result).not.toHaveProperty('regulatoryAuthority')
  })

  test('returns commodity-level driver for animals using species-agnostic code', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/eu-live-animals/commodities/102'
    })
    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toMatchObject({
      routingFlags: expect.objectContaining({
        cphNumber: expect.any(Boolean)
      })
    })
  })

  test('returns 404 when commodity code is unknown', async () => {
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/eu-live-animals/commodities/99999'
    })
    expect(statusCode).toBe(statusCodes.notFound)
  })
})

describe('#http-api plugin — GET /api/config/journeys/{key}/commodities/{code}/species/{species}', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('returns species-level driver for animals 1063100 / Strigiformes', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/eu-live-animals/commodities/1063100/species/Strigiformes'
    })
    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toMatchObject({
      routingFlags: expect.any(Object),
      content: expect.any(Object)
    })
  })

  test('returns species-level driver for plants 0808108090 / MABSD with varieties intact', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/chedpp-plants/commodities/0808108090/species/MABSD'
    })
    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toMatchObject({
      regulatoryAuthority: 'JOINT',
      marketingStandard: 'SMS',
      varieties: expect.arrayContaining(['Braeburn'])
    })
  })

  test('animals: unknown species falls back to the species-agnostic row (200)', async () => {
    // Per the joint-key fallback semantics for animals — when both
    // species-specific routing AND content miss, fall back to the
    // species-agnostic `${code}|` row. Result is the species-agnostic
    // detail, not a 404.
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/eu-live-animals/commodities/102/species/Nonexistent'
    })
    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toMatchObject({
      routingFlags: expect.objectContaining({
        cphNumber: expect.any(Boolean)
      })
    })
  })

  test('animals: 404 when both species-specific and species-agnostic miss', async () => {
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/eu-live-animals/commodities/99999/species/Nope'
    })
    expect(statusCode).toBe(statusCodes.notFound)
  })

  test('plants: 404 for unknown species (no cross-grain fallback)', async () => {
    // D17 — plants must NOT fall back from species-grain to commodity.
    // '0808108090' has a commodity entry, but '0808108090|UNKNOWN' has no
    // species row, so the species call returns null → 404.
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/chedpp-plants/commodities/0808108090/species/UNKNOWN'
    })
    expect(statusCode).toBe(statusCodes.notFound)
  })
})

describe('#http-api plugin — GET /api/config/journeys/{key}/commodities/{code}/page-variance', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test.each([
    ['eu-live-animals', '102'],
    ['chedpp-plants', '0805108010'],
    ['chedd-products', '1001']
  ])(
    'returns 200 with { pageVariance: [...] } envelope and well-formed entries for %s/%s',
    async (key, code) => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: `/api/config/journeys/${key}/commodities/${code}/page-variance`
      })
      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toMatchObject({ pageVariance: expect.any(Array) })
      expect(result.pageVariance.length).toBeGreaterThan(0)
      for (const row of result.pageVariance) {
        expect(row).toMatchObject({
          screenId: expect.any(String),
          screenName: expect.any(String),
          activates: expect.any(Boolean),
          drivers: expect.any(Array)
        })
        for (const d of row.drivers) {
          expect(d).toMatchObject({
            id: expect.any(String),
            name: expect.any(String),
            active: expect.any(Boolean),
            reason: expect.any(String)
          })
        }
      }
    }
  )

  test('PHSI-only plants commodity 06042090 with no species segment returns 200 with a pageVariance array', async () => {
    // The trailing-pipe boundary: handler must reassemble commodityKey
    // as '06042090|' (not '06042090'). A regression that dropped the
    // pipe would silently break parseCommodityKey downstream.
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/chedpp-plants/commodities/06042090/page-variance'
    })
    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toMatchObject({ pageVariance: expect.any(Array) })
  })

  test('returns 404 for unknown commodity code', async () => {
    // computePageVariance would happily return [] for a non-existent
    // commodity. The handler must check existence first so callers see
    // a real 404 instead of a misleading "empty" 200.
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/eu-live-animals/commodities/99999/page-variance'
    })
    expect(statusCode).toBe(statusCodes.notFound)
  })

  test('returns 404 for unknown journey', async () => {
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/unknown/commodities/102/page-variance'
    })
    expect(statusCode).toBe(statusCodes.notFound)
  })

  test('route is tagged "api" and "config" so it appears in the Swagger config group', () => {
    const route = server
      .table()
      .find(
        (r) =>
          r.path ===
            '/api/config/journeys/{key}/commodities/{code}/page-variance' &&
          r.method === 'get'
      )
    expect(route).toBeDefined()
    expect(route.settings.tags).toEqual(
      expect.arrayContaining(['api', 'config'])
    )
  })
})

describe('#http-api plugin — GET /api/config/journeys/{key}/commodities/{code}/page-variance/species/{species}', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test.each([
    ['0805108010', 'CIDAU', true],
    ['0709999090', 'DATME', false]
  ])(
    'plants %s/%s drives the GMS declaration screen with activates=%s',
    async (code, species, expectedActivates) => {
      // Activation crossover is the canary for commodityKey
      // reassembly: handler must produce 'code|species' so the pure
      // function reads the correct refdata row. If the pipe is
      // dropped or species is appended without it, both rows return
      // identically and this test fails.
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: `/api/config/journeys/chedpp-plants/commodities/${code}/page-variance/species/${species}`
      })
      expect(statusCode).toBe(statusCodes.ok)
      const gms = result.pageVariance.find(
        (r) => r.screenName === 'GMS declaration'
      )
      expect(gms).toBeDefined()
      expect(gms.activates).toBe(expectedActivates)
    }
  )

  test('plants: unknown species returns 200 (not 404) with a valid pageVariance array', async () => {
    // /page-variance does NOT own species existence. An unknown species
    // is a legitimate request: drivers that read species return
    // activates=false. Deliberate split from /commodities/{code}/species/{species}
    // which DOES 404.
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/chedpp-plants/commodities/0805108010/page-variance/species/UNKNOWN'
    })
    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toMatchObject({ pageVariance: expect.any(Array) })
  })

  test('returns 404 for unknown commodity code even when species segment is present', async () => {
    // Existence check must run before species reassembly. Catches the
    // copy-paste failure where the species branch skips the check.
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/api/config/journeys/eu-live-animals/commodities/99999/page-variance/species/Bos%20taurus'
    })
    expect(statusCode).toBe(statusCodes.notFound)
  })
})
