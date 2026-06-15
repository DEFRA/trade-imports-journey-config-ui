import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import createFetchMock from 'vitest-fetch-mock'

import {
  createJourneyApiClient,
  clientForRequest,
  ApiError
} from './journey-api-client.js'

const fetchMocker = createFetchMock(vi)

beforeAll(() => {
  fetchMocker.enableMocks()
})

beforeEach(() => {
  fetchMocker.resetMocks()
})

const okJson = (body) =>
  fetchMocker.mockResponseOnce(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })

const errorJson = (status, body) =>
  fetchMocker.mockResponseOnce(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

const lastRequest = () => {
  const call = fetchMocker.mock.calls[fetchMocker.mock.calls.length - 1]
  // The mocker is invoked with (Request) OR (url, init). Normalise.
  if (call[0] instanceof Request) {
    return {
      url: call[0].url,
      method: call[0].method,
      headers: Object.fromEntries(call[0].headers.entries())
    }
  }
  const [url, init = {}] = call
  return {
    url,
    method: init.method ?? 'GET',
    headers: init.headers ?? {}
  }
}

describe('createJourneyApiClient — listJourneys', () => {
  it('GETs <baseUrl>/api/config/journeys and returns the unwrapped journeys array', async () => {
    okJson({
      journeys: [
        { key: 'eu-live-animals', name: 'EU Live Animals' },
        { key: 'chedpp-plants', name: 'CHEDPP Plants' }
      ]
    })

    const client = createJourneyApiClient({ baseUrl: 'http://localhost:3001' })
    const journeys = await client.listJourneys()

    expect(journeys).toEqual([
      { key: 'eu-live-animals', name: 'EU Live Animals' },
      { key: 'chedpp-plants', name: 'CHEDPP Plants' }
    ])
    expect(lastRequest().url).toBe('http://localhost:3001/api/config/journeys')
    expect(lastRequest().method).toBe('GET')
  })

  it.each([
    ['http://localhost:3001', 'http://localhost:3001/api/config/journeys'],
    ['http://localhost:3001/', 'http://localhost:3001/api/config/journeys'],
    [
      'http://localhost:3001/api-gateway',
      'http://localhost:3001/api-gateway/api/config/journeys'
    ],
    [
      'http://localhost:3001/api-gateway/',
      'http://localhost:3001/api-gateway/api/config/journeys'
    ]
  ])(
    'joins baseUrl %s and path without duplicating slashes',
    async (baseUrl, expected) => {
      okJson({ journeys: [] })
      const client = createJourneyApiClient({ baseUrl })
      await client.listJourneys()
      expect(lastRequest().url).toBe(expected)
    }
  )

  it('throws a clear error when baseUrl is empty and no API_BASE_URL is set', () => {
    expect(() => createJourneyApiClient({ baseUrl: '' })).toThrow(
      /baseUrl is required/
    )
  })

  it('returns an empty array when the response envelope contains no journeys', async () => {
    okJson({ journeys: [] })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    const journeys = await client.listJourneys()
    expect(journeys).toEqual([])
  })
})

describe('createJourneyApiClient — error handling', () => {
  it.each([400, 404, 500])(
    'throws ApiError with status %s and parsed JSON body on a non-2xx response',
    async (status) => {
      errorJson(status, { error: 'Boom', message: 'something broke' })
      const client = createJourneyApiClient({ baseUrl: 'http://x' })

      await expect(client.listJourneys()).rejects.toMatchObject({
        name: 'ApiError',
        status,
        method: 'GET',
        url: 'http://x/api/config/journeys',
        body: { error: 'Boom', message: 'something broke' }
      })
    }
  )

  it('ApiError.message includes status, method, and URL for log readability', async () => {
    errorJson(500, { error: 'Boom' })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })

    await expect(client.listJourneys()).rejects.toMatchObject({
      message: 'HTTP 500 on GET http://x/api/config/journeys'
    })
  })

  it('throws ApiError whose body is the raw text when Content-Type is not application/json', async () => {
    fetchMocker.mockResponseOnce('<html>502 Bad Gateway</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' }
    })

    const client = createJourneyApiClient({ baseUrl: 'http://x' })

    await expect(client.listJourneys()).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      body: '<html>502 Bad Gateway</html>'
    })
  })

  it('propagates network errors from fetch without wrapping them as ApiError', async () => {
    const networkError = new TypeError('fetch failed')
    fetchMocker.mockRejectOnce(networkError)
    const client = createJourneyApiClient({ baseUrl: 'http://x' })

    let caught
    try {
      await client.listJourneys()
    } catch (error) {
      caught = error
    }
    expect(caught).toBe(networkError)
    expect(caught).not.toBeInstanceOf(ApiError)
  })
})

describe('createJourneyApiClient — trace-id propagation', () => {
  it('forwards x-cdp-request-id when traceId is provided to the factory', async () => {
    okJson({ journeys: [] })
    const client = createJourneyApiClient({
      baseUrl: 'http://x',
      traceId: 'abc-123'
    })
    await client.listJourneys()
    expect(lastRequest().headers).toMatchObject({
      'x-cdp-request-id': 'abc-123'
    })
  })

  it('omits the x-cdp-request-id header entirely when traceId is undefined', async () => {
    okJson({ journeys: [] })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    await client.listJourneys()
    expect(lastRequest().headers).not.toHaveProperty('x-cdp-request-id')
  })
})

describe('clientForRequest', () => {
  it('derives baseUrl from request.server.info.uri and traceId from request headers', async () => {
    okJson({ journeys: [] })
    const fakeRequest = {
      server: { info: { uri: 'http://localhost:9999' } },
      headers: { 'x-cdp-request-id': 'trace-from-request' }
    }
    const client = clientForRequest(fakeRequest)
    await client.listJourneys()
    expect(lastRequest().url).toBe('http://localhost:9999/api/config/journeys')
    expect(lastRequest().headers).toMatchObject({
      'x-cdp-request-id': 'trace-from-request'
    })
  })
})

describe('createJourneyApiClient — getJourney', () => {
  it('GETs /api/config/journeys/{key} and returns the response body', async () => {
    okJson({
      key: 'eu-live-animals',
      obligations: [],
      journeyMap: {},
      scenarios: {}
    })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    const journey = await client.getJourney('eu-live-animals')

    expect(lastRequest().url).toBe(
      'http://x/api/config/journeys/eu-live-animals'
    )
    expect(journey).toMatchObject({ key: 'eu-live-animals' })
  })

  it('encodeURIComponent-s the key segment', async () => {
    okJson({ key: 'weird/key', obligations: [], journeyMap: {}, scenarios: {} })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    await client.getJourney('weird/key')
    expect(lastRequest().url).toBe('http://x/api/config/journeys/weird%2Fkey')
  })
})

describe('createJourneyApiClient — getJourneyRefdata', () => {
  it('GETs /api/config/journeys/{key}/refdata', async () => {
    okJson({ routing: {}, content: {} })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    const refdata = await client.getJourneyRefdata('eu-live-animals')
    expect(lastRequest().url).toBe(
      'http://x/api/config/journeys/eu-live-animals/refdata'
    )
    expect(refdata).toMatchObject({ routing: {} })
  })
})

describe('createJourneyApiClient — getRefdataView', () => {
  it('omits the query string entirely when no options are provided', async () => {
    okJson({ dimensions: [], details: [] })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    await client.getRefdataView('eu-live-animals')
    expect(lastRequest().url).toBe(
      'http://x/api/config/journeys/eu-live-animals/refdata-view'
    )
  })

  it('encodes commodity and species into the query string', async () => {
    okJson({ dimensions: [], details: [] })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    await client.getRefdataView('eu-live-animals', {
      commodity: '1063100',
      species: 'Bos taurus'
    })
    expect(lastRequest().url).toBe(
      'http://x/api/config/journeys/eu-live-animals/refdata-view?commodity=1063100&species=Bos+taurus'
    )
  })

  it('throws when species is provided without commodity (client-side guard mirrors server)', async () => {
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    await expect(() =>
      client.getRefdataView('eu-live-animals', { species: 'Strigiformes' })
    ).rejects.toThrow(/species requires commodity/)
  })
})

describe('createJourneyApiClient — getCommodities', () => {
  it('GETs /api/config/journeys/{key}/commodities and returns the array', async () => {
    okJson({ commodities: ['102|', '1063100|Strigiformes'] })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    const list = await client.getCommodities('eu-live-animals')
    expect(lastRequest().url).toBe(
      'http://x/api/config/journeys/eu-live-animals/commodities'
    )
    expect(list).toEqual(['102|', '1063100|Strigiformes'])
  })
})

describe('createJourneyApiClient — getCommodityDetail', () => {
  it('omits the /species/{species} segment when species is undefined', async () => {
    okJson({ group: 'Fruit and nuts' })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    await client.getCommodityDetail('chedpp-plants', '0808108090')
    expect(lastRequest().url).toBe(
      'http://x/api/config/journeys/chedpp-plants/commodities/0808108090'
    )
  })

  it.each([null, ''])(
    'omits the /species segment when species is %p',
    async (species) => {
      okJson({ group: 'Fruit and nuts' })
      const client = createJourneyApiClient({ baseUrl: 'http://x' })
      await client.getCommodityDetail('chedpp-plants', '0808108090', species)
      expect(lastRequest().url).toBe(
        'http://x/api/config/journeys/chedpp-plants/commodities/0808108090'
      )
    }
  )

  it('appends /species/{encoded} when species is provided', async () => {
    okJson({ regulatoryAuthority: 'JOINT' })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    await client.getCommodityDetail('eu-live-animals', '1063100', 'Bos taurus')
    expect(lastRequest().url).toBe(
      'http://x/api/config/journeys/eu-live-animals/commodities/1063100/species/Bos%20taurus'
    )
  })

  it('throws when code is missing or empty', async () => {
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    await expect(() =>
      client.getCommodityDetail('eu-live-animals')
    ).rejects.toThrow(/code is required/)
    await expect(() =>
      client.getCommodityDetail('eu-live-animals', '')
    ).rejects.toThrow(/code is required/)
  })
})

describe('createJourneyApiClient — getPageVariance', () => {
  it('omits the /species/{species} segment when species is undefined', async () => {
    okJson({ pageVariance: [] })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    await client.getPageVariance('chedpp-plants', '0808108090')
    expect(lastRequest().url).toBe(
      'http://x/api/config/journeys/chedpp-plants/commodities/0808108090/page-variance'
    )
  })

  it.each([null, ''])(
    'omits the /species segment when species is %p',
    async (species) => {
      okJson({ pageVariance: [] })
      const client = createJourneyApiClient({ baseUrl: 'http://x' })
      await client.getPageVariance('chedpp-plants', '0808108090', species)
      expect(lastRequest().url).toBe(
        'http://x/api/config/journeys/chedpp-plants/commodities/0808108090/page-variance'
      )
    }
  )

  it('appends /species/{encoded} when species is provided', async () => {
    okJson({ pageVariance: [] })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    await client.getPageVariance('eu-live-animals', '1063100', 'Bos taurus')
    expect(lastRequest().url).toBe(
      'http://x/api/config/journeys/eu-live-animals/commodities/1063100/page-variance/species/Bos%20taurus'
    )
  })

  it('returns the response body verbatim with the pageVariance wrapper preserved', async () => {
    // Load-bearing: Story 05b's controller relies on the wrapper for a
    // uniform `.catch(() => ({ pageVariance: [] }))` fallback. A future
    // "tidy up" that unwraps to a bare array would break that.
    const body = {
      pageVariance: [
        {
          screenId: 'gms-declaration',
          screenName: 'GMS declaration',
          activates: true,
          drivers: [
            {
              id: 'gms-declaration',
              name: 'GMS declaration required',
              active: true,
              reason: 'HMI-inspected species with GMS marketing standard'
            }
          ]
        }
      ]
    }
    okJson(body)
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    const result = await client.getPageVariance(
      'chedpp-plants',
      '0805108010',
      'CIDAU'
    )
    expect(result).toEqual(body)
  })

  it('throws when code is missing or empty', async () => {
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    await expect(() => client.getPageVariance('chedpp-plants')).rejects.toThrow(
      /code is required/
    )
    await expect(() =>
      client.getPageVariance('chedpp-plants', '')
    ).rejects.toThrow(/code is required/)
  })
})

describe('createJourneyApiClient — evaluate', () => {
  it('POSTs the raw notification to /api/engine/journeys/{key}/evaluate with no query', async () => {
    okJson({ obligations: [], summary: { total: 0, submittable: true } })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    const notif = { origin: { country: 'NL' } }
    await client.evaluate('eu-live-animals', notif)

    const req = lastRequest()
    expect(req.url).toBe(
      'http://x/api/engine/journeys/eu-live-animals/evaluate'
    )
    expect(req.method).toBe('POST')
  })

  it('appends ?withTrace=true when called with { withTrace: true }', async () => {
    okJson({ obligations: [], summary: {} })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    await client.evaluate('eu-live-animals', {}, { withTrace: true })
    expect(lastRequest().url).toBe(
      'http://x/api/engine/journeys/eu-live-animals/evaluate?withTrace=true'
    )
  })

  it('returns the parsed EvaluationResult body', async () => {
    const expected = {
      obligations: [{ id: 'x', status: 'satisfied' }],
      summary: { total: 1, submittable: true }
    }
    okJson(expected)
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    const result = await client.evaluate('eu-live-animals', {})
    expect(result).toEqual(expected)
  })

  it('surfaces non-2xx as ApiError', async () => {
    errorJson(500, { error: 'Boom', message: 'broken' })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    await expect(client.evaluate('eu-live-animals', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 500
    })
  })
})

describe('createJourneyApiClient — getScreens', () => {
  it('POSTs raw notification and returns { screens } unwrapped to array', async () => {
    okJson({ screens: [{ screenId: 'a' }] })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    const screens = await client.getScreens('eu-live-animals', {})
    expect(lastRequest().url).toBe(
      'http://x/api/engine/journeys/eu-live-animals/screens'
    )
    expect(screens).toEqual([{ screenId: 'a' }])
  })
})

describe('createJourneyApiClient — getSections', () => {
  it('POSTs raw notification and returns the full { sections, summary } envelope', async () => {
    const body = {
      sections: [{ sectionId: 's', status: 'incomplete' }],
      summary: { total: 1 }
    }
    okJson(body)
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    const result = await client.getSections('eu-live-animals', {})
    expect(lastRequest().url).toBe(
      'http://x/api/engine/journeys/eu-live-animals/sections'
    )
    expect(result).toEqual(body)
  })
})

describe('createJourneyApiClient — putSessionNotification', () => {
  it('PUTs the raw notification body to /ui/session/notification', async () => {
    // The Response constructor disallows a body on 204 — return 200
    // with empty body; the client's 204 branch is exercised by the
    // server-side test in src/server/routes/ui-state/.
    fetchMocker.mockResponseOnce('', { status: 200 })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    await client.putSessionNotification({ a: 1 })
    expect(lastRequest().url).toBe('http://x/ui/session/notification')
    expect(lastRequest().method).toBe('PUT')
  })

  it('surfaces non-2xx as ApiError', async () => {
    fetchMocker.mockResponseOnce(JSON.stringify({ error: 'Bad' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    })
    const client = createJourneyApiClient({ baseUrl: 'http://x' })
    await expect(client.putSessionNotification({})).rejects.toMatchObject({
      name: 'ApiError',
      status: 400
    })
  })
})
