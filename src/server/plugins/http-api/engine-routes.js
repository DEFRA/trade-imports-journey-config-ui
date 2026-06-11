import { statusCodes } from '#server/common/constants/status-codes.js'
import { resolveScreens } from '#server/engine/resolve-screens.js'
import { rollUpToSections } from '#server/engine/roll-up-to-sections.js'

import {
  evaluationResultResponse,
  screensResponse,
  sectionsResponse,
  notificationSchema,
  errorResponse
} from './schemas.js'
import { withJourney } from './route-helpers.js'

/**
 * Pure projection: remove `trace` from each obligation, leaving the
 * rest of the result intact. The facade always returns the traced
 * result (it calls `evaluateWithTrace` internally); the API surface
 * only emits trace when the caller explicitly requests it via
 * `?withTrace=true`. Stripping is also applied unconditionally on
 * `/screens` and `/sections` so downstream pipelines never carry
 * the trace.
 */
export const stripTrace = (result) => ({
  ...result,
  obligations: result.obligations.map(({ trace: _trace, ...rest }) => rest)
})

// Hapi's qs query parser yields strings only; coerce here without an
// extra Joi schema.
const wantsTrace = (query) => query?.withTrace === 'true'

const engineBodyOptions = {
  payload: { maxBytes: 5 * 1024 * 1024 }
}

// Wrap an engine handler so a throw from inside the engine pipeline
// (evaluate/resolveScreens/rollUpToSections) becomes a logged 500 with
// the standard error envelope rather than an opaque Boom default that
// the response Joi schema would reshape and bury.
const runOr500 = (request, h, work) => {
  try {
    return work()
  } catch (error) {
    request.logger.error(
      { err: error, params: request.params },
      'engine route failed'
    )
    return h
      .response({
        error: 'Engine evaluation failed',
        message: 'Unable to evaluate the notification against the journey.'
      })
      .code(statusCodes.internalServerError)
  }
}

export const engineRoutes = [
  {
    method: 'POST',
    path: '/api/engine/journeys/{key}/evaluate',
    options: {
      description:
        'Evaluate a notification against a journey. ?withTrace=true returns per-obligation trace.steps[]; default omits trace.',
      tags: ['api', 'engine'],
      validate: { payload: notificationSchema },
      response: {
        schema: evaluationResultResponse,
        status: { 400: errorResponse, 404: errorResponse, 500: errorResponse }
      },
      ...engineBodyOptions
    },
    handler(request, h) {
      return withJourney(request, h, (journey) =>
        runOr500(request, h, () => {
          const result = request.server.app.evaluationEngine.evaluate(
            request.params.key,
            request.payload ?? {}
          )
          const payload = wantsTrace(request.query)
            ? result
            : stripTrace(result)
          return h.response(payload).code(statusCodes.ok)
        })
      )
    }
  },
  {
    method: 'POST',
    path: '/api/engine/journeys/{key}/screens',
    options: {
      description:
        'Evaluate a notification and resolve the result into a flat array of screens with derived status. Trace is always stripped.',
      tags: ['api', 'engine'],
      validate: { payload: notificationSchema },
      response: {
        schema: screensResponse,
        status: { 400: errorResponse, 404: errorResponse, 500: errorResponse }
      },
      ...engineBodyOptions
    },
    handler(request, h) {
      return withJourney(request, h, (journey) =>
        runOr500(request, h, () => {
          const traced = request.server.app.evaluationEngine.evaluate(
            request.params.key,
            request.payload ?? {}
          )
          const screens = resolveScreens(stripTrace(traced), journey.journeyMap)
          return h.response({ screens }).code(statusCodes.ok)
        })
      )
    }
  },
  {
    method: 'POST',
    path: '/api/engine/journeys/{key}/sections',
    options: {
      description:
        'Evaluate a notification and roll up the resolved screens into render-ready sections (task-list shape). Trace is always stripped.',
      tags: ['api', 'engine'],
      validate: { payload: notificationSchema },
      response: {
        schema: sectionsResponse,
        status: { 400: errorResponse, 404: errorResponse, 500: errorResponse }
      },
      ...engineBodyOptions
    },
    handler(request, h) {
      return withJourney(request, h, (journey) =>
        runOr500(request, h, () => {
          const traced = request.server.app.evaluationEngine.evaluate(
            request.params.key,
            request.payload ?? {}
          )
          const stripped = stripTrace(traced)
          const screens = resolveScreens(stripped, journey.journeyMap)
          const sections = rollUpToSections(screens)
          return h
            .response({ sections, summary: stripped.summary })
            .code(statusCodes.ok)
        })
      )
    }
  }
]
