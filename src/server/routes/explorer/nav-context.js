/**
 * Journey-key resolution + view-context fragment for the explorer nav.
 *
 * Two responsibilities:
 *
 *   1. `currentJourneyKey(request)` — single source for "what journey
 *      is this request being served as?". Session value wins when set
 *      and registered; otherwise we fall back to the boot default
 *      (`config.get('journey')`). The fallback guards against a stale
 *      session pointing at an unregistered journey — instead of
 *      crashing on `getJourney`, the page renders the default.
 *
 *   2. `navContext(request)` — view-context fragment containing both
 *      `journeyKey` (the resolved key) and `journeyOptions` (the
 *      select-items for the picker partial). Every view controller
 *      spreads this into its `h.view(...)` context so the picker shows
 *      up on every explorer page.
 *
 * The boot default still comes from the `JOURNEY` env var via
 * convict — it remains the source of truth for CI and unattended
 * runs; the picker is the in-browser override.
 */
import { config } from '#config/config.js'
import {
  clientForRequest,
  extractJourneyKey
} from '#server/clients/journey-api-client.js'

// currentJourneyKey stays SYNC — reads yar session + uses the
// in-process facade for the stale-session guard. The in-process
// listJourneys lookup is the fast path that prevents stale-session
// fallbacks from triggering an HTTP fetch.
export const currentJourneyKey = (request) => {
  const session = request.yar.get('journey')
  const known = request.server.app.evaluationEngine.listJourneys()
  if (session && known.includes(session)) return session
  return config.get('journey')
}

// navContext is ASYNC (Story 02) — fetches the journey list over the
// HTTP client to populate journeyOptions for the picker partial.
// Every explorer controller awaits this.
export const navContext = async (request) => {
  const journeyKey = currentJourneyKey(request)
  // The picker is a peripheral affordance; a transient API failure must
  // not blackout every explorer page. Fall back to the in-process
  // listJourneys (which we already used for currentJourneyKey above)
  // and log a warning — the page still renders, the picker may be
  // briefly missing/stale until the API recovers.
  const journeys = await clientForRequest(request)
    .listJourneys()
    .catch((error) => {
      request.logger.warn(
        { err: error },
        'navContext: listJourneys over HTTP failed; falling back to in-process facade for picker'
      )
      return request.server.app.evaluationEngine.listJourneys()
    })
  // HTTP listJourneys returns summary objects; the in-process fallback
  // returns bare key strings. extractJourneyKey accepts both.
  const keys = journeys.map(extractJourneyKey)
  return {
    journeyKey,
    journeyOptions: keys.map((key) => ({
      value: key,
      text: key, // raw key — display labels are out of scope per Story 01
      selected: key === journeyKey
    }))
  }
}
