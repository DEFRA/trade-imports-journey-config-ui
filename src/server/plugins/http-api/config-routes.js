import Joi from 'joi'

import { statusCodes } from '#server/common/constants/status-codes.js'
import {
  journeyListResponse,
  journeyResponse,
  refdataViewResponse,
  commoditiesResponse,
  commodityDetailResponse,
  errorResponse
} from './schemas.js'

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

// Returns the journey adapter for `key`, or null if not registered.
// Avoids the try/catch dance around the facade's throw-on-unknown.
const lookupJourney = (engine, key) =>
  engine.listJourneys().includes(key) ? engine.getJourney(key) : null

// 404 with the standard error envelope. Centralised so every handler
// renders the same shape.
const notFound = (h, message) =>
  h
    .response({ error: 'Not Found', message })
    .code(statusCodes.notFound)

// All six per-journey routes share the same opening dance: read
// {key} from params, resolve the journey or 404. Extracting it leaves
// each handler with only its journey-specific work.
const withJourney = (request, h, work) => {
  const { key } = request.params
  const journey = lookupJourney(request.server.app.evaluationEngine, key)
  if (!journey) return notFound(h, `Unknown journey: "${key}"`)
  return work(journey, request, h)
}

// Compose the composite refdata key the journey closures expect.
// Without species, the species-agnostic key `${code}|` covers both
// animals' fallback row and plants' PHSI-only commodities.
const refdataKey = (commodity, species) =>
  species ? `${commodity}|${species}` : `${commodity}|`

// Resolve the journey's refdataView descriptor with the selected
// commodity/species applied to every dimension and detail closure.
// Falls back to metadata-only (id + name) when no commodity is given.
const resolveRefdataView = (journey, commodity, species) => {
  const view = journey.refdataView(journey.refdata)
  if (!commodity) {
    return {
      dimensions: view.dimensions.map(({ id, name }) => ({ id, name })),
      details: view.details.map(({ id, name }) => ({ id, name }))
    }
  }
  const key = refdataKey(commodity, species)
  return {
    dimensions: view.dimensions.map((d) => ({
      id: d.id,
      name: d.name,
      values: d.valuesFor(key),
      ...(typeof d.sourceFor === 'function' ? { source: d.sourceFor(key) } : {})
    })),
    details: view.details.map((d) => ({
      id: d.id,
      name: d.name,
      rows: d.rowsFor(key)
    }))
  }
}

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
  },
  {
    method: 'GET',
    path: '/api/config/journeys/{key}',
    options: {
      description:
        'Return the journey configuration (obligations, journeyMap, scenarios). Refdata is exposed separately.',
      tags: ['api', 'config'],
      response: {
        schema: journeyResponse,
        status: { 404: errorResponse, 500: errorResponse }
      }
    },
    handler(request, h) {
      return withJourney(request, h, (journey, { params: { key } }) =>
        h
          .response({
            key,
            obligations: journey.obligations,
            journeyMap: journey.journeyMap,
            scenarios: journey.scenarios
          })
          .code(statusCodes.ok)
      )
    }
  },
  {
    method: 'GET',
    path: '/api/config/journeys/{key}/refdata',
    options: {
      description:
        'Return the journey-specific refdata (bulk). Response is journey-private and not Joi-validated due to size (chedpp-plants is ~1MB).',
      tags: ['api', 'config'],
      // No response.schema — D21 — but keep the 500 envelope.
      response: { status: { 404: errorResponse, 500: errorResponse } }
    },
    handler(request, h) {
      return withJourney(request, h, (journey) =>
        h.response(journey.refdata).code(statusCodes.ok)
      )
    }
  },
  {
    method: 'GET',
    path: '/api/config/journeys/{key}/refdata-view',
    options: {
      description:
        'Return the journey-shaped refdata-view descriptor. With ?commodity= (optional ?species=) the dimension/detail closures run server-side and resolved values cross HTTP. Without parameters, returns metadata only.',
      tags: ['api', 'config'],
      validate: {
        query: Joi.object({
          commodity: Joi.string()
            .pattern(/^[^|]+$/, 'no-pipe')
            .optional(),
          species: Joi.string()
            .pattern(/^[^|]+$/, 'no-pipe')
            .optional()
        }).with('species', 'commodity'),
        // Stable user-facing message: don't leak Joi's internal "value"
        // schema label or peer naming.
        failAction: (_request, h, err) => {
          const detail = err.details?.[0]
          const code = detail?.type
          const message =
            code === 'object.with'
              ? 'species can only be used with commodity'
              : code === 'string.pattern.name'
                ? `${detail.path?.[0] ?? 'parameter'} must not contain the | character`
                : 'Invalid query parameters'
          return h
            .response({ error: 'Bad Request', message })
            .code(statusCodes.badRequest)
            .takeover()
        }
      },
      response: {
        schema: refdataViewResponse,
        status: { 400: errorResponse, 404: errorResponse, 500: errorResponse }
      }
    },
    handler(request, h) {
      return withJourney(request, h, (journey, { query }) =>
        h
          .response(resolveRefdataView(journey, query.commodity, query.species))
          .code(statusCodes.ok)
      )
    }
  },
  {
    method: 'GET',
    path: '/api/config/journeys/{key}/commodities',
    options: {
      description:
        'List the journey-specific commodity keys (the dropdown universe). Returned as an array of composite key strings.',
      tags: ['api', 'config'],
      response: {
        schema: commoditiesResponse,
        status: { 404: errorResponse, 500: errorResponse }
      }
    },
    handler(request, h) {
      return withJourney(request, h, (journey) =>
        h
          .response({ commodities: journey.commodityKeys(journey.refdata) })
          .code(statusCodes.ok)
      )
    }
  },
  {
    method: 'GET',
    path: '/api/config/journeys/{key}/commodities/{code}',
    options: {
      description:
        'Return the per-commodity driver — animals: species-agnostic routing+content+identifierSet; plants: commodity-level metadata.',
      tags: ['api', 'config'],
      validate: {
        params: Joi.object({
          key: Joi.string().required(),
          code: Joi.string().pattern(/^[^|]+$/, 'no-pipe').required()
        })
      },
      response: {
        schema: commodityDetailResponse,
        status: { 400: errorResponse, 404: errorResponse, 500: errorResponse }
      }
    },
    handler(request, h) {
      return withJourney(request, h, (journey, { params: { key, code } }) => {
        const detail = journey.commodityDetail(journey.refdata, code)
        if (detail === null) {
          return notFound(h, `Unknown commodity: "${code}" in journey "${key}"`)
        }
        return h.response(detail).code(statusCodes.ok)
      })
    }
  },
  {
    method: 'GET',
    path: '/api/config/journeys/{key}/commodities/{code}/species/{species}',
    options: {
      description:
        'Return the species-level driver — animals: routing+content+identifierSet for (code, species); plants: regulatory+marketing+varieties.',
      tags: ['api', 'config'],
      validate: {
        params: Joi.object({
          key: Joi.string().required(),
          code: Joi.string().pattern(/^[^|]+$/, 'no-pipe').required(),
          species: Joi.string().pattern(/^[^|]+$/, 'no-pipe').required()
        })
      },
      response: {
        schema: commodityDetailResponse,
        status: { 400: errorResponse, 404: errorResponse, 500: errorResponse }
      }
    },
    handler(request, h) {
      return withJourney(
        request,
        h,
        (journey, { params: { key, code, species } }) => {
          const detail = journey.commodityDetail(journey.refdata, code, species)
          if (detail === null) {
            return notFound(
              h,
              `Unknown commodity/species: "${code}|${species}" in journey "${key}"`
            )
          }
          return h.response(detail).code(statusCodes.ok)
        }
      )
    }
  }
]
