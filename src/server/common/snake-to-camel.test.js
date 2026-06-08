import { describe, it, expect } from 'vitest'
import { mapKeysDeep } from './snake-to-camel.js'

describe('mapKeysDeep', () => {
  it.each([
    null,
    undefined,
    0,
    1,
    -1,
    '',
    'snake_case_string',
    false,
    true
  ])('returns the primitive %p unchanged', (value) => {
    expect(mapKeysDeep(value)).toBe(value)
  })

  it('camelCases object keys and recurses into values', () => {
    expect(
      mapKeysDeep({
        cph_number: true,
        permanent_address: false,
        nested_obj: { transporter_address: null, identifier_sets: 'set_01' }
      })
    ).toEqual({
      cphNumber: true,
      permanentAddress: false,
      nestedObj: { transporterAddress: null, identifierSets: 'set_01' }
    })
  })

  it('maps each element of an array; object elements re-keyed, scalars unchanged', () => {
    expect(
      mapKeysDeep([
        'snake_case_string',
        42,
        null,
        { regulatory_authority: 'JOINT' }
      ])
    ).toEqual([
      'snake_case_string',
      42,
      null,
      { regulatoryAuthority: 'JOINT' }
    ])
  })

  it('handles arrays-of-arrays', () => {
    expect(mapKeysDeep([[{ a_b: 1 }], [2, 3]])).toEqual([
      [{ aB: 1 }],
      [2, 3]
    ])
  })

  it('preserves null and undefined values inside objects', () => {
    expect(mapKeysDeep({ a_b: null, c_d: undefined })).toEqual({
      aB: null,
      cD: undefined
    })
  })

  it('is idempotent on already-camelCase keys', () => {
    const once = mapKeysDeep({ cphNumber: true, content: { purpose: 'p' } })
    const twice = mapKeysDeep(once)
    expect(twice).toEqual(once)
  })

  it('does not mutate its input', () => {
    const input = {
      cph_number: true,
      nested: { foo_bar: [1, { baz_qux: 2 }] }
    }
    const snapshot = structuredClone(input)
    mapKeysDeep(input)
    expect(input).toEqual(snapshot)
  })

  it('returns an empty object for an empty object', () => {
    expect(mapKeysDeep({})).toEqual({})
  })

  it('returns an empty array for an empty array', () => {
    expect(mapKeysDeep([])).toEqual([])
  })
})
