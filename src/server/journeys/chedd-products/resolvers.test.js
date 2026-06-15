import { describe, it, test, expect } from 'vitest'
import { resolvers, facts, tests, lookupRouting } from './resolvers.js'

describe('chedd-products resolvers — export shape', () => {
  it('exports facts, tests, and a submissionDatePath string', () => {
    expect(typeof resolvers.facts).toBe('object')
    expect(typeof resolvers.tests).toBe('object')
    expect(resolvers.submissionDatePath).toBe('submittedAt')
  })
})

describe('tests return the { active, reason } contract', () => {
  const refdata = { routing: { 1001: { has_internal_market: true } } }
  test.each(Object.entries(tests))(
    '%s returns { active:boolean, reason:string }',
    (_name, fn) => {
      const { active, reason } = fn({ id: '1001' }, refdata)
      expect(typeof active).toBe('boolean')
      expect(typeof reason).toBe('string')
      expect(reason.length).toBeGreaterThan(0)
    }
  )
})

describe('facts.commodity', () => {
  test.each([
    [
      { commodities: [{ id: '1001', description: 'wheat' }] },
      { id: '1001', description: 'wheat' }
    ],
    [{}, null],
    [{ commodities: [] }, null],
    [{ commodities: [{ description: 'no id' }] }, null]
  ])(
    'extracts the first commodity with an id, else null (%#)',
    (notification, expected) => {
      expect(facts.commodity(notification)).toEqual(expected)
    }
  )
})

describe('tests.requiresInternalMarket', () => {
  const refdata = {
    routing: {
      1001: { has_internal_market: true },
      230990: { has_internal_market: false }
    }
  }

  test.each([
    ['1001', true],
    ['230990', false],
    ['9999999', false]
  ])('commodity %s -> active: %s', (id, expectedActive) => {
    expect(tests.requiresInternalMarket({ id }, refdata).active).toBe(
      expectedActive
    )
  })

  it('does not throw and explains the cause when the routing row is absent', () => {
    const result = tests.requiresInternalMarket(
      { id: 'absent' },
      { routing: {} }
    )
    expect(result.active).toBe(false)
    expect(result.reason).toMatch(/refdata|routing/)
  })
})

describe('lookupRouting — bare-code, no pipe fallback', () => {
  it('looks up the bare commodity id (ignoring any species on the commodity)', () => {
    const refdata = { routing: { 102: { has_internal_market: true } } }
    expect(
      lookupRouting(refdata, { id: '102', species: { name: 'Bos taurus' } })
    ).toEqual({ has_internal_market: true })
  })

  it('returns null for a pipe-suffixed routing key (the animals-style fallback is absent)', () => {
    const refdata = { routing: { '102|': { has_internal_market: true } } }
    expect(lookupRouting(refdata, { id: '102' })).toBeNull()
  })
})
