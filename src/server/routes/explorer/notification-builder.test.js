import { describe, test, expect } from 'vitest'
import { setPath, applyFormFields } from './notification-builder.js'

describe('setPath', () => {
  test('sets a top-level property', () => {
    const obj = {}
    setPath(obj, 'type', 'IMPv2')
    expect(obj.type).toBe('IMPv2')
  })

  test('creates nested objects as needed', () => {
    const obj = {}
    setPath(obj, 'partOne.commodities.countryOfOrigin', 'FR')
    expect(obj.partOne.commodities.countryOfOrigin).toBe('FR')
  })

  test('preserves existing properties', () => {
    const obj = { partOne: { purpose: { purposeGroup: 'For Import' } } }
    setPath(obj, 'partOne.commodities.countryOfOrigin', 'FR')
    expect(obj.partOne.purpose.purposeGroup).toBe('For Import')
    expect(obj.partOne.commodities.countryOfOrigin).toBe('FR')
  })

  test('handles array index notation', () => {
    const obj = {}
    setPath(obj, 'partOne.commodities.commodityComplement[0].commodityID', '0101')
    expect(obj.partOne.commodities.commodityComplement[0].commodityID).toBe(
      '0101'
    )
  })

  test('preserves existing array elements', () => {
    const obj = {
      partOne: {
        commodities: {
          commodityComplement: [{ commodityID: '0101', speciesName: 'Horses' }]
        }
      }
    }
    setPath(
      obj,
      'partOne.commodities.complementParameterSet[0].healthCertificate.certificateReference',
      'CERT-001'
    )
    expect(obj.partOne.commodities.commodityComplement[0].speciesName).toBe(
      'Horses'
    )
    expect(
      obj.partOne.commodities.complementParameterSet[0].healthCertificate
        .certificateReference
    ).toBe('CERT-001')
  })

  test('returns the mutated object', () => {
    const obj = {}
    const result = setPath(obj, 'a.b', 'val')
    expect(result).toBe(obj)
    expect(result.a.b).toBe('val')
  })
})

describe('applyFormFields', () => {
  test('skips fields not in the mapping', () => {
    const notification = {}
    applyFormFields(notification, { unknownField: 'value' }, {})
    expect(notification).toEqual({})
  })

  test('skips empty string values', () => {
    const notification = {}
    const mapping = { 'origin-country': 'partOne.commodities.countryOfOrigin' }
    applyFormFields(notification, { 'origin-country': '' }, mapping)
    expect(notification.partOne).toBeUndefined()
  })

  test('applies mapped fields to notification', () => {
    const notification = {}
    const formData = { 'origin-country': 'FR', 'region-code': 'EU-FR' }
    const mapping = {
      'origin-country': 'partOne.commodities.countryOfOrigin',
      'region-code': 'partOne.commodities.regionOfOrigin'
    }
    applyFormFields(notification, formData, mapping)
    expect(notification.partOne.commodities.countryOfOrigin).toBe('FR')
    expect(notification.partOne.commodities.regionOfOrigin).toBe('EU-FR')
  })
})
