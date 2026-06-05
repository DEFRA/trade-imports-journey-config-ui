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

export const createJourneyApiClient = ({
  baseUrl = config.get('apiBaseUrl'),
  traceId
} = {}) => {
  assertBaseUrl(baseUrl)
  return {
    async listJourneys() {
      const { journeys } = await fetchJson(baseUrl, '/api/config/journeys', {
        traceId
      })
      return journeys ?? []
    }
  }
}

export const clientForRequest = (request) =>
  createJourneyApiClient({
    baseUrl: request.server?.info?.uri,
    traceId: request.headers?.[traceHeaderName()]
  })
