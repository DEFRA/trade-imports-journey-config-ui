import { describe, test, expect } from 'vitest'
import { fieldRows } from './field-rows.js'

describe('fieldRows filter', () => {
  test('returns empty array for non-array input', () => {
    expect(fieldRows(null)).toEqual([])
    expect(fieldRows(undefined)).toEqual([])
    expect(fieldRows('not an array')).toEqual([])
  })

  test('returns empty array for empty array', () => {
    expect(fieldRows([])).toEqual([])
  })

  test('produces 5 columns per row', () => {
    const fields = [
      {
        fieldName: 'cert-type',
        fieldType: 'radio',
        label: 'What are you importing?',
        obligationRef: 'notification-type',
        obligationStatus: 'unsatisfied'
      }
    ]

    const rows = fieldRows(fields)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveLength(5)
  })

  test('renders label as primary, fieldName as secondary', () => {
    const fields = [
      {
        fieldName: 'cert-type',
        fieldType: 'radio',
        label: 'What are you importing?'
      }
    ]

    const rows = fieldRows(fields)
    expect(rows[0][0].text).toBe('What are you importing?')
    expect(rows[0][1].text).toBe('cert-type')
  })

  test('falls back to fieldName for label when label is missing', () => {
    const fields = [{ fieldName: 'some-field', fieldType: 'text' }]
    const rows = fieldRows(fields)
    expect(rows[0][0].text).toBe('some-field')
  })

  test('renders obligationRef in column 3', () => {
    const fields = [
      {
        fieldName: 'x',
        fieldType: 'text',
        label: 'X',
        obligationRef: 'some-obligation'
      }
    ]
    const rows = fieldRows(fields)
    expect(rows[0][2].text).toBe('some-obligation')
  })

  test('renders dash when obligationRef is missing', () => {
    const fields = [{ fieldName: 'x', fieldType: 'text', label: 'X' }]
    const rows = fieldRows(fields)
    expect(rows[0][2].text).toBe('—')
  })

  test('renders status tag HTML for known statuses', () => {
    const statuses = ['satisfied', 'unsatisfied', 'deferred', 'inactive']
    const expectedClasses = [
      'govuk-tag--green',
      'govuk-tag--red',
      'govuk-tag--yellow',
      'govuk-tag--grey'
    ]

    statuses.forEach((status, i) => {
      const fields = [
        {
          fieldName: 'x',
          fieldType: 'text',
          label: 'X',
          obligationStatus: status
        }
      ]
      const rows = fieldRows(fields)
      expect(rows[0][3].html).toContain(expectedClasses[i])
    })
  })

  test('renders dash for status when no obligationStatus', () => {
    const fields = [{ fieldName: 'x', fieldType: 'text', label: 'X' }]
    const rows = fieldRows(fields)
    expect(rows[0][3].html || rows[0][3].text).toBe('—')
  })

  test('renders visibility condition when present', () => {
    const fields = [
      {
        fieldName: 'x',
        fieldType: 'text',
        label: 'X',
        visibility: { dependsOn: 'region-code-option' }
      }
    ]
    const rows = fieldRows(fields)
    expect(rows[0][4].text).toContain('region-code-option')
  })

  test('renders dash when no visibility condition', () => {
    const fields = [{ fieldName: 'x', fieldType: 'text', label: 'X' }]
    const rows = fieldRows(fields)
    expect(rows[0][4].text).toBe('—')
  })
})
