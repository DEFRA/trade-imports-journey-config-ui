/**
 * CHED-D (chedd-products) refdata transform.
 *
 * Projects the field-config staging artifact
 * (`features/chedd-config/chedd-products-staging.json`) into the
 * journey `refdata.json` the evaluation engine consumes. Single-grain,
 * keyed by bare commodity code (CHED-D has no species axis).
 *
 * `buildRefdata` is pure (data in, data out — no I/O, no clock). The
 * thin `main()` reads the staging artifact and writes `refdata.json`
 * beside this file; it runs only when invoked as a script
 * (`node src/server/journeys/chedd-products/build-refdata.js`), so the
 * committed test can import `buildRefdata` without side effects.
 *
 * Determinism: `_meta` carries the staging artifact's own
 * `generated_at` as provenance — never a wall-clock — so re-running the
 * build leaves the committed `refdata.json` byte-identical. See
 * `features/chedd-config/01-refdata-transform.md`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const SET_PREFIX = 'internalMarket_set_'

/**
 * Project one staging content row to its refdata shape: rename
 * `internalMarket`→`internal_market` (omitted entirely when the source
 * row has none — the anomalies) and `species_description`→
 * `product_description`; drop the redundant `complement_id`; carry
 * `combo_type_options_override` only where the source has it.
 */
const projectRow = (row) => {
  const out = {}
  if ('internalMarket' in row) out.internal_market = row.internalMarket
  out.product_description = row.species_description
  out.line_item_complement = row.line_item_complement
  out.combo_complement_id = row.combo_complement_id
  if ('combo_type_options_override' in row) {
    out.combo_type_options_override = row.combo_type_options_override
  }
  return out
}

export const buildRefdata = (staging) => {
  const content = Object.fromEntries(
    Object.entries(staging.content).map(([code, row]) => [code, projectRow(row)])
  )

  const internalMarketSets = Object.fromEntries(
    Object.entries(staging.definitions)
      .filter(([name]) => name.startsWith(SET_PREFIX))
      .map(([name, wrapper]) => [name, wrapper.values])
  )

  const rows = Object.values(content)

  return {
    _meta: {
      source: {
        staging_artifact: 'features/chedd-config/chedd-products-staging.json',
        staging_generated_at: staging.metadata.generated_at,
        cert_type: staging.metadata.certificate_type,
        part: staging.metadata.part_filter
      },
      counts: {
        commodities: rows.length,
        internal_market_sets: Object.keys(internalMarketSets).length,
        anomalies_no_internal_market: rows.filter(
          (r) => !('internal_market' in r)
        ).length,
        combo_overrides: rows.filter(
          (r) => 'combo_type_options_override' in r
        ).length
      }
    },
    routing: staging.routing,
    content,
    definitions: {
      internal_market_sets: internalMarketSets,
      line_item_packages: staging.universal_data.line_item_packages
    }
  }
}

const main = () => {
  const repoRoot = join(import.meta.dirname, '../../../..')
  const stagingPath = join(
    repoRoot,
    'features/chedd-config/chedd-products-staging.json'
  )
  const outputPath = join(import.meta.dirname, 'refdata.json')

  const staging = JSON.parse(readFileSync(stagingPath, 'utf-8'))
  const refdata = buildRefdata(staging)
  writeFileSync(outputPath, JSON.stringify(refdata, null, 2) + '\n', 'utf-8')

  const { counts } = refdata._meta
  console.log(
    `chedd refdata: ${counts.commodities} commodities, ` +
      `${counts.anomalies_no_internal_market} anomalies, ` +
      `${counts.combo_overrides} combo overrides -> ${relative(repoRoot, outputPath)}`
  )
}

if (process.argv[1] === import.meta.filename) {
  main()
}
