import {
  extractCommodityOptions,
  parseCommodityKey,
  toSelectItems
} from './config-utils.js'
import { navContext } from './nav-context.js'
import { clientForRequest } from '#server/clients/journey-api-client.js'

const baseViewContext = (nav) => ({
  pageTitle: 'Commodity Configuration',
  heading: 'Commodity Reference Data Configuration',
  currentPage: 'commodity-config',
  ...nav
})

// Detail ids that describe commodity-level routing fields. These are
// surfaced as part of the commodity summary at the top of the page,
// not down in the regular details block. Each registered journey
// names its routing detail; the set is small and stable.
const ROUTING_DETAIL_IDS = new Set(['commodity_flags', 'routing'])

const renderNoCommodity = async (h, client, journeyKey, nav) => {
  const commodities = await client.getCommodities(journeyKey)
  return h.view('explorer/commodity-config', {
    ...baseViewContext(nav),
    commodityOptions: toSelectItems(
      extractCommodityOptions(commodities),
      null,
      'Select a commodity'
    ),
    selectedCommodity: null
  })
}

/**
 * GET /explorer/commodity-config handler.
 *
 * Built end-to-end over HTTP — no in-process engine reads. The page is
 * portable: this codebase could be lifted out and pointed at a remote
 * `apiBaseUrl` and would render identically.
 *
 * Two render shapes:
 *   - no commodity selected → dropdown only (one HTTP call).
 *   - commodity selected → three parallel HTTP calls + the panels.
 *
 * Fail-loud asymmetry on the with-commodity branch:
 *   - getCommodities, getRefdataView throw → 500 (core data; no
 *     meaningful render is possible without them).
 *   - getPageVariance throws → page renders without the "Pages this
 *     commodity drives" panel (demo affordance; honest degradation).
 */
export const commodityConfigController = {
  async handler(request, h) {
    const nav = await navContext(request)
    const { journeyKey } = nav
    const client = clientForRequest(request)

    // Trim before deciding which branch: empty / whitespace / undefined
    // all collapse to "no commodity selected" rather than ambiguous
    // structural noise.
    const selectedKey = request.query.commodity?.trim() || null
    if (!selectedKey) {
      return renderNoCommodity(h, client, journeyKey, nav)
    }

    // Defensive guard: structural noise like '|MABSD' (species-only,
    // no commodity ID) parses to commodityID='' and falls through to
    // the no-commodity render. Otherwise we'd fire the per-commodity
    // fetches with an empty code.
    const { commodityID, speciesName } = parseCommodityKey(selectedKey)
    if (!commodityID) {
      return renderNoCommodity(h, client, journeyKey, nav)
    }

    // Three parallel HTTP calls. The first two (getCommodities,
    // getRefdataView) deliberately have NO .catch — any failure rejects
    // the Promise.all, propagates to Hapi, surfaces as 500. The third
    // is a demo affordance; its .catch is the intentional degradation
    // path.
    const [commodities, refdataView, pageVarianceResult] = await Promise.all([
      client.getCommodities(journeyKey),
      client.getRefdataView(journeyKey, {
        commodity: commodityID,
        species: speciesName
      }),
      client
        .getPageVariance(journeyKey, commodityID, speciesName || undefined)
        .catch((error) => {
          request.logger.warn(
            { err: error, journeyKey, commodityID, speciesName },
            'commodity-config: page-variance fetch failed; rendering without panel'
          )
          return { pageVariance: [] }
        })
    ])

    const commodityOptions = toSelectItems(
      extractCommodityOptions(commodities),
      selectedKey,
      'Select a commodity'
    )

    // refdataView returns dimensions and details with values populated
    // server-side (Story 02 design call). The controller passes them
    // through unchanged.
    const routingDetail =
      refdataView.details.find((d) => ROUTING_DETAIL_IDS.has(d.id)) ?? null
    const otherDetails = refdataView.details.filter(
      (d) => !ROUTING_DETAIL_IDS.has(d.id)
    )

    return h.view('explorer/commodity-config', {
      ...baseViewContext(nav),
      commodityOptions,
      selectedCommodity: selectedKey,
      commodityID,
      speciesName: speciesName || '(no species)',
      dimensionViews: refdataView.dimensions,
      routingDetail,
      otherDetails,
      pageVariance: pageVarianceResult.pageVariance
    })
  }
}
