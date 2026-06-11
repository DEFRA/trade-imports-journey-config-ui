import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from '#server/server.js'
import { statusCodes } from '#server/common/constants/status-codes.js'

const extractCookie = (response) => {
  const set = response.headers['set-cookie']
  if (!set) return null
  const [first] = Array.isArray(set) ? set : [set]
  return first.split(';')[0]
}

describe('PUT /ui/session/notification', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('returns 204 and writes the notification to session', async () => {
    // Pick a notification value that survives Nunjucks `| escape`
    // unchanged — letters only. The debug page renders the session
    // notification stringified into a data attribute; double-quotes
    // get escaped to &quot;, so we assert against unique alphabetic
    // markers we can find unmolested.
    const notification = {
      origin: { country: 'NLderlands' },
      commodities: [{ species: 'XYZmarker' }]
    }

    const put = await server.inject({
      method: 'PUT',
      url: '/ui/session/notification',
      payload: notification,
      headers: { 'content-type': 'application/json' }
    })
    expect(put.statusCode).toBe(statusCodes.noContent)

    const cookie = extractCookie(put)
    const get = await server.inject({
      method: 'GET',
      url: '/explorer/debug',
      headers: cookie ? { cookie } : {}
    })
    expect(get.statusCode).toBe(statusCodes.ok)
    expect(get.result).toEqual(expect.stringContaining('NLderlands'))
    expect(get.result).toEqual(expect.stringContaining('XYZmarker'))
  })

  test('accepts empty body {}', async () => {
    const { statusCode } = await server.inject({
      method: 'PUT',
      url: '/ui/session/notification',
      payload: {},
      headers: { 'content-type': 'application/json' }
    })
    expect(statusCode).toBe(statusCodes.noContent)
  })

  test('route is registered and tagged "api" + "ui-state"', () => {
    const route = server
      .table()
      .find((r) => r.path === '/ui/session/notification' && r.method === 'put')
    expect(route).toBeDefined()
    expect(route.settings.tags).toEqual(
      expect.arrayContaining(['api', 'ui-state'])
    )
  })
})
