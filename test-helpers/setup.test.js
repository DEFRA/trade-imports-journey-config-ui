/**
 * Smoke test for the vitest globalSetup hook.
 *
 * If this fails, every other integration-style test that depends on
 * the shared server will fail too — running this in isolation gives a
 * fast, clear pointer to the harness rather than the test.
 */

describe('vitest globalSetup', () => {
  test('API_BASE_URL env var is populated by globalSetup', () => {
    expect(process.env.API_BASE_URL).toMatch(/^http:\/\//)
  })

  test('the running server responds to GET /api/config/journeys', async () => {
    const response = await fetch(
      `${process.env.API_BASE_URL}/api/config/journeys`
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ journeys: expect.any(Array) })
    expect(body.journeys).toHaveLength(2)
  })
})
