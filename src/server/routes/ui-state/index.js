import { putNotification } from './notification-controller.js'

/**
 * UI session state plugin. Exposes PUT /ui/session/notification —
 * the only piece of UI state today. design.md D16 declares this a
 * distinct URL namespace from /api/* (compute + config) so the
 * Swagger UI groups it under its own `ui-state` tag and the audience
 * can tell at a glance that it's UI plumbing, not part of the
 * platform API contract.
 */
export const uiState = {
  plugin: {
    name: 'ui-state',
    register(server) {
      server.route([putNotification])
    }
  }
}
