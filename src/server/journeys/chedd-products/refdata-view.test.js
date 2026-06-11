import { describe, it, expect } from 'vitest'
import { refdataView, commodityKeys, commodityDetail } from './refdata-view.js'

const refdata = {
  routing: {
    1001: { has_internal_market: true },
    2002: { has_internal_market: false }
  },
  content: {
    1001: {
      internal_market: 'im_set_a',
      product_description: 'Cheese',
      line_item_complement: 'LIC1',
      combo_complement_id: 'CC1'
    },
    2002: {
      product_description: 'Anomaly',
      line_item_complement: 'LIC2',
      combo_complement_id: 'CC2'
    },
    3003: {
      internal_market: 'im_set_b',
      product_description: 'Outlier',
      line_item_complement: 'LIC3',
      combo_complement_id: 'CC3',
      combo_type_options_override: [{ text: 'Frozen', value: 'F' }]
    }
  },
  definitions: {
    internal_market_sets: {
      im_set_a: ['EU', 'NI'],
      im_set_b: ['GB']
    },
    line_item_packages: ['BOX', 'CRATE']
  }
}

const view = refdataView(refdata)
const dim = (id) => view.dimensions.find((d) => d.id === id)
const detail = (id) => view.details.find((d) => d.id === id)
const rowValues = (id, key) =>
  detail(id)
    .rowsFor(key)
    .map((r) => r.value)

describe('refdataView dimensions — keyed by `code|` (codeOf)', () => {
  it('internalMarket valuesFor resolves a `code|` key to the set options', () => {
    expect(dim('internalMarket').valuesFor('1001|')).toEqual(['EU', 'NI'])
  })

  it('internalMarket sourceFor resolves a `code|` key to the set name', () => {
    expect(dim('internalMarket').sourceFor('1001|')).toBe('im_set_a')
  })

  it('internalMarket returns [] and null source when there is no internal_market', () => {
    expect(dim('internalMarket').valuesFor('2002|')).toEqual([])
    expect(dim('internalMarket').sourceFor('2002|')).toBeNull()
  })

  it('comboType returns the override list when present (outlier)', () => {
    expect(dim('comboType').valuesFor('3003|')).toEqual([
      { text: 'Frozen', value: 'F' }
    ])
  })

  it('comboType returns a single templated option from combo_complement_id otherwise', () => {
    expect(dim('comboType').valuesFor('1001|')).toEqual([
      { text: '', value: 'CC1' }
    ])
  })
})

describe('refdataView details', () => {
  it('routing surfaces has_internal_market via the bare code, preserving false', () => {
    expect(detail('routing').rowsFor('1001|')).toEqual([
      { label: 'Has internal market', value: true }
    ])
    expect(rowValues('routing', '2002|')).toEqual([false])
  })

  it('product surfaces description / line-item / combo id', () => {
    expect(rowValues('product', '1001|')).toEqual(['Cheese', 'LIC1', 'CC1'])
  })

  it('packages maps line_item_packages to rows in order', () => {
    expect(rowValues('packages', '1001|')).toEqual(['BOX', 'CRATE'])
  })
})

describe('commodityKeys', () => {
  it('returns bare content codes (no pipe)', () => {
    expect(commodityKeys(refdata)).toEqual(['1001', '2002', '3003'])
  })
})

describe('commodityDetail — single-grain, bare code', () => {
  it('returns null for an unknown code', () => {
    expect(commodityDetail(refdata, 'NOPE')).toBeNull()
  })

  it('returns a camelCased composite with the resolved internal-market set', () => {
    const d = commodityDetail(refdata, '1001')
    expect(d.internalMarketSet).toEqual(['EU', 'NI'])
    expect(d.content.productDescription).toBe('Cheese')
  })

  it('resolves internalMarketSet to null on the anomaly (row present, no internal_market)', () => {
    const d = commodityDetail(refdata, '2002')
    expect(d).not.toBeNull()
    expect(d.internalMarketSet).toBeNull()
  })

  it('ignores the species argument (single-grain)', () => {
    expect(commodityDetail(refdata, '1001', 'ANY')).toEqual(
      commodityDetail(refdata, '1001')
    )
  })
})
