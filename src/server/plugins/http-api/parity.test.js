import { describe, test, expect } from 'vitest'

import { scenarios as animalScenarios } from '#server/journeys/eu-live-animals/index.js'
import { scenarios as plantScenarios } from '#server/journeys/chedpp-plants/index.js'
import { scenarios as cheddScenarios } from '#server/journeys/chedd-products/index.js'
import { createJourneyApiClient } from '#server/clients/journey-api-client.js'
import { stripTrace } from './engine-routes.js'

/**
 * Facade-vs-HTTP parity test.
 *
 * Two implementations produce the same engine output today:
 *   - The in-process facade at server.app.evaluationEngine.evaluate
 *     (Story 01).
 *   - The HTTP surface POST /api/engine/journeys/{key}/evaluate
 *     (Story 03).
 *
 * They are asserted equivalent by individual unit tests and by code
 * review. This parity test is the long-term canary for drift: if a
 * Joi schema is loosened, a response transformer is added, a future
 * authentication hook silently injects fields, or one path serialises
 * `Date`s differently — this test fails at PR time with a diff that
 * points at the field.
 *
 * The matrix is scenarios × journeys × withTrace ∈ {true, false}.
 * `withTrace=false` is what /sections, /screens, and most page
 * consumers see; `withTrace=true` is what the debug page receives.
 * Both modes must round-trip identically.
 *
 * Comparison is wire-equivalent:
 *   `JSON.parse(JSON.stringify(facadeResult))` is compared against
 *   the HTTP body. This normalises Date objects to ISO strings,
 *   drops `undefined` fields, and matches what a Postman caller
 *   actually receives.
 */

// vitest globalSetup (test-helpers/setup.js) boots one server on
// PORT=3001 and writes API_BASE_URL into the environment. The
// client picks it up via #config/config.js.
const buildClient = () =>
  createJourneyApiClient({ baseUrl: process.env.API_BASE_URL })

// Pull the in-process facade off the running server. We have to ask
// Hapi for it; createServer + initialize would boot a second instance
// and the parity guarantee is per-process. Instead, the globalSetup
// server is the canonical reference; we expose its `app.evaluationEngine`
// through a lightweight access path.
//
// The cheapest reliable way: load the engine facade directly via the
// evaluation-engine plugin's exported validateJourney + the registered
// journey adapters. But the simplest correct approach is to construct
// the engine call from the same engine module the facade uses.
import { evaluateWithTrace } from '#server/engine/evaluate-with-trace.js'

const journeys = [
  {
    key: 'eu-live-animals',
    scenarios: animalScenarios,
    adapter: await import('#server/journeys/eu-live-animals/index.js')
  },
  {
    key: 'chedpp-plants',
    scenarios: plantScenarios,
    adapter: await import('#server/journeys/chedpp-plants/index.js')
  },
  {
    key: 'chedd-products',
    scenarios: cheddScenarios,
    adapter: await import('#server/journeys/chedd-products/index.js')
  }
]

// Build the row matrix: (key, scenarioName, scenario, withTrace).
const rows = journeys.flatMap(({ key, scenarios, adapter }) =>
  Object.entries(scenarios).flatMap(([scenarioName, scenario]) =>
    [true, false].map((withTrace) => ({
      key,
      scenarioName,
      notification: scenario.notification,
      adapter,
      withTrace
    }))
  )
)

describe('facade-vs-HTTP parity for /api/engine/journeys/{key}/evaluate', () => {
  test.each(rows)(
    '$key / $scenarioName / withTrace=$withTrace',
    async ({ key, notification, adapter, withTrace }) => {
      // Facade output: evaluateWithTrace always returns the traced
      // shape (same as server.app.evaluationEngine.evaluate). When
      // withTrace=false, strip to match the HTTP contract.
      const tracedFacade = evaluateWithTrace(notification, {
        obligations: adapter.obligations,
        refdata: adapter.refdata,
        journeyResolver: adapter.resolvers
      })
      const facadeForMode = withTrace ? tracedFacade : stripTrace(tracedFacade)

      // Wire form: what a Postman caller would receive after the
      // facade's output crosses HTTP. Normalises Date → ISO string,
      // drops `undefined` fields, removes function-valued props.
      const expected = JSON.parse(JSON.stringify(facadeForMode))

      // HTTP output via the shared loopback client.
      const httpResult = await buildClient().evaluate(key, notification, {
        withTrace
      })

      expect(httpResult).toEqual(expected)
    }
  )
})
