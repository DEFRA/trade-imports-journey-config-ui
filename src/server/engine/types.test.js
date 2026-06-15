/**
 * Freeze and literal-value tests for the engine protocol vocabulary.
 *
 * The only behavioural contract this module ships is the literal value
 * each enum member resolves to (per `features/modelling/protocol.md` §3)
 * and the fact that the enums are frozen. JSDoc typedefs are
 * documentation; they are not tested.
 */
import { describe, expect, it } from 'vitest'
import { OBLIGATION_STATUS, SCREEN_STATUS, SECTION_STATUS } from './types.js'

describe('OBLIGATION_STATUS', () => {
  it.each([
    ['SATISFIED', 'satisfied'],
    ['UNSATISFIED', 'unsatisfied'],
    ['DEFERRED', 'deferred'],
    ['INACTIVE', 'inactive']
  ])('OBLIGATION_STATUS.%s === %j', (key, expected) => {
    expect(OBLIGATION_STATUS[key]).toBe(expected)
  })

  it('is a frozen object', () => {
    expect(Object.isFrozen(OBLIGATION_STATUS)).toBe(true)
  })
})

describe('SCREEN_STATUS', () => {
  it.each([
    ['COMPLETE', 'complete'],
    ['INCOMPLETE', 'incomplete'],
    ['CANNOT_START_YET', 'cannotStartYet'],
    ['NOT_APPLICABLE', 'notApplicable']
  ])('SCREEN_STATUS.%s === %j', (key, expected) => {
    expect(SCREEN_STATUS[key]).toBe(expected)
  })

  it('is a frozen object', () => {
    expect(Object.isFrozen(SCREEN_STATUS)).toBe(true)
  })
})

describe('SECTION_STATUS', () => {
  it.each([
    ['COMPLETE', 'complete'],
    ['INCOMPLETE', 'incomplete'],
    ['CANNOT_START_YET', 'cannotStartYet']
  ])('SECTION_STATUS.%s === %j', (key, expected) => {
    expect(SECTION_STATUS[key]).toBe(expected)
  })

  it('is a frozen object', () => {
    expect(Object.isFrozen(SECTION_STATUS)).toBe(true)
  })
})
