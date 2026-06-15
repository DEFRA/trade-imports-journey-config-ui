/**
 * Engine protocol vocabulary.
 *
 * Two responsibilities:
 *   1. Frozen named-constant exports for the status enums on the immovable
 *      surface (`protocol.md` §3). The literal string values are stable
 *      identifiers — consumers may compare against them directly.
 *   2. JSDoc typedefs declaring the shape of every protocol record
 *      (`protocol.md` §2). JSDoc only; no runtime exports for the types.
 *
 * See `features/modelling/protocol.md` for the authoritative contract.
 */

// ---------------------------------------------------------------------------
// Status enums (frozen)
// ---------------------------------------------------------------------------

/**
 * Per-obligation status. Literal values per `protocol.md` §3 immovable surface.
 */
export const OBLIGATION_STATUS = Object.freeze({
  SATISFIED: 'satisfied',
  UNSATISFIED: 'unsatisfied',
  DEFERRED: 'deferred',
  INACTIVE: 'inactive'
})

/**
 * Per-screen status, derived from a screen's obligations.
 * Literal values per `protocol.md` §5.3.
 */
export const SCREEN_STATUS = Object.freeze({
  COMPLETE: 'complete',
  INCOMPLETE: 'incomplete',
  CANNOT_START_YET: 'cannotStartYet',
  NOT_APPLICABLE: 'notApplicable'
})

/**
 * Per-section status, derived from a section's non-`notApplicable` screens.
 * Literal values per `protocol.md` §5.4. Distinct from `SCREEN_STATUS`:
 * sections never carry `notApplicable` (whole-notApplicable sections are
 * omitted from the output of `rollUpToSections`).
 */
export const SECTION_STATUS = Object.freeze({
  COMPLETE: 'complete',
  INCOMPLETE: 'incomplete',
  CANNOT_START_YET: 'cannotStartYet'
})

/**
 * Per-step kind emitted by `evaluateWithTrace`. Surfaced on the
 * `/api/engine/.../evaluate?withTrace=true` response; the HTTP API's
 * Joi schema validates `trace.steps[].step` against this exact enum
 * so a new engine step type cannot ship without a corresponding API
 * contract update.
 */
export const TRACE_STEP = Object.freeze({
  EXTRACT_FACT: 'extract-fact',
  APPLY_TEST: 'apply-test',
  DEFERRED: 'deferred',
  INACTIVE: 'inactive',
  SATISFACTION_CHECK: 'satisfaction-check',
  ACTION_CHECK: 'action-check'
})

// ---------------------------------------------------------------------------
// Status enum types
// ---------------------------------------------------------------------------

/** @typedef {'satisfied' | 'unsatisfied' | 'deferred' | 'inactive'} ObligationStatus */
/** @typedef {'complete' | 'incomplete' | 'cannotStartYet' | 'notApplicable'} ScreenStatus */
/** @typedef {'complete' | 'incomplete' | 'cannotStartYet'} SectionStatus */
/** @typedef {'extract-fact' | 'apply-test' | 'deferred' | 'inactive' | 'satisfaction-check' | 'action-check'} TraceStep */

// ---------------------------------------------------------------------------
// Obligation contract (input)
// ---------------------------------------------------------------------------

/**
 * A declarative requirement. Optionally conditional via `condition`.
 * Optional `name` / `rationale` / `note` are documentation; the engine
 * only reads `id`, `schemaPaths`, and `condition`.
 *
 * @typedef {Object} Obligation
 * @property {string} id
 * @property {string} [name]
 * @property {string} [rationale]
 * @property {string[]} [schemaPaths]   - dot-notation; `[]` = action-only
 * @property {Condition} [condition]
 * @property {string} [note]
 */

/**
 * An obligation's activation predicate, by reference. The engine resolves
 * `fact` and `test` against `journeyResolver.facts` and
 * `journeyResolver.tests`.
 *
 * @typedef {Object} Condition
 * @property {string} fact
 * @property {string} test
 * @property {string} [description]
 */

// ---------------------------------------------------------------------------
// Journey resolver contract (input)
// ---------------------------------------------------------------------------

/**
 * Functions and metadata each journey supplies. Schema-specific knowledge
 * lives here, not in the kernel.
 *
 * @typedef {Object} JourneyResolver
 * @property {Object<string, FactExtractor>} facts
 * @property {Object<string, ConditionTest>} tests
 * @property {string} submissionDatePath           - non-empty dot-notation
 */

/**
 * Extracts a domain value from a notification. Returning null/undefined
 * causes the obligation's condition to defer.
 *
 * @typedef {(notification: object) => any} FactExtractor
 */

/**
 * Tests whether a condition is active. Receives the extracted fact value
 * plus the journey's refdata; returns a {@link TestResult}.
 *
 * @typedef {(factValue: any, refdata: object) => TestResult} ConditionTest
 */

/**
 * Output of a {@link ConditionTest}.
 *
 * @typedef {Object} TestResult
 * @property {boolean} active
 * @property {string} reason
 */

// ---------------------------------------------------------------------------
// Journey map contract (input — page structure)
// ---------------------------------------------------------------------------

/**
 * Declarative description of the page structure.
 *
 * @typedef {Object} JourneyMap
 * @property {string} [journey]
 * @property {string} [version]
 * @property {string} [description]
 * @property {Section[]} sections
 */

/**
 * A grouping of screens within a journey map.
 *
 * @typedef {Object} Section
 * @property {string} id
 * @property {string} name
 * @property {ScreenDef[]} screens
 */

/**
 * A screen definition within a section. Distinct from {@link Screen},
 * which is the resolved/output form.
 *
 * @typedef {Object} ScreenDef
 * @property {string} id
 * @property {string} screenName
 * @property {Field[]} fields
 * @property {string} [repeats]
 */

/**
 * A field within a screen.
 *
 * @typedef {Object} Field
 * @property {string} fieldName
 * @property {string} fieldType
 * @property {string} label
 * @property {string} [obligationRef]
 * @property {Visibility} [visibility]
 */

/**
 * Field-level visibility condition. `dependsOn` references a sibling
 * field's `fieldName` on the same screen.
 *
 * @typedef {Object} Visibility
 * @property {string} dependsOn
 */

// ---------------------------------------------------------------------------
// Journey adapter contract (input — umbrella)
// ---------------------------------------------------------------------------

/**
 * The whole journey contribution as a single record. Passed directly to
 * engine functions per `protocol.md` §5.
 *
 * @typedef {Object} JourneyAdapter
 * @property {Obligation[]} obligations
 * @property {object} refdata
 * @property {JourneyMap} journeyMap
 * @property {JourneyResolver} journeyResolver
 * @property {object} [scenarios]
 */

// ---------------------------------------------------------------------------
// Evaluation output
// ---------------------------------------------------------------------------

/**
 * Output of the canonical evaluator (and the traced evaluator, with
 * `trace` populated per obligation).
 *
 * @typedef {Object} EvaluationResult
 * @property {EvaluatedObligation[]} obligations
 * @property {Summary} summary
 */

/**
 * Per-obligation result. Field presence is status-discriminated:
 *
 * - status === 'satisfied' or 'unsatisfied' → `missingPaths` present;
 *   `reason` absent.
 * - status === 'deferred' or 'inactive' → `reason` present;
 *   `missingPaths` absent.
 * - `trace` is present only when produced by `evaluateWithTrace`.
 *
 * @typedef {Object} EvaluatedObligation
 * @property {string} id
 * @property {ObligationStatus} status
 * @property {string[]} [missingPaths]
 * @property {string} [reason]
 * @property {Trace} [trace]
 */

/**
 * Aggregate counts and the submittability boolean. Invariants per
 * `protocol.md` §5.1:
 *
 * - `satisfied + unsatisfied + deferred + inactive === total`
 * - `submittable === (unsatisfied === 0 && deferred === 0)`
 *
 * @typedef {Object} Summary
 * @property {number} satisfied
 * @property {number} unsatisfied
 * @property {number} deferred
 * @property {number} inactive
 * @property {number} total
 * @property {boolean} submittable
 */

// ---------------------------------------------------------------------------
// Trace (diagnostics; emitted by evaluateWithTrace)
// ---------------------------------------------------------------------------

/**
 * Step-by-step reasoning for a single obligation. The last `steps`
 * entry is always a terminal step matching the obligation's final
 * `status`.
 *
 * @typedef {Object} Trace
 * @property {'conditional' | 'unconditional'} type
 * @property {Condition} [condition]   - present iff type === 'conditional'
 * @property {TraceStep[]} steps
 */

/**
 * One step in a {@link Trace}. Six variants by `step`:
 *
 * Informational (non-terminal; conditional obligations only):
 * - `'extract-fact'`  →  `{ fact, value }`
 * - `'apply-test'`    →  `{ test, result }`
 *
 * Terminal (always last; matches the obligation's final status):
 * - `'deferred'`           →  `{ reason }`
 * - `'inactive'`           →  `{ reason }`
 * - `'satisfaction-check'` →  `{ paths, missing, pathDetails }`
 * - `'action-check'`       →  `{ satisfied, reason }`
 *
 * @typedef {Object} TraceStep
 * @property {'extract-fact' | 'apply-test' | 'deferred' | 'inactive' | 'satisfaction-check' | 'action-check'} step
 * @property {string} [fact]
 * @property {*} [value]
 * @property {string} [test]
 * @property {TestResult} [result]
 * @property {string} [reason]
 * @property {number} [paths]
 * @property {number} [missing]
 * @property {{path: string, satisfied: boolean}[]} [pathDetails]
 * @property {boolean} [satisfied]
 */

// ---------------------------------------------------------------------------
// Screen mapper output
// ---------------------------------------------------------------------------

/**
 * A resolved screen produced by `resolveScreens`. Distinct from
 * {@link ScreenDef} (the input definition).
 *
 * Note: screens whose `status` is `notApplicable` are filtered out by
 * `rollUpToSections` (and whole-notApplicable sections are omitted)
 * before the result reaches a host renderer.
 *
 * @typedef {Object} Screen
 * @property {string} screenId
 * @property {string} screenName
 * @property {string} sectionId
 * @property {string} sectionName
 * @property {ScreenStatus} status
 * @property {EnrichedField[]} fields
 * @property {string} [repeats]
 */

/**
 * A {@link Field} enriched with `obligationStatus` when the field has
 * an `obligationRef`. All source-field properties are passed through
 * verbatim.
 *
 * @typedef {Object} EnrichedField
 * @property {string} fieldName
 * @property {string} fieldType
 * @property {string} label
 * @property {string} [obligationRef]
 * @property {Visibility} [visibility]
 * @property {ObligationStatus} [obligationStatus]
 */
