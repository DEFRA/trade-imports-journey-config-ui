import { describe, it, expect } from 'vitest'
import { refdata } from './index.js'
import { commodityDetail } from './refdata-view.js'

describe('eu-live-animals commodityDetail', () => {
  describe('miss', () => {
    it('returns null when neither routing nor content has the species-agnostic code', () => {
      expect(commodityDetail(refdata, '99999')).toBeNull()
    })

    it('returns null when species and code|species fallback both miss', () => {
      expect(commodityDetail(refdata, '99999', 'Unknown sp.')).toBeNull()
    })
  })

  describe('species-agnostic lookup (code only)', () => {
    it('returns the composite with camelCased routing flags, content, and resolved identifierSet', () => {
      // Fixture: '102|' has routing { cph_number:true, permanent_address:false, transporter_address:true }
      // content { purpose:'purpose_set_01', identifiers:'identifier_set_01', quantity:'quantity' }
      const detail = commodityDetail(refdata, '102')

      expect(detail).not.toBeNull()
      expect(detail.routingFlags).toEqual({
        cphNumber: true,
        permanentAddress: false,
        transporterAddress: true
      })
      expect(detail.content).toMatchObject({
        purpose: 'purpose_set_01',
        identifiers: 'identifier_set_01'
      })
      expect(detail.identifierSet).toBe(
        refdata.definitions.identifier_sets.identifier_set_01
      )
    })
  })

  describe('species-specific lookup (code + species)', () => {
    it('returns the species-specific composite when both species-specific keys exist', () => {
      // Fixture: '1063100|Strigiformes' present in both routing and content
      const detail = commodityDetail(refdata, '1063100', 'Strigiformes')

      expect(detail).not.toBeNull()
      expect(detail.routingFlags).toEqual(
        expect.objectContaining({
          cphNumber: expect.any(Boolean),
          permanentAddress: expect.any(Boolean),
          transporterAddress: expect.any(Boolean)
        })
      )
      expect(detail.content).toMatchObject({
        purpose: expect.any(String),
        identifiers: expect.any(String)
      })
    })

    it('falls back to species-agnostic row when species-specific row is missing', () => {
      // Fixture: '102|' exists; '102|UnknownSpecies' does not.
      // Result must equal the species-agnostic detail (transparent fallback).
      const fallback = commodityDetail(refdata, '102', 'UnknownSpecies')
      const agnostic = commodityDetail(refdata, '102')
      expect(fallback).toEqual(agnostic)
    })
  })

  describe('partial hits', () => {
    it('returns the composite with content=null when only routing exists', () => {
      // Hand-built minimal refdata to control the row presence
      const partial = {
        routing: { '900|': { cph_number: true, permanent_address: false } },
        content: {},
        definitions: { identifier_sets: {} }
      }
      const detail = commodityDetail(partial, '900')

      expect(detail).not.toBeNull()
      expect(detail.routingFlags).toEqual({
        cphNumber: true,
        permanentAddress: false
      })
      expect(detail.content).toBeNull()
      expect(detail.identifierSet).toBeNull()
    })

    it('returns the composite with routingFlags=null when only content exists', () => {
      const partial = {
        routing: {},
        content: {
          '900|': {
            purpose: 'purpose_set_01',
            identifiers: 'identifier_set_01'
          }
        },
        definitions: { identifier_sets: { identifier_set_01: ['EARTAG'] } }
      }
      const detail = commodityDetail(partial, '900')

      expect(detail).not.toBeNull()
      expect(detail.routingFlags).toBeNull()
      expect(detail.content).toEqual({
        purpose: 'purpose_set_01',
        identifiers: 'identifier_set_01'
      })
      expect(detail.identifierSet).toEqual(['EARTAG'])
    })
  })

  describe('joint key resolution', () => {
    it('uses the species-specific key for both tables when ONLY routing has the specific row', () => {
      // Asymmetric refdata: routing has the species-specific row,
      // content has only the species-agnostic row. The joint-fallback
      // contract says: if EITHER table has the specific row, use the
      // specific key for BOTH tables. Result: routingFlags from the
      // specific row; content is null (because content[specificKey] is
      // missing). Never mix grains.
      const asymmetric = {
        routing: {
          '900|SPECIES': { cph_number: true, permanent_address: true },
          '900|': { cph_number: false, permanent_address: false }
        },
        content: {
          '900|': { purpose: 'p1', identifiers: 'id1' }
        },
        definitions: { identifier_sets: {} }
      }
      const detail = commodityDetail(asymmetric, '900', 'SPECIES')

      expect(detail).not.toBeNull()
      expect(detail.routingFlags).toEqual({
        cphNumber: true,
        permanentAddress: true
      })
      expect(detail.content).toBeNull()
    })

    it('uses the species-specific key for both tables when ONLY content has the specific row', () => {
      const asymmetric = {
        routing: {
          '900|': { cph_number: false }
        },
        content: {
          '900|SPECIES': { purpose: 'p_specific', identifiers: 'id1' },
          '900|': { purpose: 'p_agnostic', identifiers: 'id1' }
        },
        definitions: { identifier_sets: { id1: ['EARTAG'] } }
      }
      const detail = commodityDetail(asymmetric, '900', 'SPECIES')

      expect(detail.routingFlags).toBeNull()
      expect(detail.content).toEqual({
        purpose: 'p_specific',
        identifiers: 'id1'
      })
    })
  })

  describe('identifierSet resolution', () => {
    it('returns identifierSet=null when content.identifiers names a definition that does not exist', () => {
      const broken = {
        routing: { '900|': { cph_number: false } },
        content: { '900|': { identifiers: 'identifier_set_missing' } },
        definitions: { identifier_sets: {} }
      }
      const detail = commodityDetail(broken, '900')
      expect(detail.identifierSet).toBeNull()
    })
  })
})
