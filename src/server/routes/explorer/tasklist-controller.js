import { resolveScreens } from '#server/engine/resolve-screens.js'
import { rollUpToSections } from '#server/engine/roll-up-to-sections.js'
import { SCREEN_STATUS } from '#server/engine/types.js'

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
  handler(request, h) {
    const { evaluationEngine } = request.server.app
    const sessionNotification = request.yar.get('notification')
    const notification = sessionNotification || {}
    const presetName = sessionNotification ? 'Custom' : 'empty'

    let sections = []
    let submittable = false
    let error = null

    try {
      const traced = evaluationEngine.evaluate('eu-live-animals', notification)
      const { journeyMap } = evaluationEngine.getJourney('eu-live-animals')
      const screens = resolveScreens(traced, journeyMap)
      sections = toTaskListSections(rollUpToSections(screens))
      submittable = traced.summary.submittable
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
      error
    })
  }
}
