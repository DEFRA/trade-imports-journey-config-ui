/**
 * Regression net for chedpp-plants scenarios.
 *
 * Behaviour & risks (≤5 lines):
 *   Every committed scenario evaluates with `submittable: true`,
 *   `unsatisfied: 0`, `deferred: 0`. Per-status counts are pinned
 *   pre-/post-migration. An empty notification produces a mix of
 *   unsatisfied + deferred (inverse check guarding against the
 *   wrapper-object trap R2). No mocks, real journey adapter.
 */
import { describe, test, expect } from 'vitest'
import { evaluate } from '#server/engine/evaluate.js'
import { obligations, refdata, resolvers, scenarios } from './index.js'

const adapter = { obligations, refdata, journeyResolver: resolvers }

const evaluateScenario = (notification) => evaluate(notification, adapter)

// ---------------------------------------------------------------------------
// Per-scenario submittable assertions
// ---------------------------------------------------------------------------

describe('chedpp-plants scenarios — submittable', () => {
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
// Per-scenario (satisfied, inactive) parity targets pinned pre-migration
// ---------------------------------------------------------------------------

describe('chedpp-plants scenarios — per-status counts (parity pins)', () => {
  // Pinned from baseline captured immediately before Story 03 migration.
  // Any drift here means the new shape is missing data the obligations
  // expect, or conditional obligations are firing differently than
  // before.
  const parityTargets = [
    ['import-phsi-ornamental', 20, 8],
    ['import-apples', 23, 5],
    ['import-peppers', 22, 6],
    ['import-bulbs', 22, 6],
    ['import-seeds', 21, 7],
    ['transit-plants', 21, 7],
    ['transhipment-plants', 21, 7]
  ]

  test.each(parityTargets)(
    '%s has satisfied=%i, inactive=%i',
    (name, expectedSatisfied, expectedInactive) => {
      const { summary } = evaluateScenario(scenarios[name].notification)
      expect(summary.satisfied).toBe(expectedSatisfied)
      expect(summary.inactive).toBe(expectedInactive)
    }
  )
})

// ---------------------------------------------------------------------------
// Inverse check: empty notification produces no spurious satisfaction
// ---------------------------------------------------------------------------

describe('chedpp-plants — empty-notification inverse (Risk R2)', () => {
  test('an empty notification produces unsatisfied + deferred, never silently satisfied', () => {
    const { obligations: ob, summary } = evaluateScenario({})

    // Some obligations are unsatisfied (data-bearing); some deferred
    // (conditional with absent fact); we should see both kinds.
    expect(summary.unsatisfied).toBeGreaterThan(0)
    expect(summary.deferred).toBeGreaterThan(0)

    // No data-bearing obligation silently satisfies. Action-only
    // obligations (empty schemaPaths) are allowed to be unsatisfied;
    // they cannot satisfy without a submittedAt either.
    const satisfiedIds = ob
      .filter((o) => o.status === 'satisfied')
      .map((o) => o.id)
    expect(satisfiedIds).toEqual([])
  })
})
