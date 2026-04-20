import { mapToScreens, rollUpToSections } from './map-to-screens.js'

/**
 * Map screen status to GOV.UK task list tag configuration.
 */
const SCREEN_STATUS_TAGS = {
  complete: { text: 'Done', classes: 'govuk-tag--green' },
  incomplete: { text: 'To do', classes: 'govuk-tag--blue' },
  cannotStartYet: { text: 'Cannot start yet', classes: 'govuk-tag--grey' }
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
      if (screen.status !== 'cannotStartYet') {
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
      const screens = mapToScreens(traced, journeyMap)
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
