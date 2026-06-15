import Joi from 'joi'

import {
  OBLIGATION_STATUS,
  SCREEN_STATUS,
  SECTION_STATUS,
  TRACE_STEP
} from '#server/engine/types.js'

export const journeyListResponse = Joi.object({
  journeys: Joi.array()
    .items(
      Joi.object({
        key: Joi.string().required(),
        name: Joi.string().required(),
        obligationCount: Joi.number().integer().min(0).required(),
        sectionCount: Joi.number().integer().min(0).required()
      })
    )
    .required()
})
  .label('JourneyListResponse')
  .example({
    journeys: [
      {
        key: 'eu-live-animals',
        name: 'eu-live-animals',
        obligationCount: 23,
        sectionCount: 6
      },
      {
        key: 'chedpp-plants',
        name: 'chedpp-plants',
        obligationCount: 28,
        sectionCount: 8
      }
    ]
  })

export const errorResponse = Joi.object({
  error: Joi.string().required(),
  message: Joi.string().required()
})
  .label('ErrorResponse')
  .example({
    error: 'Internal Server Error',
    message: 'Something went wrong while serving the request.'
  })

// Journey-shaped responses (varies per journey). Permissive on inner
// shape — the load-bearing contract is the top-level key set; inner
// structure is journey-private and surfaces in Swagger via examples.

export const journeyResponse = Joi.object({
  key: Joi.string().required(),
  obligations: Joi.array().required(),
  journeyMap: Joi.object().unknown(true).required(),
  scenarios: Joi.object().unknown(true).required()
})
  .label('JourneyResponse')
  .example({
    key: 'eu-live-animals',
    obligations: [{ id: 'consignment-origin' }],
    journeyMap: { sections: [] },
    scenarios: {}
  })

export const refdataViewResponse = Joi.object({
  dimensions: Joi.array().items(Joi.object().unknown(true)).required(),
  details: Joi.array().items(Joi.object().unknown(true)).required()
})
  .label('RefdataViewResponse')
  .example({
    dimensions: [
      { id: 'purpose', name: 'Purpose', values: ['purpose_set_05'] }
    ],
    details: [
      {
        id: 'routing',
        name: 'Routing Flags',
        rows: [{ label: 'CPH Number', value: true }]
      }
    ]
  })

export const commoditiesResponse = Joi.object({
  commodities: Joi.array().items(Joi.string()).required()
})
  .label('CommoditiesResponse')
  .example({ commodities: ['102|', '1063100|Strigiformes'] })

export const commodityDetailResponse = Joi.object()
  .unknown(true)
  .label('CommodityDetailResponse')
  .example({
    routingFlags: {
      cphNumber: true,
      permanentAddress: false,
      transporterAddress: true
    },
    content: { purpose: 'purpose_set_01', identifiers: 'identifier_set_01' },
    identifierSet: ['EARTAG']
  })

// Engine response schemas — strict on load-bearing keys (drift-catching
// canary for both the API contract and the browser JS that consumes it);
// permissive (.unknown(true)) on enrichment. The status enums derive
// from `engine/types.js` so they cannot drift from the engine.

const summarySchema = Joi.object({
  satisfied: Joi.number().integer().min(0).required(),
  unsatisfied: Joi.number().integer().min(0).required(),
  deferred: Joi.number().integer().min(0).required(),
  inactive: Joi.number().integer().min(0).required(),
  total: Joi.number().integer().min(0).required(),
  submittable: Joi.boolean().required()
}).label('Summary')

const traceStepSchema = Joi.object({
  step: Joi.string()
    .valid(...Object.values(TRACE_STEP))
    .required()
})
  .unknown(true)
  .label('TraceStep')

const traceSchema = Joi.object({
  steps: Joi.array().items(traceStepSchema).required()
})
  .unknown(true)
  .label('Trace')

const obligationSchema = Joi.object({
  id: Joi.string().required(),
  status: Joi.string()
    .valid(...Object.values(OBLIGATION_STATUS))
    .required(),
  missingPaths: Joi.array().items(Joi.string()),
  reason: Joi.string(),
  trace: traceSchema
})
  .unknown(true)
  .label('Obligation')

// The notification body is journey-specific. We don't validate its
// shape at the HTTP boundary — the engine's resolvers consume what
// they need and ignore the rest. Empty {} is valid and exercises the
// "everything unsatisfied" baseline.
export const notificationSchema = Joi.object()
  .unknown(true)
  .label('Notification')
  .example({})

export const evaluationResultResponse = Joi.object({
  obligations: Joi.array().items(obligationSchema).required(),
  summary: summarySchema.required()
})
  .label('EvaluationResult')
  .example({
    obligations: [{ id: 'consignment-origin', status: 'unsatisfied' }],
    summary: {
      satisfied: 0,
      unsatisfied: 23,
      deferred: 0,
      inactive: 0,
      total: 23,
      submittable: false
    }
  })

const screenSchema = Joi.object({
  screenId: Joi.string().required(),
  screenName: Joi.string().required(),
  sectionId: Joi.string().required(),
  sectionName: Joi.string().required(),
  status: Joi.string()
    .valid(...Object.values(SCREEN_STATUS))
    .required(),
  fields: Joi.array().required()
})
  .unknown(true)
  .label('Screen')

export const screensResponse = Joi.object({
  screens: Joi.array().items(screenSchema).required()
})
  .label('ScreensResponse')
  .example({
    screens: [
      {
        screenId: 'origin-screen',
        screenName: 'Region of origin',
        sectionId: 'origin-section',
        sectionName: 'Origin',
        status: 'incomplete',
        fields: []
      }
    ]
  })

const sectionSchema = Joi.object({
  sectionId: Joi.string().required(),
  sectionName: Joi.string().required(),
  status: Joi.string()
    .valid(...Object.values(SECTION_STATUS))
    .required(),
  screens: Joi.array().items(screenSchema).required()
})
  .unknown(true)
  .label('Section')

export const sectionsResponse = Joi.object({
  sections: Joi.array().items(sectionSchema).required(),
  summary: summarySchema.required()
})
  .label('SectionsResponse')
  .example({
    sections: [
      {
        sectionId: 'origin-section',
        sectionName: 'Origin',
        status: 'incomplete',
        screens: []
      }
    ],
    summary: {
      satisfied: 0,
      unsatisfied: 23,
      deferred: 0,
      inactive: 0,
      total: 23,
      submittable: false
    }
  })

// Page-variance: per-commodity "which screens would this drive?" output.
// Strict on the load-bearing inner shape (drift canary for the analytics
// function and Story 05b's controller consumption); .unknown(true) on
// the item leaves a small forward-compat hatch.

const pageVarianceDriverSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  active: Joi.boolean().required(),
  reason: Joi.string().allow('').required()
}).unknown(true)

const pageVarianceItemSchema = Joi.object({
  screenId: Joi.string().required(),
  screenName: Joi.string().required(),
  activates: Joi.boolean().required(),
  drivers: Joi.array().items(pageVarianceDriverSchema).required()
}).unknown(true)

export const pageVarianceResponse = Joi.object({
  pageVariance: Joi.array().items(pageVarianceItemSchema).required()
})
  .label('PageVarianceResponse')
  .example({
    pageVariance: [
      {
        screenId: 'gms-declaration',
        screenName: 'GMS declaration',
        activates: true,
        drivers: [
          {
            id: 'gms-declaration',
            name: 'GMS declaration required',
            active: true,
            reason: 'HMI-inspected species with GMS marketing standard'
          }
        ]
      }
    ]
  })

export const emptyResponse = Joi.any().label('EmptyResponse')
