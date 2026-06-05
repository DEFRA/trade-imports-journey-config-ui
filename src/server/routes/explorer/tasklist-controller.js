import { SCREEN_STATUS } from '#server/engine/types.js'
import { clientForRequest } from '#server/clients/journey-api-client.js'
import { navContext } from './nav-context.js'

/**
 * Map screen status to GOV.UK task list tag configuration.
 * Keys mirror `SCREEN_STATUS` wire values (the table is keyed by the
 * wire status the engine emits).
 */
const SCREEN_STATUS_TAGS = {
  [SCREEN_STATUS.COMPLETE]: { text: 'Done', classes: 'govuk-tag--green' },
  [SCREEN_STATUS.INCOMPLETE]: { text: 'To do', classes: 'govuk-tag--blue' },
  [SCREEN_STATUS.CANNOT_START_YET]: { text: 'Cannot start yet', classes: 'govuk-tag--grey' }
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
      if (screen.status !== SCREEN_STATUS.CANNOT_START_YET) {
        item.href = '#'
      }

      return item
    })
  }))

/**
 * GET /explorer/tasklist handler
 *
 * Renders the task list page with server-side evaluated obligations.
 * Uses the evaluation engine via server.app.evaluationEngine.
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
