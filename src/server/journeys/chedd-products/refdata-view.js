import { mapKeysDeep } from '#server/common/snake-to-camel.js'

/**
 * Refdata-view descriptor for the chedd-products journey.
 *
 * Single-grain: refdata stores routing/content under BARE commodity
 * codes, but the explorer invokes the view closures with `${code}|`
 * keys (config-routes.js `refdataKey` always appends `|`). So every
 * closure strips the key via `codeOf`. `commodityDetail`, by contrast,
 * receives the raw `{code}` route param and looks up the bare code
 * directly — do NOT append `|` there.
 *
 * Dimensions:
 *   - internalMarket — the option set the commodity is intended for (a
 *     named set in `definitions`; absent on the 31 anomaly commodities).
 *   - comboType — the combo options: the per-commodity override for the
 *     9 outliers, else the template's single complement-id option.
 * Details: the routing flag, product scalars, and the universal package
 * list.
 */

const codeOf = (key) => key.split('|')[0]

// The combo reconstruction the staging build deferred to read time:
// outliers carry an explicit option list; everyone else gets the
// template's single `{{complement}}` option with the complement id
// substituted in. A present-but-empty override (`[]`) is returned
// as-is — an explicit empty list means "no combo options", distinct
// from the no-override template default — so the `??` only falls
// through on a genuinely absent override.
const resolveComboType = (row) =>
  row?.combo_type_options_override ?? [
    { text: '', value: row?.combo_complement_id }
  ]

export const refdataView = (refdata) => {
  const { content, definitions, routing } = refdata
  return {
    dimensions: [
      {
        id: 'internalMarket',
        name: 'Internal market',
        // The dimension-block template renders each value as a string.
        // Surface "label (value)" so the notification mapping is legible:
        // the label is the human-facing option, the value is the
        // CommodityIntention enum written to consignment.intendedFor. The
        // structured {label,value} also stays on the JSON API via
        // commodityDetail.internalMarketSet.
        valuesFor: (k) =>
          (
            definitions.internal_market_sets[
              content[codeOf(k)]?.internal_market
            ] ?? []
          ).map((o) => `${o.label} (${o.value})`),
        sourceFor: (k) => content[codeOf(k)]?.internal_market ?? null
      },
      {
        id: 'comboType',
        name: 'Combo type',
        // One display string per option: the 9 outlier overrides carry a
        // meaningful `text` label; the single-template option has an empty
        // `text`, so fall back to the complement id (`value`).
        valuesFor: (k) =>
          resolveComboType(content[codeOf(k)]).map((o) => o.text || o.value)
      }
    ],
    details: [
      {
        id: 'routing',
        name: 'Routing flags',
        rowsFor: (k) => [
          {
            label: 'Has internal market',
            value: routing[codeOf(k)]?.has_internal_market ?? null
          }
        ]
      },
      {
        id: 'product',
        name: 'Product',
        rowsFor: (k) => {
          const c = content[codeOf(k)]
          return [
            {
              label: 'Product description',
              value: c?.product_description ?? null
            },
            {
              label: 'Line item complement',
              value: c?.line_item_complement ?? null
            },
            {
              label: 'Combo complement id',
              value: c?.combo_complement_id ?? null
            }
          ]
        }
      },
      {
        id: 'packages',
        name: 'Line item packages',
        rowsFor: () =>
          definitions.line_item_packages.map((p, i) => ({
            label: `Package ${i + 1}`,
            value: p
          }))
      }
    ]
  }
}

export const commodityKeys = (refdata) => Object.keys(refdata.content)

export const commodityDetail = (refdata, code, _species) => {
  // Single-grain: look up the BARE code (the route passes the raw
  // `{code}` param). There is no species axis here; `species` is
  // intentionally ignored — do NOT append `|`.
  const content = refdata.content[code]
  const routing = refdata.routing[code]
  if (content === undefined && routing === undefined) return null

  const setName = content?.internal_market
  const internalMarketSet = setName
    ? (refdata.definitions?.internal_market_sets?.[setName] ?? null)
    : null

  return {
    routingFlags: routing === undefined ? null : mapKeysDeep(routing),
    content: content === undefined ? null : mapKeysDeep(content),
    internalMarketSet,
    comboType: content ? mapKeysDeep(resolveComboType(content)) : null
  }
}
