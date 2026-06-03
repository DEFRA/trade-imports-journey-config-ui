import { createServer } from '#server/server.js'
import { statusCodes } from '#server/common/constants/status-codes.js'

describe('#journeySelectionController', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('GET /journey-selection renders the page with the picker form', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/journey-selection'
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toEqual(expect.stringContaining('Journey Selection |'))
    // The picker form must be present — that's the page's whole job.
    expect(result).toEqual(
      expect.stringContaining('action="/explorer/journey"')
    )
  })

  test('GET /about no longer exists (404)', async () => {
    // Story 05 retires /about. Asserting 4xx — Hapi returns 404 for an
    // unrouted GET; any client-error class is acceptable proof that
    // the old URL is gone.
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/about'
    })

    expect(statusCode).toBe(statusCodes.notFound)
  })
})
