import Joi from 'joi'

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
