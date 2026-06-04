import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from '../../server.js'
import { buildCommodityValue, computePageVariance } from './page-variance.js'

/**
 * Behaviour & intent (Story 06):
 *   `page-variance.js` derives, per selected commodity, which screens
 *   in the active journey would be present. The panel renders one row
 *   per screen, OR-ing each screen's commodity-fact conditional
 *   obligations into a single Yes/No.
 *
 *   The five risks the tests guard against:
 *     1. Silent shape mismatch between the constructed commodity value
 *        and what `resolvers.tests` actually read.
 *     2. Grouping bug: one row per obligation instead of per screen.
 *     3. Purpose-conditional obligations leaking into the panel.
 *     4. Predicate wired to wrong refdata - verbatim reasons catch it.
 *     5. PHSI-only key `06042090|` producing `undefined` rather than `''`
 *        for the species shape, which would break predicate destructuring.
 */

describe('buildCommodityValue', () => {
  test.each([
    [
      'eu-live-animals',
      '102|Bos taurus',
      { id: '102', species: { name: 'Bos taurus' } }
    ],
    [
      'chedpp-plants',
      '0805108010|CIDAU',
      { id: '0805108010', species: { eppoCode: 'CIDAU' } }
    ]
  ])(
    'happy path %s + %s produces the journey-shaped commodity',
    (journeyKey, commodityKey, expected) => {
      expect(buildCommodityValue(journeyKey, commodityKey)).toEqual(expected)
    }
  )

  test('PHSI-only plants key with trailing pipe leaves species.eppoCode as the empty string', () => {
    // The empty-string boundary matters: a `species.eppoCode` of
    // `undefined` would break the resolver's refdata key construction
    // (`${id}|${eppoCode}` would produce literal "undefined").
    const result = buildCommodityValue('chedpp-plants', '06042090|')
    expect(result.species.eppoCode).toBe('')
    expect(result.id).toBe('06042090')
  })

  test('unknown journey key throws a named error', () => {
    expect(() =>
      buildCommodityValue('not-a-journey', '102|Bos taurus')
    ).toThrow(
      "buildCommodityValue: unknown journey 'not-a-journey'"
    )
  })
})

describe('computePageVariance', () => {
  let server
  let engine

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
    engine = server.app.evaluationEngine
  })

  afterAll(async () => {
    if (server) {
      await server.stop({ timeout: 0 })
    }
  })

  const findScreen = (rows, screenName) =>
    rows.find((r) => r.screenName === screenName)

  test.each([null, undefined])(
    'returns [] when commodityKey is %s',
    (commodityKey) => {
      const journey = engine.getJourney('chedpp-plants')
      expect(
        computePageVariance(journey, 'chedpp-plants', commodityKey)
      ).toEqual([])
    }
  )

  test('plants HMI+GMS commodity activates the GMS declaration screen with the verbatim active reason', () => {
    const journey = engine.getJourney('chedpp-plants')
    const rows = computePageVariance(
      journey,
      'chedpp-plants',
      '0805108010|CIDAU'
    )
    const gms = findScreen(rows, 'GMS declaration')
    expect(gms).toBeDefined()
    expect(gms.activates).toBe(true)
    expect(gms.drivers).toHaveLength(1)
    expect(gms.drivers[0].reason).toBe(
      'HMI-inspected species with GMS marketing standard'
    )
  })

  test('plants JOINT+GMS commodity does NOT activate the GMS declaration screen and pins the negative reason', () => {
    const journey = engine.getJourney('chedpp-plants')
    const rows = computePageVariance(
      journey,
      'chedpp-plants',
      '0709999090|DATME'
    )
    const gms = findScreen(rows, 'GMS declaration')
    expect(gms).toBeDefined()
    expect(gms.activates).toBe(false)
    expect(gms.drivers).toHaveLength(1)
    expect(gms.drivers[0].reason).toBe(
      'species is not HMI+GMS (no GMS declaration required)'
    )
  })

  test('animals "Additional details" screen groups two drivers into one row', () => {
    // Targets the grouping risk: this screen has two different
    // conditional obligations (animal-certification +
    // animal-weaning-status). The panel must emit one row, not two,
    // and its `activates` must be `drivers.some(d => d.active)`.
    const journey = engine.getJourney('eu-live-animals')
    const rows = computePageVariance(journey, 'eu-live-animals', '102|Bos taurus')
    const additional = findScreen(rows, 'Additional details')
    expect(additional).toBeDefined()
    expect(additional.drivers).toHaveLength(2)
    const ids = additional.drivers.map((d) => d.id).sort()
    expect(ids).toEqual(['animal-certification', 'animal-weaning-status'])
    expect(additional.activates).toBe(
      additional.drivers.some((d) => d.active)
    )
  })

  test('obligation referencing an unknown resolver test throws with a named error', () => {
    // Catches config-author typos: an obligations.json entry whose
    // condition.test does not exist in resolvers.tests would otherwise
    // surface as a cryptic TypeError ("test is not a function").
    const plants = engine.getJourney('chedpp-plants')
    const broken = {
      ...plants,
      obligations: plants.obligations.map((o) =>
        o.id === 'gms-declaration'
          ? { ...o, condition: { ...o.condition, test: 'does-not-exist' } }
          : o
      )
    }
    expect(() =>
      computePageVariance(broken, 'chedpp-plants', '0805108010|CIDAU')
    ).toThrow(
      "page-variance: obligation 'gms-declaration' references unknown test 'does-not-exist'"
    )
  })

  test('animals routing flags map cleanly to the three single-driver screens, and purpose-conditionals do not appear', () => {
    const journey = engine.getJourney('eu-live-animals')
    const rows = computePageVariance(journey, 'eu-live-animals', '102|Bos taurus')

    // Per `eu-live-animals/refdata.json` for 102|Bos taurus:
    // cph_number=true, permanent_address=false, transporter_address=true.
    expect(findScreen(rows, 'CPH number').activates).toBe(true)
    expect(findScreen(rows, 'Permanent addresses for pets').activates).toBe(
      false
    )
    expect(findScreen(rows, 'Transporter').activates).toBe(true)

    // Purpose-conditional obligations (transit-routing) sit on
    // "Reason for importing" and must not be in the panel.
    const screenNames = rows.map((r) => r.screenName)
    expect(screenNames).not.toContain('Reason for importing')
  })
})
