import { describe, test, expect } from 'vitest'
import {
  parseCommodityKey,
  formatCommodityLabel,
  extractCommodityOptions,
  toSelectItems
} from './config-utils.js'

describe('parseCommodityKey', () => {
  test('parses valid commodity key with species', () => {
    expect(parseCommodityKey('102|Bos taurus')).toEqual({
      commodityID: '102',
      speciesName: 'Bos taurus'
    })
  })

  test('parses commodity key with empty species', () => {
    expect(parseCommodityKey('102|')).toEqual({
      commodityID: '102',
      speciesName: ''
    })
  })

  test('handles null gracefully', () => {
    expect(parseCommodityKey(null)).toEqual({
      commodityID: '',
      speciesName: ''
    })
  })

  test('handles undefined gracefully', () => {
    expect(parseCommodityKey(undefined)).toEqual({
      commodityID: '',
      speciesName: ''
    })
  })

  test('parses commodity key with species containing special characters', () => {
    expect(parseCommodityKey('0101|Bos-taurus (Holstein)')).toEqual({
      commodityID: '0101',
      speciesName: 'Bos-taurus (Holstein)'
    })
  })
})

describe('formatCommodityLabel', () => {
  test('formats commodity with species using en-dash separator', () => {
    expect(
      formatCommodityLabel({
        commodityID: '0101',
        speciesName: 'Equus caballus'
      })
    ).toBe('0101 – Equus caballus')
  })

  test('formats commodity without species as (no species)', () => {
    expect(formatCommodityLabel({ commodityID: '0101', speciesName: '' })).toBe(
      '0101 (no species)'
    )
  })
})

describe('extractCommodityOptions', () => {
  test('extracts and sorts commodity options from a key list', () => {
    const options = extractCommodityOptions([
      '0101210000|Horses',
      '0106190000|Bees'
    ])
    expect(options).toHaveLength(2)
    expect(options[0].value).toBe('0101210000|Horses')
    expect(options[0].label).toBe('0101210000 – Horses')
    expect(options[1].value).toBe('0106190000|Bees')
  })

  test('handles commodity without species name', () => {
    const options = extractCommodityOptions(['0101210000|'])
    expect(options[0].label).toBe('0101210000 (no species)')
  })

  test('includes parsed commodityID and speciesName in each option', () => {
    const [option] = extractCommodityOptions(['102|Bos taurus'])
    expect(option.commodityID).toBe('102')
    expect(option.speciesName).toBe('Bos taurus')
  })
})

describe('toSelectItems', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' }
  ]

  test('builds select items with placeholder when nothing selected', () => {
    const items = toSelectItems(options, null, 'Pick one')
    expect(items[0]).toEqual({ value: '', text: 'Pick one', selected: true })
    expect(items[1]).toEqual({ value: 'a', text: 'Alpha', selected: false })
    expect(items[2]).toEqual({ value: 'b', text: 'Beta', selected: false })
  })

  test('marks the selected option', () => {
    const items = toSelectItems(options, 'b', 'Pick one')
    expect(items[0].selected).toBe(false)
    expect(items[1].selected).toBe(false)
    expect(items[2].selected).toBe(true)
  })
})
