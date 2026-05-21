import { describe, test, expect } from 'vitest'
import { evaluate as evaluateAdapter } from '#server/engine/evaluate.js'
import { obligations, refdata, resolvers } from '../../journeys/eu-live-animals/index.js'
import {
  importSemen,
  importOwls,
  importCattle,
  importCats,
  transhipmentSemen,
  transhipmentCattle,
  importMixedLivestock,
  scenarioMap
} from '../../journeys/eu-live-animals/scenarios.js'

/**
 * Behavior & Intent:
 * - [Domain Goal]: Provide 7 curated notification fixtures that exercise every
 *   distinct path through the obligation graph (4 routing flag combos × 2 purpose
 *   groups + 1 multi-commodity), each evaluating as submittable.
 * - [Observable Outcome]: Every fixture passes the evaluator with submittable: true,
 *   0 unsatisfied, 0 deferred. Each covers a distinct routing flag combination.
 *
 * High-value cases:
 * - Every scenario evaluates without throwing
 * - Every scenario is submittable with 0 unsatisfied and 0 deferred
 * - Obligation counts match expected routing flag activation
 * - Multi-commodity scenario has correct array structure
 * - Routing flag coverage: each combo produces distinct inactive sets
 *
 * Explicitly excluded:
 * - Not testing internal builder functions (pure implementation detail)
 * - Not testing JSON serialisation round-trips
 * - Not testing individual field values (plausible fakes, not domain-critical)
 */

const adapter = { obligations, refdata, journeyResolver: resolvers }

/**
 * Helper: evaluate a scenario and return the summary.
 */
const evaluate = (notification) => evaluateAdapter(notification, adapter)

// ---------------------------------------------------------------------------
// Core contract: every scenario is submittable
// ---------------------------------------------------------------------------

describe('Scenario fixtures', () => {
  const scenarios = [
    ['import-semen', importSemen],
    ['import-owls', importOwls],
    ['import-cattle', importCattle],
    ['import-cats', importCats],
    ['transhipment-semen', transhipmentSemen],
    ['transhipment-cattle', transhipmentCattle],
    ['import-mixed-livestock', importMixedLivestock]
  ]

  describe.each(scenarios)('%s', (_name, notification) => {
    test('should evaluate as submittable with 0 unsatisfied and 0 deferred', () => {
      const { summary } = evaluate(notification)

      expect(summary.submittable).toBe(true)
      expect(summary.unsatisfied).toBe(0)
      expect(summary.deferred).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // Obligation count verification — confirms distinct routing paths
  // -------------------------------------------------------------------------

  describe('Routing flag coverage', () => {
    test('import-semen (no flags) should have fewest active obligations', () => {
      const { summary } = evaluate(importSemen)
      // 6 inactive: transit-routing, animal-certification, animal-weaning-status,
      //             permanent-address, livestock-holding, transporter-identification
      expect(summary.satisfied).toBe(17)
      expect(summary.inactive).toBe(6)
    })

    test('import-owls (transporter only) should activate transporter-identification', () => {
      const { summary } = evaluate(importOwls)
      expect(summary.satisfied).toBe(18)
      expect(summary.inactive).toBe(5)
    })

    test('import-cattle (CPH + transporter) should activate livestock-holding', () => {
      const result = evaluate(importCattle)
      expect(result.summary.satisfied).toBe(19)

      const livestockHolding = result.obligations.find(
        (o) => o.id === 'livestock-holding'
      )
      expect(livestockHolding.status).toBe('satisfied')
    })

    test('import-cats (perm addr + transporter) should activate permanent-address', () => {
      const result = evaluate(importCats)
      expect(result.summary.satisfied).toBe(19)

      const permAddr = result.obligations.find(
        (o) => o.id === 'permanent-address'
      )
      expect(permAddr.status).toBe('satisfied')

      // CPH should be inactive for cats (no cph_number flag)
      const livestock = result.obligations.find(
        (o) => o.id === 'livestock-holding'
      )
      expect(livestock.status).toBe('inactive')
    })

    test('transhipment-cattle (maximal) should have most active obligations', () => {
      const { summary } = evaluate(transhipmentCattle)
      expect(summary.satisfied).toBe(20)
      expect(summary.inactive).toBe(3)
    })

    test('transhipment-semen should activate transit-routing but not commodity flags', () => {
      const result = evaluate(transhipmentSemen)
      expect(result.summary.satisfied).toBe(18)

      const transitRouting = result.obligations.find(
        (o) => o.id === 'transit-routing'
      )
      expect(transitRouting.status).toBe('satisfied')
    })
  })

  // -------------------------------------------------------------------------
  // Multi-commodity scenario
  // -------------------------------------------------------------------------

  describe('import-mixed-livestock (multi-commodity)', () => {
    test('should have 2 commodity complements', () => {
      const complements =
        importMixedLivestock.partOne.commodities.commodityComplement
      expect(complements).toHaveLength(2)
    })

    test('should have 2 complement parameter sets', () => {
      const paramSets =
        importMixedLivestock.partOne.commodities.complementParameterSet
      expect(paramSets).toHaveLength(2)
    })

    test('should use cattle as first commodity (drives routing)', () => {
      const first =
        importMixedLivestock.partOne.commodities.commodityComplement[0]
      expect(first.commodityID).toBe('102')
      expect(first.speciesName).toBe('Bos taurus')
    })

    test('should use goat as second commodity', () => {
      const second =
        importMixedLivestock.partOne.commodities.commodityComplement[1]
      expect(second.commodityID).toBe('10420')
      expect(second.speciesName).toBe('Capra hircus')
    })
  })

  // -------------------------------------------------------------------------
  // Two obligations that should NEVER activate
  // -------------------------------------------------------------------------

  describe('Always-inactive obligations', () => {
    test.each(scenarios)(
      '%s should have animal-certification and animal-weaning-status inactive',
      (_name, notification) => {
        const result = evaluate(notification)

        const cert = result.obligations.find(
          (o) => o.id === 'animal-certification'
        )
        const weaning = result.obligations.find(
          (o) => o.id === 'animal-weaning-status'
        )

        expect(cert.status).toBe('inactive')
        expect(weaning.status).toBe('inactive')
      }
    )
  })

  // -------------------------------------------------------------------------
  // Scenario map structure (used by controller)
  // -------------------------------------------------------------------------

  describe('scenarioMap', () => {
    test('should contain all 7 scenarios', () => {
      expect(Object.keys(scenarioMap)).toHaveLength(7)
    })

    test('every entry should have notification and label', () => {
      for (const [key, entry] of Object.entries(scenarioMap)) {
        expect(entry.notification).toBeDefined()
        expect(entry.notification.partOne).toBeDefined()
        expect(typeof entry.label).toBe('string')
        expect(entry.label.length).toBeGreaterThan(0)
      }
    })
  })
})
