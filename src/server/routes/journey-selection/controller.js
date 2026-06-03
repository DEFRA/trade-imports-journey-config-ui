import { navContext } from '../explorer/nav-context.js'

export const journeySelectionController = {
  handler(request, h) {
    return h.view('journey-selection/index', {
      pageTitle: 'Journey Selection',
      heading: 'Journey Selection',
      breadcrumbs: [
        { text: 'Home', href: '/' },
        { text: 'Journey Selection' }
      ],
      ...navContext(request)
    })
  }
}
