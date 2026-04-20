/**
 * Contract tests for the eu-live-animals journey resolvers.
 *
 * These tests verify the shape of the journey's public contract that the
 * evaluation engine relies on:
 *   - `facts` extractors map IPAFFS notification → domain values
 *   - `tests` predicates return `{ active: boolean, reason: string }`
 *   - `submissionDatePath` resolves against a real notification
 *
 * Scope: contract correctness only. Fine-grained activation behaviour for
 * the full commodity matrix is exercised by the engine's own test suite.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvers, TRANSIT_PURPOSES } from './resolvers.js'
import { resolvePath } from '../../plugins/evaluation-engine/evaluate-obligations.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const refdata = JSON.parse(
  readFileSync(join(__dirname, 'refdata.json'), 'utf-8')
)

describe('resolvers export shape', () => {
  it('exports facts, tests, and submissionDatePath', () => {
    expect(typeof resolvers.facts).toBe('object')
    expect(typeof resolvers.tests).toBe('object')
    expect(typeof resolvers.submissionDatePath).toBe('string')
  })
})

describe('facts.purposeGroup', () => {
  it('extracts purposeGroup from the IPAFFS path', () => {
    const notification = {
      partOne: { purpose: { purposeGroup: 'For Import' } }
    }
    expect(resolvers.facts.purposeGroup(notification)).toBe('For Import')
  })

  it('returns null when purposeGroup is absent', () => {
    expect(resolvers.facts.purposeGroup({})).toBe(null)
  })
})

describe('facts.commodity', () => {
  it('extracts the first commodityComplement when it has a commodityID', () => {
    const notification = {
      partOne: {
        commodities: {
          commodityComplement: [
            { commodityID: '102', speciesName: 'Bos taurus' }
          ]
        }
      }
    }
    const result = resolvers.facts.commodity(notification)
    expect(result).toEqual({ commodityID: '102', speciesName: 'Bos taurus' })
  })

  it('returns null when no commodityComplement is present', () => {
    expect(resolvers.facts.commodity({})).toBe(null)
  })

  it('returns null when commodityComplement[0] lacks commodityID', () => {
    const notification = {
      partOne: {
        commodities: { commodityComplement: [{ speciesName: 'Bos taurus' }] }
      }
    }
    expect(resolvers.facts.commodity(notification)).toBe(null)
  })
})

describe('tests return the { active, reason } contract', () => {
  it('every test returns an object with boolean active and string reason', () => {
    const commodity = { commodityID: '102', speciesName: 'Bos taurus' }
    const purposeGroup = 'For Import'

    for (const [name, testFn] of Object.entries(resolvers.tests)) {
      const input = name === 'isTransit' ? purposeGroup : commodity
      const result = testFn(input, refdata)
      expect(typeof result.active, `${name}.active`).toBe('boolean')
      expect(typeof result.reason, `${name}.reason`).toBe('string')
    }
  })
})

describe('tests.isTransit', () => {
  it.each(TRANSIT_PURPOSES)(
    'reports active for transit purpose "%s"',
    (purpose) => {
      expect(resolvers.tests.isTransit(purpose, refdata).active).toBe(true)
    }
  )

  it('reports inactive for a non-transit purpose', () => {
    expect(resolvers.tests.isTransit('For Import', refdata).active).toBe(false)
  })
})

describe('tests.requiresIdentification', () => {
  it('is active for a commodity whose identifier set is not NONE (cattle)', () => {
    const cattle = { commodityID: '102', speciesName: 'Bos taurus' }
    expect(resolvers.tests.requiresIdentification(cattle, refdata).active)
      .toBe(true)
  })

  it('is inactive when the commodity has no refdata entry', () => {
    const unknown = { commodityID: '999999', speciesName: 'Nothing' }
    const result = resolvers.tests.requiresIdentification(unknown, refdata)
    expect(result.active).toBe(false)
    expect(result.reason).toMatch(/no refdata content/)
  })
})

describe('routing-flag tests read the correct refdata field', () => {
  // cattle: cph_number=true, permanent_address=false, transporter_address=true
  const cattle = { commodityID: '102', speciesName: 'Bos taurus' }

  it.each([
    ['requiresCphNumber', true],
    ['requiresPermanentAddress', false],
    ['requiresTransporter', true]
  ])('%s for cattle → active=%s', (testName, expected) => {
    expect(resolvers.tests[testName](cattle, refdata).active).toBe(expected)
  })

  it('returns inactive with reason when the commodity has no routing entry', () => {
    const unknown = { commodityID: '999999', speciesName: 'Nothing' }
    const result = resolvers.tests.requiresCphNumber(unknown, refdata)
    expect(result.active).toBe(false)
    expect(result.reason).toMatch(/no refdata routing/)
  })
})

describe('submissionDatePath', () => {
  it('resolves the submission date from a real notification shape', () => {
    const notification = {
      partOne: { submissionDate: '2026-04-07T10:00:00Z' }
    }
    expect(resolvePath(notification, resolvers.submissionDatePath)).toBe(
      '2026-04-07T10:00:00Z'
    )
  })

  it('resolves to undefined when submission date is absent', () => {
    expect(resolvePath({}, resolvers.submissionDatePath)).toBeUndefined()
  })
})
