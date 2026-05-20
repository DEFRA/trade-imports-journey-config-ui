/**
 * Tests for engine/path.js — the protocol-internal path utilities.
 *
 * Table-driven coverage of `resolvePath` (dot-path with `[]` array marker)
 * and `isEmpty` (protocol emptiness rules). These two functions are
 * non-public engine helpers used by both the canonical evaluator and the
 * traced evaluator.
 */
import { describe, it, expect } from 'vitest'
import { resolvePath, isEmpty } from './path.js'

// ---------------------------------------------------------------------------
// isEmpty
// ---------------------------------------------------------------------------

describe('isEmpty', () => {
  it.each([
    ['undefined', undefined, true],
    ['null', null, true],
    ['empty string', '', true],
    ['non-empty string', 'hello', false],
    ['false (boolean false is a value)', false, false],
    ['true', true, false],
    ['zero (numeric zero is a value)', 0, false],
    ['positive number', 42, false],
    ['empty array', [], true],
    ['non-empty array', [1], false],
    ['empty object', {}, true],
    ['non-empty object', { a: 1 }, false]
  ])('treats %s as empty=%s', (_label, value, expected) => {
    expect(isEmpty(value)).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// resolvePath
// ---------------------------------------------------------------------------

describe('resolvePath', () => {
  // Fixtures referenced by the table rows below
  const cattle = { partOne: { cphNumber: '12/345/6789' } }
  const arrayLeaf = {
    partOne: {
      commodities: { commodityComplement: [{ commodityID: '102' }] }
    }
  }
  const emptyArray = {
    partOne: { commodities: { commodityComplement: [] } }
  }
  const nestedArray = {
    partOne: {
      commodities: {
        complementParameterSet: [
          { identifiers: [{ data: 'UK123456' }] }
        ]
      }
    }
  }
  const bareArrayLeaf = {
    partOne: { nominatedContacts: [{ name: 'John' }] }
  }
  // Array where every element's remaining path is empty — exercises the
  // `hasValue ? ... : undefined` branch, distinct from "empty array".
  const arrayAllEmpty = {
    partOne: {
      commodities: {
        commodityComplement: [{ commodityID: '' }, { commodityID: null }]
      }
    }
  }
  // Array where the first item is empty at the remaining path but a later
  // item is not — proves `.find((v) => !isEmpty(v))` semantics.
  const arrayFirstEmpty = {
    partOne: {
      commodities: {
        commodityComplement: [{ commodityID: '' }, { commodityID: '102' }]
      }
    }
  }

  it.each([
    // [label, obj, path, expected]
    [
      'mid-path [] returns first non-empty value',
      arrayFirstEmpty,
      'notification.partOne.commodities.commodityComplement[].commodityID',
      '102'
    ],
    [
      'mid-path [] returns undefined when all elements are empty',
      arrayAllEmpty,
      'notification.partOne.commodities.commodityComplement[].commodityID',
      undefined
    ],
    [
      '[] as last segment returns the array itself',
      bareArrayLeaf,
      'notification.partOne.nominatedContacts[]',
      [{ name: 'John' }]
    ],
    [
      'empty array with [] returns undefined',
      emptyArray,
      'notification.partOne.commodities.commodityComplement[].commodityID',
      undefined
    ],
    [
      'simple [] resolves first element',
      arrayLeaf,
      'notification.partOne.commodities.commodityComplement[].commodityID',
      '102'
    ],
    [
      'nested arrays resolve [].[]',
      nestedArray,
      'notification.partOne.commodities.complementParameterSet[].identifiers[].data',
      'UK123456'
    ],
    [
      'notification. prefix stripped at top level',
      { type: 'X' },
      'notification.type',
      'X'
    ],
    [
      'plain dot path without prefix resolves',
      { a: { b: 1 } },
      'a.b',
      1
    ],
    [
      'simple dotted path with prefix resolves',
      cattle,
      'notification.partOne.cphNumber',
      '12/345/6789'
    ],
    [
      'missing intermediate returns undefined',
      { a: {} },
      'a.b.c',
      undefined
    ],
    [
      'missing top-level segment returns undefined',
      {},
      'notification.partOne.cphNumber',
      undefined
    ],
    [
      'null obj returns undefined',
      null,
      'a.b',
      undefined
    ],
    [
      'undefined obj returns undefined',
      undefined,
      'a.b',
      undefined
    ],
    [
      'primitive intermediate stops traversal and returns undefined',
      { a: 'str' },
      'a.b',
      undefined
    ]
  ])('%s', (_label, obj, path, expected) => {
    expect(resolvePath(obj, path)).toEqual(expected)
  })
})
