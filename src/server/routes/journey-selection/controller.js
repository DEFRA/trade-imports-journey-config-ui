import { navContext } from '../explorer/nav-context.js'

export const journeySelectionController = {
  async handler(request, h) {
    // navContext is async (Story 02) — it fetches the journey list
    // over the HTTP client so the picker is served via the API path,
    // not the in-process facade.
    const nav = await navContext(request)

    return h.view('journey-selection/index', {
      pageTitle: 'Journey Selection',
      heading: 'Journey Selection',
      breadcrumbs: [
        { text: 'Home', href: '/' },
        { text: 'Journey Selection' }
      ],
      ...nav
    })
  }
}
