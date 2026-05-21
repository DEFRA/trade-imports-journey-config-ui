import { scenarios } from '../../journeys/eu-live-animals/index.js'
import { resolveScreens } from '#server/engine/resolve-screens.js'

/**
 * Scenario options for the dropdown, derived from the scenario map.
 * Each scenario is a pre-built notification fixture designed to satisfy all obligations.
 */
const SCENARIO_OPTIONS = Object.entries(scenarios).map(([value, { label }]) => ({
  value,
  label
}))

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
 * Convert scenario options to GOV.UK select items format.
 *
 * @param {string|null} selected - Currently selected scenario name
 * @returns {Array<Object>} Select items for govukSelect macro
 */
const toScenarioSelectItems = (selected) => {
  const items = [{ value: '', text: 'Empty (clear all)', selected: !selected }]

  for (const scenario of SCENARIO_OPTIONS) {
    items.push({
      value: scenario.value,
      text: scenario.label,
      selected: scenario.value === selected
    })
  }

  return items
}

/**
 * GET /explorer handler (scenario-based journey configuration)
 *
 * Loads a scenario from query param (?scenario=X), session, or shows empty state.
 * Uses the evaluation engine via server.app.evaluationEngine.
 */
export const journeyController = {
  handler(request, h) {
    const { evaluationEngine } = request.server.app
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
        const traced = evaluationEngine.evaluate('eu-live-animals', notification)
        const { journeyMap } = evaluationEngine.getJourney('eu-live-animals')
        const screens = resolveScreens(traced, journeyMap)
        sections = groupScreensBySection(screens)
        summary = traced.summary
      } catch (err) {
        request.logger.error({ err }, 'Journey evaluation failed')
      }
    }

    const scenarioSelectItems = toScenarioSelectItems(selectedScenario)

    return h.view('explorer/journey', {
      pageTitle: 'Journey Configuration',
      heading: 'Scenario-Based Journey Explorer',
      currentPage: 'journey',
      scenarioSelectItems,
      selectedScenario,
      sections,
      summary
    })
  }
}
