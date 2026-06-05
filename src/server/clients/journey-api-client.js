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

const fetchJson = async (baseUrl, path, { traceId } = {}) => {
  const url = resolveUrl(baseUrl, path)
  const response = await fetch(url, { headers: buildHeaders(traceId) })
  if (!response.ok) {
    throw new ApiError(response.status, 'GET', url, await parseBody(response))
  }
  return parseBody(response)
}

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
    throw new Error(
      'getRefdataView: species requires commodity to also be set'
    )
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
      return get(`${journeyBase(key)}/refdata-view${buildRefdataViewQuery(opts)}`)
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
    }
  }
}

export const clientForRequest = (request) =>
  createJourneyApiClient({
    baseUrl: request.server?.info?.uri,
    traceId: request.headers?.[traceHeaderName()]
  })

/**
 * Normalise a journey-list entry to its bare key string. The HTTP
 * `listJourneys` returns summary objects (`{ key, name, ... }`); the
 * in-process fallback returns bare key strings. Callers that just want
 * the keys can `journeys.map(extractJourneyKey)` regardless of source.
 */
export const extractJourneyKey = (entry) =>
  typeof entry === 'string' ? entry : (entry?.key ?? '')
