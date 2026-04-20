/**
 * Tests for mapToScreens - maps obligation evaluation results to screen status.
 *
 * Core contract: Given evaluation results and journey structure, consistently
 * derive correct screen status using precedence rules and enrich fields with
 * obligation statuses.
 */

import { describe, it, expect } from 'vitest'
import { mapToScreens, rollUpToSections } from './map-to-screens.js'

// Test helpers to reduce duplication
const createObligation = (id, status, missingPaths = []) => ({
  id,
  status,
  missingPaths
})

const createField = (fieldName, obligationRef = undefined) => ({
  fieldName,
  fieldType: 'text',
  label: `Label for ${fieldName}`,
  ...(obligationRef && { obligationRef })
})

const createScreen = (id, screenName, fields) => ({
  id,
  screenName,
  fields
})

const createSection = (id, name, screens) => ({
  id,
  name,
  screens
})

const createJourneyMap = (sections) => ({
  journey: 'Test Journey',
  version: '1.0',
  sections
})

const createEvaluationResult = (obligations) => ({
  obligations,
  summary: {
    satisfied: obligations.filter((o) => o.status === 'satisfied').length,
    unsatisfied: obligations.filter((o) => o.status === 'unsatisfied').length,
    deferred: obligations.filter((o) => o.status === 'deferred').length,
    inactive: obligations.filter((o) => o.status === 'inactive').length,
    total: obligations.length,
    submittable: obligations.every(
      (o) => o.status === 'satisfied' || o.status === 'inactive'
    )
  }
})

describe('mapToScreens', () => {
  describe('status precedence rules', () => {
    it('prioritizes unsatisfied over all other statuses', () => {
      // Arrange
      const obligations = [
        createObligation('obl-1', 'satisfied'),
        createObligation('obl-2', 'unsatisfied'), // This wins
        createObligation('obl-3', 'deferred'),
        createObligation('obl-4', 'inactive')
      ]
      const evaluationResult = createEvaluationResult(obligations)

      const fields = [
        createField('field1', 'obl-1'),
        createField('field2', 'obl-2'),
        createField('field3', 'obl-3'),
        createField('field4', 'obl-4')
      ]
      const journeyMap = createJourneyMap([
        createSection('01', 'Section', [createScreen('01-01', 'Screen', fields)])
      ])

      // Act
      const result = mapToScreens(evaluationResult, journeyMap)

      // Assert
      expect(result[0].status).toBe('incomplete')
    })

    it('prioritizes deferred over satisfied when no unsatisfied obligations', () => {
      // Arrange
      const obligations = [
        createObligation('obl-1', 'satisfied'),
        createObligation('obl-2', 'deferred'), // This wins
        createObligation('obl-3', 'inactive')
      ]
      const evaluationResult = createEvaluationResult(obligations)

      const fields = [
        createField('field1', 'obl-1'),
        createField('field2', 'obl-2'),
        createField('field3', 'obl-3')
      ]
      const journeyMap = createJourneyMap([
        createSection('01', 'Section', [createScreen('01-01', 'Screen', fields)])
      ])

      // Act
      const result = mapToScreens(evaluationResult, journeyMap)

      // Assert
      expect(result[0].status).toBe('cannotStartYet')
    })

    it('marks screen notApplicable when all obligations are inactive', () => {
      // Arrange
      const obligations = [
        createObligation('obl-1', 'inactive'),
        createObligation('obl-2', 'inactive')
      ]
      const evaluationResult = createEvaluationResult(obligations)

      const fields = [
        createField('field1', 'obl-1'),
        createField('field2', 'obl-2')
      ]
      const journeyMap = createJourneyMap([
        createSection('01', 'Section', [createScreen('01-01', 'Screen', fields)])
      ])

      // Act
      const result = mapToScreens(evaluationResult, journeyMap)

      // Assert
      expect(result[0].status).toBe('notApplicable')
    })

    it('marks screen complete when only satisfied and inactive obligations exist', () => {
      // Arrange
      const obligations = [
        createObligation('obl-1', 'satisfied'),
        createObligation('obl-2', 'satisfied'),
        createObligation('obl-3', 'inactive')
      ]
      const evaluationResult = createEvaluationResult(obligations)

      const fields = [
        createField('field1', 'obl-1'),
        createField('field2', 'obl-2'),
        createField('field3', 'obl-3')
      ]
      const journeyMap = createJourneyMap([
        createSection('01', 'Section', [createScreen('01-01', 'Screen', fields)])
      ])

      // Act
      const result = mapToScreens(evaluationResult, journeyMap)

      // Assert
      expect(result[0].status).toBe('complete')
    })

    it('marks screen complete when all obligations are satisfied', () => {
      // Arrange
      const obligations = [
        createObligation('obl-1', 'satisfied'),
        createObligation('obl-2', 'satisfied')
      ]
      const evaluationResult = createEvaluationResult(obligations)

      const fields = [
        createField('field1', 'obl-1'),
        createField('field2', 'obl-2')
      ]
      const journeyMap = createJourneyMap([
        createSection('01', 'Section', [createScreen('01-01', 'Screen', fields)])
      ])

      // Act
      const result = mapToScreens(evaluationResult, journeyMap)

      // Assert
      expect(result[0].status).toBe('complete')
    })
  })

  describe('field enrichment', () => {
    it('enriches each field with its obligation status from evaluation', () => {
      // Arrange
      const obligations = [
        createObligation('import-purpose', 'unsatisfied'),
        createObligation('commodity', 'satisfied')
      ]
      const evaluationResult = createEvaluationResult(obligations)

      const fields = [
        createField('purpose', 'import-purpose'),
        createField('commodity-code', 'commodity')
      ]
      const journeyMap = createJourneyMap([
        createSection('01', 'Section', [createScreen('01-01', 'Screen', fields)])
      ])

      // Act
      const result = mapToScreens(evaluationResult, journeyMap)

      // Assert
      expect(result[0].fields[0].obligationStatus).toBe('unsatisfied')
      expect(result[0].fields[1].obligationStatus).toBe('satisfied')
    })

    it('preserves all original field properties', () => {
      // Arrange
      const obligations = [createObligation('obl-1', 'satisfied')]
      const evaluationResult = createEvaluationResult(obligations)

      const fields = [
        {
          fieldName: 'test-field',
          fieldType: 'radio',
          label: 'Test Label',
          obligationRef: 'obl-1',
          customProp: 'custom-value'
        }
      ]
      const journeyMap = createJourneyMap([
        createSection('01', 'Section', [createScreen('01-01', 'Screen', fields)])
      ])

      // Act
      const result = mapToScreens(evaluationResult, journeyMap)

      // Assert
      expect(result[0].fields[0]).toMatchObject({
        fieldName: 'test-field',
        fieldType: 'radio',
        label: 'Test Label',
        obligationRef: 'obl-1',
        customProp: 'custom-value',
        obligationStatus: 'satisfied'
      })
    })
  })

  describe('edge cases', () => {
    it('handles fields without obligationRef gracefully', () => {
      // Arrange
      const obligations = [createObligation('obl-1', 'satisfied')]
      const evaluationResult = createEvaluationResult(obligations)

      const fields = [
        createField('local-reference-number'), // No obligationRef (optional field)
        createField('field2', 'obl-1')
      ]
      const journeyMap = createJourneyMap([
        createSection('01', 'Section', [createScreen('01-01', 'Screen', fields)])
      ])

      // Act
      const result = mapToScreens(evaluationResult, journeyMap)

      // Assert - Should not crash, field should exist in output
      expect(result[0].fields[0].fieldName).toBe('local-reference-number')
      expect(result[0].fields[0].obligationStatus).toBeUndefined()
    })

    it('throws error when obligationRef does not exist in evaluation', () => {
      // Arrange
      const obligations = [createObligation('obl-1', 'satisfied')]
      const evaluationResult = createEvaluationResult(obligations)

      const fields = [createField('field1', 'NON-EXISTENT')] // Missing obligation
      const journeyMap = createJourneyMap([
        createSection('01', 'Section', [createScreen('01-01', 'Screen', fields)])
      ])

      // Act & Assert - Should throw (fail fast on data integrity issue)
      expect(() => mapToScreens(evaluationResult, journeyMap)).toThrow(
        /obligation.*NON-EXISTENT.*not found/i
      )
    })

    it('assigns same obligation status to multiple fields referencing it', () => {
      // Arrange
      const obligations = [createObligation('shared-obl', 'deferred')]
      const evaluationResult = createEvaluationResult(obligations)

      const fields = [
        createField('field-a', 'shared-obl'),
        createField('field-b', 'shared-obl')
      ]
      const journeyMap = createJourneyMap([
        createSection('01', 'Section', [createScreen('01-01', 'Screen', fields)])
      ])

      // Act
      const result = mapToScreens(evaluationResult, journeyMap)

      // Assert
      expect(result[0].fields[0].obligationStatus).toBe('deferred')
      expect(result[0].fields[1].obligationStatus).toBe('deferred')
    })

    it('marks screen complete when it has no fields', () => {
      // Arrange
      const evaluationResult = createEvaluationResult([])

      const journeyMap = createJourneyMap([
        createSection('01', 'Section', [
          createScreen('01-01', 'Empty Screen', [])
        ])
      ])

      // Act
      const result = mapToScreens(evaluationResult, journeyMap)

      // Assert - Nothing to do = complete
      expect(result[0].status).toBe('complete')
      expect(result[0].fields).toEqual([])
    })

    it('marks screen complete when all fields lack obligationRef', () => {
      // Arrange
      const evaluationResult = createEvaluationResult([])

      const fields = [
        createField('info-field-1'), // No obligationRef
        createField('info-field-2') // No obligationRef
      ]
      const journeyMap = createJourneyMap([
        createSection('01', 'Section', [createScreen('01-01', 'Screen', fields)])
      ])

      // Act
      const result = mapToScreens(evaluationResult, journeyMap)

      // Assert - No obligations to satisfy = complete
      expect(result[0].status).toBe('complete')
    })

    it('handles empty journey map', () => {
      // Arrange
      const evaluationResult = createEvaluationResult([])
      const journeyMap = createJourneyMap([])

      // Act
      const result = mapToScreens(evaluationResult, journeyMap)

      // Assert
      expect(result).toEqual([])
    })

    it('handles section with empty screens array', () => {
      // Arrange
      const evaluationResult = createEvaluationResult([])
      const journeyMap = createJourneyMap([createSection('01', 'Section', [])])

      // Act
      const result = mapToScreens(evaluationResult, journeyMap)

      // Assert
      expect(result).toEqual([])
    })
  })

  describe('input validation', () => {
    it('throws when evaluationResult is null', () => {
      // Arrange
      const journeyMap = createJourneyMap([])

      // Act & Assert
      expect(() => mapToScreens(null, journeyMap)).toThrow(
        /evaluationResult must have obligations array/i
      )
    })

    it('throws when evaluationResult is undefined', () => {
      // Arrange
      const journeyMap = createJourneyMap([])

      // Act & Assert
      expect(() => mapToScreens(undefined, journeyMap)).toThrow(
        /evaluationResult must have obligations array/i
      )
    })

    it('throws when evaluationResult.obligations is missing', () => {
      // Arrange
      const journeyMap = createJourneyMap([])

      // Act & Assert
      expect(() => mapToScreens({}, journeyMap)).toThrow(
        /evaluationResult must have obligations array/i
      )
    })

    it('throws when journeyMap is null', () => {
      // Arrange
      const evaluationResult = createEvaluationResult([])

      // Act & Assert
      expect(() => mapToScreens(evaluationResult, null)).toThrow(
        /journeyMap must have sections array/i
      )
    })

    it('throws when journeyMap is undefined', () => {
      // Arrange
      const evaluationResult = createEvaluationResult([])

      // Act & Assert
      expect(() => mapToScreens(evaluationResult, undefined)).toThrow(
        /journeyMap must have sections array/i
      )
    })

    it('throws when journeyMap.sections is missing', () => {
      // Arrange
      const evaluationResult = createEvaluationResult([])

      // Act & Assert
      expect(() => mapToScreens(evaluationResult, {})).toThrow(
        /journeyMap must have sections array/i
      )
    })
  })

  describe('output structure', () => {
    it('returns screens with correct structure', () => {
      // Arrange
      const obligations = [createObligation('obl-1', 'unsatisfied')]
      const evaluationResult = createEvaluationResult(obligations)

      const fields = [createField('field1', 'obl-1')]
      const journeyMap = createJourneyMap([
        createSection('01', 'About', [
          createScreen('01-02', 'Test Screen', fields)
        ])
      ])

      // Act
      const result = mapToScreens(evaluationResult, journeyMap)

      // Assert
      expect(result[0]).toMatchObject({
        screenId: '01-02',
        screenName: 'Test Screen',
        sectionId: '01',
        sectionName: 'About',
        status: 'incomplete',
        fields: expect.any(Array)
      })
    })

    it('returns all screens flattened from multiple sections', () => {
      // Arrange
      const obligations = [
        createObligation('obl-1', 'satisfied'),
        createObligation('obl-2', 'unsatisfied')
      ]
      const evaluationResult = createEvaluationResult(obligations)

      const journeyMap = createJourneyMap([
        createSection('01', 'Section 1', [
          createScreen('01-01', 'Screen 1', [createField('f1', 'obl-1')])
        ]),
        createSection('02', 'Section 2', [
          createScreen('02-01', 'Screen 2', [createField('f2', 'obl-2')])
        ])
      ])

      // Act
      const result = mapToScreens(evaluationResult, journeyMap)

      // Assert
      expect(result).toHaveLength(2)
      expect(result[0].screenId).toBe('01-01')
      expect(result[0].sectionId).toBe('01')
      expect(result[1].screenId).toBe('02-01')
      expect(result[1].sectionId).toBe('02')
    })
  })
})

// ===========================================================================
// rollUpToSections Tests
// ===========================================================================

// Helper to create screen (simplified - for rollUpToSections input)
const createMappedScreen = (
  screenId,
  screenName,
  sectionId,
  sectionName,
  status,
  fields = []
) => ({
  screenId,
  screenName,
  sectionId,
  sectionName,
  status,
  fields
})

describe('rollUpToSections', () => {
  describe('core contract: grouping and filtering', () => {
    it('groups screens by sectionId and preserves section metadata', () => {
      const screens = [
        createMappedScreen('01-01', 'Screen 1', '01', 'About', 'complete'),
        createMappedScreen('01-02', 'Screen 2', '01', 'About', 'complete')
      ]

      const result = rollUpToSections(screens)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        sectionId: '01',
        sectionName: 'About',
        screens: expect.any(Array)
      })
      expect(result[0].screens).toHaveLength(2)
    })

    it('filters out notApplicable screens from section.screens', () => {
      const screens = [
        createMappedScreen('01-01', 'Screen 1', '01', 'About', 'complete'),
        createMappedScreen('01-02', 'Screen 2', '01', 'About', 'notApplicable'),
        createMappedScreen('01-03', 'Screen 3', '01', 'About', 'complete')
      ]

      const result = rollUpToSections(screens)

      expect(result[0].screens).toHaveLength(2)
      expect(result[0].screens.map((s) => s.screenId)).toEqual([
        '01-01',
        '01-03'
      ])
      expect(
        result[0].screens.every((s) => s.status !== 'notApplicable')
      ).toBe(true)
    })

    it('omits sections where all screens are notApplicable', () => {
      const screens = [
        createMappedScreen(
          '01-01',
          'Screen 1',
          '01',
          'About',
          'notApplicable'
        ),
        createMappedScreen(
          '01-02',
          'Screen 2',
          '01',
          'About',
          'notApplicable'
        ),
        createMappedScreen('02-01', 'Screen 3', '02', 'Details', 'complete')
      ]

      const result = rollUpToSections(screens)

      expect(result).toHaveLength(1)
      expect(result[0].sectionId).toBe('02')
    })

    it('maintains section order from first appearance in input', () => {
      const screens = [
        createMappedScreen('02-01', 'Screen 1', '02', 'Details', 'complete'),
        createMappedScreen('01-01', 'Screen 2', '01', 'About', 'complete'),
        createMappedScreen('02-02', 'Screen 3', '02', 'Details', 'complete')
      ]

      const result = rollUpToSections(screens)

      expect(result[0].sectionId).toBe('02')
      expect(result[1].sectionId).toBe('01')
    })
  })

  describe('status derivation: precedence rules', () => {
    it('section status is incomplete if ANY screen is incomplete', () => {
      const screens = [
        createMappedScreen('01-01', 'Screen 1', '01', 'About', 'complete'),
        createMappedScreen('01-02', 'Screen 2', '01', 'About', 'incomplete'),
        createMappedScreen('01-03', 'Screen 3', '01', 'About', 'complete')
      ]

      const result = rollUpToSections(screens)

      expect(result[0].status).toBe('incomplete')
    })

    it('section status is cannotStartYet if ANY screen is cannotStartYet (no incomplete)', () => {
      const screens = [
        createMappedScreen('01-01', 'Screen 1', '01', 'About', 'complete'),
        createMappedScreen(
          '01-02',
          'Screen 2',
          '01',
          'About',
          'cannotStartYet'
        ),
        createMappedScreen('01-03', 'Screen 3', '01', 'About', 'complete')
      ]

      const result = rollUpToSections(screens)

      expect(result[0].status).toBe('cannotStartYet')
    })

    it('section status is complete when all screens are complete', () => {
      const screens = [
        createMappedScreen('01-01', 'Screen 1', '01', 'About', 'complete'),
        createMappedScreen('01-02', 'Screen 2', '01', 'About', 'complete')
      ]

      const result = rollUpToSections(screens)

      expect(result[0].status).toBe('complete')
    })

    it('section status is complete when screens are complete or notApplicable', () => {
      const screens = [
        createMappedScreen('01-01', 'Screen 1', '01', 'About', 'complete'),
        createMappedScreen(
          '01-02',
          'Screen 2',
          '01',
          'About',
          'notApplicable'
        ),
        createMappedScreen('01-03', 'Screen 3', '01', 'About', 'complete')
      ]

      const result = rollUpToSections(screens)

      expect(result[0].status).toBe('complete')
      // notApplicable was filtered, so only complete screens remain
      expect(result[0].screens).toHaveLength(2)
    })
  })

  describe('multiple sections with mixed statuses', () => {
    it('derives correct status for each section independently', () => {
      const screens = [
        // Section 01: incomplete
        createMappedScreen('01-01', 'Screen 1', '01', 'About', 'incomplete'),
        createMappedScreen('01-02', 'Screen 2', '01', 'About', 'complete'),
        // Section 02: cannotStartYet
        createMappedScreen(
          '02-01',
          'Screen 1',
          '02',
          'Details',
          'cannotStartYet'
        ),
        createMappedScreen('02-02', 'Screen 2', '02', 'Details', 'complete'),
        // Section 03: complete
        createMappedScreen('03-01', 'Screen 1', '03', 'Review', 'complete'),
        createMappedScreen('03-02', 'Screen 2', '03', 'Review', 'complete')
      ]

      const result = rollUpToSections(screens)

      expect(result).toHaveLength(3)
      expect(result[0].status).toBe('incomplete')
      expect(result[1].status).toBe('cannotStartYet')
      expect(result[2].status).toBe('complete')
    })
  })

  describe('edge cases', () => {
    it('handles empty screen array', () => {
      const result = rollUpToSections([])

      expect(result).toEqual([])
    })

    it('handles single screen section', () => {
      const screens = [
        createMappedScreen('01-01', 'Screen 1', '01', 'About', 'complete')
      ]

      const result = rollUpToSections(screens)

      expect(result).toHaveLength(1)
      expect(result[0].screens).toHaveLength(1)
      expect(result[0].status).toBe('complete')
    })

    it('preserves all screen properties in section.screens', () => {
      const screens = [
        createMappedScreen('01-01', 'Screen 1', '01', 'About', 'complete', [
          { fieldName: 'field1', obligationStatus: 'satisfied' }
        ])
      ]

      const result = rollUpToSections(screens)

      expect(result[0].screens[0]).toMatchObject({
        screenId: '01-01',
        screenName: 'Screen 1',
        status: 'complete',
        fields: expect.any(Array)
      })
    })
  })

  describe('input validation', () => {
    it('throws when screens is null', () => {
      expect(() => rollUpToSections(null)).toThrow(/screens must be an array/i)
    })

    it('throws when screens is undefined', () => {
      expect(() => rollUpToSections(undefined)).toThrow(
        /screens must be an array/i
      )
    })

    it('throws when screens is not an array', () => {
      expect(() => rollUpToSections('not an array')).toThrow(
        /screens must be an array/i
      )
    })

    it('throws when screen is missing sectionName', () => {
      const screens = [
        {
          screenId: '01-01',
          screenName: 'Screen 1',
          sectionId: '01',
          // Missing sectionName
          status: 'complete',
          fields: []
        }
      ]

      expect(() => rollUpToSections(screens)).toThrow(/missing sectionName/i)
    })
  })
})
