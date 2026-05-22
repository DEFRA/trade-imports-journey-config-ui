/**
 * Contract tests for engine/combinators.js — owns protocol.md §5.5.
 *
 * Behaviour & risks (≤5 lines):
 *   Five HOFs over ConditionTest. Risks: short-circuit drift (the
 *   unused test must NOT be invoked), verbatim return (the active
 *   test's TestResult identity must be preserved, not rebuilt),
 *   reason composition with exact `'; '` separator and left-to-right
 *   order, default reason strings for always/never, argument
 *   forwarding to child tests, exact throw messages.
 *
 * Verbatim short-circuit is asserted with `toBe` (Object.is) rather
 * than `toEqual` — only identity catches a `{...result}` regression.
 */
import { describe, it, expect, vi } from 'vitest'
import { or, and, not, always, never } from './combinators.js'

// ---------------------------------------------------------------------------
// Test-fixture helpers — typed ConditionTest-shaped functions
// ---------------------------------------------------------------------------

const activeTest = (reason) => () => ({ active: true, reason })
const inactiveTest = (reason) => () => ({ active: false, reason })

// ---------------------------------------------------------------------------
// or — disjunction
// ---------------------------------------------------------------------------

describe('or — disjunction', () => {
  it('short-circuits on the first active test and returns its TestResult VERBATIM (identity)', () => {
    const activeResult = { active: true, reason: 'first active' }
    const t1 = vi.fn(() => activeResult)
    const t2 = vi.fn(() => ({ active: true, reason: 'second active' }))

    const result = or(t1, t2)(null, null)

    expect(result).toBe(activeResult) // Object.is — identity, not deep-equality
    expect(t2).not.toHaveBeenCalled()
  })

  it('returns { active: false, reason: <joined> } when no test is active', () => {
    const result = or(inactiveTest('a'), inactiveTest('b'))(null, null)
    expect(result).toEqual({ active: false, reason: 'a; b' })
  })

  it('single-test variadic: no trailing separator when only one test runs', () => {
    const result = or(inactiveTest('only'))(null, null)
    expect(result).toEqual({ active: false, reason: 'only' })
  })

  it('forwards (factValue, refdata) verbatim to child tests', () => {
    const spy = vi.fn(() => ({ active: false, reason: 'x' }))
    or(spy)('the-fact', { the: 'refdata' })
    expect(spy).toHaveBeenCalledWith('the-fact', { the: 'refdata' })
  })
})

// ---------------------------------------------------------------------------
// and — conjunction
// ---------------------------------------------------------------------------

describe('and — conjunction', () => {
  it('short-circuits on the first inactive test and returns its TestResult VERBATIM (identity)', () => {
    const inactiveResult = { active: false, reason: 'first inactive' }
    const t1 = vi.fn(() => inactiveResult)
    const t2 = vi.fn(() => ({ active: false, reason: 'second inactive' }))

    const result = and(t1, t2)(null, null)

    expect(result).toBe(inactiveResult)
    expect(t2).not.toHaveBeenCalled()
  })

  it('returns { active: true, reason: <joined> } when all tests are active', () => {
    const result = and(activeTest('a'), activeTest('b'))(null, null)
    expect(result).toEqual({ active: true, reason: 'a; b' })
  })
})

// ---------------------------------------------------------------------------
// not — negation
// ---------------------------------------------------------------------------

describe('not — negation', () => {
  it('inverts an active test to inactive and wraps reason as "not (...)"', () => {
    const result = not(activeTest('r'))(null, null)
    expect(result).toEqual({ active: false, reason: 'not (r)' })
  })

  it('inverts an inactive test to active and wraps reason as "not (...)"', () => {
    const result = not(inactiveTest('r'))(null, null)
    expect(result).toEqual({ active: true, reason: 'not (r)' })
  })
})

// ---------------------------------------------------------------------------
// always / never — constants
// ---------------------------------------------------------------------------

describe('always — constant true', () => {
  it('default reason is "always active"', () => {
    expect(always()(null, null)).toEqual({
      active: true,
      reason: 'always active'
    })
  })

  it('custom reason passes through', () => {
    expect(always('foo')(null, null)).toEqual({
      active: true,
      reason: 'foo'
    })
  })
})

describe('never — constant false', () => {
  it('default reason is "always inactive"', () => {
    expect(never()(null, null)).toEqual({
      active: false,
      reason: 'always inactive'
    })
  })
})

// ---------------------------------------------------------------------------
// Throws — exact §5.5 messages
// ---------------------------------------------------------------------------

describe('combinators — throws (§5.5 exact text)', () => {
  it('or() with zero arguments throws', () => {
    expect(() => or()).toThrow('or/and requires at least one test')
  })

  it('and() with zero arguments throws', () => {
    expect(() => and()).toThrow('or/and requires at least one test')
  })

  it.each([
    ['number', 123],
    ['null', null],
    ['undefined', undefined],
    ['object', { active: true }]
  ])('not(%s) throws', (_label, input) => {
    expect(() => not(input)).toThrow('not requires a ConditionTest')
  })
})

// ---------------------------------------------------------------------------
// Composition smoke — combinators yield ConditionTest, so they chain
// ---------------------------------------------------------------------------

describe('combinators compose: not(or(never, always))', () => {
  it('reduces to an inactive ConditionTest with the negated reason', () => {
    const composed = not(or(never('a'), always('b')))
    expect(composed(null, null)).toEqual({
      active: false,
      reason: 'not (b)'
    })
  })
})
