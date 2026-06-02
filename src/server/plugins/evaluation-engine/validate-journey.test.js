/**
 * Focused unit tests for validateJourney.
 *
 * Behaviour & risks (≤5 lines):
 *   The plugin's startup guard is the only safety net catching
 *   malformed adapter shapes before the engine touches them. Story 03
 *   relaxed it from "must have refdata.routing" to "must have refdata"
 *   — these cases pin both the relaxation (no routing key is OK) and
 *   the safety net (non-object refdata still fails).
 *
 * No mocks. Calls validateJourney directly with synthetic adapters.
 */
import { describe, test, expect } from 'vitest'
import { validateJourney } from './plugin.js'

const baseAdapter = () => ({
  obligations: [{ id: 'x' }],
  refdata: {},
  journeyMap: { sections: [] },
  resolvers: {
    facts: {},
    tests: {},
    submissionDatePath: 'submittedAt'
  }
})

describe('validateJourney', () => {
  // ---------------------------------------------------------------------------
  // Happy path: refdata is journey-shape-agnostic — it just has to be an object.
  // ---------------------------------------------------------------------------

  test('passes when refdata is an empty object (journey-shape-agnostic)', () => {
    expect(() => validateJourney('test', baseAdapter())).not.toThrow()
  })

  test('passes when refdata has commodities/species (plants shape) and no routing', () => {
    const adapter = baseAdapter()
    adapter.refdata = { commodities: {}, species: {} }
    expect(() => validateJourney('plants-like', adapter)).not.toThrow()
  })

  test('passes when refdata has routing (animals shape)', () => {
    const adapter = baseAdapter()
    adapter.refdata = { routing: {}, content: {} }
    expect(() => validateJourney('animals-like', adapter)).not.toThrow()
  })

  // ---------------------------------------------------------------------------
  // Refdata guard: a missing or non-object refdata must still throw a clear
  // error. This is the safety net the relaxation must not lose.
  // ---------------------------------------------------------------------------

  test('throws when refdata is missing', () => {
    const adapter = baseAdapter()
    delete adapter.refdata
    expect(() => validateJourney('bad', adapter)).toThrow(
      /Journey "bad": refdata is missing or not an object/
    )
  })

  test('throws when refdata is null', () => {
    const adapter = baseAdapter()
    adapter.refdata = null
    expect(() => validateJourney('bad', adapter)).toThrow(
      /refdata is missing or not an object/
    )
  })

  test('throws when refdata is a string (non-object)', () => {
    const adapter = baseAdapter()
    adapter.refdata = 'whoops'
    expect(() => validateJourney('bad', adapter)).toThrow(
      /refdata is missing or not an object/
    )
  })

  // ---------------------------------------------------------------------------
  // The other adapter sections still must be present + shaped.
  // ---------------------------------------------------------------------------

  test('throws when obligations is empty', () => {
    const adapter = baseAdapter()
    adapter.obligations = []
    expect(() => validateJourney('bad', adapter)).toThrow(
      /obligations must be a non-empty array/
    )
  })

  test('throws when resolvers.facts is missing', () => {
    const adapter = baseAdapter()
    adapter.resolvers.facts = null
    expect(() => validateJourney('bad', adapter)).toThrow(
      /resolvers\.facts is missing/
    )
  })
})
