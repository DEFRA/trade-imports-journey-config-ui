import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
      im_set_a: [
        { label: 'EU', value: 'eu' },
        { label: 'NI', value: 'ni' }
      ],
      im_set_b: [{ label: 'GB', value: 'gb' }]
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
  it('internalMarket valuesFor resolves a `code|` key to the set option labels', () => {
    expect(dim('internalMarket').valuesFor('1001|')).toEqual(['EU', 'NI'])
  })

  it('internalMarket sourceFor resolves a `code|` key to the set name', () => {
    expect(dim('internalMarket').sourceFor('1001|')).toBe('im_set_a')
  })

  it('internalMarket returns [] and null source when there is no internal_market', () => {
    expect(dim('internalMarket').valuesFor('2002|')).toEqual([])
    expect(dim('internalMarket').sourceFor('2002|')).toBeNull()
  })

  it('comboType renders the override option labels when present (outlier)', () => {
    expect(dim('comboType').valuesFor('3003|')).toEqual(['Frozen'])
  })

  it('comboType falls back to the complement id when the option has no text', () => {
    expect(dim('comboType').valuesFor('1001|')).toEqual(['CC1'])
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
    expect(d.internalMarketSet).toEqual([
      { label: 'EU', value: 'eu' },
      { label: 'NI', value: 'ni' }
    ])
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

// ---------------------------------------------------------------------------
// Regression (real data): the dimension-block template renders `{{ value }}`
// for each item, so a dimension value that is an object renders as the literal
// "[object Object]" in the UI. The synthetic fixture above hid this by using
// string sets; the real refdata carries fat option objects (internalMarket)
// and {text,value} pairs (comboType). Load the committed refdata.json and
// assert every dimension value is a flat string.
// ---------------------------------------------------------------------------

const realRefdata = JSON.parse(
  readFileSync(join(import.meta.dirname, 'refdata.json'), 'utf-8')
)

describe('dimensions render as flat strings (no [object Object])', () => {
  const realView = refdataView(realRefdata)

  // 96020000: internal-market set_01 (4 options) + single-template combo;
  // 200710: combo-override outlier (3 non-empty texts); 84181020: anomaly
  // (no internal market); 12079996: an override carrying an empty-text
  // option, so comboType's `text || value` fallback fires inside a real
  // override list (not only the single-template path).
  it.each([['96020000'], ['200710'], ['84181020'], ['12079996']])(
    'commodity %s — every dimension value is a string',
    (code) => {
      for (const d of realView.dimensions) {
        const values = d.valuesFor(`${code}|`)
        expect(Array.isArray(values)).toBe(true)
        for (const v of values) {
          expect(typeof v).toBe('string')
        }
      }
    }
  )
})
