/**
 * Invariant tests for the normalised chedpp-plants refdata.
 *
 * These run on every CI build and guard the *output* of the one-shot
 * migration (Story 03 Phase A). The migration tooling itself is
 * git-ignored, so this is the durable guarantee that the committed data
 * stays coherent — referential integrity, no legacy keys, classes
 * well-formed, _meta provenance present.
 */
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const refdata = JSON.parse(
  readFileSync(join(here, 'refdata.json'), 'utf-8')
)

describe('chedpp-plants refdata.json — normalised shape invariants', () => {
  // -------------------------------------------------------------------------
  // Shape: no legacy keys, both grain tables present.
  // -------------------------------------------------------------------------

  test('uses the normalised two-grain shape (no routing / content / definitions)', () => {
    expect(refdata).toHaveProperty('commodities')
    expect(refdata).toHaveProperty('species')
    expect(refdata).not.toHaveProperty('routing')
    expect(refdata).not.toHaveProperty('content')
    expect(refdata).not.toHaveProperty('definitions')
  })

  test('commodities and species are non-empty objects', () => {
    expect(Object.keys(refdata.commodities).length).toBeGreaterThan(0)
    expect(Object.keys(refdata.species).length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // Referential integrity: every species[code|eppo] has a matching
  // commodities[code]. This is the safety net for the most likely
  // migration bug (orphaned species rows).
  // -------------------------------------------------------------------------

  test('every species["code|eppo"] resolves to a commodities["code"]', () => {
    const orphans = []
    for (const key of Object.keys(refdata.species)) {
      const code = key.split('|')[0]
      if (!refdata.commodities[code]) {
        orphans.push(key)
      }
    }
    expect(orphans).toEqual([])
  })

  // -------------------------------------------------------------------------
  // Field allow-lists. Anything outside these is either a derived flag that
  // leaked in (regression) or a new field added without a model-doc update.
  // resolvers.js computes the engine-facing booleans at read time — they
  // must not live on refdata.
  // -------------------------------------------------------------------------

  const COMMODITY_FIELDS = new Set([
    'group',
    'requires_test_and_trial',
    'requires_finished_or_propagated',
    'propagation',
    'classes'
  ])

  const SPECIES_FIELDS = new Set([
    'regulatory_authority',
    'marketing_standard',
    'validity_period',
    'varieties'
  ])

  test('commodity rows only carry the allow-listed fields', () => {
    const unexpected = {}
    for (const [code, c] of Object.entries(refdata.commodities)) {
      const extra = Object.keys(c).filter((k) => !COMMODITY_FIELDS.has(k))
      if (extra.length) unexpected[code] = extra
    }
    expect(unexpected).toEqual({})
  })

  test('species rows only carry the allow-listed fields', () => {
    const unexpected = {}
    for (const [key, s] of Object.entries(refdata.species)) {
      const extra = Object.keys(s).filter((k) => !SPECIES_FIELDS.has(k))
      if (extra.length) unexpected[key] = extra
    }
    expect(unexpected).toEqual({})
  })

  // -------------------------------------------------------------------------
  // Classes (where present) must be well-formed.
  // -------------------------------------------------------------------------

  test('commodities[code].classes (where present) is a non-empty array of strings', () => {
    const bad = []
    for (const [code, c] of Object.entries(refdata.commodities)) {
      if (!('classes' in c)) continue
      if (
        !Array.isArray(c.classes) ||
        c.classes.length === 0 ||
        !c.classes.every((cls) => typeof cls === 'string' && cls.length > 0)
      ) {
        bad.push(code)
      }
    }
    expect(bad).toEqual([])
  })

  // -------------------------------------------------------------------------
  // _meta provenance — keeps the snapshot identity discoverable.
  // -------------------------------------------------------------------------

  test('_meta records the commodity_class revision used to build classes', () => {
    expect(refdata._meta).toBeDefined()
    expect(refdata._meta.source?.commodity_class_revision).toMatch(
      /^IMTA-\d+$/
    )
  })
})
