import { mapKeysDeep } from '#server/common/snake-to-camel.js'

/**
 * Refdata-view descriptor for the eu-live-animals journey.
 *
 * The explorer's commodity-config page reads this descriptor (via
 * `getJourney(journeyKey)`) to render any journey's refdata generically.
 *
 * Two concepts (see features/journey-switching/02-journey-agnostic-variance.md):
 * - **dimension** — a variance-annotated value list (common/specific
 *   tagging + an explicit "excluded" list). For animals: Purpose,
 *   Identifiers — each a named set referenced from `content[k]`.
 * - **detail** — a labelled group of rows shown as-is, no variance.
 *   For animals: Quantity type, Routing Flags.
 *
 * `sourceFor` on a dimension is optional; here it surfaces the set
 * NAME (e.g. "purpose_set_05") so the page keeps showing the indirection
 * label it always has.
 */

export const refdataView = (refdata) => {
  const { content, definitions, routing } = refdata
  return {
    dimensions: [
      {
        id: 'purpose',
        name: 'Purpose',
        valuesFor: (k) => definitions.purpose_sets[content[k]?.purpose] ?? [],
        sourceFor: (k) => content[k]?.purpose ?? null
      },
      {
        id: 'identifiers',
        name: 'Identifiers',
        valuesFor: (k) =>
          definitions.identifier_sets[content[k]?.identifiers] ?? [],
        sourceFor: (k) => content[k]?.identifiers ?? null
      }
    ],
    details: [
      {
        id: 'quantity',
        name: 'Quantity type',
        rowsFor: (k) => {
          const qt = definitions.quantity_types[content[k]?.quantity]
          return [
            { label: 'Label', value: qt?.label ?? null },
            { label: 'Field name', value: qt?.name ?? null },
            { label: 'ID', value: qt?.id ?? null }
          ]
        }
      },
      {
        id: 'routing',
        name: 'Routing Flags',
        rowsFor: (k) => [
          { label: 'CPH Number', value: routing[k]?.cph_number ?? null },
          {
            label: 'Permanent Address',
            value: routing[k]?.permanent_address ?? null
          },
          {
            label: 'Transporter Address',
            value: routing[k]?.transporter_address ?? null
          }
        ]
      }
    ]
  }
}

/**
 * The set of commodity keys the dropdown enumerates. For animals the
 * source has always been `Object.keys(refdata.routing)`.
 */
export const commodityKeys = (refdata) => Object.keys(refdata.routing)

/**
 * Per-commodity driver for the API surface (D17 + D18).
 *
 * `commodityDetail(refdata, code)` — species-agnostic lookup against
 * the `${code}|` row in routing and content.
 * `commodityDetail(refdata, code, species)` — species-specific lookup
 * with transparent fallback to the species-agnostic row when the
 * specific row is missing in BOTH routing and content.
 *
 * Returns `null` when both routing and content miss (route handler
 * translates to 404). Partial hits — only routing OR only content
 * present — return a composite with the missing half as `null`,
 * surfacing real data mismatches rather than hiding them.
 *
 * Response keys are camelCase (D18) via {@link mapKeysDeep}. The
 * `identifierSet` field is the resolved array from
 * `refdata.definitions.identifier_sets`; `null` when the content's
 * identifier name doesn't resolve.
 */
export const commodityDetail = (refdata, code, species) => {
  const hasSpecies = typeof species === 'string' && species.length > 0
  const specificKey = hasSpecies ? `${code}|${species}` : null
  const agnosticKey = `${code}|`

  // Pick the lookup key JOINTLY across routing and content so the two
  // tables never disagree on grain. If species was requested AND at
  // least one of routing/content has the specific row, use the specific
  // key everywhere; otherwise both tables resolve against the species-
  // agnostic key. This keeps partial-hit composites honest: missing
  // halves are visibly null rather than silently filled from the
  // wrong grain.
  const specificPresent =
    specificKey !== null &&
    (refdata.routing[specificKey] !== undefined ||
      refdata.content[specificKey] !== undefined)
  const key = specificPresent ? specificKey : agnosticKey

  const routingRow = refdata.routing[key]
  const contentRow = refdata.content[key]

  if (routingRow === undefined && contentRow === undefined) return null

  const identifierName = contentRow?.identifiers
  const identifierSet = identifierName
    ? (refdata.definitions?.identifier_sets?.[identifierName] ?? null)
    : null

  return {
    routingFlags: routingRow === undefined ? null : mapKeysDeep(routingRow),
    content: contentRow === undefined ? null : mapKeysDeep(contentRow),
    identifierSet
  }
}
