# Story 01: Journey-Owned Resolvers

## Goal

Extract all schema-specific knowledge from `evaluate-obligations.js` and
`trace-evaluate-obligations.js` into journey-owned resolver modules. After
this story, the evaluation engine is a generic loop that knows nothing about
any particular notification schema. Each journey provides its own `facts`,
`tests`, and configuration — full ownership of how its schema maps to
obligation evaluation.

All existing tests pass. Behaviour is identical. The engine gains the ability
to evaluate obligations against any notification schema without modification.

## Why

The evaluation engine currently hardcodes knowledge of the IPAFFS
notification structure (the `notification.partOne.*` shape). This couples the
engine to one schema. We need to support a second journey
(`gb-import-notification-v1`) that has a fundamentally different structure:

| Concept              | eu-live-animals (IPAFFS)                                | gb-import-notification-v1                        |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| Purpose              | `partOne.purpose.purposeGroup`                          | `ukRegulatoryFields.purpose.purposeGroup`        |
| Commodity            | `partOne.commodities.commodityComplement[0]`            | `consignment.goods[0]`                           |
| Commodity code field | `.commodityID`                                          | `.commodityCode`                                 |
| Species field        | `.speciesName`                                          | `.species.scientificName`                        |
| Submission date      | `partOne.submissionDate`                                | `notificationMetadata.submissionDate`            |
| Transit purposes     | `'For Transhipment to'`, `'For Transit to 3rd Country'` | `'For Transit'`                                  |
| CPH number           | routing flag in refdata                                 | explicit field at `ukRegulatoryFields.cphNumber` |

This is not cosmetic renaming — it is different nesting, different array
shapes, and different domain semantics. A config-driven approach would
produce a DSL that collapses under complex tests (like
`requiresIdentification` which traverses three levels of refdata). Instead,
each journey owns its resolver code explicitly. Duplication between journeys
is acceptable and preferred over premature abstraction.

## Context: What Is Coupled Today

Four areas of `evaluate-obligations.js` contain schema-specific knowledge:

### 1. Fact extractors (lines 15-23)

The `facts` object hardcodes IPAFFS paths:

```javascript
const facts = {
  purposeGroup: (notification) =>
    notification?.partOne?.purpose?.purposeGroup ?? null,

  commodity: (notification) => {
    const c = notification?.partOne?.commodities?.commodityComplement?.[0]
    return c?.commodityID ? c : null
  }
}
```

These know that purpose lives at `partOne.purpose.purposeGroup` and that the
first commodity complement is the one that matters. The gb-import schema puts
purpose at `ukRegulatoryFields.purpose.purposeGroup` and commodities at
`consignment.goods[0]`.

### 2. Refdata key construction (lines 100-111)

```javascript
const buildRefdataKey = (commodity) => {
  const code = commodity.commodityID
  const species = commodity.speciesName ?? ''
  return `${code}|${species}`
}
```

This knows that a commodity object has `.commodityID` and `.speciesName`. The
gb-import schema uses `.commodityCode` and `.species.scientificName`.

### 3. Action obligation fallback (lines 260-264)

```javascript
const submissionDate = notification?.partOne?.submissionDate
```

Hardcodes the path to the submission date marker. The gb-import schema puts
this at `notificationMetadata.submissionDate`.

### 4. Test implementations (lines 124-198)

Seven test functions that navigate refdata structure. These are less
problematic because refdata is already journey-specific, but some (like
`isTransit`) compare against hardcoded string constants. The test functions
also receive commodity objects whose shape they know
(e.g. calling `lookupRefdata` which uses `buildRefdataKey`).

### What is already generic

- `resolvePath(obj, path)` — works on any object shape
- `isEmpty(value)` — type-level check, no schema knowledge
- The evaluation loop in `evaluateObligations()` — iterates obligations,
  resolves conditions via `facts[name]` and `tests[name]`, checks
  satisfaction via `resolvePath`. This loop is the part we keep.
- `traceEvaluateObligations()` — wraps the evaluation loop with trace
  capture. Also generic, delegates to the same `facts` and `tests`.

## Design: Journey-Owned Resolvers (Strategy Pattern)

Each journey module exports a `resolvers` object alongside its data. The
evaluation engine receives resolvers as a parameter and delegates all
schema-specific work to them.

### The resolver contract

```javascript
/**
 * @typedef {Object} JourneyResolvers
 *
 * @property {Object<string, (notification: object) => any>} facts
 *   Named fact extractors. Each extracts a domain value from the
 *   notification. Returns null/undefined when the fact is absent
 *   (triggers 'deferred' status).
 *
 * @property {Object<string, (factValue: any, refdata: object) => { active: boolean, reason: string }>} tests
 *   Named condition tests. Each receives the extracted fact value and
 *   refdata, returns whether the condition is active with a reason string.
 *
 * @property {string} submissionDatePath
 *   Dot-notation path to the submission date field within the notification.
 *   Used for action-only obligations (empty schemaPaths) as the
 *   conventional satisfaction marker.
 */
```

This is the minimum interface the engine needs. It does not prescribe how
facts are extracted or how tests work internally — that is entirely the
journey's business.

### File layout after this story

```
src/server/
  plugins/
    evaluation-engine/
      index.js                          # Registry (CHANGED: passes resolvers)
      evaluate-obligations.js           # CHANGED: generic, receives resolvers
      trace-evaluate-obligations.js     # CHANGED: generic, receives resolvers

  journeys/
    eu-live-animals/
      index.js                          # CHANGED: exports resolvers
      resolvers.js                      # NEW: facts, tests, submissionDatePath
      obligations.json
      refdata.json
      journey.json
      scenarios.js
```

## Specification

### New file: `src/server/journeys/eu-live-animals/resolvers.js`

Move the four coupled areas out of `evaluate-obligations.js` into this file.
The code is identical — it is a cut-and-paste extraction, not a rewrite.

```javascript
/**
 * EU Live Animals journey resolvers.
 *
 * Schema-specific fact extractors and condition tests for the IPAFFS
 * notification structure (notification.partOne.* shape).
 *
 * These functions know how to navigate the IPAFFS notification schema
 * and the eu-live-animals refdata structure. No other module should
 * contain this knowledge.
 */

// -- Fact extractors --

const facts = {
  purposeGroup: (notification) =>
    notification?.partOne?.purpose?.purposeGroup ?? null,

  commodity: (notification) => {
    const c = notification?.partOne?.commodities?.commodityComplement?.[0]
    return c?.commodityID ? c : null
  }
}

// -- Refdata key construction --

const buildRefdataKey = (commodity) => {
  const code = commodity.commodityID
  const species = commodity.speciesName ?? ''
  return `${code}|${species}`
}

const lookupRefdata = (table, commodity) => {
  const exactKey = buildRefdataKey(commodity)
  if (table[exactKey]) return table[exactKey]
  const fallbackKey = `${commodity.commodityID}|`
  return table[fallbackKey] ?? null
}

// -- Condition tests --

const TRANSIT_PURPOSES = ['For Transhipment to', 'For Transit to 3rd Country']

const IDENTIFIER_NONE = 'NONE'

const tests = {
  isTransit: (purposeGroup, _refdata) => ({
    active: TRANSIT_PURPOSES.includes(purposeGroup),
    reason: TRANSIT_PURPOSES.includes(purposeGroup)
      ? `purposeGroup "${purposeGroup}" is a transit purpose`
      : `purposeGroup "${purposeGroup}" is not a transit purpose`
  }),

  requiresIdentification: (commodity, refdata) => {
    const content = lookupRefdata(refdata.content, commodity)
    if (!content)
      return { active: false, reason: 'no refdata content for commodity' }
    const idRef = content.identifiers
    const idSet = refdata.definitions?.identifier_sets?.[idRef]
    if (!idSet)
      return { active: false, reason: `identifier set ${idRef} not found` }
    const isNone = idSet.length === 1 && idSet[0] === IDENTIFIER_NONE
    return {
      active: !isNone,
      reason: isNone
        ? `identifier set ${idRef} is NONE`
        : `identifier set ${idRef} requires identification`
    }
  },

  requiresCertification: (commodity, refdata) => {
    /* ... same as current ... */
  },
  requiresWeaningStatus: (commodity, refdata) => {
    /* ... same as current ... */
  },
  requiresPermanentAddress: (commodity, refdata) => {
    /* ... same as current ... */
  },
  requiresCphNumber: (commodity, refdata) => {
    /* ... same as current ... */
  },
  requiresTransporter: (commodity, refdata) => {
    /* ... same as current ... */
  }
}

// -- Submission date path --

const submissionDatePath = 'notification.partOne.submissionDate'

// -- Exports --

export const resolvers = { facts, tests, submissionDatePath }

// Re-export internals for testing
export {
  facts,
  tests,
  buildRefdataKey,
  lookupRefdata,
  TRANSIT_PURPOSES,
  IDENTIFIER_NONE
}
```

### Changes to `evaluate-obligations.js`

Remove: `facts`, `tests`, `buildRefdataKey`, `lookupRefdata`,
`TRANSIT_PURPOSES`, `IDENTIFIER_NONE`, and the `evaluateSatisfaction`
hardcoded submission date path.

Keep: `resolvePath`, `isEmpty` (generic utilities), and the evaluation loop.

The function signature changes from:

```javascript
evaluateObligations(notification, obligations, refdata)
```

to:

```javascript
evaluateObligations(notification, obligations, refdata, resolvers)
```

Where `resolvers` is `{ facts, tests, submissionDatePath }`.

The evaluation loop changes minimally:

```javascript
// Before:
const factExtractor = facts[fact]

// After:
const factExtractor = resolvers.facts[fact]
```

```javascript
// Before:
const testFn = tests[test]

// After:
const testFn = resolvers.tests[test]
```

```javascript
// Before (in evaluateSatisfaction):
const submissionDate = notification?.partOne?.submissionDate

// After:
const submissionDate = resolvePath(notification, resolvers.submissionDatePath)
```

The `evaluateSatisfaction` function gains a `resolvers` parameter:

```javascript
const evaluateSatisfaction = (id, schemaPaths, notification, resolvers) => {
  if (!schemaPaths || schemaPaths.length === 0) {
    const submissionDate = resolvePath(
      notification,
      resolvers.submissionDatePath
    )
    if (!isEmpty(submissionDate)) {
      return { id, status: 'satisfied', missingPaths: [] }
    }
    return { id, status: 'unsatisfied', missingPaths: [] }
  }
  // ... rest unchanged ...
}
```

Exports become:

```javascript
export { evaluateObligations, resolvePath, isEmpty }
```

The journey-specific symbols (`facts`, `tests`, `buildRefdataKey`, etc.)
are no longer exported from this module.

### Changes to `trace-evaluate-obligations.js`

The function signature changes from:

```javascript
traceEvaluateObligations(notification, obligations, refdata)
```

to:

```javascript
traceEvaluateObligations(notification, obligations, refdata, resolvers)
```

Internally, `traceObligation` passes `resolvers.facts` and `resolvers.tests`
where it currently accesses the module-level `facts` and `tests` imports.

The import changes from:

```javascript
import {
  evaluateObligations,
  facts,
  tests,
  resolvePath,
  isEmpty
} from './evaluate-obligations.js'
```

to:

```javascript
import {
  evaluateObligations,
  resolvePath,
  isEmpty
} from './evaluate-obligations.js'
```

`facts` and `tests` are no longer imported — they come from the `resolvers`
parameter.

### Changes to `journeys/eu-live-animals/index.js`

Add the resolvers export:

```javascript
export { resolvers } from './resolvers.js'
```

### Changes to `plugins/evaluation-engine/index.js`

The registry passes resolvers through to the evaluation function:

```javascript
// Before:
evaluate(journeyKey, notification) {
  const journey = JOURNEYS[journeyKey]
  return traceEvaluateObligations(
    notification, journey.obligations, journey.refdata
  )
}

// After:
evaluate(journeyKey, notification) {
  const journey = JOURNEYS[journeyKey]
  return traceEvaluateObligations(
    notification, journey.obligations, journey.refdata, journey.resolvers
  )
}
```

The validation function gains a resolvers check:

```javascript
if (!journey.resolvers?.facts || typeof journey.resolvers.facts !== 'object') {
  throw new Error(`Journey "${key}": resolvers.facts is missing`)
}
if (!journey.resolvers?.tests || typeof journey.resolvers.tests !== 'object') {
  throw new Error(`Journey "${key}": resolvers.tests is missing`)
}
if (typeof journey.resolvers?.submissionDatePath !== 'string') {
  throw new Error(`Journey "${key}": resolvers.submissionDatePath is missing`)
}
```

### Changes to test files

#### `evaluate-obligations.test.js`

Import resolvers from the journey module:

```javascript
import { resolvers } from '../../journeys/eu-live-animals/resolvers.js'
```

Update every `evaluateObligations(notification, obligations, refdata)` call
to `evaluateObligations(notification, obligations, refdata, resolvers)`.

Tests that directly reference `facts`, `tests`, `buildRefdataKey`,
`lookupRefdata`, `TRANSIT_PURPOSES`, `IDENTIFIER_NONE` should import them
from `resolvers.js` instead of `evaluate-obligations.js`.

#### `trace-evaluate-obligations.test.js`

Same pattern — import `resolvers` and pass as fourth argument.

#### New file: `journeys/eu-live-animals/resolvers.test.js`

Test the resolver contract independently of the evaluation engine:

1. **Each fact extractor returns the expected value or null**
   - `facts.purposeGroup` extracts from `partOne.purpose.purposeGroup`
   - `facts.purposeGroup` returns null for empty notification
   - `facts.commodity` extracts first commodity complement
   - `facts.commodity` returns null when no commodities present

2. **Each test returns `{ active: boolean, reason: string }`**
   - `tests.isTransit` returns active for transit purpose strings
   - `tests.isTransit` returns inactive for non-transit purposes
   - `tests.requiresIdentification` traverses refdata correctly
   - Each routing flag test checks the correct boolean

3. **submissionDatePath resolves against a real notification**
   - `resolvePath(notification, resolvers.submissionDatePath)` returns
     the expected value

These tests are the journey's own contract tests. When a second journey is
added, it gets its own `resolvers.test.js` with equivalent coverage.

## What This Enables

After this story, adding the `gb-import-notification-v1` journey requires:

1. Create `journeys/gb-import-v1/resolvers.js` with its own facts, tests,
   and submissionDatePath
2. Create `journeys/gb-import-v1/obligations.json` with schema paths into
   the new notification structure
3. Create `journeys/gb-import-v1/refdata.json` (if applicable)
4. Create `journeys/gb-import-v1/index.js` exporting data + resolvers
5. Register the journey in the evaluation-engine plugin's `JOURNEYS` map

The evaluation engine does not change. No existing journey is affected.

## Acceptance Criteria

- [ ] `evaluate-obligations.js` has zero imports of journey-specific symbols
- [ ] `evaluate-obligations.js` does not reference `partOne`, `commodityComplement`, `commodityID`, `speciesName`, `submissionDate`, or any IPAFFS path
- [ ] `evaluateObligations` signature is `(notification, obligations, refdata, resolvers)`
- [ ] `traceEvaluateObligations` signature is `(notification, obligations, refdata, resolvers)`
- [ ] `journeys/eu-live-animals/resolvers.js` exports `{ resolvers }` containing `{ facts, tests, submissionDatePath }`
- [ ] `journeys/eu-live-animals/index.js` re-exports `resolvers`
- [ ] Evaluation engine plugin passes `journey.resolvers` to the evaluator
- [ ] Plugin startup validation rejects journeys with missing resolvers
- [ ] All existing tests pass (count should match current suite)
- [ ] New `resolvers.test.js` tests the resolver contract independently
- [ ] `resolvePath` and `isEmpty` remain exported from `evaluate-obligations.js` (they are generic)

## Verification

```bash
# All tests pass
npm test

# No IPAFFS-specific paths remain in the engine
grep -n "partOne\|commodityComplement\|commodityID\|speciesName" \
  src/server/plugins/evaluation-engine/evaluate-obligations.js
# Expected: no matches

grep -n "partOne\|commodityComplement\|commodityID\|speciesName" \
  src/server/plugins/evaluation-engine/trace-evaluate-obligations.js
# Expected: no matches

# Resolvers exist and export the contract
node -e "import('./src/server/journeys/eu-live-animals/resolvers.js').then(m => {
  const r = m.resolvers;
  console.assert(typeof r.facts === 'object', 'facts missing');
  console.assert(typeof r.tests === 'object', 'tests missing');
  console.assert(typeof r.submissionDatePath === 'string', 'submissionDatePath missing');
  console.log('Resolver contract OK');
})"
```

## What NOT to change

- Do not modify obligation JSON files — schema paths are already journey-specific and correct
- Do not modify `map-to-screens.js` — it operates on evaluation results, not notifications
- Do not modify templates or client-side JavaScript
- Do not change the shape of data returned by `evaluateObligations` or `traceEvaluateObligations`
- Do not create shared base classes or abstract factories for resolvers — each journey is a standalone module
- Do not extract `resolvePath` or `isEmpty` into a separate utility module (they are small, co-located with their only consumer, and not worth the indirection)
