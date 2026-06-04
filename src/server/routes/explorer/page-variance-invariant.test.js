import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from '../../server.js'

/**
 * Page-variance invariant (Story 06 §4).
 *
 *   The "Pages this commodity drives" panel claims that for every
 *   screen it lists, the screen's presence is determined entirely by
 *   commodity-fact conditional obligations. That 1:1 mapping relies
 *   on a structural property of every journey:
 *
 *     For every screen that has at least one field referencing a
 *     commodity-fact conditional obligation, every other field on
 *     that screen that carries an obligationRef must also reference
 *     a commodity-fact conditional obligation.
 *
 *   If a screen mixed a commodity-fact conditional with an
 *   always-required obligation, the always-required obligation would
 *   be `unsatisfied` under `resolveScreens`; the screen would render
 *   regardless of the commodity; the panel's Yes/No would no longer
 *   match page presence.
 *
 *   This test fails immediately when that property is broken,
 *   forcing the change author either to restructure the journey map
 *   or to update the panel's claim.
 *
 *   Presentational fields (no `obligationRef`) are skipped, matching
 *   `engine/resolve-screens.js`'s `extractScreenObligations`.
 */

const JOURNEY_KEYS = ['eu-live-animals', 'chedpp-plants']

describe('page-variance invariant: commodity-conditional screens are uniformly commodity-conditional', () => {
  let server
  let engine

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
    engine = server.app.evaluationEngine
  })

  afterAll(async () => {
    if (server) {
      await server.stop({ timeout: 0 })
    }
  })

  test.each(JOURNEY_KEYS)('%s', (journeyKey) => {
    const journey = engine.getJourney(journeyKey)
    const commodityFactConditionalIds = new Set(
      journey.obligations
        .filter((o) => o.condition?.fact === 'commodity')
        .map((o) => o.id)
    )

    for (const section of journey.journeyMap.sections) {
      for (const screen of section.screens) {
        const refs = screen.fields
          .map((f) => f.obligationRef)
          .filter(Boolean)
        const hasCommodityFactConditional = refs.some((r) =>
          commodityFactConditionalIds.has(r)
        )
        if (!hasCommodityFactConditional) continue

        for (const ref of refs) {
          expect({
            journey: journeyKey,
            screen: screen.screenName,
            ref,
            isCommodityFactConditional: commodityFactConditionalIds.has(ref)
          }).toEqual({
            journey: journeyKey,
            screen: screen.screenName,
            ref,
            isCommodityFactConditional: true
          })
        }
      }
    }
  })
})
