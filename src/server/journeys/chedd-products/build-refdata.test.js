import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildRefdata } from './build-refdata.js'

// Tiny hand-built staging fixture: one normal, one anomaly, one combo-outlier.
const fixture = () => ({
  metadata: { generated_at: '2024-06-09T00:00:00.000Z', version: '2.0' },
  routing: {
    1001: { has_internal_market: true },
    84181020: { has_internal_market: false },
    200710: { has_internal_market: true }
  },
  content: {
    1001: {
      internalMarket: 'internalMarket_set_01',
      complement_id: '151100',
      species_description: '1001 Wheat and meslin',
      line_item_complement: '1001',
      combo_complement_id: '151100'
    },
    84181020: {
      complement_id: '233701',
      species_description: '8418 Refrigerators',
      line_item_complement: '84181020',
      combo_complement_id: '233701'
    },
    200710: {
      internalMarket: 'internalMarket_set_02',
      complement_id: '149352',
      species_description: '2007 Jams',
      line_item_complement: '200710',
      combo_complement_id: '149352',
      combo_type_options_override: [
        { text: 'fig paste', value: '149352' },
        { text: 'hazelnut paste', value: '149534' }
      ]
    }
  },
  definitions: {
    internalMarket_set_01: {
      values: [
        {
          label: 'Feedingstuff',
          value: 'feedingstuff',
          id: 'internalMarketfeedingstuff',
          name: 'internalMarket'
        }
      ]
    },
    internalMarket_set_02: {
      values: [
        {
          label: 'Human consumption',
          value: 'human',
          id: 'internalMarkethuman',
          name: 'internalMarket'
        }
      ]
    },
    combo_template: {
      comboType: {
        options: [{ text: '', value: '{{complement}}' }],
        label: 'Type'
      }
    }
  },
  universal_data: { line_item_packages: ['notset', 'Bag', 'Box'] }
})

describe('buildRefdata — projection rules', () => {
  it('passes routing through verbatim', () => {
    const s = fixture()
    expect(buildRefdata(s).routing).toEqual(s.routing)
  })

  it('renames internalMarket and species_description on a normal row', () => {
    const c = buildRefdata(fixture()).content['1001']
    expect(c.internal_market).toBe('internalMarket_set_01')
    expect(c.product_description).toBe('1001 Wheat and meslin')
    expect(c.combo_complement_id).toBe('151100')
    expect(c.line_item_complement).toBe('1001')
  })

  it('drops complement_id from every content row, keeping combo_complement_id', () => {
    const out = buildRefdata(fixture())
    for (const code of ['1001', '84181020', '200710']) {
      expect('complement_id' in out.content[code]).toBe(false)
      expect('combo_complement_id' in out.content[code]).toBe(true)
    }
  })

  it('omits internal_market entirely on an anomaly row (absent, not undefined)', () => {
    const c = buildRefdata(fixture()).content['84181020']
    expect('internal_market' in c).toBe(false)
  })

  it('copies combo_type_options_override only where the source row has it', () => {
    const out = buildRefdata(fixture())
    expect(out.content['200710'].combo_type_options_override).toEqual([
      { text: 'fig paste', value: '149352' },
      { text: 'hazelnut paste', value: '149534' }
    ])
    expect('combo_type_options_override' in out.content['1001']).toBe(false)
  })

  it('unwraps internal_market sets to bare arrays; combo_template not carried', () => {
    const s = fixture()
    const defs = buildRefdata(s).definitions
    expect(defs.internal_market_sets.internalMarket_set_01).toEqual(
      s.definitions.internalMarket_set_01.values
    )
    expect(Array.isArray(defs.internal_market_sets.internalMarket_set_02)).toBe(
      true
    )
    expect('combo_template' in defs.internal_market_sets).toBe(false)
  })

  it('copies line_item_packages from universal_data', () => {
    const s = fixture()
    expect(buildRefdata(s).definitions.line_item_packages).toEqual(
      s.universal_data.line_item_packages
    )
  })

  it('preserves the structural invariant: internal_market present iff has_internal_market', () => {
    const out = buildRefdata(fixture())
    for (const code of Object.keys(out.routing)) {
      expect('internal_market' in out.content[code]).toBe(
        out.routing[code].has_internal_market
      )
    }
  })

  it('is deterministic and embeds no wall-clock', () => {
    const s = fixture()
    expect(buildRefdata(s)).toEqual(buildRefdata(s))
    expect(buildRefdata(s)._meta.source.staging_generated_at).toBe(
      '2024-06-09T00:00:00.000Z'
    )
  })

  it('does not mutate the staging input', () => {
    const s = fixture()
    const snapshot = structuredClone(s)
    buildRefdata(s)
    expect(s).toEqual(snapshot)
  })
})

describe('chedd refdata — verify against the real staging artifact', () => {
  const HERE = import.meta.dirname
  const STAGING = join(
    HERE,
    '../../../../features/chedd-config/chedd-products-staging.json'
  )
  const REFDATA = join(HERE, 'refdata.json')

  let staging
  let built
  let committed

  beforeAll(() => {
    staging = JSON.parse(readFileSync(STAGING, 'utf-8'))
    built = buildRefdata(staging)
    committed = existsSync(REFDATA) ? readFileSync(REFDATA, 'utf-8') : null
  })

  it('committed refdata.json is byte-identical to a fresh build', () => {
    expect(committed).not.toBeNull()
    expect(JSON.stringify(built, null, 2) + '\n').toBe(committed)
  })

  it('has exactly 2,176 routing and content entries over the same code set', () => {
    const rk = Object.keys(built.routing)
    const ck = Object.keys(built.content)
    expect(rk).toHaveLength(2176)
    expect(ck).toHaveLength(2176)
    expect(new Set(rk)).toEqual(new Set(ck))
  })

  it('has exactly 31 anomalies, each with has_internal_market false', () => {
    const anomalies = Object.keys(built.content).filter(
      (c) => !('internal_market' in built.content[c])
    )
    expect(anomalies).toHaveLength(31)
    for (const c of anomalies) {
      expect(built.routing[c].has_internal_market).toBe(false)
    }
  })

  it('has exactly 9 combo_type_options_override outliers', () => {
    const overrides = Object.keys(built.content).filter(
      (c) => 'combo_type_options_override' in built.content[c]
    )
    expect(overrides).toHaveLength(9)
  })

  it('every content.internal_market resolves to a defined set', () => {
    for (const c of Object.keys(built.content)) {
      const ref = built.content[c].internal_market
      if (ref !== undefined) {
        expect(built.definitions.internal_market_sets[ref]).toBeDefined()
      }
    }
  })

  it('complement_id === combo_complement_id in the staging source (pre-drop)', () => {
    for (const c of Object.keys(staging.content)) {
      expect(staging.content[c].complement_id).toBe(
        staging.content[c].combo_complement_id
      )
    }
  })

  it('_meta carries the real counts and CED provenance', () => {
    expect(built._meta.counts).toEqual({
      commodities: 2176,
      internal_market_sets: 5,
      anomalies_no_internal_market: 31,
      combo_overrides: 9
    })
    expect(built._meta.source.cert_type).toBe('ced')
    expect(built._meta.source.part).toBe('one')
  })
})
