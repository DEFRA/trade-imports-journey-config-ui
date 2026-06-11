# Story 03: Migrate chedpp-plants to the new notification shape

## Goal

Rewrite the **chedpp-plants** journey adapter so notifications use the
new shape declared in `01-target-shape.md`. Every committed plant
scenario continues to evaluate `submittable: true` with the same
per-status obligation counts. Retire the unused
`chedpp-notification-schema.json`. The journey remains engine-only — no
UI exposure.

This is the parallel of Story 02 (animals) but is **simpler** because:

- chedpp has no test files in the journey directory today (no
  `index.test.js`, no `resolvers.test.js`). The story adds a new
  `scenarios.test.js` to capture the regression net at the journey
  level.
- chedpp has no UI exposure. The explorer routes are hardcoded to
  `'eu-live-animals'`. No UI parity check.
- The unused schema file (`chedpp-notification-schema.json`) is deleted
  as part of this story.

## Why

Same motivation as Story 02: the IPAFFS shape is data-model baggage we
no longer need. Path depths halve. Shared fragments (`Party`, `Address`,
`Place`, `Document`) emerge from the cross-journey overlap analysis.
The engine is schema-agnostic, so the migration is journey-local.

Story 02 (animals) should land first; this story references the same
shared fragments and follows the same pattern. By implementing animals
first, the live UI path proves the design end-to-end before plants
inherits the precedent.

## Context

- `features/notification-shape/00-deep-dive.md` — inventory; plants
  touch list is shorter than animals because plants is engine-only.
- `features/notification-shape/01-target-shape.md` — target shape and
  path-translation table.
- `features/notification-shape/02-migrate-eu-live-animals.md` — the
  precedent. Implementation patterns (resolver rewrite, scenario
  builder rewrite, fragments) are inherited from there.
- `src/server/journeys/chedpp-plants/chedpp-notification-schema.json`
  — IPAFFS-derived documentation file. Unreferenced by any code
  (confirmed in deep dive). Deleted in this story.

## Specification

### 1. Files to modify (and delete)

| File                                                                | What changes                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server/journeys/chedpp-plants/obligations.json`                | Rewrite every `schemaPaths` entry per the Path Translation Table below. Strip the `notification.` prefix. 28 obligations × 38 unique paths.                                                                                                                                                                                                              |
| `src/server/journeys/chedpp-plants/resolvers.js`                    | Rewrite both `facts.*` extractors (`purposeGroup` and `commodity`) to navigate the new shape. Update `submissionDatePath` from `'notification.partOne.submissionDate'` to `'submittedAt'`. `tests.*` bodies (purpose predicates + refdata-driven flags) are unchanged. Kernel `or` import (from Story 10) stays.                                         |
| `src/server/journeys/chedpp-plants/scenarios.js`                    | Rebuild the scenario builder and the 7 plant scenarios (`importPhsiOrnamental`, `importApples`, `importPeppers`, `importBulbs`, `importSeeds`, `transitPlants`, `transhipmentPlants`) in the new shape. Shared building blocks are rewritten; signatures preserved.                                                                                      |
| `src/server/journeys/chedpp-plants/scenarios.test.js`               | **NEW.** A scenario sweep test parallel to `routes/explorer/scenarios.test.js`. For each scenario in `scenarioMap`, call `evaluate(notification, adapter)` and assert `summary.submittable === true`, `summary.unsatisfied === 0`, `summary.deferred === 0`. Per-scenario `satisfied/inactive` counts pinned to current values (captured pre-migration). |
| `src/server/journeys/chedpp-plants/chedpp-notification-schema.json` | **DELETE.** Unreferenced by any code; IPAFFS-derived; no longer matches the live shape.                                                                                                                                                                                                                                                                  |

**No source code in `src/server/engine/` is touched.** The engine
isolation test continues to pass without modification.

The `plugins/evaluation-engine/registration.test.js` (which asserts the
`import-apples` scenario evaluates submittable) continues to pass
without modification — it consumes the journey adapter through the
public engine facade and doesn't reference notification paths
directly.

### 2. Path translation

The complete `old → new` mapping for the 38 paths this journey
references (15 shared + 23 plants-only) lives in
[`01-target-shape.md` § Path translation — complete inventory](./01-target-shape.md#path-translation--complete-inventory).
That table is the **single source of truth** for the
`obligations.json` rewrite. Author from it; do not re-derive paths
from memory.

For this story specifically: use the **Shared paths** + **Plants-only
paths** sub-tables. The animals-only sub-table does not apply.

The special-case `submissionDatePath` resolver export
(`'notification.partOne.submissionDate'` → `'submittedAt'`) is also
in that section. The note on `contactDetails` vs `contacts[]` (chedpp
has both — singular plant-specific contact + shared nominated-contacts
array) is also there.

### 3. Resolver rewrite

```javascript
// Old:
const facts = {
  purposeGroup: (notification) =>
    notification?.partOne?.purpose?.purposeGroup ?? null,
  commodity: (notification) => {
    const c = notification?.partOne?.commodities?.commodityComplement?.[0]
    return c?.commodityID ? c : null
  }
}

// New:
const facts = {
  purposeGroup: (notification) => notification?.purpose?.group ?? null,
  commodity: (notification) => {
    const c = notification?.commodities?.[0]
    return c?.id ? c : null
  }
}
```

The `commodity` extractor preserves the `[0]`-only semantic (matches
the animals story — both journeys carry this limitation).

`submissionDatePath` becomes `'submittedAt'`.

The kernel `or` combinator import (`import { or } from
'#server/engine/combinators.js'`) stays — Story 10 wired this in.

### 4. Scenarios rewrite

`scenarios.js`'s shared building blocks are rewritten to produce
new-shape notifications:

- Address fragments → `{ name, address: { ...AddressFragment } }`
- Party fragments → `Party` shape
- Commodity entries → `{ id, species: { name, eppoCode, ... } }` with
  parameters inlined under the commodity (no parallel `complementParameterSet[]`).
- Consignment-level fields (numberOfPackages, totalGrossWeight, etc.)
  promoted to a `consignment` block at the top level.
- Plant-specific declarations (`gmsAccepted`) under a `declarations`
  block.

The 7 scenario constructors and `scenarioMap` are unchanged in
structure; they produce new-shape notifications.

### 5. New `scenarios.test.js` (regression net for plants)

Created at `src/server/journeys/chedpp-plants/scenarios.test.js`.
Parallel pattern to `routes/explorer/scenarios.test.js`. Asserts:

- For each of the 7 scenarios in `scenarioMap`, calling
  `evaluate(notification, { obligations, refdata, journeyResolver })`
  returns `summary.submittable === true`, `summary.unsatisfied === 0`,
  `summary.deferred === 0`.
- Per-scenario satisfied/inactive counts are pinned (counts captured
  pre-migration; populate the table at implementation time).
- Empty notification `{}` produces a mix of `unsatisfied` and
  `deferred` — never silently `satisfied` (inverse check for Risk R2).

### 6. Schema-file deletion

`src/server/journeys/chedpp-plants/chedpp-notification-schema.json` is
deleted. The deep dive verified zero source-code references to this
file; it's IPAFFS-derived documentation that does not match the
live shape and has not been maintained.

No replacement is created in this story. If a schema-driven validation
story lands later (deferred topic), it can author a new shape from
scratch.

## Tests

### Test files to add

- `src/server/journeys/chedpp-plants/scenarios.test.js` — NEW.
  Parallel to `routes/explorer/scenarios.test.js`. ~15 assertions:
  - 7 × scenario submittable assertions
  - 7 × per-scenario `satisfied/inactive` count assertions
  - 1 × empty-notification inverse check

### Test files NOT modified

- Engine contract tests (`engine/*.test.js`). The `evaluate-with-trace.test.js`
  scenario sweep happens to use eu-live-animals scenarios (not chedpp);
  no chedpp coupling.
- `plugins/evaluation-engine/registration.test.js` — already exercises
  chedpp through the facade; its `import-apples` scenario assertion
  continues to pass transparently.

## Non-functional requirements

### Test integrity

- `npm test` is green: same baseline (300 passing + 1 favicon failure)
  plus the new ~15 tests from `chedpp-plants/scenarios.test.js`.
  Post-migration baseline: **~315 passing + 1 pre-existing failure**.
- Engine contract tests pass **unmodified**.
- Framework-isolation test passes **unmodified**.
- Registration test passes **unmodified**.

### Behavioural preservation (parity targets)

For each of the 7 committed chedpp-plants scenarios, the
`{satisfied, unsatisfied, deferred, inactive}` counts must be identical
to the pre-migration values (captured pre-migration; populate the
table at implementation time):

| Scenario                 | Pre-migration satisfied | Pre-migration inactive |
| ------------------------ | ----------------------- | ---------------------- |
| `import-phsi-ornamental` | (capture)               | (capture)              |
| `import-apples`          | (capture)               | (capture)              |
| `import-peppers`         | (capture)               | (capture)              |
| `import-bulbs`           | (capture)               | (capture)              |
| `import-seeds`           | (capture)               | (capture)              |
| `transit-plants`         | (capture)               | (capture)              |
| `transhipment-plants`    | (capture)               | (capture)              |

All scenarios produce `summary.submittable === true`,
`summary.unsatisfied === 0`, `summary.deferred === 0`.

Additionally:

- An empty notification `{}` still produces a mix of `unsatisfied` and
  `deferred` — never silently `satisfied`. (Inverse check for R2.)
- The current multi-commodity routing semantic is preserved: the
  `commodity` fact extractor returns `commodities[0]` only. (R4.)

### Service health

- `npm run dev` boots cleanly. Startup log includes
  `Evaluation engine loaded: 2 journey(s), 51 total obligations`.
- All four explorer views return HTTP 200 (chedpp is not exposed
  through any of them, but they shouldn't regress).

### UI rendering parity

**Not applicable.** Plants is engine-only. The explorer route handlers
are hardcoded to `'eu-live-animals'`. UI parity is Story 02's concern.

### Code health

- `npm run lint` is clean.
- `npm run format` is a no-op.
- No new dependencies.

## Acceptance Criteria

- [ ] `obligations.json` uses the new shape. Every `schemaPath` matches
      the Path Translation Table above; no `notification.partOne.*`
      prefix.
- [ ] `resolvers.js` fact extractors navigate the new shape;
      `submissionDatePath` is `'submittedAt'`; the `[0]`-only commodity
      semantic is preserved; kernel `or` import is intact.
- [ ] All 7 scenarios in `scenarios.js` use the new shape.
- [ ] New `scenarios.test.js` exists with submittable + per-status
      count assertions for all 7 scenarios plus the empty-notification
      inverse check.
- [ ] `chedpp-notification-schema.json` is deleted from the working
      tree and git.
- [ ] Registration test continues to pass **unmodified**.
- [ ] All engine contract tests pass **unmodified**.
- [ ] Framework-isolation test passes **unmodified**.
- [ ] Full `npm test` is green.
- [ ] `grep -rn "partOne" src/server/journeys/chedpp-plants/` returns
      **zero hits**.
- [ ] `npm run dev` boots cleanly with both journeys loaded; the
      startup log line confirms `2 journey(s), 51 total obligations`.

## Risks and pre-emptive mitigations

The general risks (R1–R12) from the plan and Story 02 apply here too.
Plants-specific risks called out:

### R1 — Path typos in `schemaPaths`

Same mitigation: Path Translation Table reviewed before any code
change.

### R2 — `isEmpty` wrapper-object trap

Same mitigation: scenarios only set fields when populated; plus the
empty-notification inverse check in the new `scenarios.test.js`.

### R3 — Deep array paths

Plants does NOT have permanent-address (animals-specific). Plants'
deepest array path is `commodities[].parameters.keyDataPair` — one
`[]` layer + array of pairs. Lower complexity than animals; lower
risk.

### R4 — Multi-commodity routing

Same as animals: preserve `[0]`-only. Document explicitly.

### R5 — `submissionDatePath` prefix-strip

Same as animals: action-only obligations (e.g. plants' equivalent of
`legal-declaration` if any) remain `satisfied` for scenarios with a
populated `submittedAt`.

### R10 — Cross-journey field leakage

Plants must not reference `consignment.cph` (animals-only),
`commodities[].identifiers[]` (animals-only),
`documents.veterinary` (animals-only), or
`commodities[].species.{class,family,type,typeName}`
(animals-only species taxonomy). Animals must not reference
`commodities[].species.{eppoCode,id}`, `declarations.gmsAccepted`,
`consignment.{numberOfPackages,totalGrossWeight,totalNetWeight}`,
`entry.{bcpControlPoint,arrivalTime,isGVMS,transportType}`,
`parties.packer`, `importerLocalRef`, `ctcMrn`, `sealsContainers[]`,
or `billing`.

**Mitigation:** the Path Translation Table is split by journey. Copy
only from the appropriate column.

### R11 — Schema file deletion is irreversible

`chedpp-notification-schema.json` carries IPAFFS-derived documentation
that may be useful as historical reference. Once deleted from git, it
takes a `git log -- <path>` + `git show` to recover.

**Mitigation:** the file is unreferenced by any code (verified in the
deep dive), and the new shape is documented in
`features/notification-shape/01-target-shape.md`. The schema file's
content is reproducible from `git log` if needed for forensics. If a
schema file becomes a runtime artifact later (schema-driven validation
story), it'll be authored against the new shape from scratch.

## Verification

```bash
# 1. Path Translation Table sanity check (pre-code-change):
#    Visual review of the table in this story.

# 2. Lint clean:
npm run lint

# 3. Per-journey tests (the new scenarios.test.js):
TZ=UTC npx vitest run src/server/journeys/chedpp-plants/

# 4. Engine contract tests (must pass unmodified):
TZ=UTC npx vitest run src/server/engine/

# 5. Plugin registration test:
TZ=UTC npx vitest run src/server/plugins/evaluation-engine/registration.test.js

# 6. Full suite:
npm test
# Expected: ~315 passing + 1 pre-existing favicon failure.

# 7. Verify no partOne references remain in plants code:
grep -rn "partOne" src/server/journeys/chedpp-plants/
# Expected: zero hits.

# 8. Verify schema file is gone:
ls src/server/journeys/chedpp-plants/chedpp-notification-schema.json 2>&1
# Expected: No such file.

# 9. Verify chedpp evaluates through the facade:
#    The registration test should pass (regression check).
#    Programmatic check:
node --input-type=module -e "
import * as ch from './src/server/journeys/chedpp-plants/index.js';
import { evaluate } from './src/server/engine/evaluate.js';
const adapter = { obligations: ch.obligations, refdata: ch.refdata, journeyResolver: ch.resolvers };
for (const [key, { notification }] of Object.entries(ch.scenarios)) {
  const r = evaluate(notification, adapter);
  console.log(\`\${key.padEnd(28)} submittable=\${r.summary.submittable}\`);
}
"
# Expected: all 7 scenarios print submittable=true.

# 10. Service smoke:
npm run dev
#     Startup log: "Evaluation engine loaded: 2 journey(s), 51 total obligations"
#     All 4 explorer views still return 200 (animals unaffected).
```

## What NOT to change

- **The engine** (`src/server/engine/*`). Schema-agnostic by
  construction; no edits.
- **The plugin** (`src/server/plugins/evaluation-engine/plugin.js`).
- **The journey map** (`src/server/journeys/chedpp-plants/journey.json`).
  Fields reference obligations by `id`, not by path.
- **chedpp's `refdata.json`**. Independent of notification shape.
- **The explorer route handlers**. They're hardcoded to
  `'eu-live-animals'`; chedpp remains engine-only. No journey picker,
  no chedpp dropdown, no chedpp commodity-config view.
- **eu-live-animals**. Separate story (Story 02), already landed.
- **The multi-commodity routing semantic** (`commodities?.[0]` in the
  extractor). Preserved deliberately.
- **The kernel `or` import** (Story 10 wired this in; stays).
- **The framework-isolation test rationale or behaviour.**

## Out of scope

- Adding a chedpp UI surface (journey selector, plant scenario
  dropdown, plant-specific commodity-config view). Separate work.
- Authoring a new schema file for the new shape (deferred to a
  potential schema-driven-validation story).
- Multi-commodity routing fix. Independent limitation.
- Per-journey contract tests beyond the new `scenarios.test.js`.
  Story 11 of the engine refactor lane is deferred; this story does
  not pre-empt it.
