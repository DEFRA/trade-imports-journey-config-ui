/**
 * Derived "Pages this commodity drives" panel data for the
 * commodity-config view.
 *
 * For the selected commodity, computes one entry per screen whose
 * presence is determined by commodity-fact conditional obligations.
 * Each entry carries the OR'd activation across the screen's drivers,
 * plus the per-driver reasons returned by the journey's resolver
 * tests.
 *
 * Lives in the analytics layer; the engine and the journey adapters
 * are not touched. Backs the HTTP endpoints
 * `GET /api/config/journeys/{key}/commodities/{code}/page-variance`
 * (and the `/species/{species}` variant) and the in-process call from
 * the commodity-config controller (until Story 05b switches it to HTTP).
 */

import { parseCommodityKey } from '#server/routes/explorer/config-utils.js'

const COMMODITY_FACT = 'commodity'

/**
 * Build the commodity object that a journey's `resolvers.tests`
 * consume. Constructs the value directly rather than going through
 * `facts.commodity` (which would need a notification stub), because
 * for `condition.fact === 'commodity'` obligations the fact extractor
 * is known to return `notification.commodities[0]` verbatim in both
 * journeys.
 *
 * @param {string} journeyKey
 * @param {string} commodityKey
 * @returns {{ id: string, species: object }}
 * @throws {Error} when journeyKey is not a registered journey
 */
export const buildCommodityValue = (journeyKey, commodityKey) => {
  const { commodityID, speciesName } = parseCommodityKey(commodityKey)
  // The journey-key switch duplicates shape knowledge that lives in
  // each adapter's resolvers. Story 06 deliberately keeps this in the
  // explorer layer to avoid expanding the adapter contract for a demo
  // UI feature. If a third journey lands, add a case here rather than
  // a new field on the adapter.
  if (journeyKey === 'eu-live-animals') {
    return { id: commodityID, species: { name: speciesName } }
  }
  if (journeyKey === 'chedpp-plants') {
    return { id: commodityID, species: { eppoCode: speciesName } }
  }
  if (journeyKey === 'chedd-products') {
    // Single-grain: the resolver test reads refdata.routing[id]; there
    // is no species axis (parseCommodityKey yields an empty species).
    return { id: commodityID }
  }
  throw new Error(
    `buildCommodityValue: unknown journey '${journeyKey}'`
  )
}

/**
 * One entry per screen whose presence is driven by commodity-fact
 * conditional obligations. `activates` is the OR of the per-driver
 * `active` flags - the engine's `resolveScreens` marks a screen
 * `notApplicable` only when every referenced obligation is inactive,
 * so a screen with any driver active would render.
 *
 * Returns `[]` when no commodity is selected.
 *
 * @param {object} journey - The adapter from getJourney(journeyKey)
 * @param {string} journeyKey - Passed explicitly; the adapter does not carry it
 * @param {string|null|undefined} commodityKey
 * @returns {Array<{ screenId: string, screenName: string, activates: boolean, drivers: Array<{id, name, active, reason}> }>}
 */
export const computePageVariance = (journey, journeyKey, commodityKey) => {
  if (!commodityKey) return []

  const commodityValue = buildCommodityValue(journeyKey, commodityKey)

  const commodityFactConditionals = new Map(
    journey.obligations
      .filter((o) => o.condition?.fact === COMMODITY_FACT)
      .map((o) => [o.id, o])
  )

  return journey.journeyMap.sections.flatMap((section) =>
    section.screens.flatMap((screen) =>
      buildScreenRow(screen, commodityFactConditionals, journey, commodityValue)
    )
  )
}

/**
 * Returns either a single-element array with the screen's panel row,
 * or `[]` when the screen has no commodity-fact-conditional drivers.
 * (Returning an array keeps the caller's `flatMap` shape clean.)
 */
const buildScreenRow = (
  screen,
  commodityFactConditionals,
  journey,
  commodityValue
) => {
  const driverObligations = screen.fields
    .map((f) => commodityFactConditionals.get(f.obligationRef))
    .filter(Boolean)

  if (driverObligations.length === 0) return []

  // De-duplicate by obligation id - multiple fields on a screen can
  // reference the same obligation, and the panel should show one
  // driver per obligation, not per field.
  const uniqueDrivers = [
    ...new Map(driverObligations.map((o) => [o.id, o])).values()
  ]

  const drivers = uniqueDrivers.map((o) => runDriver(o, journey, commodityValue))

  return [
    {
      screenId: screen.id,
      screenName: screen.screenName,
      activates: drivers.some((d) => d.active),
      drivers
    }
  ]
}

const runDriver = (obligation, journey, commodityValue) => {
  const testName = obligation.condition.test
  const test = journey.resolvers.tests[testName]
  if (typeof test !== 'function') {
    throw new Error(
      `page-variance: obligation '${obligation.id}' references unknown test '${testName}'`
    )
  }
  const { active, reason } = test(commodityValue, journey.refdata)
  return {
    id: obligation.id,
    name: obligation.name,
    active,
    reason
  }
}
