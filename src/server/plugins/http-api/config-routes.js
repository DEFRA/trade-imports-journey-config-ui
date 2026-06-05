import { statusCodes } from '#server/common/constants/status-codes.js'
import { journeyListResponse, errorResponse } from './schemas.js'

// validateJourney (evaluation-engine plugin) guarantees journey.journeyMap
// with journeyMap.sections (array) and journey.obligations (non-empty array)
// at registration time. We can dereference both without optional chaining.
const projectJourneySummary = (key, journey) => ({
  key,
  name: journey.journeyMap.name ?? key,
  obligationCount: journey.obligations.length,
  sectionCount: journey.journeyMap.sections.length
})

// Pure projection: engine facade → API envelope. Easy to unit-test
// without a Hapi `h`, and mirrored by the engine + ui-state plugins in
// Stories 02-03.
export const listJourneySummaries = (engine) => ({
  journeys: engine
    .listJourneys()
    .map((key) => projectJourneySummary(key, engine.getJourney(key)))
})

export const configRoutes = [
  {
    method: 'GET',
    path: '/api/config/journeys',
    options: {
      description: 'List all registered journeys with summary metadata',
      tags: ['api', 'config'],
      response: {
        schema: journeyListResponse,
        status: { 500: errorResponse }
      }
    },
    handler(request, h) {
      try {
        return h
          .response(listJourneySummaries(request.server.app.evaluationEngine))
          .code(statusCodes.ok)
      } catch (error) {
        request.logger.error({ err: error }, 'Failed to list journeys')
        return h
          .response({
            error: 'Failed to list journeys',
            message: 'Unable to read journey configuration.'
          })
          .code(statusCodes.internalServerError)
      }
    }
  }
]
