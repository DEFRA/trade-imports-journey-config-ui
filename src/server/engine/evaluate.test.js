/**
 * Contract tests for engine/evaluate.js — owns protocol.md §5.1.
 *
 * Behaviour & risks (per .claude/skills/valuable-unit-tests.md):
 *   evaluate(notification, adapter) classifies each obligation into one of
 *   four discriminated shapes (satisfied / unsatisfied / deferred / inactive)
 *   and emits a Summary with two arithmetic invariants. Risks: throw-message
 *   drift (consumers depend on exact text), shape leakage (e.g. `reason` on
 *   a satisfied result), submittable inverted around `inactive`, scenario
 *   drift (committed adapters silently stop being submittable). Tests use
 *   minimal hand-rolled adapters for the shape/throw assertions and real
 *   journey data only for the scenario sweep. No mocks.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluate } from './evaluate.js'
import { resolvers } from '../journeys/eu-live-animals/resolvers.js'
import { scenarioMap } from '../journeys/eu-live-animals/scenarios.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EU_LIVE_ANIMALS_DIR = join(__dirname, '../journeys/eu-live-animals')

// ---------------------------------------------------------------------------
// Hand-rolled minimal adapter for shape / variant / throw assertions
// ---------------------------------------------------------------------------

const minimalResolver = {
  facts: {
    purposeGroup: (n) => n?.partOne?.purpose?.purposeGroup ?? null
  },
  tests: {
    isTransit: (value) =>
      value === 'Transit'
        ? { active: true, reason: 'transit purpose' }
        : { active: false, reason: `purposeGroup "${value}" is not a transit purpose` }
  },
  submissionDatePath: 'notification.partOne.submissionDate'
}

// ---------------------------------------------------------------------------
// Throws — protocol §5.1 exact messages
// ---------------------------------------------------------------------------

describe('evaluate — throws', () => {
  const validAdapter = {
    obligations: [],
    refdata: {},
    journeyResolver: minimalResolver
  }

  it.each([
    ['null notification', null, validAdapter, 'notification must be a non-null object'],
    ['undefined notification', undefined, validAdapter, 'notification must be a non-null object'],
    ['string notification', 'oops', validAdapter, 'notification must be a non-null object'],
    ['null adapter', {}, null, 'adapter must be a non-null object'],
    ['undefined adapter', {}, undefined, 'adapter must be a non-null object'],
    ['string adapter', {}, 'oops', 'adapter must be a non-null object'],
    [
      'non-array obligations',
      {},
      { obligations: 'oops', refdata: {}, journeyResolver: minimalResolver },
      'adapter.obligations must be an array'
    ]
  ])('%s throws "%s"', (_label, notification, adapter, expectedMessage) => {
    expect(() => evaluate(notification, adapter)).toThrow(expectedMessage)
  })

  it('unknown fact throws with protocol-exact message', () => {
    const adapter = {
      obligations: [
        {
          id: 'bad-fact-obligation',
          schemaPaths: ['notification.x'],
          condition: { fact: 'doesNotExist', test: 'isTransit' }
        }
      ],
      refdata: {},
      journeyResolver: minimalResolver
    }
    expect(() => evaluate({}, adapter)).toThrow(
      'Obligation "bad-fact-obligation" references unknown fact: "doesNotExist"'
    )
  })

  it('unknown test throws with protocol-exact message', () => {
    const adapter = {
      obligations: [
        {
          id: 'bad-test-obligation',
          schemaPaths: ['notification.x'],
          condition: { fact: 'purposeGroup', test: 'doesNotExist' }
        }
      ],
      refdata: {},
      journeyResolver: minimalResolver
    }
    expect(() =>
      evaluate({ partOne: { purpose: { purposeGroup: 'Import' } } }, adapter)
    ).toThrow(
      'Obligation "bad-test-obligation" references unknown test: "doesNotExist"'
    )
  })
})

// ---------------------------------------------------------------------------
// Four status variants in one evaluation — proves shape discrimination
// and summary arithmetic in one shot.
// ---------------------------------------------------------------------------

describe('evaluate — status variants & shape discrimination', () => {
  // One adapter that triggers each of the four statuses against one
  // notification: separate facts let us land deferred vs inactive
  // independently (one fact returns null → deferred; the other returns a
  // value that fails the test → inactive).
  const variantAdapter = {
    obligations: [
      {
        id: 'all-paths-present',
        schemaPaths: ['notification.partOne.cphNumber']
      },
      {
        id: 'missing-path',
        schemaPaths: ['notification.partOne.absentField']
      },
      {
        id: 'fact-absent',
        schemaPaths: ['notification.x'],
        condition: { fact: 'missingFact', test: 'isTransit' }
      },
      {
        id: 'test-fails',
        schemaPaths: ['notification.x'],
        condition: { fact: 'presentFact', test: 'isTransit' }
      }
    ],
    refdata: {},
    journeyResolver: {
      facts: {
        missingFact: () => null,
        presentFact: () => 'Import'
      },
      tests: {
        isTransit: (value) =>
          value === 'Transit'
            ? { active: true, reason: 'transit purpose' }
            : {
                active: false,
                reason: `purposeGroup "${value}" is not a transit purpose`
              }
      },
      submissionDatePath: 'notification.partOne.submissionDate'
    }
  }

  const notification = {
    partOne: {
      cphNumber: '12/345/6789'
    }
  }

  let result
  beforeAll(() => {
    result = evaluate(notification, variantAdapter)
  })

  it('emits one obligation per input', () => {
    expect(result.obligations).toHaveLength(4)
  })

  it('satisfied obligation: { id, status, missingPaths: [] }, no reason', () => {
    const o = result.obligations.find((x) => x.id === 'all-paths-present')
    expect(o).toEqual({
      id: 'all-paths-present',
      status: 'satisfied',
      missingPaths: []
    })
    expect(o).not.toHaveProperty('reason')
  })

  it('unsatisfied obligation: missingPaths lists absent paths, no reason', () => {
    const o = result.obligations.find((x) => x.id === 'missing-path')
    expect(o).toEqual({
      id: 'missing-path',
      status: 'unsatisfied',
      missingPaths: ['notification.partOne.absentField']
    })
    expect(o).not.toHaveProperty('reason')
  })

  it('deferred obligation: reason is "<fact> not yet provided", no missingPaths', () => {
    const o = result.obligations.find((x) => x.id === 'fact-absent')
    expect(o).toEqual({
      id: 'fact-absent',
      status: 'deferred',
      reason: 'missingFact not yet provided'
    })
    expect(o).not.toHaveProperty('missingPaths')
  })

  it('inactive obligation: reason from test, no missingPaths', () => {
    const o = result.obligations.find((x) => x.id === 'test-fails')
    expect(o).toEqual({
      id: 'test-fails',
      status: 'inactive',
      reason: 'purposeGroup "Import" is not a transit purpose'
    })
    expect(o).not.toHaveProperty('missingPaths')
  })

  it('summary: counts sum to total', () => {
    const { satisfied, unsatisfied, deferred, inactive, total } = result.summary
    expect(satisfied + unsatisfied + deferred + inactive).toBe(total)
    expect(total).toBe(4)
  })

  it('summary: submittable is false when unsatisfied or deferred present', () => {
    expect(result.summary).toMatchObject({
      satisfied: 1,
      unsatisfied: 1,
      deferred: 1,
      inactive: 1,
      total: 4,
      submittable: false
    })
  })
})

// ---------------------------------------------------------------------------
// Submittable inversion trap: inactive counts toward submittable.
// ---------------------------------------------------------------------------

describe('evaluate — submittable rule (inactive counts toward submittable)', () => {
  it('submittable: true when every obligation is satisfied or inactive', () => {
    const adapter = {
      obligations: [
        { id: 'sat', schemaPaths: ['notification.a'] },
        {
          id: 'inact',
          schemaPaths: ['notification.b'],
          condition: { fact: 'x', test: 'fail' }
        }
      ],
      refdata: {},
      journeyResolver: {
        facts: { x: () => 'value' },
        tests: { fail: () => ({ active: false, reason: 'nope' }) },
        submissionDatePath: 'notification.partOne.submissionDate'
      }
    }
    const result = evaluate({ a: 'present' }, adapter)
    expect(result.summary.submittable).toBe(true)
    expect(result.summary).toMatchObject({
      satisfied: 1,
      unsatisfied: 0,
      deferred: 0,
      inactive: 1,
      total: 2
    })
  })
})

// ---------------------------------------------------------------------------
// Action-only obligation (schemaPaths: [])
// ---------------------------------------------------------------------------

describe('evaluate — action-only obligation', () => {
  const adapter = {
    obligations: [{ id: 'sign-here', schemaPaths: [] }],
    refdata: {},
    journeyResolver: {
      facts: {},
      tests: {},
      submissionDatePath: 'notification.partOne.submissionDate'
    }
  }

  it('satisfied when submissionDatePath is populated; missingPaths is []', () => {
    const result = evaluate(
      { partOne: { submissionDate: '2026-05-20' } },
      adapter
    )
    expect(result.obligations[0]).toEqual({
      id: 'sign-here',
      status: 'satisfied',
      missingPaths: []
    })
  })

  it('unsatisfied when submissionDatePath is empty; missingPaths is []', () => {
    const result = evaluate({}, adapter)
    expect(result.obligations[0]).toEqual({
      id: 'sign-here',
      status: 'unsatisfied',
      missingPaths: []
    })
  })
})

// ---------------------------------------------------------------------------
// Real-data integration: every committed scenario is submittable.
// ---------------------------------------------------------------------------

describe('evaluate — committed eu-live-animals scenarios', () => {
  let adapter

  beforeAll(async () => {
    const [obligationsFile, refdataFile] = await Promise.all([
      readFile(join(EU_LIVE_ANIMALS_DIR, 'obligations.json'), 'utf-8'),
      readFile(join(EU_LIVE_ANIMALS_DIR, 'refdata.json'), 'utf-8')
    ])
    adapter = {
      obligations: JSON.parse(obligationsFile).obligations,
      refdata: JSON.parse(refdataFile),
      journeyResolver: resolvers
    }
  })

  it.each(Object.entries(scenarioMap))(
    'scenario "%s" evaluates submittable: true',
    (_key, { notification }) => {
      const result = evaluate(notification, adapter)
      expect(result.summary.submittable).toBe(true)
      expect(result.summary.unsatisfied).toBe(0)
      expect(result.summary.deferred).toBe(0)
    }
  )
})
