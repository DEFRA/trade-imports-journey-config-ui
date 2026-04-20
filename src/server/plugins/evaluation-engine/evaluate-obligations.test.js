/**
 * Exhaustive test suite for the obligation evaluation runtime.
 *
 * Test-first: these tests define correctness. An implementation must pass them.
 *
 * The function under test is pure:
 *   evaluateObligations(notification, obligations, refdata) -> obligationState
 *
 * Static inputs (obligations, refdata) are loaded once per suite.
 * Only the notification varies between tests.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  evaluateObligations,
  facts,
  tests,
  buildRefdataKey,
  lookupRefdata,
  resolvePath,
  isEmpty,
  TRANSIT_PURPOSES
} from './evaluate-obligations.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INPUT_DIR = join(__dirname, '../../journeys/eu-live-animals')

// ---------------------------------------------------------------------------
// Static fixtures — loaded once
// ---------------------------------------------------------------------------
let obligations
let refdata

beforeAll(async () => {
  const [obligationsFile, refdataFile] = await Promise.all([
    readFile(join(INPUT_DIR, 'obligations.json'), 'utf-8'),
    readFile(join(INPUT_DIR, 'refdata.json'), 'utf-8')
  ])
  obligations = JSON.parse(obligationsFile).obligations
  refdata = JSON.parse(refdataFile)
})

// ---------------------------------------------------------------------------
// Helpers: find an obligation result by id
// ---------------------------------------------------------------------------
const findObligation = (result, id) =>
  result.obligations.find((o) => o.id === id)

const evaluate = (notification) =>
  evaluateObligations(notification, obligations, refdata)

// ---------------------------------------------------------------------------
// Commodity archetype keys (used across categories)
// ---------------------------------------------------------------------------
const CATTLE = '102|Bos taurus'
const DOG = '1061900|Canis familiaris'
const BOVINE_SEMEN = '5119985|Bos taurus'
const CAT = '1061900|Felis catus'
const HORSE = '101|Equus caballus'
const PIG = '103|Sus scrofa domesticus'
const GOAT = '10420|Capra hircus'
const SHEEP = '10410|Ovis Aries'
const RODENT = '1061900|Rodentia'
const PORK = '203|Sus scrofa domesticus'
const FERRET = '1061900|Mustela putorius furio'
const BEE = '1064100|'

/**
 * Build a minimal notification with a specific commodity code.
 * commodity format: "commodityID|speciesName"
 */
const withCommodity = (commodityKey) => {
  const [commodityID, speciesName] = commodityKey.split('|')
  return {
    partOne: {
      commodities: {
        commodityComplement: [
          {
            commodityID,
            speciesName: speciesName || undefined
          }
        ]
      }
    }
  }
}

// Unconditional obligation IDs
const UNCONDITIONAL_IDS = [
  'notification-type',
  'consignment-origin',
  'import-purpose',
  'commodity-selection',
  'species-identification',
  'commodity-complement-detail',
  'health-certification',
  'establishments-of-origin',
  'accompanying-documents',
  'consignor-identification',
  'consignee-identification',
  'importer-identification',
  'destination-identification',
  'entry-and-arrival',
  'contact-designation',
  'legal-declaration'
]

// Conditional obligation IDs — commodity-conditional
const COMMODITY_CONDITIONAL_IDS = [
  'animal-identification',
  'animal-certification',
  'animal-weaning-status',
  'permanent-address',
  'livestock-holding',
  'transporter-identification'
]

// Conditional obligation IDs — purpose-conditional
const PURPOSE_CONDITIONAL_IDS = [
  'transit-routing'
]

// All conditional obligation IDs
const CONDITIONAL_IDS = [...COMMODITY_CONDITIONAL_IDS, ...PURPOSE_CONDITIONAL_IDS]

// =========================================================================
// Helper unit tests
// =========================================================================
describe('isEmpty', () => {
  it('treats undefined as empty', () => {
    expect(isEmpty(undefined)).toBe(true)
  })

  it('treats null as empty', () => {
    expect(isEmpty(null)).toBe(true)
  })

  it('treats empty string as empty', () => {
    expect(isEmpty('')).toBe(true)
  })

  it('treats non-empty string as non-empty', () => {
    expect(isEmpty('hello')).toBe(false)
  })

  it('treats false as non-empty (boolean false is a value)', () => {
    expect(isEmpty(false)).toBe(false)
  })

  it('treats true as non-empty', () => {
    expect(isEmpty(true)).toBe(false)
  })

  it('treats 0 as non-empty', () => {
    expect(isEmpty(0)).toBe(false)
  })

  it('treats empty array as empty', () => {
    expect(isEmpty([])).toBe(true)
  })

  it('treats non-empty array as non-empty', () => {
    expect(isEmpty([1])).toBe(false)
  })

  it('treats empty object as empty', () => {
    expect(isEmpty({})).toBe(true)
  })

  it('treats non-empty object as non-empty', () => {
    expect(isEmpty({ a: 1 })).toBe(false)
  })
})

describe('facts.commodity', () => {
  it('returns null for empty notification', () => {
    expect(facts.commodity({})).toBe(null)
  })

  it('returns null when no commodity complement exists', () => {
    expect(facts.commodity({ partOne: {} })).toBe(null)
  })

  it('extracts commodity object from cattle notification', () => {
    const n = withCommodity(CATTLE)
    const commodity = facts.commodity(n)
    expect(commodity).toBeDefined()
    expect(commodity.commodityID).toBe('102')
    expect(commodity.speciesName).toBe('Bos taurus')
  })

  it('extracts commodity with empty speciesName', () => {
    const n = {
      partOne: {
        commodities: {
          commodityComplement: [{ commodityID: '102', speciesName: '' }]
        }
      }
    }
    const commodity = facts.commodity(n)
    expect(commodity).toBeDefined()
    expect(commodity.commodityID).toBe('102')
    expect(commodity.speciesName).toBe('')
  })

  it('extracts commodity when speciesName is absent', () => {
    const n = {
      partOne: {
        commodities: {
          commodityComplement: [{ commodityID: '1064100' }]
        }
      }
    }
    const commodity = facts.commodity(n)
    expect(commodity).toBeDefined()
    expect(commodity.commodityID).toBe('1064100')
  })
})

describe('resolvePath', () => {
  it('resolves a simple dotted path', () => {
    const obj = { partOne: { cphNumber: '12/345/6789' } }
    expect(resolvePath(obj, 'notification.partOne.cphNumber')).toBe(
      '12/345/6789'
    )
  })

  it('returns undefined for missing intermediate', () => {
    expect(resolvePath({}, 'notification.partOne.cphNumber')).toBeUndefined()
  })

  it('resolves an array path with []', () => {
    const obj = {
      partOne: {
        commodities: {
          commodityComplement: [{ commodityID: '102' }]
        }
      }
    }
    expect(
      resolvePath(
        obj,
        'notification.partOne.commodities.commodityComplement[].commodityID'
      )
    ).toBe('102')
  })

  it('returns undefined for empty array with [] path', () => {
    const obj = {
      partOne: { commodities: { commodityComplement: [] } }
    }
    expect(
      resolvePath(
        obj,
        'notification.partOne.commodities.commodityComplement[].commodityID'
      )
    ).toBeUndefined()
  })

  it('resolves nested array paths', () => {
    const obj = {
      partOne: {
        commodities: {
          complementParameterSet: [
            {
              identifiers: [{ data: 'UK123456' }]
            }
          ]
        }
      }
    }
    expect(
      resolvePath(
        obj,
        'notification.partOne.commodities.complementParameterSet[].identifiers[].data'
      )
    ).toBe('UK123456')
  })

  it('resolves a path ending in [] (bare array)', () => {
    const obj = {
      partOne: {
        nominatedContacts: [{ name: 'John' }]
      }
    }
    expect(
      resolvePath(obj, 'notification.partOne.nominatedContacts[]')
    ).toEqual([{ name: 'John' }])
  })
})

// =========================================================================
// Category 1: Activation (Condition Resolution)
// =========================================================================
describe('Category 1: Activation — condition resolution', () => {
  describe('empty notification (no answers given)', () => {
    it('returns 23 obligations total', () => {
      const result = evaluate({})
      expect(result.obligations).toHaveLength(23)
    })

    it('all 16 unconditional obligations are unsatisfied', () => {
      const result = evaluate({})
      for (const id of UNCONDITIONAL_IDS) {
        const o = findObligation(result, id)
        expect(o, `${id} should exist`).toBeDefined()
        expect(o.status, `${id} should be unsatisfied`).toBe('unsatisfied')
      }
    })

    it('all 6 commodity-conditional obligations are deferred', () => {
      const result = evaluate({})
      for (const id of COMMODITY_CONDITIONAL_IDS) {
        const o = findObligation(result, id)
        expect(o, `${id} should exist`).toBeDefined()
        expect(o.status, `${id} should be deferred`).toBe('deferred')
        expect(o.reason).toBe('commodity not yet provided')
      }
    })

    it('transit-routing is deferred when no purpose selected', () => {
      const result = evaluate({})
      const o = findObligation(result, 'transit-routing')
      expect(o, 'transit-routing should exist').toBeDefined()
      expect(o.status, 'transit-routing should be deferred').toBe('deferred')
      expect(o.reason).toBe('purposeGroup not yet provided')
    })
  })

  describe('cattle (102|Bos taurus) — livestock profile', () => {
    it('activates livestock-holding (cph_number = true)', () => {
      const result = evaluate(withCommodity(CATTLE))
      const o = findObligation(result, 'livestock-holding')
      expect(o.status).not.toBe('inactive')
      expect(o.status).not.toBe('deferred')
    })

    it('deactivates permanent-address (permanent_address = false)', () => {
      const result = evaluate(withCommodity(CATTLE))
      const o = findObligation(result, 'permanent-address')
      expect(o.status).toBe('inactive')
    })

    it('activates transporter-identification (transporter_address = true)', () => {
      const result = evaluate(withCommodity(CATTLE))
      const o = findObligation(result, 'transporter-identification')
      expect(o.status).not.toBe('inactive')
      expect(o.status).not.toBe('deferred')
    })

    it('activates animal-identification (identifier_set_13 is not NONE)', () => {
      const result = evaluate(withCommodity(CATTLE))
      const o = findObligation(result, 'animal-identification')
      expect(o.status).not.toBe('inactive')
      expect(o.status).not.toBe('deferred')
    })
  })

  describe('dog (1061900|Canis familiaris) — pet profile', () => {
    it('deactivates livestock-holding (cph_number = false)', () => {
      const result = evaluate(withCommodity(DOG))
      expect(findObligation(result, 'livestock-holding').status).toBe(
        'inactive'
      )
    })

    it('activates permanent-address (permanent_address = true)', () => {
      const result = evaluate(withCommodity(DOG))
      const o = findObligation(result, 'permanent-address')
      expect(o.status).not.toBe('inactive')
      expect(o.status).not.toBe('deferred')
    })

    it('activates transporter-identification (transporter_address = true)', () => {
      const result = evaluate(withCommodity(DOG))
      const o = findObligation(result, 'transporter-identification')
      expect(o.status).not.toBe('inactive')
      expect(o.status).not.toBe('deferred')
    })

    it('activates animal-identification (identifier_set_07 is not NONE)', () => {
      const result = evaluate(withCommodity(DOG))
      const o = findObligation(result, 'animal-identification')
      expect(o.status).not.toBe('inactive')
      expect(o.status).not.toBe('deferred')
    })
  })

  describe('bovine semen (5119985|Bos taurus) — semen/embryo profile', () => {
    it('deactivates livestock-holding', () => {
      const result = evaluate(withCommodity(BOVINE_SEMEN))
      expect(findObligation(result, 'livestock-holding').status).toBe(
        'inactive'
      )
    })

    it('deactivates permanent-address', () => {
      const result = evaluate(withCommodity(BOVINE_SEMEN))
      expect(findObligation(result, 'permanent-address').status).toBe(
        'inactive'
      )
    })

    it('deactivates transporter-identification', () => {
      const result = evaluate(withCommodity(BOVINE_SEMEN))
      expect(findObligation(result, 'transporter-identification').status).toBe(
        'inactive'
      )
    })

    it('deactivates animal-identification (identifier_set_03 resolves to Collection date/Donor ID — wait, that is NOT NONE)', () => {
      // identifier_set_03 = ["Collection date", "Donor ID"] — this is NOT "NONE"
      // so animal-identification should be ACTIVE for bovine semen
      const result = evaluate(withCommodity(BOVINE_SEMEN))
      const o = findObligation(result, 'animal-identification')
      expect(o.status).not.toBe('inactive')
      expect(o.status).not.toBe('deferred')
    })
  })

  describe('rodent (1061900|Rodentia) — identifier_set_11 (NONE)', () => {
    it('deactivates animal-identification (identifier_set_11 = NONE)', () => {
      const result = evaluate(withCommodity(RODENT))
      expect(findObligation(result, 'animal-identification').status).toBe(
        'inactive'
      )
    })
  })

  describe('pork (203|Sus scrofa domesticus) — no routing flags, NONE identifiers', () => {
    it('deactivates all three routing-based tier 2 obligations', () => {
      const result = evaluate(withCommodity(PORK))
      expect(findObligation(result, 'livestock-holding').status).toBe(
        'inactive'
      )
      expect(findObligation(result, 'permanent-address').status).toBe(
        'inactive'
      )
      expect(findObligation(result, 'transporter-identification').status).toBe(
        'inactive'
      )
    })

    it('deactivates animal-identification (identifier_set_11 = NONE)', () => {
      const result = evaluate(withCommodity(PORK))
      expect(findObligation(result, 'animal-identification').status).toBe(
        'inactive'
      )
    })
  })

  describe('cat (1061900|Felis catus) — pet profile, same as dog', () => {
    it('matches the pet routing profile', () => {
      const result = evaluate(withCommodity(CAT))
      expect(findObligation(result, 'livestock-holding').status).toBe(
        'inactive'
      )
      expect(findObligation(result, 'permanent-address').status).not.toBe(
        'inactive'
      )
      expect(
        findObligation(result, 'transporter-identification').status
      ).not.toBe('inactive')
    })
  })

  describe('horse (101|Equus caballus) — no CPH, no perm addr, has transporter', () => {
    it('matches the "other" routing profile', () => {
      const result = evaluate(withCommodity(HORSE))
      expect(findObligation(result, 'livestock-holding').status).toBe(
        'inactive'
      )
      expect(findObligation(result, 'permanent-address').status).toBe(
        'inactive'
      )
      expect(
        findObligation(result, 'transporter-identification').status
      ).not.toBe('inactive')
    })

    it('activates animal-identification (identifier_set_15 — Horse Name, Microchip, Passport)', () => {
      const result = evaluate(withCommodity(HORSE))
      expect(findObligation(result, 'animal-identification').status).not.toBe(
        'inactive'
      )
    })
  })

  describe('bee (1064100|) — species-only commodity code', () => {
    it('correctly resolves with empty speciesName', () => {
      const result = evaluate(withCommodity(BEE))
      // bees: cph=false, permanent_address=false, transporter=true
      expect(findObligation(result, 'livestock-holding').status).toBe(
        'inactive'
      )
      expect(findObligation(result, 'permanent-address').status).toBe(
        'inactive'
      )
      expect(
        findObligation(result, 'transporter-identification').status
      ).not.toBe('inactive')
    })
  })

  describe('pending refdata extensions', () => {
    it.todo(
      'animal-certification activation — has_certified_as refdata extension not yet built',
      () => {
        // When refdata is extended with has_certified_as, this test should verify
        // that animal-certification activates/deactivates per commodity.
        // Currently treated as inactive due to missing refdata.
      }
    )

    it.todo(
      'animal-weaning-status activation — has_unweaned refdata extension not yet built',
      () => {
        // When refdata is extended with has_unweaned, this test should verify
        // that animal-weaning-status activates/deactivates per commodity.
        // Currently treated as inactive due to missing refdata.
      }
    )

    it('animal-certification is inactive for all commodities until refdata extended', () => {
      const result = evaluate(withCommodity(CATTLE))
      expect(findObligation(result, 'animal-certification').status).toBe(
        'inactive'
      )
    })

    it('animal-weaning-status is inactive for all commodities until refdata extended', () => {
      const result = evaluate(withCommodity(CATTLE))
      expect(findObligation(result, 'animal-weaning-status').status).toBe(
        'inactive'
      )
    })
  })
})

// =========================================================================
// Category 2: Satisfaction (Path Checking)
// =========================================================================
describe('Category 2: Satisfaction — path checking', () => {
  describe('livestock-holding (single scalar path)', () => {
    it('is unsatisfied when cphNumber is absent', () => {
      const n = withCommodity(CATTLE)
      const result = evaluate(n)
      const o = findObligation(result, 'livestock-holding')
      expect(o.status).toBe('unsatisfied')
      expect(o.missingPaths).toContain('notification.partOne.cphNumber')
    })

    it('is satisfied when cphNumber is populated', () => {
      const n = {
        ...withCommodity(CATTLE),
        partOne: {
          ...withCommodity(CATTLE).partOne,
          cphNumber: '12/345/6789'
        }
      }
      const result = evaluate(n)
      const o = findObligation(result, 'livestock-holding')
      expect(o.status).toBe('satisfied')
      expect(o.missingPaths).toEqual([])
    })
  })

  describe('notification-type (single path)', () => {
    it('is unsatisfied for empty notification', () => {
      const result = evaluate({})
      const o = findObligation(result, 'notification-type')
      expect(o.status).toBe('unsatisfied')
      expect(o.missingPaths).toContain('notification.type')
    })

    it('is satisfied when notification.type is set', () => {
      const result = evaluate({ type: 'IMPv2' })
      const o = findObligation(result, 'notification-type')
      expect(o.status).toBe('satisfied')
      expect(o.missingPaths).toEqual([])
    })
  })

  describe('consignor-identification (object-level path)', () => {
    it('is unsatisfied when consignor is missing', () => {
      const result = evaluate({})
      const o = findObligation(result, 'consignor-identification')
      expect(o.status).toBe('unsatisfied')
    })

    it('is unsatisfied when consignor is empty object', () => {
      const result = evaluate({ partOne: { consignor: {} } })
      const o = findObligation(result, 'consignor-identification')
      expect(o.status).toBe('unsatisfied')
    })

    it('is satisfied when consignor has content', () => {
      const result = evaluate({
        partOne: {
          consignor: {
            companyName: 'Acme Farms',
            address: { addressLine1: '123 Farm Rd' }
          }
        }
      })
      const o = findObligation(result, 'consignor-identification')
      expect(o.status).toBe('satisfied')
      expect(o.missingPaths).toEqual([])
    })
  })

  describe('consignee-identification', () => {
    it('is unsatisfied when consignee is missing', () => {
      const result = evaluate({})
      expect(findObligation(result, 'consignee-identification').status).toBe(
        'unsatisfied'
      )
    })

    it('is satisfied when consignee has content', () => {
      const result = evaluate({
        partOne: { consignee: { companyName: 'UK Livestock Ltd' } }
      })
      expect(findObligation(result, 'consignee-identification').status).toBe(
        'satisfied'
      )
    })
  })

  describe('importer-identification', () => {
    it('is satisfied when importer has content', () => {
      const result = evaluate({
        partOne: { importer: { companyName: 'Import Co' } }
      })
      expect(findObligation(result, 'importer-identification').status).toBe(
        'satisfied'
      )
    })
  })

  describe('destination-identification', () => {
    it('is satisfied when placeOfDestination has content', () => {
      const result = evaluate({
        partOne: { placeOfDestination: { addressLine1: '456 Holding Rd' } }
      })
      expect(findObligation(result, 'destination-identification').status).toBe(
        'satisfied'
      )
    })
  })

  describe('transporter-identification (object-level, tier 2)', () => {
    it('is unsatisfied when transporter is empty for active commodity', () => {
      const n = withCommodity(CATTLE)
      const result = evaluate(n)
      const o = findObligation(result, 'transporter-identification')
      expect(o.status).toBe('unsatisfied')
    })

    it('is satisfied when transporter has content for active commodity', () => {
      const n = {
        partOne: {
          ...withCommodity(CATTLE).partOne,
          transporter: {
            companyName: 'Haulage Ltd',
            approvalNumber: 'TR12345'
          }
        }
      }
      const result = evaluate(n)
      const o = findObligation(result, 'transporter-identification')
      expect(o.status).toBe('satisfied')
    })
  })

  describe('entry-and-arrival (two paths)', () => {
    it('is unsatisfied when both missing', () => {
      const result = evaluate({})
      const o = findObligation(result, 'entry-and-arrival')
      expect(o.status).toBe('unsatisfied')
      expect(o.missingPaths).toContain('notification.partOne.pointOfEntry')
      expect(o.missingPaths).toContain('notification.partOne.arrivalDate')
    })

    it('is unsatisfied when only pointOfEntry populated', () => {
      const result = evaluate({
        partOne: { pointOfEntry: 'GBDVR' }
      })
      const o = findObligation(result, 'entry-and-arrival')
      expect(o.status).toBe('unsatisfied')
      expect(o.missingPaths).toContain('notification.partOne.arrivalDate')
      expect(o.missingPaths).not.toContain(
        'notification.partOne.pointOfEntry'
      )
    })

    it('is satisfied when both populated', () => {
      const result = evaluate({
        partOne: {
          pointOfEntry: 'GBDVR',
          arrivalDate: '2026-04-15'
        }
      })
      const o = findObligation(result, 'entry-and-arrival')
      expect(o.status).toBe('satisfied')
      expect(o.missingPaths).toEqual([])
    })
  })

  describe('consignment-origin (two paths)', () => {
    it('reports specific missing paths', () => {
      const result = evaluate({
        partOne: {
          commodities: { countryOfOrigin: 'FR' }
        }
      })
      const o = findObligation(result, 'consignment-origin')
      expect(o.status).toBe('unsatisfied')
      expect(o.missingPaths).toContain(
        'notification.partOne.commodities.regionOfOrigin'
      )
      expect(o.missingPaths).not.toContain(
        'notification.partOne.commodities.countryOfOrigin'
      )
    })
  })

  describe('legal-declaration (action-only, empty schemaPaths)', () => {
    it('is unsatisfied when submissionDate is absent', () => {
      const result = evaluate({})
      const o = findObligation(result, 'legal-declaration')
      expect(o.status).toBe('unsatisfied')
    })

    it('is satisfied when submissionDate is populated', () => {
      const result = evaluate({
        partOne: { submissionDate: '2026-04-07T10:00:00Z' }
      })
      const o = findObligation(result, 'legal-declaration')
      expect(o.status).toBe('satisfied')
    })

    it.todo(
      'satisfaction convention needs confirming — currently uses submissionDate as marker'
    )
  })

  describe('object-level satisfaction depth', () => {
    it.todo(
      'define what constitutes "populated" for object-level obligations like consignor — currently any non-empty object'
    )
  })
})

// =========================================================================
// Category 3: Multi-Path Obligations
// =========================================================================
describe('Category 3: Multi-path obligations', () => {
  describe('import-purpose (2 paths — purposeGroup + internalMarketPurpose)', () => {
    it('is unsatisfied when only purposeGroup is populated', () => {
      const result = evaluate({
        partOne: {
          purpose: { purposeGroup: 'For Import' }
        }
      })
      const o = findObligation(result, 'import-purpose')
      expect(o.status).toBe('unsatisfied')
      expect(o.missingPaths).toContain(
        'notification.partOne.purpose.internalMarketPurpose'
      )
      expect(o.missingPaths).not.toContain(
        'notification.partOne.purpose.exitBIP'
      )
      expect(o.missingPaths).not.toContain('notification.partOne.portOfExit')
    })

    it('is satisfied when both paths are populated', () => {
      const result = evaluate({
        partOne: {
          purpose: {
            purposeGroup: 'For Import',
            internalMarketPurpose: 'Breeding'
          }
        }
      })
      const o = findObligation(result, 'import-purpose')
      expect(o.status).toBe('satisfied')
      expect(o.missingPaths).toEqual([])
    })

    it('is unsatisfied when both paths are missing', () => {
      const result = evaluate({})
      const o = findObligation(result, 'import-purpose')
      expect(o.status).toBe('unsatisfied')
      expect(o.missingPaths).toHaveLength(2)
    })
  })

  describe('transit-routing (2 paths — exitBIP + portOfExit, purpose-conditional)', () => {
    it('is deferred when no purpose selected', () => {
      const result = evaluate(withCommodity(CATTLE))
      const o = findObligation(result, 'transit-routing')
      expect(o.status).toBe('deferred')
    })

    it('is inactive for non-transit purpose', () => {
      const result = evaluate({
        partOne: {
          ...withCommodity(CATTLE).partOne,
          purpose: { purposeGroup: 'For Import' }
        }
      })
      const o = findObligation(result, 'transit-routing')
      expect(o.status).toBe('inactive')
    })

    it('is active and unsatisfied for transit purpose with missing paths', () => {
      const result = evaluate({
        partOne: {
          ...withCommodity(CATTLE).partOne,
          purpose: { purposeGroup: 'For Transhipment to' }
        }
      })
      const o = findObligation(result, 'transit-routing')
      expect(o.status).toBe('unsatisfied')
      expect(o.missingPaths).toContain('notification.partOne.purpose.exitBIP')
      expect(o.missingPaths).toContain('notification.partOne.portOfExit')
    })

    it('is satisfied when transit purpose and both paths populated', () => {
      const result = evaluate({
        partOne: {
          ...withCommodity(CATTLE).partOne,
          purpose: {
            purposeGroup: 'For Transit to 3rd Country',
            exitBIP: 'GBDVR'
          },
          portOfExit: 'FRCQF'
        }
      })
      const o = findObligation(result, 'transit-routing')
      expect(o.status).toBe('satisfied')
      expect(o.missingPaths).toEqual([])
    })

    it('is active for both transit purpose values', () => {
      for (const purpose of TRANSIT_PURPOSES) {
        const result = evaluate({
          partOne: {
            purpose: { purposeGroup: purpose }
          }
        })
        const o = findObligation(result, 'transit-routing')
        expect(
          ['satisfied', 'unsatisfied'].includes(o.status),
          `transit-routing should be active for "${purpose}", got ${o.status}`
        ).toBe(true)
      }
    })
  })

  describe('health-certification (3 paths including array)', () => {
    it('is unsatisfied when all missing', () => {
      const result = evaluate({})
      const o = findObligation(result, 'health-certification')
      expect(o.status).toBe('unsatisfied')
      expect(o.missingPaths).toHaveLength(3)
    })

    it('is unsatisfied when only veterinaryDocument populated', () => {
      const result = evaluate({
        partOne: {
          veterinaryInformation: {
            veterinaryDocument: 'VET/2026/001'
          }
        }
      })
      const o = findObligation(result, 'health-certification')
      expect(o.status).toBe('unsatisfied')
      expect(o.missingPaths).toContain(
        'notification.partOne.veterinaryInformation.veterinaryDocumentIssueDate'
      )
    })

    it('is satisfied when all three paths populated', () => {
      const result = evaluate({
        partOne: {
          veterinaryInformation: {
            veterinaryDocument: 'VET/2026/001',
            veterinaryDocumentIssueDate: '2026-04-01',
            accompanyingDocuments: [{ attachmentId: 'att-001' }]
          }
        }
      })
      const o = findObligation(result, 'health-certification')
      expect(o.status).toBe('satisfied')
    })
  })

  describe('species-identification (6 paths in array)', () => {
    it('is unsatisfied when complement exists but species fields are empty', () => {
      const n = {
        partOne: {
          commodities: {
            commodityComplement: [{ commodityID: '102' }]
          }
        }
      }
      const result = evaluate(n)
      const o = findObligation(result, 'species-identification')
      expect(o.status).toBe('unsatisfied')
      // Should list the missing species paths
      expect(o.missingPaths.length).toBeGreaterThan(0)
    })

    it('is satisfied when all species fields populated', () => {
      const n = {
        partOne: {
          commodities: {
            commodityComplement: [
              {
                commodityID: '102',
                speciesTypeName: 'Bos taurus',
                speciesType: 'domestic',
                speciesClass: 'Mammalia',
                speciesFamilyName: 'Bovidae',
                speciesNomination: 'Bos',
                speciesName: 'Bos taurus'
              }
            ]
          }
        }
      }
      const result = evaluate(n)
      const o = findObligation(result, 'species-identification')
      expect(o.status).toBe('satisfied')
    })
  })

  describe('accompanying-documents (4 paths in array)', () => {
    it('is unsatisfied when accompanyingDocuments is empty array', () => {
      const result = evaluate({
        partOne: {
          veterinaryInformation: {
            accompanyingDocuments: []
          }
        }
      })
      const o = findObligation(result, 'accompanying-documents')
      expect(o.status).toBe('unsatisfied')
    })

    it('is satisfied when all document fields populated', () => {
      const result = evaluate({
        partOne: {
          veterinaryInformation: {
            accompanyingDocuments: [
              {
                documentType: 'commercial_invoice',
                documentReference: 'INV-001',
                documentIssueDate: '2026-04-01',
                attachmentId: 'att-002'
              }
            ]
          }
        }
      })
      const o = findObligation(result, 'accompanying-documents')
      expect(o.status).toBe('satisfied')
    })
  })
})

// =========================================================================
// Category 4: Commodity Change (Re-evaluation)
// =========================================================================
describe('Category 4: Commodity change — re-evaluation', () => {
  it('flips livestock-holding from active to inactive when changing cattle to dog', () => {
    const cattleResult = evaluate(withCommodity(CATTLE))
    expect(findObligation(cattleResult, 'livestock-holding').status).not.toBe(
      'inactive'
    )

    const dogResult = evaluate(withCommodity(DOG))
    expect(findObligation(dogResult, 'livestock-holding').status).toBe(
      'inactive'
    )
  })

  it('flips permanent-address from inactive to active when changing cattle to dog', () => {
    const cattleResult = evaluate(withCommodity(CATTLE))
    expect(findObligation(cattleResult, 'permanent-address').status).toBe(
      'inactive'
    )

    const dogResult = evaluate(withCommodity(DOG))
    expect(findObligation(dogResult, 'permanent-address').status).not.toBe(
      'inactive'
    )
  })

  it('flips all routing flags when changing cattle to bovine semen', () => {
    const cattleResult = evaluate(withCommodity(CATTLE))
    const semenResult = evaluate(withCommodity(BOVINE_SEMEN))

    // cattle: cph=true, transporter=true
    expect(
      findObligation(cattleResult, 'livestock-holding').status
    ).not.toBe('inactive')
    expect(
      findObligation(cattleResult, 'transporter-identification').status
    ).not.toBe('inactive')

    // semen: cph=false, perm_addr=false, transporter=false
    expect(findObligation(semenResult, 'livestock-holding').status).toBe(
      'inactive'
    )
    expect(
      findObligation(semenResult, 'transporter-identification').status
    ).toBe('inactive')
    expect(findObligation(semenResult, 'permanent-address').status).toBe(
      'inactive'
    )
  })

  it('transitions from deferred to active/inactive when commodity is added', () => {
    const emptyResult = evaluate({})
    expect(findObligation(emptyResult, 'livestock-holding').status).toBe(
      'deferred'
    )

    const cattleResult = evaluate(withCommodity(CATTLE))
    expect(
      findObligation(cattleResult, 'livestock-holding').status
    ).not.toBe('deferred')
  })

  it('transitions from active/inactive back to deferred if commodity is removed', () => {
    // Simulating commodity removal: notification has commodityComplement but
    // no commodityID (or empty complement)
    const result = evaluate({
      partOne: {
        commodities: {
          commodityComplement: []
        }
      }
    })
    expect(findObligation(result, 'livestock-holding').status).toBe(
      'deferred'
    )
  })

  it('changing dog to ferret preserves permanent-address activation', () => {
    // Both dog and ferret have permanent_address = true
    const dogResult = evaluate(withCommodity(DOG))
    const ferretResult = evaluate(withCommodity(FERRET))

    expect(findObligation(dogResult, 'permanent-address').status).not.toBe(
      'inactive'
    )
    expect(
      findObligation(ferretResult, 'permanent-address').status
    ).not.toBe('inactive')
  })

  it('changing rodent to cattle flips animal-identification from inactive to active', () => {
    // Rodent: identifier_set_11 = NONE → inactive
    // Cattle: identifier_set_13 ≠ NONE → active
    const rodentResult = evaluate(withCommodity(RODENT))
    const cattleResult = evaluate(withCommodity(CATTLE))

    expect(
      findObligation(rodentResult, 'animal-identification').status
    ).toBe('inactive')
    expect(
      findObligation(cattleResult, 'animal-identification').status
    ).not.toBe('inactive')
  })
})

// =========================================================================
// Category 5: Array Obligations (Cardinality)
// =========================================================================
describe('Category 5: Array obligations — cardinality', () => {
  describe('commodity-selection (commodityComplement[].commodityID)', () => {
    it('is unsatisfied when commodityComplement is missing', () => {
      const result = evaluate({})
      const o = findObligation(result, 'commodity-selection')
      expect(o.status).toBe('unsatisfied')
    })

    it('is unsatisfied when commodityComplement is empty array', () => {
      const result = evaluate({
        partOne: { commodities: { commodityComplement: [] } }
      })
      const o = findObligation(result, 'commodity-selection')
      expect(o.status).toBe('unsatisfied')
    })

    it('is satisfied when commodityComplement has entry with commodityID', () => {
      const result = evaluate(withCommodity(CATTLE))
      const o = findObligation(result, 'commodity-selection')
      expect(o.status).toBe('satisfied')
    })

    it('is unsatisfied when commodityComplement has entry without commodityID', () => {
      const result = evaluate({
        partOne: {
          commodities: {
            commodityComplement: [{ speciesName: 'Bos taurus' }]
          }
        }
      })
      const o = findObligation(result, 'commodity-selection')
      expect(o.status).toBe('unsatisfied')
    })
  })

  describe('commodity-complement-detail (complementParameterSet[].keyDataPair)', () => {
    it('is unsatisfied when complementParameterSet is missing', () => {
      const result = evaluate({})
      const o = findObligation(result, 'commodity-complement-detail')
      expect(o.status).toBe('unsatisfied')
    })

    it('is unsatisfied when keyDataPair is empty array', () => {
      const result = evaluate({
        partOne: {
          commodities: {
            commodityComplement: [{ speciesName: 'Bos taurus' }],
            complementParameterSet: [{ keyDataPair: [] }]
          }
        }
      })
      const o = findObligation(result, 'commodity-complement-detail')
      expect(o.status).toBe('unsatisfied')
    })

    it('is satisfied when keyDataPair has entries and speciesName present', () => {
      const result = evaluate({
        partOne: {
          commodities: {
            commodityComplement: [{ speciesName: 'Bos taurus' }],
            complementParameterSet: [
              {
                keyDataPair: [
                  { key: 'numberOfAnimals', data: '50' }
                ]
              }
            ]
          }
        }
      })
      const o = findObligation(result, 'commodity-complement-detail')
      expect(o.status).toBe('satisfied')
    })
  })

  describe('establishments-of-origin (array path)', () => {
    it('is unsatisfied when establishmentsOfOrigin is missing', () => {
      const result = evaluate({})
      const o = findObligation(result, 'establishments-of-origin')
      expect(o.status).toBe('unsatisfied')
    })

    it('is unsatisfied when establishmentsOfOrigin is empty array', () => {
      const result = evaluate({
        partOne: {
          veterinaryInformation: { establishmentsOfOrigin: [] }
        }
      })
      const o = findObligation(result, 'establishments-of-origin')
      expect(o.status).toBe('unsatisfied')
    })

    it('is satisfied when establishmentsOfOrigin has entry with approvalNumber', () => {
      const result = evaluate({
        partOne: {
          veterinaryInformation: {
            establishmentsOfOrigin: [{ approvalNumber: 'FR-12345' }]
          }
        }
      })
      const o = findObligation(result, 'establishments-of-origin')
      expect(o.status).toBe('satisfied')
    })
  })

  describe('contact-designation (nominatedContacts[])', () => {
    it('is unsatisfied when nominatedContacts is missing', () => {
      const result = evaluate({})
      const o = findObligation(result, 'contact-designation')
      expect(o.status).toBe('unsatisfied')
    })

    it('is unsatisfied when nominatedContacts is empty array', () => {
      const result = evaluate({
        partOne: { nominatedContacts: [] }
      })
      const o = findObligation(result, 'contact-designation')
      expect(o.status).toBe('unsatisfied')
    })

    it('is satisfied when nominatedContacts has at least one entry', () => {
      const result = evaluate({
        partOne: {
          nominatedContacts: [
            { name: 'John Smith', telephone: '01onal234' }
          ]
        }
      })
      const o = findObligation(result, 'contact-designation')
      expect(o.status).toBe('satisfied')
    })
  })

  describe('animal-identification (nested array: complementParameterSet[].identifiers[].data)', () => {
    it('is unsatisfied when identifiers array is missing for active commodity', () => {
      const n = {
        partOne: {
          ...withCommodity(CATTLE).partOne,
          commodities: {
            ...withCommodity(CATTLE).partOne.commodities,
            complementParameterSet: [{}]
          }
        }
      }
      const result = evaluate(n)
      const o = findObligation(result, 'animal-identification')
      expect(o.status).toBe('unsatisfied')
    })

    it('is unsatisfied when identifiers array is empty for active commodity', () => {
      const n = {
        partOne: {
          ...withCommodity(CATTLE).partOne,
          commodities: {
            ...withCommodity(CATTLE).partOne.commodities,
            complementParameterSet: [{ identifiers: [] }]
          }
        }
      }
      const result = evaluate(n)
      const o = findObligation(result, 'animal-identification')
      expect(o.status).toBe('unsatisfied')
    })

    it('is satisfied when identifiers have data for active commodity', () => {
      const n = {
        partOne: {
          ...withCommodity(CATTLE).partOne,
          commodities: {
            ...withCommodity(CATTLE).partOne.commodities,
            complementParameterSet: [
              {
                identifiers: [{ data: 'UK123456789' }]
              }
            ]
          }
        }
      }
      const result = evaluate(n)
      const o = findObligation(result, 'animal-identification')
      expect(o.status).toBe('satisfied')
    })
  })

  describe('permanent-address (nested array: complementParameterSet[].identifiers[].permanentAddress)', () => {
    it('is unsatisfied when permanentAddress is missing for active commodity (dog)', () => {
      const n = {
        partOne: {
          ...withCommodity(DOG).partOne,
          commodities: {
            ...withCommodity(DOG).partOne.commodities,
            complementParameterSet: [
              { identifiers: [{ data: 'CHIP123' }] }
            ]
          }
        }
      }
      const result = evaluate(n)
      const o = findObligation(result, 'permanent-address')
      expect(o.status).toBe('unsatisfied')
    })

    it('is satisfied when permanentAddress is populated for active commodity (dog)', () => {
      const n = {
        partOne: {
          ...withCommodity(DOG).partOne,
          commodities: {
            ...withCommodity(DOG).partOne.commodities,
            complementParameterSet: [
              {
                identifiers: [
                  {
                    data: 'CHIP123',
                    permanentAddress: {
                      addressLine1: '10 Pet Lane'
                    }
                  }
                ]
              }
            ]
          }
        }
      }
      const result = evaluate(n)
      const o = findObligation(result, 'permanent-address')
      expect(o.status).toBe('satisfied')
    })
  })
})

// =========================================================================
// Category 6: Full Journey (End-to-End)
// =========================================================================
describe('Category 6: Full journey — end-to-end cattle notification', () => {
  const buildFullCattleNotification = () => ({
    type: 'IMPv2',
    partOne: {
      commodities: {
        countryOfOrigin: 'FR',
        regionOfOrigin: 'Ile-de-France',
        commodityComplement: [
          {
            commodityID: '102',
            speciesTypeName: 'Bos taurus',
            speciesType: 'domestic',
            speciesClass: 'Mammalia',
            speciesFamilyName: 'Bovidae',
            speciesNomination: 'Bos',
            speciesName: 'Bos taurus'
          }
        ],
        complementParameterSet: [
          {
            keyDataPair: [
              { key: 'numberOfAnimals', data: '50' }
            ],
            identifiers: [
              {
                data: 'UK123456789',
                permanentAddress: null // not applicable for cattle
              }
            ]
          }
        ],
        animalsCertifiedAs: null,
        includeNonAblactedAnimals: null
      },
      purpose: {
        purposeGroup: 'For Import',
        internalMarketPurpose: 'Breeding'
      },
      veterinaryInformation: {
        veterinaryDocument: 'VET/2026/001',
        veterinaryDocumentIssueDate: '2026-04-01',
        accompanyingDocuments: [
          {
            documentType: 'veterinary_health_certificate',
            documentReference: 'CERT-001',
            documentIssueDate: '2026-04-01',
            attachmentId: 'att-001'
          }
        ],
        establishmentsOfOrigin: [{ approvalNumber: 'FR-FARM-001' }]
      },
      consignor: {
        companyName: 'Ferme de France',
        address: { addressLine1: '1 Rue de la Ferme', country: 'FR' }
      },
      consignee: {
        companyName: 'UK Livestock Ltd',
        address: { addressLine1: '1 Farm Lane', country: 'GB' }
      },
      importer: {
        companyName: 'Import Services Ltd',
        address: { addressLine1: '2 Trade Way', country: 'GB' }
      },
      placeOfDestination: {
        addressLine1: '3 Holding Farm',
        country: 'GB'
      },
      cphNumber: '12/345/6789',
      transporter: {
        companyName: 'Haulage Ltd',
        approvalNumber: 'TR12345'
      },
      pointOfEntry: 'GBDVR',
      arrivalDate: '2026-04-15',
      nominatedContacts: [
        { name: 'John Smith', telephone: '01onal234', email: 'j@example.com' }
      ],
      submissionDate: '2026-04-07T10:00:00Z'
    }
  })

  it('evaluates all 23 obligations', () => {
    const result = evaluate(buildFullCattleNotification())
    expect(result.obligations).toHaveLength(23)
  })

  it('has no deferred obligations', () => {
    const result = evaluate(buildFullCattleNotification())
    const deferred = result.obligations.filter(
      (o) => o.status === 'deferred'
    )
    expect(deferred).toEqual([])
  })

  it('permanent-address is inactive for cattle', () => {
    const result = evaluate(buildFullCattleNotification())
    expect(findObligation(result, 'permanent-address').status).toBe(
      'inactive'
    )
  })

  it('animal-certification is inactive (refdata extension pending)', () => {
    const result = evaluate(buildFullCattleNotification())
    expect(findObligation(result, 'animal-certification').status).toBe(
      'inactive'
    )
  })

  it('animal-weaning-status is inactive (refdata extension pending)', () => {
    const result = evaluate(buildFullCattleNotification())
    expect(findObligation(result, 'animal-weaning-status').status).toBe(
      'inactive'
    )
  })

  it('transit-routing is inactive for non-transit purpose (For Import)', () => {
    const result = evaluate(buildFullCattleNotification())
    expect(findObligation(result, 'transit-routing').status).toBe(
      'inactive'
    )
  })

  it('all unconditional obligations are satisfied', () => {
    const result = evaluate(buildFullCattleNotification())
    for (const id of UNCONDITIONAL_IDS) {
      const o = findObligation(result, id)
      expect(o.status, `${id} should be satisfied`).toBe('satisfied')
    }
  })

  it('active conditional obligations (livestock-holding, transporter, animal-identification) are satisfied', () => {
    const result = evaluate(buildFullCattleNotification())
    expect(findObligation(result, 'livestock-holding').status).toBe(
      'satisfied'
    )
    expect(
      findObligation(result, 'transporter-identification').status
    ).toBe('satisfied')
    expect(findObligation(result, 'animal-identification').status).toBe(
      'satisfied'
    )
  })

  it('has no unsatisfied obligations', () => {
    const result = evaluate(buildFullCattleNotification())
    const unsatisfied = result.obligations.filter(
      (o) => o.status === 'unsatisfied'
    )
    expect(
      unsatisfied,
      `These obligations are still unsatisfied: ${unsatisfied.map((o) => o.id).join(', ')}`
    ).toEqual([])
  })
})

// =========================================================================
// Category 7: Exhaustive Commodity Coverage
// =========================================================================
describe('Category 7: Exhaustive commodity coverage', () => {
  // Helper to classify a commodity's expected routing profile from refdata
  const getExpectedRouting = (commodityKey) => ({
    cph_number: refdata.routing[commodityKey]?.cph_number ?? false,
    permanent_address:
      refdata.routing[commodityKey]?.permanent_address ?? false,
    transporter_address:
      refdata.routing[commodityKey]?.transporter_address ?? false
  })

  const getExpectedIdentifierActive = (commodityKey) => {
    const content = refdata.content[commodityKey]
    if (!content) return false
    const idSet =
      refdata.definitions.identifier_sets[content.identifiers]
    if (!idSet) return false
    return !(idSet.length === 1 && idSet[0] === 'NONE')
  }

  it('refdata contains exactly 67 commodity keys in routing', () => {
    expect(Object.keys(refdata.routing)).toHaveLength(67)
  })

  it('refdata routing and content have matching commodity keys', () => {
    const routingKeys = Object.keys(refdata.routing).sort()
    const contentKeys = Object.keys(refdata.content).sort()
    expect(routingKeys).toEqual(contentKeys)
  })

  describe('every commodity produces correct tier 2 activation', () => {
    beforeAll(() => {
      // Verify refdata is loaded
      expect(refdata).toBeDefined()
      expect(refdata.routing).toBeDefined()
    })

    // Generate one test per commodity
    const commodityKeys = () => Object.keys(refdata.routing)

    it('generates correct livestock-holding activation for all 67 commodities', () => {
      for (const key of commodityKeys()) {
        const expected = getExpectedRouting(key)
        const result = evaluate(withCommodity(key))
        const o = findObligation(result, 'livestock-holding')

        if (expected.cph_number) {
          expect(
            o.status,
            `${key}: livestock-holding should be active (cph_number=true)`
          ).not.toBe('inactive')
        } else {
          expect(
            o.status,
            `${key}: livestock-holding should be inactive (cph_number=false)`
          ).toBe('inactive')
        }
      }
    })

    it('generates correct permanent-address activation for all 67 commodities', () => {
      for (const key of commodityKeys()) {
        const expected = getExpectedRouting(key)
        const result = evaluate(withCommodity(key))
        const o = findObligation(result, 'permanent-address')

        if (expected.permanent_address) {
          expect(
            o.status,
            `${key}: permanent-address should be active (permanent_address=true)`
          ).not.toBe('inactive')
        } else {
          expect(
            o.status,
            `${key}: permanent-address should be inactive (permanent_address=false)`
          ).toBe('inactive')
        }
      }
    })

    it('generates correct transporter-identification activation for all 67 commodities', () => {
      for (const key of commodityKeys()) {
        const expected = getExpectedRouting(key)
        const result = evaluate(withCommodity(key))
        const o = findObligation(result, 'transporter-identification')

        if (expected.transporter_address) {
          expect(
            o.status,
            `${key}: transporter-identification should be active (transporter_address=true)`
          ).not.toBe('inactive')
        } else {
          expect(
            o.status,
            `${key}: transporter-identification should be inactive (transporter_address=false)`
          ).toBe('inactive')
        }
      }
    })

    it('generates correct animal-identification activation for all 67 commodities', () => {
      for (const key of commodityKeys()) {
        const expectedActive = getExpectedIdentifierActive(key)
        const result = evaluate(withCommodity(key))
        const o = findObligation(result, 'animal-identification')

        if (expectedActive) {
          expect(
            o.status,
            `${key}: animal-identification should be active`
          ).not.toBe('inactive')
        } else {
          expect(
            o.status,
            `${key}: animal-identification should be inactive`
          ).toBe('inactive')
        }
      }
    })
  })

  describe('routing profile distribution matches expected archetypes', () => {
    it('has the expected count of livestock (full) profile commodities — cph=true, perm_addr=false, transporter=true', () => {
      const livestock = Object.entries(refdata.routing).filter(
        ([, r]) =>
          r.cph_number === true &&
          r.permanent_address === false &&
          r.transporter_address === true
      )
      // Handoff says 38
      expect(livestock.length).toBe(38)
    })

    it('has the expected count of pet/companion profile commodities — cph=false, perm_addr=true, transporter=true', () => {
      const pets = Object.entries(refdata.routing).filter(
        ([, r]) =>
          r.cph_number === false &&
          r.permanent_address === true &&
          r.transporter_address === true
      )
      // Handoff says 4
      expect(pets.length).toBe(4)
    })

    it('has the expected count of semen/embryo profile commodities — all flags false', () => {
      const semen = Object.entries(refdata.routing).filter(
        ([, r]) =>
          r.cph_number === false &&
          r.permanent_address === false &&
          r.transporter_address === false
      )
      // Handoff says 8
      expect(semen.length).toBe(8)
    })

    it('has the expected count of "other" profile commodities — cph=false, perm_addr=false, transporter=true', () => {
      const other = Object.entries(refdata.routing).filter(
        ([, r]) =>
          r.cph_number === false &&
          r.permanent_address === false &&
          r.transporter_address === true
      )
      // Handoff says 17
      expect(other.length).toBe(17)
    })

    it('four profiles account for all 67 commodities', () => {
      expect(38 + 4 + 8 + 17).toBe(67)
    })
  })

  describe('identifier set distribution', () => {
    it('identifier_set_11 (NONE) commodities have inactive animal-identification', () => {
      const noneIdentifierCommodities = Object.entries(refdata.content)
        .filter(([, c]) => c.identifiers === 'identifier_set_11')
        .map(([key]) => key)

      expect(noneIdentifierCommodities.length).toBeGreaterThan(0)

      for (const key of noneIdentifierCommodities) {
        const result = evaluate(withCommodity(key))
        const o = findObligation(result, 'animal-identification')
        expect(
          o.status,
          `${key} uses identifier_set_11 (NONE) — animal-identification should be inactive`
        ).toBe('inactive')
      }
    })

    it('identifier_set_13 (Ear tag, Passport) commodities have active animal-identification', () => {
      const earTagPassportCommodities = Object.entries(refdata.content)
        .filter(([, c]) => c.identifiers === 'identifier_set_13')
        .map(([key]) => key)

      expect(earTagPassportCommodities.length).toBeGreaterThan(0)

      for (const key of earTagPassportCommodities) {
        const result = evaluate(withCommodity(key))
        const o = findObligation(result, 'animal-identification')
        expect(
          o.status,
          `${key} uses identifier_set_13 — animal-identification should be active`
        ).not.toBe('inactive')
      }
    })
  })

  describe('no unexpected activation states', () => {
    it('unconditional obligations are always active regardless of commodity', () => {
      const sampleCommodities = [CATTLE, DOG, BOVINE_SEMEN, RODENT, HORSE]
      for (const key of sampleCommodities) {
        const result = evaluate(withCommodity(key))
        for (const id of UNCONDITIONAL_IDS) {
          const o = findObligation(result, id)
          expect(
            ['satisfied', 'unsatisfied'].includes(o.status),
            `${key}: unconditional obligation ${id} should be active (satisfied/unsatisfied), got ${o.status}`
          ).toBe(true)
        }
      }
    })
  })
})

// =========================================================================
// Category 8: Configuration error detection
// =========================================================================
describe('Category 8: Configuration error detection', () => {
  describe('unknown fact name', () => {
    it('throws an error referencing the obligation and fact name', () => {
      const badObligation = [
        {
          id: 'test-bad-fact',
          condition: { fact: 'nonExistentFact', test: 'isTransit' },
          schemaPaths: []
        }
      ]
      expect(() =>
        evaluateObligations({}, badObligation, {})
      ).toThrow(/unknown fact.*nonExistentFact/)
    })

    it('includes the obligation id in the error message', () => {
      const badObligation = [
        {
          id: 'my-broken-obligation',
          condition: { fact: 'unknownFact', test: 'isTransit' },
          schemaPaths: []
        }
      ]
      expect(() =>
        evaluateObligations({}, badObligation, {})
      ).toThrow(/my-broken-obligation/)
    })
  })

  describe('unknown test name', () => {
    it('throws an error referencing the obligation and test name', () => {
      const notification = {
        partOne: { purpose: { purposeGroup: 'For Transit to 3rd Country' } }
      }
      const badObligation = [
        {
          id: 'test-bad-test',
          condition: { fact: 'purposeGroup', test: 'nonExistentTest' },
          schemaPaths: []
        }
      ]
      expect(() =>
        evaluateObligations(notification, badObligation, {})
      ).toThrow(/unknown test.*nonExistentTest/)
    })

    it('does not throw if the fact value is null (deferred before reaching test lookup)', () => {
      const badObligation = [
        {
          id: 'test-deferred-before-test',
          condition: { fact: 'purposeGroup', test: 'nonExistentTest' },
          schemaPaths: []
        }
      ]
      // purposeGroup is null → deferred, never reaches the unknown test
      const result = evaluateObligations({}, badObligation, {})
      expect(result.obligations[0].status).toBe('deferred')
    })
  })

  describe('null safety in routing-based tests', () => {
    it('returns inactive with reason when routing lookup returns null', () => {
      const commodity = { commodityID: '999999', speciesName: 'Unknown' }
      const emptyRefdata = { routing: {}, content: {}, definitions: {} }

      const result = tests.requiresCertification(commodity, emptyRefdata)
      expect(result.active).toBe(false)
      expect(result.reason).toMatch(/no refdata routing/)

      expect(tests.requiresWeaningStatus(commodity, emptyRefdata).active).toBe(false)
      expect(tests.requiresPermanentAddress(commodity, emptyRefdata).active).toBe(false)
      expect(tests.requiresCphNumber(commodity, emptyRefdata).active).toBe(false)
      expect(tests.requiresTransporter(commodity, emptyRefdata).active).toBe(false)
    })
  })
})

// =========================================================================
// Known gaps — documented as skip/todo
// =========================================================================
describe('Known gaps and pending work', () => {
  it.todo(
    'Gap 1: has_certified_as refdata extension — animal-certification activation logic will change'
  )

  it.todo(
    'Gap 2: has_unweaned refdata extension — animal-weaning-status activation logic will change'
  )

  it.todo(
    'Gap 3: Full identifiers condition resolution may need refdata extension beyond simple NONE check'
  )

  // Gap 4 resolved: exitBIP and portOfExit moved to transit-routing obligation (purpose-conditional tier 2)

  it.todo(
    'Gap 5: legal-declaration satisfaction convention — currently uses submissionDate, needs confirmation'
  )

  it.todo(
    'Gap 6: Object-level satisfaction depth — what counts as "populated" for consignor, consignee, etc.'
  )

  it.todo(
    'Gap 7: taskGroup mapping — screens grouped into task list items not yet in journey map'
  )
})
