/**
 * Contract tests for engine/roll-up-to-sections.js — owns protocol.md §5.4.
 *
 * Behaviour & risks:
 *   rollUpToSections(screens) groups screens by section in first-appearance
 *   order, filters notApplicable screens, omits whole-notApplicable sections,
 *   and derives a section status from the 3-value SectionStatus set
 *   (notApplicable is NOT a SectionStatus). Risks: throw-message drift
 *   (existing shim tests use loose regex), section-status discrimination
 *   leaking notApplicable, empty sections leaking through, real composition
 *   with resolveScreens regressing. Tests pin §5.4 exact wording and
 *   compose with the real engine pipeline over a committed scenario.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluate } from './evaluate.js'
import { resolveScreens } from './resolve-screens.js'
import { rollUpToSections } from './roll-up-to-sections.js'
import { resolvers } from '../journeys/eu-live-animals/resolvers.js'
import { scenarioMap } from '../journeys/eu-live-animals/scenarios.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EU_LIVE_ANIMALS_DIR = join(__dirname, '../journeys/eu-live-animals')

// ---------------------------------------------------------------------------
// Hand-rolled fixture helper
// ---------------------------------------------------------------------------

const makeScreen = (screenId, sectionId, sectionName, status) => ({
  screenId,
  screenName: `Screen ${screenId}`,
  sectionId,
  sectionName,
  status,
  fields: []
})

// ---------------------------------------------------------------------------
// Throws — protocol-exact strings (§5.4)
// ---------------------------------------------------------------------------

describe('rollUpToSections — throws (§5.4 exact text)', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'oops'],
    ['object', { not: 'an array' }]
  ])('%s input throws "rollUpToSections: screens must be an array"', (_label, input) => {
    expect(() => rollUpToSections(input)).toThrow(
      'rollUpToSections: screens must be an array'
    )
  })

  it('missing sectionName on first appearance throws with exact §5.4 wording', () => {
    const screens = [
      {
        screenId: '01-01',
        screenName: 'Screen 1',
        sectionId: '01',
        // sectionName intentionally absent
        status: 'complete',
        fields: []
      }
    ]
    expect(() => rollUpToSections(screens)).toThrow(
      'rollUpToSections: screen "01-01" has sectionId "01" but missing sectionName.'
    )
  })
})

// ---------------------------------------------------------------------------
// Section-status table (§5.4, 3 rows top-down first-match-wins)
// ---------------------------------------------------------------------------

describe('rollUpToSections — section status derivation table (§5.4)', () => {
  it.each([
    // [label, child screen statuses, expected section status]
    ['any incomplete → incomplete', ['complete', 'incomplete', 'cannotStartYet'], 'incomplete'],
    ['no incomplete, any cannotStartYet → cannotStartYet', ['complete', 'cannotStartYet'], 'cannotStartYet'],
    ['all complete → complete', ['complete', 'complete'], 'complete']
  ])('%s', (_label, statuses, expectedStatus) => {
    const screens = statuses.map((status, i) =>
      makeScreen(`01-${i + 1}`, '01', 'About', status)
    )
    const [section] = rollUpToSections(screens)
    expect(section.status).toBe(expectedStatus)
  })
})

// ---------------------------------------------------------------------------
// First-appearance ordering invariant (§5.4)
// ---------------------------------------------------------------------------

describe('rollUpToSections — first-appearance ordering (§5.4)', () => {
  it('emits sections in first-appearance order across interleaved input', () => {
    // Order of first appearance: B, A, C
    const screens = [
      makeScreen('B-01', 'B', 'Beta', 'complete'),
      makeScreen('A-01', 'A', 'Alpha', 'complete'),
      makeScreen('C-01', 'C', 'Gamma', 'complete'),
      makeScreen('B-02', 'B', 'Beta', 'complete'),
      makeScreen('A-02', 'A', 'Alpha', 'complete')
    ]
    const sections = rollUpToSections(screens)
    expect(sections.map((s) => s.sectionId)).toEqual(['B', 'A', 'C'])
  })
})

// ---------------------------------------------------------------------------
// Whole-notApplicable section omission (§5.4)
// ---------------------------------------------------------------------------

describe('rollUpToSections — whole-notApplicable section omission (§5.4)', () => {
  it('omits sections where every screen is notApplicable', () => {
    const screens = [
      makeScreen('01-01', '01', 'About', 'notApplicable'),
      makeScreen('01-02', '01', 'About', 'notApplicable'),
      makeScreen('02-01', '02', 'Details', 'complete')
    ]
    const sections = rollUpToSections(screens)
    expect(sections).toHaveLength(1)
    expect(sections[0].sectionId).toBe('02')
  })
})

// ---------------------------------------------------------------------------
// Section shape exhaustiveness (§5.4)
// ---------------------------------------------------------------------------

describe('rollUpToSections — Section shape exhaustiveness (§5.4)', () => {
  it('every emitted Section has exactly {sectionId, sectionName, status, screens}; status is one of 3 SectionStatus values; no empty sections; no notApplicable screens inside', () => {
    const allowedSectionStatuses = new Set([
      'complete',
      'incomplete',
      'cannotStartYet'
    ])

    const screens = [
      // Section A: complete + notApplicable → status complete, 1 screen
      makeScreen('A-01', 'A', 'Alpha', 'complete'),
      makeScreen('A-02', 'A', 'Alpha', 'notApplicable'),
      // Section B: incomplete + complete → status incomplete
      makeScreen('B-01', 'B', 'Beta', 'incomplete'),
      makeScreen('B-02', 'B', 'Beta', 'complete'),
      // Section C: cannotStartYet + complete → status cannotStartYet
      makeScreen('C-01', 'C', 'Gamma', 'cannotStartYet'),
      makeScreen('C-02', 'C', 'Gamma', 'complete')
    ]
    const sections = rollUpToSections(screens)

    for (const section of sections) {
      expect(Object.keys(section).sort()).toEqual([
        'screens',
        'sectionId',
        'sectionName',
        'status'
      ])
      expect(allowedSectionStatuses.has(section.status)).toBe(true)
      expect(section.screens.length).toBeGreaterThan(0)
      for (const screen of section.screens) {
        expect(screen.status).not.toBe('notApplicable')
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Real-data composition smoke (resolveScreens + rollUpToSections)
// ---------------------------------------------------------------------------

describe('rollUpToSections — real-data composition with resolveScreens (eu-live-animals)', () => {
  let adapter, journeyMap

  beforeAll(async () => {
    const [obligationsFile, refdataFile, journeyMapFile] = await Promise.all([
      readFile(join(EU_LIVE_ANIMALS_DIR, 'obligations.json'), 'utf-8'),
      readFile(join(EU_LIVE_ANIMALS_DIR, 'refdata.json'), 'utf-8'),
      readFile(join(EU_LIVE_ANIMALS_DIR, 'journey.json'), 'utf-8')
    ])
    adapter = {
      obligations: JSON.parse(obligationsFile).obligations,
      refdata: JSON.parse(refdataFile),
      journeyResolver: resolvers
    }
    journeyMap = JSON.parse(journeyMapFile)
  })

  it('composes with resolveScreens over import-semen: every section is complete, notApplicable screens are filtered, no empty sections', () => {
    const evalResult = evaluate(scenarioMap['import-semen'].notification, adapter)
    const screens = resolveScreens(evalResult, journeyMap)
    const sections = rollUpToSections(screens)

    expect(sections.length).toBeGreaterThan(0)

    const inputScreenCount = screens.length
    const outputScreenCount = sections.reduce(
      (sum, s) => sum + s.screens.length,
      0
    )
    // At least some screens must have been filtered (import-semen has
    // inactive obligations driving notApplicable screens).
    expect(outputScreenCount).toBeLessThan(inputScreenCount)

    for (const section of sections) {
      expect(section.status).toBe('complete') // scenario is submittable
      expect(section.screens.length).toBeGreaterThan(0)
      for (const screen of section.screens) {
        expect(screen.status).not.toBe('notApplicable')
      }
    }
  })
})