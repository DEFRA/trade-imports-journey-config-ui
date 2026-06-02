import { resolveScreens } from '#server/engine/resolve-screens.js'
import { navContext } from './nav-context.js'

/**
 * Group flat screen array by sectionId, preserving order.
 *
 * @param {Array<Object>} screens - Output from resolveScreens
 * @returns {Array<Object>} Sections with screens array
 */
const groupScreensBySection = (screens) => {
  const sectionMap = new Map()

  for (const screen of screens) {
    if (!sectionMap.has(screen.sectionId)) {
      sectionMap.set(screen.sectionId, {
        sectionId: screen.sectionId,
        sectionName: screen.sectionName,
        screens: []
      })
    }
    sectionMap.get(screen.sectionId).screens.push(screen)
  }

  return Array.from(sectionMap.values())
}

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
  handler(request, h) {
    const { evaluationEngine } = request.server.app
    const nav = navContext(request)
    const { journeyKey } = nav
    const { scenarios, journeyMap } = evaluationEngine.getJourney(journeyKey)
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
        const traced = evaluationEngine.evaluate(journeyKey, notification)
        const screens = resolveScreens(traced, journeyMap)
        sections = groupScreensBySection(screens)
        summary = traced.summary
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
