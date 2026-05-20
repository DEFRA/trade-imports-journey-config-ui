/**
 * Contract tests for engine/evaluate-with-trace.js — owns protocol.md §5.2.
 *
 * Behaviour & risks:
 *   evaluateWithTrace(notification, adapter) returns the §5.1 EvaluationResult
 *   plus a `trace` per obligation. Risks: trace step shape drift, mismatched
 *   terminal step vs status, `condition` leaked onto unconditional traces (or
 *   missing on conditional), §5.2 mismatch-message format drift, equivalence
 *   broken on real notifications. Tests use hand-rolled adapters for the
 *   shape/throw/mismatch assertions and the committed eu-live-animals
 *   scenarios for the equivalence sweep. No mocks.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluate } from './evaluate.js'
import { evaluateWithTrace } from './evaluate-with-trace.js'
import { resolvers } from '../journeys/eu-live-animals/resolvers.js'
import { scenarioMap } from '../journeys/eu-live-animals/scenarios.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EU_LIVE_ANIMALS_DIR = join(__dirname, '../journeys/eu-live-animals')

// ---------------------------------------------------------------------------
// Hand-rolled minimal resolver for shape / variant / throw assertions
// ---------------------------------------------------------------------------

const minimalResolver = {
  facts: {
    purposeGroup: (n) => n?.partOne?.purpose?.purposeGroup ?? null
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

// ---------------------------------------------------------------------------
// Throws — inherits §5.1 set
// ---------------------------------------------------------------------------

describe('evaluateWithTrace — throws (inherited from §5.1)', () => {
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
    [
      'non-array obligations',
      {},
      { obligations: 'oops', refdata: {}, journeyResolver: minimalResolver },
      'adapter.obligations must be an array'
    ]
  ])('%s throws "%s"', (_label, notification, adapter, expectedMessage) => {
    expect(() => evaluateWithTrace(notification, adapter)).toThrow(expectedMessage)
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
    expect(() => evaluateWithTrace({}, adapter)).toThrow(
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
      evaluateWithTrace(
        { partOne: { purpose: { purposeGroup: 'Import' } } },
        adapter
      )
    ).toThrow(
      'Obligation "bad-test-obligation" references unknown test: "doesNotExist"'
    )
  })
})

// ---------------------------------------------------------------------------
// Terminal step ↔ status table — every §5.2 invariant in one adapter
// ---------------------------------------------------------------------------

describe('evaluateWithTrace — terminal step ↔ status correspondence', () => {
  // One adapter, one notification, six obligations — one per §5.2 terminal
  // step shape. Each row asserts the terminal step variant and the status
  // it must imply per §5.2.
  const variantAdapter = {
    obligations: [
      // action-check satisfied:true   → status satisfied
      { id: 'action-done', schemaPaths: [] },
      // action-check satisfied:false  → status unsatisfied
      // (handled by a separate notification; see test body)
      // satisfaction-check missing===0 → status satisfied
      { id: 'sat-complete', schemaPaths: ['notification.partOne.cphNumber'] },
      // satisfaction-check missing>0   → status unsatisfied
      { id: 'sat-incomplete', schemaPaths: ['notification.partOne.absentField'] },
      // deferred (fact null)           → status deferred
      {
        id: 'cond-deferred',
        schemaPaths: ['notification.x'],
        condition: { fact: 'missingFact', test: 'isTransit' }
      },
      // inactive (test active:false)   → status inactive
      {
        id: 'cond-inactive',
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

  const submittedNotification = {
    partOne: {
      submissionDate: '2026-05-20',
      cphNumber: '12/345/6789'
    }
  }

  const unsubmittedNotification = {
    partOne: {
      cphNumber: '12/345/6789'
    }
  }

  let submitted, unsubmitted
  beforeAll(() => {
    submitted = evaluateWithTrace(submittedNotification, variantAdapter)
    unsubmitted = evaluateWithTrace(unsubmittedNotification, variantAdapter)
  })

  const lastStep = (result, id) =>
    result.obligations.find((o) => o.id === id).trace.steps.at(-1)

  const statusOf = (result, id) =>
    result.obligations.find((o) => o.id === id).status

  it('action-check satisfied:true → status satisfied', () => {
    expect(statusOf(submitted, 'action-done')).toBe('satisfied')
    expect(lastStep(submitted, 'action-done')).toMatchObject({
      step: 'action-check',
      satisfied: true
    })
  })

  it('action-check satisfied:false → status unsatisfied', () => {
    expect(statusOf(unsubmitted, 'action-done')).toBe('unsatisfied')
    expect(lastStep(unsubmitted, 'action-done')).toMatchObject({
      step: 'action-check',
      satisfied: false
    })
  })

  it('satisfaction-check missing===0 → status satisfied', () => {
    expect(statusOf(submitted, 'sat-complete')).toBe('satisfied')
    expect(lastStep(submitted, 'sat-complete')).toMatchObject({
      step: 'satisfaction-check',
      missing: 0
    })
  })

  it('satisfaction-check missing>0 → status unsatisfied', () => {
    expect(statusOf(submitted, 'sat-incomplete')).toBe('unsatisfied')
    expect(lastStep(submitted, 'sat-incomplete')).toMatchObject({
      step: 'satisfaction-check'
    })
    expect(lastStep(submitted, 'sat-incomplete').missing).toBeGreaterThan(0)
  })

  it('deferred step → status deferred', () => {
    expect(statusOf(submitted, 'cond-deferred')).toBe('deferred')
    expect(lastStep(submitted, 'cond-deferred')).toMatchObject({
      step: 'deferred'
    })
    expect(lastStep(submitted, 'cond-deferred').reason).toBe(
      'missingFact not yet provided'
    )
  })

  it('inactive step → status inactive', () => {
    expect(statusOf(submitted, 'cond-inactive')).toBe('inactive')
    expect(lastStep(submitted, 'cond-inactive')).toMatchObject({
      step: 'inactive'
    })
    expect(lastStep(submitted, 'cond-inactive').reason).toBe(
      'purposeGroup "Import" is not a transit purpose'
    )
  })

  it('satisfaction-check pathDetails count matches paths', () => {
    const step = lastStep(submitted, 'sat-complete')
    expect(step.paths).toBe(1)
    expect(step.pathDetails).toHaveLength(1)
    expect(step.pathDetails[0]).toEqual({
      path: 'notification.partOne.cphNumber',
      satisfied: true
    })
  })
})

// ---------------------------------------------------------------------------
// Trace shape: conditional vs unconditional
// ---------------------------------------------------------------------------

describe('evaluateWithTrace — trace.type and trace.condition discrimination', () => {
  it('unconditional obligation → trace.type "unconditional", no condition field', () => {
    const adapter = {
      obligations: [{ id: 'plain', schemaPaths: ['notification.x'] }],
      refdata: {},
      journeyResolver: minimalResolver
    }
    const result = evaluateWithTrace({ x: 'present' }, adapter)
    const { trace } = result.obligations[0]

    expect(trace.type).toBe('unconditional')
    expect('condition' in trace).toBe(false)
    // First (and only) step is the terminal step — no extract-fact/apply-test.
    expect(trace.steps).toHaveLength(1)
    expect(trace.steps[0].step).toBe('satisfaction-check')
  })

  it('conditional obligation → trace.type "conditional", condition copied verbatim, informational steps precede terminal', () => {
    const conditionRef = {
      fact: 'purposeGroup',
      test: 'isTransit',
      description: 'Active when purposeGroup is a transit purpose.'
    }
    const adapter = {
      obligations: [
        {
          id: 'transit-routing',
          schemaPaths: ['notification.x'],
          condition: conditionRef
        }
      ],
      refdata: {},
      journeyResolver: minimalResolver
    }
    const result = evaluateWithTrace(
      { partOne: { purpose: { purposeGroup: 'Import' } } },
      adapter
    )
    const { trace } = result.obligations[0]

    expect(trace.type).toBe('conditional')
    expect(trace.condition).toEqual(conditionRef)
    // Steps: extract-fact → apply-test → inactive (terminal)
    expect(trace.steps.map((s) => s.step)).toEqual([
      'extract-fact',
      'apply-test',
      'inactive'
    ])
    expect(trace.steps[0]).toMatchObject({
      step: 'extract-fact',
      fact: 'purposeGroup',
      value: 'Import'
    })
    expect(trace.steps[1]).toMatchObject({
      step: 'apply-test',
      test: 'isTransit',
      result: {
        active: false,
        reason: 'purposeGroup "Import" is not a transit purpose'
      }
    })
  })

  it('conditional + deferred obligation → trace ends after extract-fact with deferred step (no apply-test)', () => {
    const adapter = {
      obligations: [
        {
          id: 'deferred-cond',
          schemaPaths: ['notification.x'],
          condition: { fact: 'purposeGroup', test: 'isTransit' }
        }
      ],
      refdata: {},
      journeyResolver: minimalResolver
    }
    const result = evaluateWithTrace({}, adapter)
    const { trace } = result.obligations[0]

    expect(trace.steps.map((s) => s.step)).toEqual([
      'extract-fact',
      'deferred'
    ])
    expect(trace.steps[0]).toMatchObject({
      step: 'extract-fact',
      fact: 'purposeGroup',
      value: null
    })
  })
})

// ---------------------------------------------------------------------------
// Status equivalence with evaluate() over every committed scenario
// ---------------------------------------------------------------------------

describe('evaluateWithTrace — status equivalence with evaluate()', () => {
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

  it.each([
    ['empty notification', {}],
    ...Object.entries(scenarioMap).map(([key, { notification }]) => [
      key,
      notification
    ])
  ])('%s: traced status matches canonical for every obligation', (_label, notification) => {
    const canonical = evaluate(notification, adapter)
    const traced = evaluateWithTrace(notification, adapter)

    expect(traced.obligations.map((o) => ({ id: o.id, status: o.status }))).toEqual(
      canonical.obligations.map((o) => ({ id: o.id, status: o.status }))
    )
    expect(traced.summary).toEqual(canonical.summary)
  })
})

// ---------------------------------------------------------------------------
// §5.2 mismatch throw — exact protocol message format
// ---------------------------------------------------------------------------

describe('evaluateWithTrace — status mismatch throw (§5.2 safety net)', () => {
  it('throws "Status mismatch for <id>: Traced: <s1>, Canonical: <s2>" when traced status diverges from canonical', () => {
    // Contrive divergence: a stateful test fn that returns active:true on its
    // first invocation (canonical pass through evaluate()) and active:false
    // on its second (trace pass re-walking the obligations). This forces
    // canonical → satisfied/unsatisfied and traced → inactive.
    let callCount = 0
    const adapter = {
      obligations: [
        {
          id: 'flaky',
          schemaPaths: [],
          condition: { fact: 'always', test: 'flipsOnSecondCall' }
        }
      ],
      refdata: {},
      journeyResolver: {
        facts: { always: () => 'value' },
        tests: {
          flipsOnSecondCall: () => {
            callCount++
            return callCount === 1
              ? { active: true, reason: 'first call' }
              : { active: false, reason: 'second call' }
          }
        },
        submissionDatePath: 'notification.partOne.submissionDate'
      }
    }

    expect(() =>
      evaluateWithTrace({ partOne: { submissionDate: '2026-05-20' } }, adapter)
    ).toThrow('Status mismatch for "flaky": Traced: inactive, Canonical: satisfied')
  })
})