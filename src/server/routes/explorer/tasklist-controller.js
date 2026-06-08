import { clientForRequest } from '#server/clients/journey-api-client.js'
import { navContext } from './nav-context.js'

// Wire values from the screen-status enum. Hardcoded here as HTTP
// contract literals (the response Joi schema enforces them at the API
// boundary). Avoids a direct in-process engine import so this route
// stays HTTP-only. The fallback at the lookup site gracefully handles
// any future drift.
const CANNOT_START_YET = 'cannotStartYet'
const SCREEN_STATUS_TAGS = {
  complete: { text: 'Done', classes: 'govuk-tag--green' },
  incomplete: { text: 'To do', classes: 'govuk-tag--blue' },
  [CANNOT_START_YET]: { text: 'Cannot start yet', classes: 'govuk-tag--grey' }
}

/**
 * Transform sections from rollUpToSections into govukTaskList items.
 *
 * @param {Array<Object>} sections - Output from rollUpToSections
 * @returns {Array<Object>} Sections with taskListItems arrays
 */
const toTaskListSections = (sections) =>
  sections.map((section) => ({
    ...section,
    taskListItems: section.screens.map((screen) => {
      const item = {
        title: { text: screen.screenName },
        status: {
          tag: SCREEN_STATUS_TAGS[screen.status] || {
            text: screen.status,
            classes: ''
          }
        }
      }

      // GOV.UK task list renders items without href as non-clickable
      if (screen.status !== CANNOT_START_YET) {
        item.href = '#'
      }

      return item
    })
  }))

/**
 * GET /explorer/tasklist handler
 *
 * Renders the task list page with server-side evaluated obligations.
 * Reaches the engine over HTTP via the journey-api-client.
 */
export const tasklistController = {
  async handler(request, h) {
    const nav = await navContext(request)
    const { journeyKey } = nav
    const client = clientForRequest(request)
    const sessionNotification = request.yar.get('notification')
    const notification = sessionNotification || {}
    const presetName = sessionNotification ? 'Custom' : 'empty'

    let sections = []
    let submittable = false
    let error = null

    try {
      const result = await client.getSections(journeyKey, notification)
      sections = toTaskListSections(result.sections)
      submittable = result.summary.submittable
    } catch (err) {
      request.logger.error({ err }, 'Task list evaluation failed')
      error =
        'Unable to evaluate notification. The evaluation engine encountered an error.'
    }

    return h.view('explorer/tasklist', {
      pageTitle: 'Notification Task List',
      heading: 'Check your notification',
      currentPage: 'tasklist',
      sections,
      submittable,
      presetName,
      error,
      ...nav
    })
  }
}
