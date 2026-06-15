/**
 * Nunjucks filter that transforms screen fields into govukTable row format.
 *
 * Used by the journey view to render field-level detail with obligation status tags.
 * Keeps HTML construction in the template layer rather than the controller.
 *
 * Produces 5 columns:
 * | Label | Field name | Obligation | Status | Conditions |
 *
 * @param {Array<Object>} fields - Screen fields from mapToScreens output
 * @returns {Array<Array<Object>>} Rows for govukTable macro
 */
export function fieldRows(fields) {
  if (!Array.isArray(fields)) return []

  const statusTagMap = {
    satisfied: { text: 'Satisfied', classes: 'govuk-tag--green' },
    unsatisfied: { text: 'Unsatisfied', classes: 'govuk-tag--red' },
    deferred: { text: 'Deferred', classes: 'govuk-tag--yellow' },
    inactive: { text: 'Inactive', classes: 'govuk-tag--grey' }
  }

  return fields.map((field) => {
    const tag = statusTagMap[field.obligationStatus]
    const statusCell = tag
      ? {
          html: `<strong class="govuk-tag ${tag.classes}">${tag.text}</strong>`
        }
      : { text: field.obligationStatus || '—' }

    const conditionsText = field.visibility?.dependsOn
      ? `Depends on: ${field.visibility.dependsOn}`
      : '—'

    return [
      { text: field.label || field.fieldName || '—' },
      { text: field.fieldName || '—' },
      { text: field.obligationRef || '—' },
      statusCell,
      { text: conditionsText }
    ]
  })
}
