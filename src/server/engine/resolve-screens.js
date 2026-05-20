/**
 * Screen resolution.
 *
 * Public engine surface — owns the protocol.md §5.3 contract:
 *
 *   resolveScreens(result, journeyMap) → Screen[]
 *
 * Folds an EvaluationResult over a JourneyMap's page structure producing
 * a flat list of Screen records with derived statuses and
 * obligation-enriched fields. Pure: knows nothing of any particular
 * journey. The status-derivation table is universal per §5.3.
 */
import { OBLIGATION_STATUS, SCREEN_STATUS } from './types.js'

/**
 * @param {import('./types.js').EvaluationResult} result
 * @param {import('./types.js').JourneyMap} journeyMap
 * @returns {import('./types.js').Screen[]}
 */
export const resolveScreens = (result, journeyMap) => {
  if (!result || !result.obligations) {
    throw new Error(
      'resolveScreens: evaluationResult must have obligations array'
    )
  }
  if (!journeyMap || !journeyMap.sections) {
    throw new Error('resolveScreens: journeyMap must have sections array')
  }

  const obligationById = new Map(
    result.obligations.map((o) => [o.id, o])
  )

  return journeyMap.sections.flatMap((section) =>
    section.screens.map((screen) =>
      processScreen(screen, section, obligationById)
    )
  )
}

const processScreen = (screen, section, obligationById) => {
  // enrichField MUST run before extractScreenObligations: it validates
  // every field's obligationRef. Reversing them would let a dangling ref
  // flow into deriveScreenStatus as `undefined` and silently mis-classify
  // the screen as complete.
  const enrichedFields = screen.fields.map((field) =>
    enrichField(field, obligationById)
  )
  const screenObligations = extractScreenObligations(
    screen.fields,
    obligationById
  )

  const base = {
    screenId: screen.id,
    screenName: screen.screenName,
    sectionId: section.id,
    sectionName: section.name,
    status: deriveScreenStatus(screenObligations),
    fields: enrichedFields
  }

  return screen.repeats ? { ...base, repeats: screen.repeats } : base
}

const enrichField = (field, obligationById) => {
  if (!field.obligationRef) return { ...field }

  const obligation = obligationById.get(field.obligationRef)
  if (!obligation) {
    throw new Error(
      `Field "${field.fieldName}" references obligation "${field.obligationRef}" which was not found in evaluation result.`
    )
  }
  return { ...field, obligationStatus: obligation.status }
}

const extractScreenObligations = (fields, obligationById) => {
  const refs = new Set(fields.map((f) => f.obligationRef).filter(Boolean))
  return [...refs].map((ref) => obligationById.get(ref))
}

/**
 * §5.3 status-derivation table — top-down, first match wins.
 */
const deriveScreenStatus = (obligations) => {
  if (obligations.length === 0) return SCREEN_STATUS.COMPLETE

  if (obligations.some((o) => o.status === OBLIGATION_STATUS.UNSATISFIED)) {
    return SCREEN_STATUS.INCOMPLETE
  }
  if (obligations.some((o) => o.status === OBLIGATION_STATUS.DEFERRED)) {
    return SCREEN_STATUS.CANNOT_START_YET
  }
  if (obligations.every((o) => o.status === OBLIGATION_STATUS.INACTIVE)) {
    return SCREEN_STATUS.NOT_APPLICABLE
  }
  return SCREEN_STATUS.COMPLETE
}