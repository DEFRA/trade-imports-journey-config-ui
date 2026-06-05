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
