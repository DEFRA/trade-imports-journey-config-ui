/**
 * Test suite for trace evaluator.
 *
 * Contract: traceEvaluateObligations returns observationally equivalent
 * results to evaluateObligations, enhanced with trace metadata explaining
 * how each status was determined.
 *
 * Focus: Status equivalence, terminal step consistency, summary correctness.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateObligations } from './evaluate-obligations.js'
import { traceEvaluateObligations } from './trace-evaluate-obligations.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INPUT_DIR = join(__dirname, '../../journeys/eu-live-animals')

// ---------------------------------------------------------------------------
// Static fixtures — loaded once
// ---------------------------------------------------------------------------
let obligations
let refdata

beforeAll(async () => {
  const [obligationsFile, refdataFile] = await Promise.all([
    readFile(join(INPUT_DIR, 'obligations.json'), 'utf-8'),
    readFile(join(INPUT_DIR, 'refdata.json'), 'utf-8')
  ])
  obligations = JSON.parse(obligationsFile).obligations
  refdata = JSON.parse(refdataFile)

  // Validate fixtures are suitable for testing
  if (!Array.isArray(obligations) || obligations.length === 0) {
    throw new Error(
      'Test fixture: obligations array is empty or invalid'
    )
  }
  if (!refdata.routing || !refdata.content || !refdata.definitions) {
    throw new Error(
      'Test fixture: refdata missing required keys (routing, content, definitions)'
    )
  }
})

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const findObligation = (result, id) =>
  result.obligations.find((o) => o.id === id)

const evaluate = (notification) =>
  evaluateObligations(notification, obligations, refdata)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const EMPTY_NOTIFICATION = {}

const CATTLE = '102|Bos taurus'
const DOG = '1061900|Canis familiaris'

/**
 * Build a minimal notification with a specific commodity.
 * commodity format: "commodityID|speciesName"
 */
const withCommodity = (commodityKey) => {
  const [commodityID, speciesName] = commodityKey.split('|')
  return {
    partOne: {
      commodities: {
        commodityComplement: [
          {
            commodityID,
            speciesName: speciesName || undefined
          }
        ]
      }
    }
  }
}

/**
 * Build a minimal notification with purpose.
 */
const withPurpose = (purposeGroup) => {
  return {
    partOne: {
      purpose: {
        purposeGroup
      }
    }
  }
}

/**
 * Fully satisfied cattle notification for testing submittable=true.
 * Contains all required fields for CATTLE commodity obligations.
 */
const FULL_CATTLE_NOTIFICATION = {
  type: 'CVEDA',
  partOne: {
    submissionDate: '2026-04-11T10:00:00Z',
    commodities: {
      countryOfOrigin: 'FR',
      regionOfOrigin: 'FR-75',
      commodityComplement: [
        {
          commodityID: '102',
          speciesName: 'Bos taurus',
          speciesTypeName: 'Cattle',
          speciesType: 'Bovine',
          speciesClass: 'Mammals',
          speciesFamilyName: 'Bovidae',
          speciesNomination: 'Species'
        }
      ],
      complementParameterSet: [
        {
          keyDataPair: [{ key: 'number_of_animals', data: '10' }],
          identifiers: [{ data: 'GB123456789012' }]
        }
      ]
    },
    purpose: {
      purposeGroup: 'For Import',
      internalMarketPurpose: 'Permanent Import'
    },
    cphNumber: 'CPH12/345/6789',
    veterinaryInformation: {
      veterinaryDocument: 'CERT123',
      veterinaryDocumentIssueDate: '2026-04-10',
      establishmentsOfOrigin: [{ approvalNumber: 'FR12345', name: 'Test Farm' }],
      accompanyingDocuments: [
        {
          documentType: 'HEALTH_CERTIFICATE',
          documentReference: 'CERT123',
          documentIssueDate: '2026-04-10',
          attachmentId: 'ATT123'
        }
      ]
    },
    consignor: {
      companyName: 'Test Consignor',
      street: '123 Test St',
      city: 'Test City',
      postalCode: '12345',
      country: 'FR'
    },
    consignee: {
      companyName: 'Test Consignee',
      street: '456 Test Ave',
      city: 'Test Town',
      postalCode: '67890',
      country: 'GB'
    },
    importer: {
      companyName: 'Test Importer',
      street: '789 Import Rd',
      city: 'Import City',
      postalCode: 'IM1 2PT',
      country: 'GB'
    },
    placeOfDestination: {
      street: '321 Destination Ln',
      city: 'Destination',
      postalCode: 'DE1 2ST',
      country: 'GB'
    },
    pointOfEntry: 'GBLHR',
    arrivalDate: '2026-04-15',
    transporter: {
      companyName: 'Test Transport Ltd',
      street: '111 Transport Way',
      city: 'Transport Town',
      postalCode: 'TR1 2PT',
      country: 'GB'
    },
    nominatedContacts: [
      {
        name: 'John Doe',
        email: 'john@example.com',
        telephone: '+44 1234 567890'
      }
    ]
  }
}

// ===========================================================================
// GROUP 1: Status Equivalence (CRITICAL)
// ===========================================================================
describe('Status Equivalence with Canonical Evaluator', () => {
  it('returns identical statuses for empty notification', () => {
    const notification = EMPTY_NOTIFICATION
    const canonical = evaluate(notification)
    const traced = traceEvaluateObligations(notification, obligations, refdata)

    // For every obligation, statuses must match
    traced.obligations.forEach((tracedObligation) => {
      const canonicalObligation = findObligation(canonical, tracedObligation.id)
      expect(tracedObligation.status).toBe(canonicalObligation.status)
    })
  })

  it('returns identical statuses for partially filled notification', () => {
    const notification = {
      partOne: {
        commodities: {
          commodityComplement: [
            {
              commodityID: '102',
              speciesName: 'Bos taurus'
            }
          ]
        },
        purpose: {
          purposeGroup: 'For Import'
        }
      }
    }
    const canonical = evaluate(notification)
    const traced = traceEvaluateObligations(notification, obligations, refdata)

    traced.obligations.forEach((tracedObligation) => {
      const canonicalObligation = findObligation(canonical, tracedObligation.id)
      expect(tracedObligation.status).toBe(canonicalObligation.status)
    })
  })

  it('returns identical statuses for fully satisfied notification', () => {
    const notification = FULL_CATTLE_NOTIFICATION
    const canonical = evaluate(notification)
    const traced = traceEvaluateObligations(notification, obligations, refdata)

    traced.obligations.forEach((tracedObligation) => {
      const canonicalObligation = findObligation(canonical, tracedObligation.id)
      expect(tracedObligation.status).toBe(canonicalObligation.status)
    })
  })
})

// ===========================================================================
// GROUP 2: Trace Metadata Presence (HIGH)
// ===========================================================================
describe('Trace Metadata Presence', () => {
  it('returns trace object for each obligation', () => {
    const notification = withCommodity(CATTLE)
    const result = traceEvaluateObligations(notification, obligations, refdata)

    result.obligations.forEach((obligation) => {
      expect(obligation.trace).toBeDefined()
      expect(obligation.trace.steps).toBeInstanceOf(Array)
    })
  })

  it('trace.steps is non-empty for all obligations', () => {
    const notification = withCommodity(CATTLE)
    const result = traceEvaluateObligations(notification, obligations, refdata)

    result.obligations.forEach((obligation) => {
      expect(obligation.trace.steps.length).toBeGreaterThan(0)
    })
  })
})

// ===========================================================================
// GROUP 3: Terminal Step Consistency (HIGH)
// ===========================================================================
describe('Terminal Step Consistency', () => {
  it('terminal step type matches status for satisfied obligations', () => {
    const notification = FULL_CATTLE_NOTIFICATION
    const result = traceEvaluateObligations(notification, obligations, refdata)

    const satisfiedObligations = result.obligations.filter(
      (o) => o.status === 'satisfied'
    )
    expect(satisfiedObligations.length).toBeGreaterThan(0) // Fixture sanity check

    satisfiedObligations.forEach((obligation) => {
      const terminalStep = obligation.trace.steps.at(-1)

      // Terminal step can be either satisfaction-check (data obligations)
      // or action-check (action-only obligations like legal-declaration)
      if (obligation.missingPaths.length === 0 && terminalStep.step === 'action-check') {
        // Action-only obligation
        expect(terminalStep.satisfied).toBe(true)
      } else {
        // Data obligation
        expect(terminalStep.step).toBe('satisfaction-check')
        expect(terminalStep.missing).toBe(0)
      }
    })
  })

  it('satisfaction-check steps include pathDetails with per-path status', () => {
    const notification = FULL_CATTLE_NOTIFICATION
    const result = traceEvaluateObligations(notification, obligations, refdata)

    const satCheckSteps = result.obligations
      .flatMap((o) => o.trace.steps)
      .filter((s) => s.step === 'satisfaction-check')

    expect(satCheckSteps.length).toBeGreaterThan(0)

    satCheckSteps.forEach((step) => {
      expect(step.pathDetails).toBeInstanceOf(Array)
      expect(step.pathDetails.length).toBe(step.paths)

      // Count of satisfied: false should equal step.missing
      const missingCount = step.pathDetails.filter((d) => !d.satisfied).length
      expect(missingCount).toBe(step.missing)

      // Each detail has path (string) and satisfied (boolean)
      step.pathDetails.forEach((detail) => {
        expect(typeof detail.path).toBe('string')
        expect(typeof detail.satisfied).toBe('boolean')
      })
    })
  })

  it('terminal step type matches status for unsatisfied obligations', () => {
    const notification = {
      partOne: {
        commodities: {
          commodityComplement: [
            {
              commodityID: '102',
              speciesName: 'Bos taurus'
            }
          ]
        },
        purpose: {
          purposeGroup: 'For Import'
        }
      }
    }
    const result = traceEvaluateObligations(notification, obligations, refdata)

    // Filter out action-only obligations (empty schemaPaths) as they have missing=0
    const unsatisfiedObligations = result.obligations.filter(
      (o) => o.status === 'unsatisfied' && o.missingPaths.length > 0
    )
    expect(unsatisfiedObligations.length).toBeGreaterThan(0)

    unsatisfiedObligations.forEach((obligation) => {
      const terminalStep = obligation.trace.steps.at(-1)
      expect(terminalStep.step).toBe('satisfaction-check')
      expect(terminalStep.missing).toBeGreaterThan(0)
    })
  })

  it('terminal step type matches status for deferred obligations', () => {
    const notification = EMPTY_NOTIFICATION // No commodity selected
    const result = traceEvaluateObligations(notification, obligations, refdata)

    const deferredObligations = result.obligations.filter(
      (o) => o.status === 'deferred'
    )
    expect(deferredObligations.length).toBeGreaterThan(0)

    deferredObligations.forEach((obligation) => {
      const terminalStep = obligation.trace.steps.at(-1)
      expect(terminalStep.step).toBe('deferred')
      expect(terminalStep.reason).toBeDefined()
    })
  })

  it('terminal step type matches status for inactive obligations', () => {
    const notification = {
      partOne: {
        commodities: {
          commodityComplement: [
            {
              commodityID: '1061900',
              speciesName: 'Canis familiaris'
            }
          ]
        },
        purpose: {
          purposeGroup: 'For Import'
        }
      }
    }
    const result = traceEvaluateObligations(notification, obligations, refdata)

    const inactiveObligations = result.obligations.filter(
      (o) => o.status === 'inactive'
    )
    expect(inactiveObligations.length).toBeGreaterThan(0)

    inactiveObligations.forEach((obligation) => {
      const terminalStep = obligation.trace.steps.at(-1)
      expect(terminalStep.step).toBe('inactive')
      expect(terminalStep.reason).toBeDefined()
    })
  })
})

// ===========================================================================
// GROUP 4: Summary Correctness (HIGH)
// ===========================================================================
describe('Summary Correctness', () => {
  it('summary counts match actual statuses', () => {
    const notification = {
      partOne: {
        commodities: {
          commodityComplement: [
            {
              commodityID: '102',
              speciesName: 'Bos taurus'
            }
          ]
        },
        purpose: {
          purposeGroup: 'For Import'
        }
      }
    }
    const result = traceEvaluateObligations(notification, obligations, refdata)

    const actualCounts = {
      satisfied: result.obligations.filter((o) => o.status === 'satisfied')
        .length,
      unsatisfied: result.obligations.filter((o) => o.status === 'unsatisfied')
        .length,
      deferred: result.obligations.filter((o) => o.status === 'deferred')
        .length,
      inactive: result.obligations.filter((o) => o.status === 'inactive').length
    }

    expect(result.summary.satisfied).toBe(actualCounts.satisfied)
    expect(result.summary.unsatisfied).toBe(actualCounts.unsatisfied)
    expect(result.summary.deferred).toBe(actualCounts.deferred)
    expect(result.summary.inactive).toBe(actualCounts.inactive)
    expect(result.summary.total).toBe(obligations.length)
  })

  it('submittable is true when all obligations satisfied or inactive', () => {
    const notification = FULL_CATTLE_NOTIFICATION
    const result = traceEvaluateObligations(notification, obligations, refdata)

    // Verify test precondition
    expect(result.summary.unsatisfied).toBe(0)
    expect(result.summary.deferred).toBe(0)

    expect(result.summary.submittable).toBe(true)
  })

  it('submittable is false when any unsatisfied or deferred', () => {
    const notification = {
      partOne: {
        commodities: {
          commodityComplement: [
            {
              commodityID: '102',
              speciesName: 'Bos taurus'
            }
          ]
        },
        purpose: {
          purposeGroup: 'For Import'
        }
      }
    }
    const result = traceEvaluateObligations(notification, obligations, refdata)

    // Verify test precondition (at least one blocker exists)
    const hasBlockers =
      result.summary.unsatisfied > 0 || result.summary.deferred > 0
    expect(hasBlockers).toBe(true)

    expect(result.summary.submittable).toBe(false)
  })
})