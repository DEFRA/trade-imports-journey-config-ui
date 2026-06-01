import { config } from '#config/config.js'
import { generateObligationFragments } from './obligation-fragments.js'
import { navContext } from './nav-context.js'

/**
 * GET /explorer/debug handler
 *
 * Renders the evaluation debugger page — a client-side visual debugging tool
 * for the obligation evaluation engine.
 *
 * If a notification exists in the session (e.g., set by the journey page),
 * it is passed to the template as a pre-populated initial value for the
 * JSON editor.
 *
 * Also provides obligation fragments for the fragment explorer panel.
 * Resolves the configured journey's obligations + scenarios via the engine
 * facade so the debugger works for any registered journey.
 */
export const debugController = {
  handler(request, h) {
    const { evaluationEngine } = request.server.app
    const journeyKey = config.get('journey')
    const { obligations, scenarios } = evaluationEngine.getJourney(journeyKey)
    const sessionNotification = request.yar.get('notification') || null

    // Generate obligation fragments
    const fragmentData = generateObligationFragments(obligations, scenarios)

    // Build dropdown items for fragment explorer
    // NOTE: Nunjucks `+` is string concatenation, not array concat,
    // so the full items array must be built server-side.
    const fragmentSelectItems = [
      { value: '', text: 'Select an obligation' },
      ...obligations.map((ob) => ({
        value: ob.id,
        text: ob.name
      }))
    ]

    // Build fragments object for client-side access (JSON-serializable)
    const fragments = {}
    for (const [id, data] of Object.entries(fragmentData)) {
      fragments[id] = {
        fragment: JSON.stringify(data.fragment, null, 2),
        note: data.note || null
      }
    }

    return h.view('explorer/debug', {
      pageTitle: 'Evaluation Debugger',
      heading: 'Evaluation Debugger',
      currentPage: 'debug',
      initialNotification: sessionNotification
        ? JSON.stringify(sessionNotification, null, 2)
        : null,
      fragmentSelectItems,
      fragmentsJson: JSON.stringify(fragments),
      ...navContext(journeyKey)
    })
  }
}
