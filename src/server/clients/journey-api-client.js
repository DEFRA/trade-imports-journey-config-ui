import { config } from '#config/config.js'

export class ApiError extends Error {
  constructor(status, method, url, body) {
    super(`HTTP ${status} on ${method} ${url}`)
    this.name = 'ApiError'
    this.status = status
    this.method = method
    this.url = url
    this.body = body
  }
}

const parseBody = async (response) => {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return response.text()
  try {
    return await response.json()
  } catch {
    // The JSON parse consumed the stream; `text()` will typically
    // reject as well. The empty-string fallback prevents the error
    // path from itself throwing — callers see ApiError.body === ''
    // rather than a SyntaxError replacing the real status.
    return response.text().catch(() => '')
  }
}

const traceHeaderName = () => config.get('tracing.header')

const buildHeaders = (traceId) =>
  traceId ? { [traceHeaderName()]: traceId } : {}

const ensureTrailingSlash = (s) => (s.endsWith('/') ? s : `${s}/`)
const stripLeadingSlash = (s) => (s.startsWith('/') ? s.slice(1) : s)

const resolveUrl = (baseUrl, path) =>
  new URL(stripLeadingSlash(path), ensureTrailingSlash(baseUrl)).toString()

const jsonHeaders = (traceId) => ({
  ...buildHeaders(traceId),
  'content-type': 'application/json'
})

const fetchJson = async (baseUrl, path, { traceId } = {}) => {
  const url = resolveUrl(baseUrl, path)
  const response = await fetch(url, { headers: buildHeaders(traceId) })
  if (!response.ok) {
    throw new ApiError(response.status, 'GET', url, await parseBody(response))
  }
  return parseBody(response)
}

const sendJson = async (method, baseUrl, path, body, { traceId } = {}) => {
  const url = resolveUrl(baseUrl, path)
  const response = await fetch(url, {
    method,
    headers: jsonHeaders(traceId),
    body: JSON.stringify(body ?? {})
  })
  if (!response.ok) {
    throw new ApiError(response.status, method, url, await parseBody(response))
  }
  // 204 No Content (used by PUT /ui/session/notification) — no body to parse.
  if (response.status === 204) return undefined
  return parseBody(response)
}

const postJson = (baseUrl, path, body, opts) =>
  sendJson('POST', baseUrl, path, body, opts)

const putJson = (baseUrl, path, body, opts) =>
  sendJson('PUT', baseUrl, path, body, opts)

const assertBaseUrl = (baseUrl) => {
  if (!baseUrl) {
    throw new Error(
      'journey-api-client: baseUrl is required (set API_BASE_URL or pass baseUrl explicitly)'
    )
  }
}

const encodeSegment = (value) => encodeURIComponent(value)

const journeyBase = (key) => `/api/config/journeys/${encodeSegment(key)}`

const hasValue = (v) => typeof v === 'string' && v.trim().length > 0

const buildRefdataViewQuery = ({ commodity, species } = {}) => {
  // Client-side mirror of the server's Joi `.with('species', 'commodity')`
  // constraint. Throwing here gives a clear stack trace instead of an
  // opaque 400 from the server.
  if (hasValue(species) && !hasValue(commodity)) {
    throw new Error('getRefdataView: species requires commodity to also be set')
  }
  const params = new URLSearchParams()
  if (hasValue(commodity)) params.set('commodity', commodity)
  if (hasValue(species)) params.set('species', species)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export const createJourneyApiClient = ({
  baseUrl = config.get('apiBaseUrl'),
  traceId
} = {}) => {
  assertBaseUrl(baseUrl)
  const get = (path) => fetchJson(baseUrl, path, { traceId })

  return {
    async listJourneys() {
      const { journeys } = await get('/api/config/journeys')
      return journeys ?? []
    },

    async getJourney(key) {
      return get(journeyBase(key))
    },

    async getJourneyRefdata(key) {
      return get(`${journeyBase(key)}/refdata`)
    },

    async getRefdataView(key, opts) {
      return get(
        `${journeyBase(key)}/refdata-view${buildRefdataViewQuery(opts)}`
      )
    },

    async getCommodities(key) {
      const { commodities } = await get(`${journeyBase(key)}/commodities`)
      return commodities ?? []
    },

    async getCommodityDetail(key, code, species) {
      if (!hasValue(code)) {
        throw new Error('getCommodityDetail: code is required')
      }
      const path = hasValue(species)
        ? `${journeyBase(key)}/commodities/${encodeSegment(code)}/species/${encodeSegment(species)}`
        : `${journeyBase(key)}/commodities/${encodeSegment(code)}`
      return get(path)
    },

    // Returns the response body verbatim (`{ pageVariance: [...] }`).
    // Do NOT unwrap to a bare array — the wrapper IS the contract.
    // Story 05b's controller uses `.catch(() => ({ pageVariance: [] }))`
    // as a uniform fallback, which only works because the success path
    // returns the same shape.
    async getPageVariance(key, code, species) {
      if (!hasValue(code)) {
        throw new Error('getPageVariance: code is required')
      }
      const path = hasValue(species)
        ? `${journeyBase(key)}/commodities/${encodeSegment(code)}/page-variance/species/${encodeSegment(species)}`
        : `${journeyBase(key)}/commodities/${encodeSegment(code)}/page-variance`
      return get(path)
    },

    async evaluate(key, notification, { withTrace = false } = {}) {
      const qs = withTrace ? '?withTrace=true' : ''
      return postJson(
        baseUrl,
        `/api/engine/journeys/${encodeSegment(key)}/evaluate${qs}`,
        notification,
        { traceId }
      )
    },

    async getScreens(key, notification) {
      const { screens } = await postJson(
        baseUrl,
        `/api/engine/journeys/${encodeSegment(key)}/screens`,
        notification,
        { traceId }
      )
      return screens ?? []
    },

    async getSections(key, notification) {
      return postJson(
        baseUrl,
        `/api/engine/journeys/${encodeSegment(key)}/sections`,
        notification,
        { traceId }
      )
    },

    async putSessionNotification(notification) {
      return putJson(baseUrl, '/ui/session/notification', notification, {
        traceId
      })
    }
  }
}

export const clientForRequest = (request) =>
  createJourneyApiClient({
    baseUrl: request.server?.info?.uri,
    traceId: request.headers?.[traceHeaderName()]
  })

/**
 * Pull the bare key string out of a `listJourneys` summary object.
 * Kept as a named alias for grep-ability at call sites — readability
 * win over inlining `j => j.key`.
 */
export const extractJourneyKey = (entry) => entry?.key ?? ''
