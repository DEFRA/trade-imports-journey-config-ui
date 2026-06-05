import { clientForRequest } from '#server/clients/journey-api-client.js'
import { navContext } from './nav-context.js'

// Story 03 replaced an in-process resolveScreens + groupScreensBySection
// pipeline with a single client.getSections call. The HTTP path returns
// the already-rolled-up sections (notApplicable screens dropped per
// rollUpToSections semantics), so the local grouper became dead code
// and was removed.

/**
 * Convert a journey's scenario map to GOV.UK select items.
 *
 * @param {Object} scenarios - Journey scenario map (id -> { notification, label })
 * @param {string|null} selected - Currently selected scenario name
 * @returns {Array<Object>} Select items for govukSelect macro
 */
const toScenarioSelectItems = (scenarios, selected) => {
  const items = [{ value: '', text: 'Empty (clear all)', selected: !selected }]

  for (const [value, { label }] of Object.entries(scenarios)) {
    items.push({
      value,
      text: label,
      selected: value === selected
    })
  }

  return items
}

/**
 * GET /explorer handler (scenario-based journey configuration)
 *
 * Loads a scenario from query param (?scenario=X), session, or shows empty state.
 * Uses the evaluation engine via server.app.evaluationEngine and resolves the
 * configured journey's scenario data through the facade.
 */
export const journeyController = {
  async handler(request, h) {
    const nav = await navContext(request)
    const { journeyKey } = nav
    const client = clientForRequest(request)
    const journey = await client.getJourney(journeyKey)
    const { scenarios } = journey
    const { scenario: scenarioParam } = request.query

    let notification = null
    let selectedScenario = null
    let sections = null
    let summary = null

    // Handle scenario parameter
    if (scenarioParam === 'empty') {
      request.yar.set('notification', null)
    } else if (scenarioParam && scenarios[scenarioParam]) {
      notification = scenarios[scenarioParam].notification
      selectedScenario = scenarioParam
      request.yar.set('notification', notification)
    } else if (!scenarioParam) {
      const sessionNotification = request.yar.get('notification')
      if (sessionNotification) {
        notification = sessionNotification
        for (const [name, scenarioData] of Object.entries(scenarios)) {
          if (
            JSON.stringify(scenarioData.notification) ===
            JSON.stringify(notification)
          ) {
            selectedScenario = name
            break
          }
        }
      }
    }

    // Evaluate notification if present
    if (notification) {
      try {
        const result = await client.getSections(journeyKey, notification)
        sections = result.sections
        summary = result.summary
      } catch (err) {
        request.logger.error({ err }, 'Journey evaluation failed')
      }
    }

    const scenarioSelectItems = toScenarioSelectItems(
      scenarios,
      selectedScenario
    )

    return h.view('explorer/journey', {
      pageTitle: 'Journey Configuration',
      heading: 'Scenario-Based Journey Explorer',
      currentPage: 'journey',
      scenarioSelectItems,
      selectedScenario,
      sections,
      summary,
      ...nav
    })
  }
}
