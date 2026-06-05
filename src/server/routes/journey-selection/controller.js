import { clientForRequest } from '#server/clients/journey-api-client.js'
import { navContext } from '../explorer/nav-context.js'

export const journeySelectionController = {
  async handler(request, h) {
    const client = clientForRequest(request)
    // Wired now to exercise the loopback path end-to-end. Story 02
    // reconciles the picker partial to read `journeys` here instead
    // of navContext.journeyOptions. Until then the value is passed
    // through but not consumed by the template.
    // A transient API failure is degraded rather than fatal: the page
    // still renders with an empty list, the in-process navContext
    // picker still works, and the warning surfaces in logs.
    const journeys = await client.listJourneys().catch((error) => {
      request.logger.warn(
        { err: error },
        'journey-selection: failed to load journey list from /api/config/journeys; rendering with empty list'
      )
      return []
    })

    return h.view('journey-selection/index', {
      pageTitle: 'Journey Selection',
      heading: 'Journey Selection',
      breadcrumbs: [
        { text: 'Home', href: '/' },
        { text: 'Journey Selection' }
      ],
      journeys,
      ...navContext(request)
    })
  }
}
