import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi
} from 'vitest'

// Module-spy on the journey-api-client. Default behaviour (set in
// beforeEach) is to delegate to the real implementation, so every
// test that doesn't override sees real loopback HTTP. Fail-loud
// asymmetry tests call `clientForRequest.mockImplementation(...)`
// to inject a partial fake client that throws from one method.
// Persistent (not once-only) because navContext also calls
// clientForRequest before the handler does.
vi.mock('#server/clients/journey-api-client.js', async () => {
  const actual = await vi.importActual('#server/clients/journey-api-client.js')
  return {
    ...actual,
    clientForRequest: vi.fn()
  }
})

import { createServer } from '../../server.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import {
  clientForRequest,
  createJourneyApiClient,
  ApiError
} from '#server/clients/journey-api-client.js'

const realClientForRequest = (request) =>
  createJourneyApiClient({ baseUrl: request.server?.info?.uri })

// Builds a partial fake client: real for every method except `method`,
// which rejects. Applied via clientForRequest.mockImplementation so it
// survives navContext's prior call to clientForRequest in the same
// request.
const withFailingMethod = (method) => {
  clientForRequest.mockImplementation((request) => ({
    ...realClientForRequest(request),
    [method]: () =>
      Promise.reject(new ApiError(500, 'GET', `http://x/${method}`, 'boom'))
  }))
}

describe('commodity-config controller', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    if (server) await server.stop({ timeout: 0 })
  })

  beforeEach(() => {
    // Restore the default delegate before each test.
    clientForRequest.mockImplementation(realClientForRequest)
  })

  // ---------------------------------------------------------------------
  // Two-branch shape + defensive guard table
  // ---------------------------------------------------------------------

  test('no ?commodity= renders dropdown only', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/explorer/commodity-config'
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Select a commodity')
    expect(result).not.toContain('Commodity Summary')
    expect(result).not.toContain('Pages this commodity drives')
  })

  test.each([
    { query: '', label: 'empty' },
    { query: '%20', label: 'whitespace' },
    { query: '%7CBos+taurus', label: 'species-only (|Bos taurus)' }
  ])(
    'defensive guard: ?commodity=$label routes to no-commodity render',
    async ({ query }) => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: `/explorer/commodity-config?commodity=${query}`
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).not.toContain('Commodity Summary')
      expect(result).not.toContain('Pages this commodity drives')
    }
  )

  test('well-formed ?commodity=zzz renders with-commodity shell, page-variance panel absent (404 swallowed)', async () => {
    // 'zzz' parses to { commodityID: 'zzz', speciesName: '' }. The
    // /page-variance endpoint 404s on unknown commodity → .catch
    // returns { pageVariance: [] }. /refdata-view does not 404 — its
    // closures return empty values for the unknown key — so the
    // dimension/detail panels still render (just empty). If a future
    // refactor tightens /refdata-view to 404 on unknown codes, this
    // test will surface that change as a 500 and need rethinking.
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/explorer/commodity-config?commodity=zzz'
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Commodity Summary')
    expect(result).toContain('zzz')
    expect(result).not.toContain('Pages this commodity drives')
  })

  // ---------------------------------------------------------------------
  // Fail-loud asymmetry: core fetches throw → 500;
  //                     demo affordance throws → 200 with degraded render
  // ---------------------------------------------------------------------

  test('500 when getCommodities throws', async () => {
    withFailingMethod('getCommodities')

    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/explorer/commodity-config?commodity=102%7CBos+taurus'
    })

    expect(statusCode).toBe(statusCodes.internalServerError)
  })

  test('500 when getRefdataView throws', async () => {
    withFailingMethod('getRefdataView')

    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/explorer/commodity-config?commodity=102%7CBos+taurus'
    })

    expect(statusCode).toBe(statusCodes.internalServerError)
  })

  test('200 when getPageVariance throws — page renders without page-variance panel', async () => {
    withFailingMethod('getPageVariance')

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/explorer/commodity-config?commodity=102%7CBos+taurus'
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Commodity Summary')
    expect(result).not.toContain('Pages this commodity drives')
  })

  // ---------------------------------------------------------------------
  // Template guard — variance UI is gone, dimension data still present
  // ---------------------------------------------------------------------

  test('happy-path render contains dimension data and none of the dropped variance UI', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/explorer/commodity-config?commodity=102%7CBos+taurus'
    })

    expect(statusCode).toBe(statusCodes.ok)

    // What MUST still be there
    expect(result).toContain('Commodity Summary')
    expect(result).toContain('102')
    expect(result).toContain('Bos taurus')
    expect(result).toContain('purpose_set_04')
    expect(result).toContain('Breeding')
    expect(result).toContain('Pages this commodity drives')

    // What MUST NOT be there (the variance cull)
    expect(result).not.toContain('Commodity-specific')
    expect(result).not.toMatch(/of \d+ possible values/)
    expect(result).not.toContain('Excluded values')
    expect(result).not.toContain('totalCommodities')
  })
})
