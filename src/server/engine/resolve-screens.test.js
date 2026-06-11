/**
 * Contract tests for engine/resolve-screens.js — owns protocol.md §5.3.
 *
 * Behaviour & risks:
 *   resolveScreens(result, journeyMap) folds an EvaluationResult over a
 *   JourneyMap producing a flat Screen[]. Risks: status-derivation rule
 *   order drift, throw-message prefix/wording drift (existing shim tests
 *   only loose-match via regex), `repeats` pass-through silently dropped,
 *   real-data composition regression. Tests pin §5.3 exact wording with
 *   `toThrow(string)`, table-drive the 5-row status table, and smoke-test
 *   composition with `evaluate` over a real journey.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluate } from './evaluate.js'
import { resolveScreens } from './resolve-screens.js'
import { resolvers } from '../journeys/eu-live-animals/resolvers.js'
import { scenarioMap } from '../journeys/eu-live-animals/scenarios.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EU_LIVE_ANIMALS_DIR = join(__dirname, '../journeys/eu-live-animals')

// ---------------------------------------------------------------------------
// Hand-rolled fixture helpers
// ---------------------------------------------------------------------------

const makeResult = (obligations) => ({
  obligations,
  summary: {
    satisfied: 0,
    unsatisfied: 0,
    deferred: 0,
    inactive: 0,
    total: obligations.length,
    submittable: false
  }
})

const oneScreenMap = (fields, screenOverrides = {}) => ({
  sections: [
    {
      id: '01',
      name: 'Section One',
      screens: [
        {
          id: '01-01',
          screenName: 'Screen One',
          fields,
          ...screenOverrides
        }
      ]
    }
  ]
})

// ---------------------------------------------------------------------------
// Throws — protocol-exact strings (§5.3)
// ---------------------------------------------------------------------------

describe('resolveScreens — throws (§5.3 exact text)', () => {
  it.each([
    [
      'missing obligations',
      null,
      { sections: [] },
      'resolveScreens: evaluationResult must have obligations array'
    ],
    [
      'empty result object',
      {},
      { sections: [] },
      'resolveScreens: evaluationResult must have obligations array'
    ],
    [
      'missing sections',
      { obligations: [] },
      null,
      'resolveScreens: journeyMap must have sections array'
    ],
    [
      'empty journeyMap object',
      { obligations: [] },
      {},
      'resolveScreens: journeyMap must have sections array'
    ]
  ])('%s throws "%s"', (_label, result, journeyMap, expectedMessage) => {
    expect(() => resolveScreens(result, journeyMap)).toThrow(expectedMessage)
  })

  it('dangling obligationRef throws with §5.3 exact wording', () => {
    const result = makeResult([
      { id: 'known', status: 'satisfied', missingPaths: [] }
    ])
    const journeyMap = oneScreenMap([
      {
        fieldName: 'field-x',
        fieldType: 'text',
        label: 'X',
        obligationRef: 'NON-EXISTENT'
      }
    ])
    expect(() => resolveScreens(result, journeyMap)).toThrow(
      'Field "field-x" references obligation "NON-EXISTENT" which was not found in evaluation result.'
    )
  })
})

// ---------------------------------------------------------------------------
// Status-derivation table (§5.3, 5 rows top-down first-match-wins)
// ---------------------------------------------------------------------------

describe('resolveScreens — screen status derivation table (§5.3)', () => {
  const obligationByStatus = (id, status) => ({
    id,
    status,
    ...(status === 'satisfied' || status === 'unsatisfied'
      ? { missingPaths: [] }
      : { reason: `${id} reason` })
  })

  const buildScenario = (statuses) => {
    const obligations = statuses.map((s, i) =>
      obligationByStatus(`obl-${i + 1}`, s)
    )
    const fields = obligations.map((o, i) => ({
      fieldName: `field-${i + 1}`,
      fieldType: 'text',
      label: `Label ${i + 1}`,
      obligationRef: o.id
    }))
    return {
      result: makeResult(obligations),
      journeyMap: oneScreenMap(fields)
    }
  }

  it.each([
    // [label, statuses, expected screen status]
    ['no obligations referenced', [], 'complete'],
    [
      'any unsatisfied → incomplete',
      ['satisfied', 'unsatisfied', 'deferred', 'inactive'],
      'incomplete'
    ],
    [
      'any deferred (no unsatisfied) → cannotStartYet',
      ['satisfied', 'deferred', 'inactive'],
      'cannotStartYet'
    ],
    ['all inactive → notApplicable', ['inactive', 'inactive'], 'notApplicable'],
    ['satisfied + inactive → complete', ['satisfied', 'inactive'], 'complete']
  ])('%s', (_label, statuses, expectedStatus) => {
    const { result, journeyMap } =
      statuses.length === 0
        ? { result: makeResult([]), journeyMap: oneScreenMap([]) }
        : buildScenario(statuses)
    const screens = resolveScreens(result, journeyMap)
    expect(screens[0].status).toBe(expectedStatus)
  })
})

// ---------------------------------------------------------------------------
// `repeats` pass-through (§5.3)
// ---------------------------------------------------------------------------

describe('resolveScreens — repeats pass-through (§5.3)', () => {
  it('preserves `repeats` when the source ScreenDef declares it; omits the key otherwise', () => {
    const result = makeResult([])
    const journeyMap = {
      sections: [
        {
          id: '01',
          name: 'Section',
          screens: [
            {
              id: 'repeated',
              screenName: 'Repeated',
              fields: [],
              repeats: 'commodity'
            },
            { id: 'plain', screenName: 'Plain', fields: [] }
          ]
        }
      ]
    }
    const [repeated, plain] = resolveScreens(result, journeyMap)
    expect(repeated.repeats).toBe('commodity')
    expect(plain).not.toHaveProperty('repeats')
  })
})

// ---------------------------------------------------------------------------
// Real-data composition smoke (eu-live-animals scenarios)
// ---------------------------------------------------------------------------

describe('resolveScreens — real-data composition with evaluate (eu-live-animals)', () => {
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

  it('every committed scenario produces a non-empty Screen[] with §5.3-conforming shape', () => {
    const evalResult = evaluate(
      scenarioMap['import-cattle'].notification,
      adapter
    )
    const screens = resolveScreens(evalResult, journeyMap)

    expect(screens.length).toBeGreaterThan(0)

    const allowedStatuses = new Set([
      'complete',
      'incomplete',
      'cannotStartYet',
      'notApplicable'
    ])

    for (const screen of screens) {
      expect(screen).toMatchObject({
        screenId: expect.any(String),
        screenName: expect.any(String),
        sectionId: expect.any(String),
        sectionName: expect.any(String),
        status: expect.any(String),
        fields: expect.any(Array)
      })
      expect(allowedStatuses.has(screen.status)).toBe(true)
    }

    // Committed scenarios are all submittable: no incomplete or
    // cannotStartYet should appear; both complete and notApplicable
    // should be present (the latter exercising the all-inactive rule).
    const statuses = new Set(screens.map((s) => s.status))
    expect(statuses.has('complete')).toBe(true)
    expect(statuses.has('notApplicable')).toBe(true)
    expect(statuses.has('incomplete')).toBe(false)
    expect(statuses.has('cannotStartYet')).toBe(false)
  })
})
