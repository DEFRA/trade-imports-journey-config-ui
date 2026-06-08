/**
 * Journey-key resolution + view-context fragment for the explorer nav.
 *
 * Two responsibilities:
 *
 *   1. `currentJourneyKey(request)` — single source for "what journey
 *      is this request being served as?". Session value wins when
 *      present; otherwise the boot default (`config.get('journey')`)
 *      wins. No validation — a stale session value flows downstream
 *      where it surfaces as a page render failure with real UI to
 *      report it (per feedback_ui_http_first.md).
 *
 *   2. `navContext(request)` — view-context fragment containing both
 *      `journeyKey` (the resolved key) and `journeyOptions` (the
 *      select-items for the picker partial). Fetches the journey list
 *      over HTTP. There is no in-process fallback: an HTTP failure
 *      surfaces as a thrown error and the page returns 500 honestly.
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

export const currentJourneyKey = (request) => {
  const session = request.yar.get('journey')
  if (session) return session
  return config.get('journey')
}

export const navContext = async (request) => {
  const journeyKey = currentJourneyKey(request)
  const journeys = await clientForRequest(request).listJourneys()
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
