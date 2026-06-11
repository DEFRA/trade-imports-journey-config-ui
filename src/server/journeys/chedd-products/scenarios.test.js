/**
 * Regression net for chedd-products scenarios.
 *
 * Behaviour & risks:
 *   Every committed scenario evaluates with submittable: true,
 *   unsatisfied: 0, deferred: 0. Per-status counts are pinned (the one
 *   conditional, intended-use, is active on internal-market commodities
 *   and inactive on anomaly commodities). An empty notification produces a
 *   mix of unsatisfied + deferred, never silently satisfied. The
 *   combo-outlier commodity surfaces its real override. No mocks.
 */
import { describe, test, expect } from 'vitest'
import { evaluate } from '#server/engine/evaluate.js'
import {
  obligations,
  refdata,
  resolvers,
  scenarios,
  commodityDetail
} from './index.js'

const adapter = { obligations, refdata, journeyResolver: resolvers }
const evaluateScenario = (notification) => evaluate(notification, adapter)

// ---------------------------------------------------------------------------
// Per-scenario submittable assertions
// ---------------------------------------------------------------------------

describe('chedd-products scenarios — submittable', () => {
  test.each(Object.entries(scenarios))(
    '%s evaluates as submittable with 0 unsatisfied and 0 deferred',
    (_name, { notification }) => {
      const { summary } = evaluateScenario(notification)
      expect(summary.submittable).toBe(true)
      expect(summary.unsatisfied).toBe(0)
      expect(summary.deferred).toBe(0)
    }
  )
})

// ---------------------------------------------------------------------------
// Per-scenario (satisfied, inactive) pins — taken from the green run.
// intended-use is the only conditional: active+satisfied on internal-
// market commodities (18/0), inactive on the anomalies (17/1).
// ---------------------------------------------------------------------------

describe('chedd-products scenarios — per-status counts (pins)', () => {
  const pins = [
    ['import-wheat', 18, 0],
    ['import-feed-prep', 17, 1],
    ['import-refrigerator', 17, 1],
    ['import-fruit-paste', 18, 0],
    ['import-preserved-apricots', 17, 1],
    ['import-mixed', 18, 0]
  ]

  test.each(pins)(
    '%s has satisfied=%i, inactive=%i',
    (name, satisfied, inactive) => {
      const { summary } = evaluateScenario(scenarios[name].notification)
      expect(summary.satisfied).toBe(satisfied)
      expect(summary.inactive).toBe(inactive)
    }
  )
})

// ---------------------------------------------------------------------------
// Inverse check: an empty notification produces no spurious satisfaction
// ---------------------------------------------------------------------------

describe('chedd-products — empty-notification inverse', () => {
  test('an empty notification produces unsatisfied + deferred, never silently satisfied', () => {
    const { obligations: ob, summary } = evaluateScenario({})

    // Data-bearing obligations are unsatisfied; the one conditional
    // (intended-use) defers because facts.commodity returns null.
    expect(summary.unsatisfied).toBeGreaterThan(0)
    expect(summary.deferred).toBeGreaterThan(0)

    const satisfiedIds = ob
      .filter((o) => o.status === 'satisfied')
      .map((o) => o.id)
    expect(satisfiedIds).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Combo-outlier: the fruit-paste commodity (200710) is one of the 9
// outliers carrying an explicit combo_type_options_override; commodityDetail
// surfaces it (rather than the single templated default).
// ---------------------------------------------------------------------------

describe('chedd-products — combo-outlier override', () => {
  test('commodity 200710 surfaces its multi-option combo override', () => {
    const detail = commodityDetail(refdata, '200710')
    expect(detail.comboType.length).toBeGreaterThan(1)
    expect(detail.comboType.every((o) => 'text' in o && 'value' in o)).toBe(
      true
    )
  })
})
