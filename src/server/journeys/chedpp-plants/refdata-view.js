import { mapKeysDeep } from '#server/common/snake-to-camel.js'

/**
 * Refdata-view descriptor for the chedpp-plants journey.
 *
 * Reads the two-grain shape Story 03 Phase A produced
 * (`commodities[code]` + `species[code|eppo]` + per-commodity
 * `classes`). See features/journey-switching/02-journey-agnostic-variance.md.
 *
 * Four dimensions:
 *   - regulatory_authority (species-grain)
 *   - marketing_standard (species-grain)
 *   - validity_period (species-grain)
 *   - group (commodity-grain — derived from the code segment of the key)
 *
 * Three details:
 *   - commodity_flags (test_and_trial / finished_or_propagated / propagation)
 *   - classes (per-commodity quality classes)
 *   - varieties (per-species variety names)
 *
 * Plants has no set-name indirection, so the dimensions omit `sourceFor`.
 */

const codeOf = (key) => key.split('|')[0]

// Wrap a scalar lookup as a 1-element value list, dropping only the
// genuinely-absent case (undefined/null) — NOT legitimate falsy
// scalars like 0, '', or false. The §6 explicit-absence rule means a
// real `0` or empty string must still appear in the dimension's
// superset; only "this field isn't present" is suppressed.
const lookupAsList = (field, source) => (k) => {
  const v = source(k)?.[field]
  return v === undefined || v === null ? [] : [v]
}

export const refdataView = (refdata) => {
  const { species, commodities } = refdata
  const sp = (field) => lookupAsList(field, (k) => species[k])
  const com = (field) =>
    lookupAsList(field, (k) => commodities[codeOf(k)])

  return {
    dimensions: [
      // species-grain
      {
        id: 'regulatory_authority',
        name: 'Regulatory authority',
        valuesFor: sp('regulatory_authority')
      },
      {
        id: 'marketing_standard',
        name: 'Marketing standard',
        valuesFor: sp('marketing_standard')
      },
      {
        id: 'validity_period',
        name: 'Validity period',
        valuesFor: sp('validity_period')
      },
      // commodity-grain (derived from the key's code segment)
      {
        id: 'group',
        name: 'Commodity group',
        valuesFor: com('group')
      }
    ],
    details: [
      {
        id: 'commodity_flags',
        name: 'Commodity routing',
        rowsFor: (k) => {
          const c = commodities[codeOf(k)]
          return [
            {
              label: 'Test and trial',
              value: c?.requires_test_and_trial ?? null
            },
            {
              label: 'Finished or propagated',
              value: c?.requires_finished_or_propagated ?? null
            },
            { label: 'Propagation type', value: c?.propagation ?? null }
          ]
        }
      },
      {
        id: 'classes',
        name: 'Quality classes',
        rowsFor: (k) => {
          const classes = commodities[codeOf(k)]?.classes ?? []
          return classes.length === 0
            ? [{ label: 'Classes', value: null }]
            : classes.map((c, i) => ({ label: `Class ${i + 1}`, value: c }))
        }
      },
      {
        id: 'varieties',
        name: 'Varieties',
        rowsFor: (k) => {
          const vs = species[k]?.varieties ?? []
          return vs.length === 0
            ? [{ label: 'Varieties', value: null }]
            : vs.map((v, i) => ({ label: `Variety ${i + 1}`, value: v }))
        }
      }
    ]
  }
}

/**
 * The set of commodity keys the dropdown enumerates. Pre-normalisation
 * the dropdown used `routing` keys (5,710 entries). Post-normalisation
 * the equivalent universe is:
 *   - every species row: `species[code|eppo]` → 5,321 keys.
 *   - every PHSI-only commodity (a commodity with no species rows):
 *     represented as `code|` (matching the historical fallback key
 *     format).
 */
export const commodityKeys = (refdata) => {
  const speciesKeys = Object.keys(refdata.species)
  const commodityCodesWithSpecies = new Set(speciesKeys.map(codeOf))
  const phsiOnly = Object.keys(refdata.commodities)
    .filter((code) => !commodityCodesWithSpecies.has(code))
    .map((code) => `${code}|`)
  return [...speciesKeys, ...phsiOnly]
}

/**
 * Per-commodity driver for the API surface (D17 + D18).
 *
 * `commodityDetail(refdata, code)` — commodity-level lookup against
 * `refdata.commodities[code]`. Returns null if the code is missing.
 * Returned shape (camelCased): `{ group, requiresTestAndTrial,
 * requiresFinishedOrPropagated, propagation, classes }`.
 *
 * `commodityDetail(refdata, code, species)` — species-level lookup
 * against `refdata.species[`${code}|${species}`]`. Returns null if
 * the species row is missing. **No fallback** to the commodity row
 * (D17 — cross-grain bleed is forbidden). Returned shape (camelCased):
 * `{ regulatoryAuthority, marketingStandard, validityPeriod, varieties }`.
 *
 * Returns `null` on miss; route handler translates to 404.
 */
export const commodityDetail = (refdata, code, species) => {
  const hasSpecies = typeof species === 'string' && species.length > 0
  if (hasSpecies) {
    const row = refdata.species[`${code}|${species}`]
    return row === undefined ? null : mapKeysDeep(row)
  }
  const row = refdata.commodities[code]
  return row === undefined ? null : mapKeysDeep(row)
}
