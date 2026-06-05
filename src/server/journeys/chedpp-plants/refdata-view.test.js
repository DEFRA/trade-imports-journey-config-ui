import { describe, it, expect } from 'vitest'
import { refdata } from './index.js'
import { commodityDetail } from './refdata-view.js'

describe('chedpp-plants commodityDetail', () => {
  describe('commodity-level lookup (code only)', () => {
    it('returns null when code is not in commodities', () => {
      expect(commodityDetail(refdata, 'UNKNOWN')).toBeNull()
    })

    it('returns the camelCased commodity row with classes array intact', () => {
      // Fixture: '0808108090' (Apple) has classes ['Extra Class', 'Class I', 'Class II']
      const detail = commodityDetail(refdata, '0808108090')

      expect(detail).toMatchObject({
        group: 'Fruit and nuts',
        requiresTestAndTrial: false,
        requiresFinishedOrPropagated: false,
        propagation: null,
        classes: ['Extra Class', 'Class I', 'Class II']
      })
    })

    it('returns commodity-level shape (not species) when called without species', () => {
      // PHSI-only commodity (no species rows): '10011100'
      const detail = commodityDetail(refdata, '10011100')

      expect(detail).not.toBeNull()
      expect(detail).toHaveProperty('group')
      // The species-shape fields must NOT be present
      expect(detail).not.toHaveProperty('regulatoryAuthority')
      expect(detail).not.toHaveProperty('marketingStandard')
      expect(detail).not.toHaveProperty('varieties')
    })
  })

  describe('species-level lookup (code + species)', () => {
    it('returns null when no matching code|species row exists in species map', () => {
      // Code exists in commodities but species lookup miss: must not fall back.
      expect(commodityDetail(refdata, '0808108090', 'UNKNOWN_EPPO')).toBeNull()
    })

    it('returns the camelCased species row with varieties intact', () => {
      // Fixture: '0808108090|MABSD' (apple) has varieties incl. Braeburn, Bramley, Cox's Orange Pippin
      const detail = commodityDetail(refdata, '0808108090', 'MABSD')

      expect(detail).toMatchObject({
        regulatoryAuthority: 'JOINT',
        marketingStandard: 'SMS',
        validityPeriod: '7'
      })
      expect(detail.varieties).toEqual(expect.arrayContaining(['Braeburn', 'Bramley']))
      // Species shape excludes commodity-level fields
      expect(detail).not.toHaveProperty('group')
      expect(detail).not.toHaveProperty('classes')
    })

    it('does NOT fall back from species to commodity-level (D17 cross-grain rule)', () => {
      // '10011100' is a PHSI-only commodity (has commodity row, no species rows).
      // A species call must return null, NOT the commodity row.
      const speciesCall = commodityDetail(refdata, '10011100', 'ANY_SP')
      expect(speciesCall).toBeNull()
    })
  })
})
