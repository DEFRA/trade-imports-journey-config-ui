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

export const currentJourneyKey = (request) => {
  const session = request.yar.get('journey')
  const known = request.server.app.evaluationEngine.listJourneys()
  if (session && known.includes(session)) return session
  return config.get('journey')
}

export const navContext = (request) => {
  const journeyKey = currentJourneyKey(request)
  const known = request.server.app.evaluationEngine.listJourneys()
  return {
    journeyKey,
    journeyOptions: known.map((key) => ({
      value: key,
      text: key, // raw key — display labels are out of scope per Story 01
      selected: key === journeyKey
    }))
  }
}
