import { describe, it, expect } from 'vitest'
import {
  computeVariance,
  classifyValue,
  annotateValues,
  computeAbsentValues
} from './config-variance.js'

// ---------------------------------------------------------------------------
// Tiny hand-rolled refdata + descriptor — exercises computeVariance generically
// without depending on any journey's refdata shape.
// ---------------------------------------------------------------------------

const testRefdata = {
  byKey: {
    'A|x': { fruits: ['apple', 'banana'], colours: ['red'] },
    'A|y': { fruits: ['apple'], colours: ['red', 'blue'] },
    'B|x': { fruits: ['banana', 'cherry'], colours: ['blue'] },
    'B|y': { fruits: ['apple'], colours: ['red'] }
  }
}

const commodityKeys = Object.keys(testRefdata.byKey)

const dimensions = [
  {
    id: 'fruits',
    name: 'Fruits',
    valuesFor: (k) => testRefdata.byKey[k]?.fruits ?? []
  },
  {
    id: 'colours',
    name: 'Colours',
    valuesFor: (k) => testRefdata.byKey[k]?.colours ?? []
  }
]

// ---------------------------------------------------------------------------

describe('config-variance', () => {
  describe('computeVariance', () => {
    it('returns totalCommodities = key count', () => {
      const v = computeVariance(dimensions, commodityKeys)
      expect(v.totalCommodities).toBe(4)
    })

    it('keys byDimension by dimension id (not display name)', () => {
      const v = computeVariance(dimensions, commodityKeys)
      expect(Object.keys(v.byDimension).sort()).toEqual(['colours', 'fruits'])
    })

    it('builds the superset per dimension', () => {
      const v = computeVariance(dimensions, commodityKeys)
      expect(Array.from(v.byDimension.fruits.superset).sort()).toEqual([
        'apple',
        'banana',
        'cherry'
      ])
      expect(Array.from(v.byDimension.colours.superset).sort()).toEqual([
        'blue',
        'red'
      ])
    })

    it('builds the frequency per dimension (one increment per commodity that contains the value)', () => {
      const v = computeVariance(dimensions, commodityKeys)
      // apple appears in 3 of 4 commodities (A|x, A|y, B|y).
      expect(v.byDimension.fruits.frequency.get('apple')).toBe(3)
      expect(v.byDimension.fruits.frequency.get('banana')).toBe(2)
      expect(v.byDimension.fruits.frequency.get('cherry')).toBe(1)
      // red appears in 3 of 4 (A|x, A|y, B|y); blue in 2 (A|y, B|x).
      expect(v.byDimension.colours.frequency.get('red')).toBe(3)
      expect(v.byDimension.colours.frequency.get('blue')).toBe(2)
    })

    it('handles a dimension that returns [] for some commodities (no crash)', () => {
      const withEmpty = [
        ...dimensions,
        { id: 'empties', name: 'Empties', valuesFor: () => [] }
      ]
      const v = computeVariance(withEmpty, commodityKeys)
      expect(v.byDimension.empties.superset.size).toBe(0)
      expect(v.byDimension.empties.frequency.size).toBe(0)
    })

    it('handles zero commodity keys gracefully', () => {
      const v = computeVariance(dimensions, [])
      expect(v.totalCommodities).toBe(0)
      expect(v.byDimension.fruits.superset.size).toBe(0)
      expect(v.byDimension.fruits.frequency.size).toBe(0)
    })
  })

  describe('classifyValue', () => {
    it('classifies values appearing in >= 30% of commodities as common', () => {
      expect(classifyValue(3, 10)).toBe('common')
      expect(classifyValue(4, 10)).toBe('common')
      expect(classifyValue(10, 10)).toBe('common')
    })

    it('classifies values appearing in < 30% of commodities as specific', () => {
      expect(classifyValue(1, 10)).toBe('specific')
      expect(classifyValue(2, 10)).toBe('specific')
    })

    it('handles edge case of 30% exactly', () => {
      expect(classifyValue(3, 10)).toBe('common')
    })
  })

  describe('annotateValues', () => {
    it('annotates values with frequency and classification', () => {
      const v = computeVariance(dimensions, commodityKeys)
      const annotated = annotateValues(
        ['apple', 'banana', 'cherry'],
        v.byDimension.fruits.frequency,
        v.totalCommodities
      )

      expect(annotated).toHaveLength(3)
      expect(annotated[0]).toEqual({
        value: 'apple',
        frequency: 3,
        classification: 'common' // 3/4 = 75% >= 30%
      })
      expect(annotated[1]).toEqual({
        value: 'banana',
        frequency: 2,
        classification: 'common' // 2/4 = 50% >= 30%
      })
      expect(annotated[2]).toEqual({
        value: 'cherry',
        frequency: 1,
        classification: 'specific' // 1/4 = 25% < 30%
      })
    })
  })

  describe('computeAbsentValues', () => {
    it('computes values present in superset but absent from included list', () => {
      const v = computeVariance(dimensions, commodityKeys)
      // A|x has fruits [apple, banana]; superset is [apple, banana, cherry].
      const absent = computeAbsentValues(
        v.byDimension.fruits.superset,
        ['apple', 'banana'],
        v.byDimension.fruits.frequency
      )
      expect(absent).toEqual([{ value: 'cherry', frequency: 1 }])
    })

    it('returns empty array when all superset values are included', () => {
      const superset = new Set(['A', 'B'])
      const frequency = new Map([
        ['A', 3],
        ['B', 2]
      ])
      expect(computeAbsentValues(superset, ['A', 'B'], frequency)).toHaveLength(
        0
      )
    })

    it('attaches frequency to each absent value', () => {
      const v = computeVariance(dimensions, commodityKeys)
      const absent = computeAbsentValues(
        v.byDimension.fruits.superset,
        ['apple'],
        v.byDimension.fruits.frequency
      )
      const cherry = absent.find((a) => a.value === 'cherry')
      expect(cherry.frequency).toBe(1)
    })
  })
})
