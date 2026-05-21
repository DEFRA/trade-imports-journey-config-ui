import { evaluateWithTrace } from '#server/engine/evaluate-with-trace.js'

// Journey modules — add new journeys here
import * as euLiveAnimals from '../../journeys/eu-live-animals/index.js'

const JOURNEYS = {
  'eu-live-animals': euLiveAnimals
}

const validateJourney = (key, journey) => {
  if (!Array.isArray(journey.obligations) || journey.obligations.length === 0) {
    throw new Error(
      `Journey "${key}": obligations must be a non-empty array`
    )
  }
  if (
    !journey.refdata?.routing ||
    typeof journey.refdata.routing !== 'object'
  ) {
    throw new Error(
      `Journey "${key}": refdata.routing is missing or not an object`
    )
  }
  if (
    !journey.journeyMap?.sections ||
    !Array.isArray(journey.journeyMap.sections)
  ) {
    throw new Error(
      `Journey "${key}": journeyMap.sections is missing or not an array`
    )
  }
  if (!journey.resolvers?.facts || typeof journey.resolvers.facts !== 'object') {
    throw new Error(`Journey "${key}": resolvers.facts is missing`)
  }
  if (!journey.resolvers?.tests || typeof journey.resolvers.tests !== 'object') {
    throw new Error(`Journey "${key}": resolvers.tests is missing`)
  }
  if (typeof journey.resolvers?.submissionDatePath !== 'string') {
    throw new Error(`Journey "${key}": resolvers.submissionDatePath is missing`)
  }
}

/**
 * Evaluation Engine — Hapi plugin (Journey Registry).
 *
 * Loads all registered journey modules, validates them at startup,
 * and exposes a multi-journey evaluation API on
 * `server.app.evaluationEngine`.
 *
 * ## Contract
 *
 * ```
 * server.app.evaluationEngine = {
 *   evaluate(journeyKey, notification)  -> { obligations, summary }
 *   getJourney(journeyKey)              -> { obligations, refdata, journeyMap, scenarios }
 *   listJourneys()                      -> string[]
 * }
 * ```
 *
 * Register this plugin before the router so that route handlers
 * can access the engine via `request.server.app.evaluationEngine`.
 */
export const evaluationEngine = {
  plugin: {
    name: 'evaluation-engine',
    register(server) {
      for (const [key, journey] of Object.entries(JOURNEYS)) {
        validateJourney(key, journey)
      }

      server.app.evaluationEngine = {
        /**
         * Evaluate a notification against a journey's obligations.
         *
         * @param {string} journeyKey - Journey identifier (e.g. 'eu-live-animals')
         * @param {object} notification - The notification to evaluate
         * @returns {{ obligations: Array, summary: object }}
         */
        evaluate(journeyKey, notification) {
          const journey = JOURNEYS[journeyKey]
          if (!journey) {
            throw new Error(`Unknown journey: "${journeyKey}"`)
          }
          return evaluateWithTrace(notification, {
            obligations: journey.obligations,
            refdata: journey.refdata,
            journeyResolver: journey.resolvers
          })
        },

        /**
         * Get a journey's data (obligations, refdata, journeyMap, scenarios).
         *
         * @param {string} journeyKey - Journey identifier
         * @returns {{ obligations, refdata, journeyMap, scenarios }}
         */
        getJourney(journeyKey) {
          const journey = JOURNEYS[journeyKey]
          if (!journey) {
            throw new Error(`Unknown journey: "${journeyKey}"`)
          }
          return journey
        },

        /**
         * List all registered journey keys.
         *
         * @returns {string[]}
         */
        listJourneys() {
          return Object.keys(JOURNEYS)
        }
      }

      const totalObligations = Object.values(JOURNEYS).reduce(
        (sum, j) => sum + j.obligations.length,
        0
      )
      server.logger.info(
        `Evaluation engine loaded: ${Object.keys(JOURNEYS).length} journey(s), ${totalObligations} total obligations`
      )
    }
  }
}
