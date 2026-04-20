/**
 * Maps obligation evaluation results to screen-level status.
 *
 * Core contract: Given evaluation results and journey structure, derive
 * screen status using precedence rules (unsatisfied > deferred > satisfied/inactive)
 * and enrich fields with obligation statuses.
 */

// ===========================================================================
// PART 1: mapToScreens
// ===========================================================================

// ---------------------------------------------------------------------------
// Module 1: Status Predicates (Pure Functions)
// ---------------------------------------------------------------------------

/**
 * Check if any obligation is unsatisfied.
 */
const hasUnsatisfiedObligation = (obligations) =>
  obligations.some((o) => o.status === 'unsatisfied')

/**
 * Check if any obligation is deferred.
 */
const hasDeferredObligation = (obligations) =>
  obligations.some((o) => o.status === 'deferred')

/**
 * Check if all obligations are inactive.
 */
const allObligationsInactive = (obligations) =>
  obligations.length > 0 && obligations.every((o) => o.status === 'inactive')

/**
 * Check if screen has no obligations to satisfy.
 */
const hasNoObligations = (obligations) => obligations.length === 0

// ---------------------------------------------------------------------------
// Module 2: Screen Status Derivation (Pure Function)
// ---------------------------------------------------------------------------

/**
 * Derive screen status from obligation statuses.
 *
 * Precedence rules (confirmed by user):
 * 1. Any unsatisfied → incomplete
 * 2. Any deferred (none unsatisfied) → cannotStartYet
 * 3. All inactive → notApplicable
 * 4. Otherwise (all satisfied, or mix of satisfied + inactive) → complete
 *
 * @param {Array<Object>} obligations - Obligations for this screen
 * @returns {string} Screen status
 */
const deriveScreenStatus = (obligations) => {
  if (hasNoObligations(obligations)) {
    return 'complete' // Nothing to do
  }

  if (hasUnsatisfiedObligation(obligations)) {
    return 'incomplete' // Highest priority
  }

  if (hasDeferredObligation(obligations)) {
    return 'cannotStartYet' // Second priority (deferred wins over satisfied)
  }

  if (allObligationsInactive(obligations)) {
    return 'notApplicable' // All obligations structurally irrelevant
  }

  return 'complete' // All satisfied, or mix of satisfied + inactive
}

// ---------------------------------------------------------------------------
// Module 3: Field Enrichment (Pure Function)
// ---------------------------------------------------------------------------

/**
 * Find obligation by ID in evaluation result.
 *
 * @param {string} obligationRef - Obligation ID
 * @param {Object} evaluationResult - Evaluation result
 * @returns {Object|undefined} Obligation or undefined
 */
const findObligation = (obligationRef, evaluationResult) =>
  evaluationResult.obligations.find((o) => o.id === obligationRef)

/**
 * Enrich field with obligation status.
 *
 * Throws if obligationRef is provided but obligation not found (data integrity issue).
 *
 * @param {Object} field - Field from journey map
 * @param {Object} evaluationResult - Evaluation result
 * @returns {Object} Enriched field
 */
const enrichField = (field, evaluationResult) => {
  // Field without obligationRef (optional/informational field)
  if (!field.obligationRef) {
    return { ...field }
  }

  // Find the obligation
  const obligation = findObligation(field.obligationRef, evaluationResult)

  // Fail fast on data integrity issue
  if (!obligation) {
    throw new Error(
      `Field "${field.fieldName}" references obligation "${field.obligationRef}" which was not found in evaluation result. ` +
        `This indicates a data integrity issue between the journey map and obligations definition.`
    )
  }

  return {
    ...field,
    obligationStatus: obligation.status
  }
}

// ---------------------------------------------------------------------------
// Module 4: Screen Processing (Pure Function)
// ---------------------------------------------------------------------------

/**
 * Extract unique obligations referenced by screen fields.
 *
 * Fails fast if any obligation reference is not found in evaluation result.
 *
 * @param {Array<Object>} fields - Screen fields
 * @param {Object} evaluationResult - Evaluation result
 * @returns {Array<Object>} Obligations for this screen
 * @throws {Error} If obligation reference not found in evaluation result
 */
const extractScreenObligations = (fields, evaluationResult) => {
  const obligationRefs = fields
    .map((f) => f.obligationRef)
    .filter(Boolean) // Remove undefined (fields without obligationRef)

  const uniqueRefs = [...new Set(obligationRefs)] // Deduplicate

  return uniqueRefs.map((ref) => {
    const obligation = findObligation(ref, evaluationResult)
    if (!obligation) {
      throw new Error(
        `Obligation "${ref}" referenced by screen fields but not found in evaluation result. ` +
          `This indicates a data integrity issue between the journey map and obligations definition.`
      )
    }
    return obligation
  })
}

/**
 * Process a single screen.
 *
 * @param {Object} screen - Screen from journey map
 * @param {string} sectionId - Parent section ID
 * @param {string} sectionName - Parent section name
 * @param {Object} evaluationResult - Evaluation result
 * @returns {Object} Processed screen
 */
const processScreen = (screen, sectionId, sectionName, evaluationResult) => {
  // Enrich fields with obligation statuses (throws on invalid obligationRef)
  const enrichedFields = screen.fields.map((field) =>
    enrichField(field, evaluationResult)
  )

  // Extract obligations for this screen
  const screenObligations = extractScreenObligations(
    screen.fields,
    evaluationResult
  )

  // Derive screen status
  const status = deriveScreenStatus(screenObligations)

  const result = {
    screenId: screen.id,
    screenName: screen.screenName,
    sectionId,
    sectionName,
    status,
    fields: enrichedFields
  }

  // Pass through optional screen metadata (e.g. repeats)
  if (screen.repeats) {
    result.repeats = screen.repeats
  }

  return result
}

// ---------------------------------------------------------------------------
// Module 5: Main Orchestrator
// ---------------------------------------------------------------------------

/**
 * Maps obligation evaluation results to screen-level status.
 *
 * @param {Object} evaluationResult - Output from traceEvaluateObligations
 * @param {Object} journeyMap - Journey structure with sections/screens/fields
 * @returns {Array<Object>} Screens with derived status
 * @throws {Error} If evaluationResult.obligations is missing
 * @throws {Error} If journeyMap.sections is missing
 * @throws {Error} If field references obligation not in evaluationResult
 *
 * Each screen includes:
 * - screenId: string
 * - screenName: string
 * - sectionId: string
 * - sectionName: string
 * - status: 'complete' | 'incomplete' | 'cannotStartYet' | 'notApplicable'
 * - fields: Array<Field & { obligationStatus?: string }>
 */
export const mapToScreens = (evaluationResult, journeyMap) => {
  // Validate inputs
  if (!evaluationResult || !evaluationResult.obligations) {
    throw new Error(
      'mapToScreens: evaluationResult must have obligations array'
    )
  }

  if (!journeyMap || !journeyMap.sections) {
    throw new Error('mapToScreens: journeyMap must have sections array')
  }

  // Flatten all screens from all sections
  return journeyMap.sections.flatMap((section) =>
    section.screens.map((screen) =>
      processScreen(screen, section.id, section.name, evaluationResult)
    )
  )
}

// ===========================================================================
// PART 2: rollUpToSections
// ===========================================================================

// ---------------------------------------------------------------------------
// Section Status Derivation (Pure Function)
// ---------------------------------------------------------------------------

/**
 * Derive section status from child screen statuses.
 *
 * Precedence rules (confirmed by user):
 * 1. Any incomplete → incomplete
 * 2. Any cannotStartYet (none incomplete) → cannotStartYet
 * 3. Otherwise (all complete) → complete
 *
 * Note: notApplicable screens are already filtered out before calling this.
 *
 * @param {Array<Object>} screens - Child screens (excluding notApplicable)
 * @returns {string} Section status
 */
const deriveSectionStatus = (screens) => {
  if (screens.some((s) => s.status === 'incomplete')) {
    return 'incomplete'
  }

  if (screens.some((s) => s.status === 'cannotStartYet')) {
    return 'cannotStartYet'
  }

  return 'complete'
}

// ---------------------------------------------------------------------------
// Main Function
// ---------------------------------------------------------------------------

/**
 * Groups screens by section, filters notApplicable screens, derives section status.
 *
 * Key behaviors:
 * - Groups screens by sectionId (maintains first-appearance order)
 * - Filters out notApplicable screens (they don't appear in section.screens)
 * - Omits sections where all screens are notApplicable
 * - Derives section status from child screens: incomplete > cannotStartYet > complete
 *
 * @param {Array<Object>} screens - Output from mapToScreens
 * @returns {Array<Object>} Sections with derived status
 * @throws {Error} If screens is not an array
 *
 * Each section includes:
 * - sectionId: string
 * - sectionName: string
 * - status: 'complete' | 'incomplete' | 'cannotStartYet'
 * - screens: Array<Screen> (excluding notApplicable)
 */
export const rollUpToSections = (screens) => {
  // Validate input
  if (!Array.isArray(screens)) {
    throw new Error('rollUpToSections: screens must be an array')
  }

  // Group by sectionId (Map maintains insertion order = first-appearance order)
  const sectionMap = new Map()

  for (const screen of screens) {
    const key = screen.sectionId

    // Create section entry on first screen of this section
    if (!sectionMap.has(key)) {
      // Validate section metadata
      if (!screen.sectionName) {
        throw new Error(
          `rollUpToSections: screen "${screen.screenId}" has sectionId "${key}" but missing sectionName. ` +
            `This indicates a data integrity issue.`
        )
      }

      sectionMap.set(key, {
        sectionId: screen.sectionId,
        sectionName: screen.sectionName,
        screens: []
      })
    }

    // Filter: only include non-notApplicable screens
    if (screen.status !== 'notApplicable') {
      sectionMap.get(key).screens.push(screen)
    }
  }

  // Derive status for each section, omit empty sections (all notApplicable)
  return Array.from(sectionMap.values())
    .filter((section) => section.screens.length > 0) // Omit sections with all screens notApplicable
    .map((section) => ({
      ...section,
      status: deriveSectionStatus(section.screens)
    }))
}
