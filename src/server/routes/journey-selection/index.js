import { journeySelectionController } from './controller.js'

export const journeySelection = {
  plugin: {
    name: 'journey-selection',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/journey-selection',
          ...journeySelectionController
        }
      ])
    }
  }
}
