import { describe, it, expect } from 'vitest'
import {
  computeVariance,
  classifyValue,
  annotateValues,
  computeAbsentValues
} from './config-variance.js'

describe('config-variance', () => {
  // Minimal refdata structure for testing
  const testRefdata = {
    routing: {
      '101|Equus caballus': {
        cph_number: false,
        permanent_address: false,
        transporter_address: true
      },
      '102|Bos taurus': {
        cph_number: true,
        permanent_address: false,
        transporter_address: true
      },
      '10410|Ovis Aries': {
        cph_number: true,
        permanent_address: false,
        transporter_address: true
      },
      '1061900|Canis familiaris': {
        cph_number: false,
        permanent_address: true,
        transporter_address: true
      }
    },
    content: {
      '101|Equus caballus': {
        purpose: 'purpose_set_01',
        identifiers: 'identifier_set_01',
        quantity: 'numberOfAnimals'
      },
      '102|Bos taurus': {
        purpose: 'purpose_set_02',
        identifiers: 'identifier_set_02',
        quantity: 'numberOfAnimals'
      },
      '10410|Ovis Aries': {
        purpose: 'purpose_set_02',
        identifiers: 'identifier_set_02',
        quantity: 'numberOfAnimals'
      },
      '1061900|Canis familiaris': {
        purpose: 'purpose_set_03',
        identifiers: 'identifier_set_03',
        quantity: 'numberOfAnimals'
      }
    },
    definitions: {
      purpose_sets: {
        purpose_set_01: ['Breeding', 'Racing/Competition', 'Transit'],
        purpose_set_02: ['Breeding', 'Fattening', 'Slaughter', 'Transit'],
        purpose_set_03: ['Breeding', 'Commercial sale', 'Transit']
      },
      identifier_sets: {
        identifier_set_01: ['Horse Name', 'Microchip', 'Passport'],
        identifier_set_02: ['Ear tag', 'Passport'],
        identifier_set_03: ['Microchip', 'Passport', 'Tattoo']
      },
      quantity_types: {
        numberOfAnimals: {
          id: 'number-of-animals',
          label: 'Number of animals',
          name: 'numberOfAnimals'
        }
      }
    }
  }

  describe('computeVariance', () => {
    it('computes purpose superset correctly', () => {
      const variance = computeVariance(testRefdata)

      expect(variance.purposeSuperset).toBeInstanceOf(Set)
      expect(variance.purposeSuperset.size).toBe(6)
      expect(variance.purposeSuperset.has('Breeding')).toBe(true)
      expect(variance.purposeSuperset.has('Racing/Competition')).toBe(true)
      expect(variance.purposeSuperset.has('Fattening')).toBe(true)
      expect(variance.purposeSuperset.has('Transit')).toBe(true)
    })

    it('computes purpose frequency correctly', () => {
      const variance = computeVariance(testRefdata)

      // Breeding appears in all 3 sets (4 commodities total)
      expect(variance.purposeFrequency.get('Breeding')).toBe(4)
      // Transit appears in all 3 sets (4 commodities total)
      expect(variance.purposeFrequency.get('Transit')).toBe(4)
      // Racing/Competition appears only in purpose_set_01 (1 commodity)
      expect(variance.purposeFrequency.get('Racing/Competition')).toBe(1)
      // Fattening appears only in purpose_set_02 (2 commodities)
      expect(variance.purposeFrequency.get('Fattening')).toBe(2)
    })

    it('computes identifier superset correctly', () => {
      const variance = computeVariance(testRefdata)

      expect(variance.identifierSuperset).toBeInstanceOf(Set)
      expect(variance.identifierSuperset.size).toBe(5)
      expect(variance.identifierSuperset.has('Horse Name')).toBe(true)
      expect(variance.identifierSuperset.has('Microchip')).toBe(true)
      expect(variance.identifierSuperset.has('Passport')).toBe(true)
      expect(variance.identifierSuperset.has('Ear tag')).toBe(true)
      expect(variance.identifierSuperset.has('Tattoo')).toBe(true)
    })

    it('computes identifier frequency correctly', () => {
      const variance = computeVariance(testRefdata)

      // Passport appears in all 3 sets (4 commodities total)
      expect(variance.identifierFrequency.get('Passport')).toBe(4)
      // Microchip appears in 2 sets (2 commodities: horses and dogs)
      expect(variance.identifierFrequency.get('Microchip')).toBe(2)
      // Ear tag appears only in identifier_set_02 (2 commodities)
      expect(variance.identifierFrequency.get('Ear tag')).toBe(2)
      // Horse Name appears only in identifier_set_01 (1 commodity)
      expect(variance.identifierFrequency.get('Horse Name')).toBe(1)
    })

    it('computes total commodities correctly', () => {
      const variance = computeVariance(testRefdata)

      expect(variance.totalCommodities).toBe(4)
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
    it('annotates purpose values with frequency and classification', () => {
      const variance = computeVariance(testRefdata)
      const purposeValues = testRefdata.definitions.purpose_sets.purpose_set_01

      const annotated = annotateValues(
        purposeValues,
        variance.purposeFrequency,
        variance.totalCommodities
      )

      expect(annotated).toHaveLength(3)
      expect(annotated[0]).toEqual({
        value: 'Breeding',
        frequency: 4,
        classification: 'common'
      })
      expect(annotated[1]).toEqual({
        value: 'Racing/Competition',
        frequency: 1,
        classification: 'specific'
      })
      expect(annotated[2]).toEqual({
        value: 'Transit',
        frequency: 4,
        classification: 'common'
      })
    })

    it('annotates identifier values with frequency and classification', () => {
      const variance = computeVariance(testRefdata)
      const identifierValues =
        testRefdata.definitions.identifier_sets.identifier_set_01

      const annotated = annotateValues(
        identifierValues,
        variance.identifierFrequency,
        variance.totalCommodities
      )

      expect(annotated).toHaveLength(3)
      expect(annotated[0]).toEqual({
        value: 'Horse Name',
        frequency: 1,
        classification: 'specific'
      })
      expect(annotated[1]).toEqual({
        value: 'Microchip',
        frequency: 2,
        classification: 'common' // 2/4 = 50% >= 30% threshold
      })
      expect(annotated[2]).toEqual({
        value: 'Passport',
        frequency: 4,
        classification: 'common'
      })
    })
  })

  describe('computeAbsentValues', () => {
    it('computes values present in superset but absent from included list', () => {
      const variance = computeVariance(testRefdata)
      const included = testRefdata.definitions.purpose_sets.purpose_set_01

      const absent = computeAbsentValues(
        variance.purposeSuperset,
        included,
        variance.purposeFrequency
      )

      // purpose_set_01 has Breeding, Racing/Competition, Transit
      // Superset also has Fattening, Slaughter, Commercial sale
      expect(absent).toHaveLength(3)
      const absentValues = absent.map((a) => a.value)
      expect(absentValues).toContain('Fattening')
      expect(absentValues).toContain('Slaughter')
      expect(absentValues).toContain('Commercial sale')
    })

    it('returns empty array when all superset values are included', () => {
      const superset = new Set(['A', 'B'])
      const included = ['A', 'B']
      const frequencyMap = new Map([['A', 3], ['B', 2]])

      const absent = computeAbsentValues(superset, included, frequencyMap)

      expect(absent).toHaveLength(0)
    })

    it('includes frequency for each absent value', () => {
      const variance = computeVariance(testRefdata)
      const included = testRefdata.definitions.purpose_sets.purpose_set_01

      const absent = computeAbsentValues(
        variance.purposeSuperset,
        included,
        variance.purposeFrequency
      )

      const fattening = absent.find((a) => a.value === 'Fattening')
      expect(fattening.frequency).toBe(2)
    })
  })

})
