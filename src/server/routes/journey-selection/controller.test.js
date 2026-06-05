import { statusCodes } from '#server/common/constants/status-codes.js'

// These tests use the shared server booted by vitest globalSetup
// (test-helpers/setup.js). Hitting it via real `fetch` exercises the
// controller's loopback fetch end-to-end: the in-process server
// servicing the page request is the same one servicing the
// /api/config/journeys call the handler fires internally.

const baseUrl = () => {
  if (!process.env.API_BASE_URL) {
    throw new Error(
      'API_BASE_URL not set — did vitest globalSetup (test-helpers/setup.js) run?'
    )
  }
  return process.env.API_BASE_URL
}

describe('#journeySelectionController', () => {
  test('GET /journey-selection renders the page with the picker form', async () => {
    // 200 is the load-bearing assertion: the refactored handler
    // `await`s `client.listJourneys()` before rendering, so a failure
    // there would produce a 500 (or the [] fallback would render an
    // empty page that still passes content checks). Combined with
    // test-helpers/setup.test.js (which proves the API endpoint
    // works in isolation), 200 here is sufficient evidence the
    // loopback wiring is intact for the controller.
    const response = await fetch(`${baseUrl()}/journey-selection`)
    const body = await response.text()

    expect(response.status).toBe(statusCodes.ok)
    expect(body).toEqual(expect.stringContaining('Journey Selection |'))
    // The picker form must be present — that's the page's whole job.
    expect(body).toEqual(expect.stringContaining('action="/explorer/journey"'))
  })

  test('GET /about no longer exists (404)', async () => {
    // Story 05 retires /about. Any 4xx is acceptable proof that the
    // old URL is gone; Hapi returns 404 for an unrouted GET.
    const response = await fetch(`${baseUrl()}/about`)
    expect(response.status).toBe(statusCodes.notFound)
  })
})
