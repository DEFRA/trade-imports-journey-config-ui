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
        valuesFor: (k) =>
          definitions.purpose_sets[content[k]?.purpose] ?? [],
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
