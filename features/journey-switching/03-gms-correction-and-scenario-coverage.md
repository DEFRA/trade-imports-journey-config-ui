# Story 03: Correct the GMS predicate and broaden plants scenario coverage

> **Prerequisite:** `00-normalise-plants-refdata.md` must land first (this
> story reads the normalised `species` table). The
> `gms-declaration-rule-investigation.md` Findings provide the rule,
> the gap analysis, and the recommended course of action — this story
> implements that recommendation. Independent of `01` / `02` in either
> direction.

## Goal

Replace the over-permissive `has_gms` derivation in
`chedpp-plants/resolvers.js` with the **verified IPAFFS predicate**
(`regulatory_authority === 'HMI' AND marketing_standard === 'GMS'`),
and broaden the committed scenarios so each genuinely-distinct cell of
the authority × marketing-standard variance is exercised by at least
one scenario. After this story the regression net actually demonstrates
the variance described in `src/server/journeys/chedpp-plants/README.md`.

## Why

`gms-declaration-rule-investigation.md` confirmed, against the live
IPAFFS source (`ipaffs-frontend-notification/.../utils/chedpp.js:21–28`),
that the GMS declaration page is required iff **any species has
`HMI`+`GMS`**. Our resolver derives `has_gms = marketing_standard != null`
— which fires for ~5,321 species-pairs instead of ~409 (~92% over-trigger).

Two coupled problems:

1. The rule is wrong. Story 00 deliberately preserved the wrong
   derivation so the migration's parity gate stayed clean; this story
   does the correction it deferred.
2. **None of the seven committed scenarios exercises the genuine
   HMI+GMS positive case** — both `import-apples` and `import-peppers`
   are `JOINT+SMS` in the committed refdata. Fixing the rule without
   broadening coverage would land a correction with no scenario that
   proves it works.

Solving either alone leaves a hole. Together they restore correctness
and make it provable.

## Context

- **The rule (verbatim, cited):** see Finding §1 of
  `gms-declaration-rule-investigation.md`. Predicate is strict-equal
  `HMI` (not "any HMI involvement" — JOINT+GMS does NOT trigger).
- **The variance table** lives in
  `src/server/journeys/chedpp-plants/README.md` (single source of truth
  for plain-English semantics + production counts).
- **Current usage of `has_gms`:** only in
  `resolvers.js#tests.requiresGmsDeclaration` (verified by grep). The
  flag is otherwise unread.
- **Today's scenarios (`scenarios.js` / `scenarioMap`):**
  - 5× PHSI fallback: `import-phsi-ornamental`, `import-bulbs`,
    `import-seeds`, `transit-plants`, `transhipment-plants`.
  - 2× JOINT+SMS: `import-apples` (`0808108090|MABSD`), `import-peppers`
    (`07096010|CPSAN`).
  - **Missing cells:** `HMI+GMS`, `HMI+SMS`, `JOINT+GMS`.
- **`scenarios.js` docstring is wrong** — it describes `import-apples`
  as "HMI commodity" but the refdata says `JOINT+SMS`. The build's
  post-hoc assertion only checked `has_gms === true`, which is satisfied
  by SMS under the buggy derivation, so the mismatch went undetected.
  Fix as part of this story.
- **Story 00** retained `regulatory_authority` + `marketing_standard`
  on `species`, so the corrected predicate is computable without any
  refdata shape change.

## Specification

### 1. Correct the resolver predicate

In `chedpp-plants/resolvers.js`, `tests.requiresGmsDeclaration` derives
activation from the **species** fields directly — no stored boolean:

```js
requiresGmsDeclaration: (commodity, refdata) => {
  const sp = refdata.species[buildRefdataKey(commodity)]
  const active = sp?.regulatory_authority === 'HMI'
              && sp?.marketing_standard === 'GMS'
  return {
    active,
    reason: active
      ? 'HMI-inspected species with GMS marketing standard'
      : 'species is not HMI+GMS (no GMS declaration required)'
  }
}
```

`lookupRouting` (introduced in Story 00) **drops `has_gms` entirely** —
the field was misleading and is no longer referenced. `has_varieties`,
`requires_billing`, and the commodity-grain flags stay as Story 00 left
them.

### 2. Pick real species for the missing cells

Each new scenario uses an **actual species from the refdata** matching
its target cell (so the fixture matches production reality, not an
invented authority/standard). Selection rule:

```bash
# HMI+GMS candidates (~409): the canonical positive case
jq -r '[.species|to_entries[]|select(.value.regulatory_authority=="HMI" and .value.marketing_standard=="GMS")]
       | .[0:5][] | "\(.key) \(.value.varieties|length // 0) varieties"' refdata.json

# HMI+SMS candidates (~38)
jq -r '[.species|to_entries[]|select(.value.regulatory_authority=="HMI" and .value.marketing_standard=="SMS")] | .[0:5][].key' refdata.json

# JOINT+GMS candidates (~4,820 — pick one for representativeness)
jq -r '[.species|to_entries[]|select(.value.regulatory_authority=="JOINT" and .value.marketing_standard=="GMS")] | .[0:5][].key' refdata.json
```

Selection guidance:

- **HMI+GMS: pick a species with NO varieties.** The variety/class page
  is a separate concern; bundling it into the GMS scenario entangles
  two signals. (A separate "HMI+GMS *with* varieties" scenario can be
  added later if variety/class coverage is wanted.)
- Pick **one species per missing cell**; record the chosen
  `(commodityCode, eppoCode)` in a scenario constant in `scenarios.js`.
- Add a small startup-time assertion in `scenarios.js` (or in the
  scenario test setup) that each chosen species actually exists in
  `refdata.species` with the expected authority + standard — so a
  refdata regeneration that drops the species fails loudly instead of
  silently breaking the scenario.

### 3. Add the three missing scenarios

Add to `scenarioMap` (parallel to existing fixtures, using the chosen
species):

| New scenario | Cell | gms-declaration | Notes |
|---|---|---|---|
| `import-hmi-gms` | HMI + GMS | **active** | The canonical positive case; the GMS declaration page should appear. |
| `import-hmi-sms` | HMI + SMS | inactive | HMI inspects, but Specific Marketing Standards apply — no GMS declaration. |
| `import-joint-gms` | JOINT + GMS | inactive | The "surprising" cell — JOINT routing doesn't fire the GMS page despite the GMS standard. |

Each scenario sets the species' notification keyDataPair fields (the
same way `importPeppers` already overrides authority+standard at
`scenarios.js:377–378`), so the fixture is self-describing.

**Submittability is non-negotiable.** Every entry in `scenarioMap` is
asserted by `scenarios.test.js` to be `submittable: true` with
`unsatisfied: 0` and `deferred: 0`. Each new fixture must carry every
field the engine needs to satisfy its obligations — for non-PHSI cells
(`HMI+GMS`, `HMI+SMS`, `JOINT+GMS`) that includes the **billing block**
(mirroring `import-apples` / `import-peppers`), and for `HMI+GMS`
specifically, the GMS declaration data (`gmsDeclarationAccepted`) since
`requiresGmsDeclaration` is now active for that scenario.

### 4. Re-pin scenario counts

`chedpp-plants/scenarios.test.js` parityTargets must change:

| Scenario | Was `(satisfied, inactive)` | Now | Reason |
|---|---|---|---|
| `import-apples` | `23, 5` | `22, 6` | `gms-declaration` moves active-satisfied → inactive |
| `import-peppers` | `22, 6` | `21, 7` | same |
| `import-hmi-gms` | — | (new pin) | active-satisfied for the GMS path |
| `import-hmi-sms` | — | (new pin) | inactive for GMS path |
| `import-joint-gms` | — | (new pin) | inactive for GMS path |

The exact pins for new scenarios will be determined at implementation
time by running the engine; the table above states only the
gms-declaration cell.

The empty-notification inverse check (Risk R2 in `scenarios.test.js`)
is unaffected.

### 5. Fix the apples docstring

Update `scenarios.js` so the `APPLES` constant and the `scenarioMap`
label no longer claim apples is "HMI" — describe it accurately as a
`JOINT+SMS` example. The `import-apples` scenario remains valuable as a
**JOINT+SMS** coverage point.

## Tests

- **Scenarios test parity** — `scenarios.test.js` pins per scenario
  `(satisfied, inactive)`; apples + peppers re-pinned; three new pins
  added.
- **Resolver unit tests** — added to the `resolvers.test.js` that
  Story 00 introduced. One case per variance cell, asserting
  `requiresGmsDeclaration` matches the variance table — and using the
  **actual chosen species** (the same `(commodityCode, eppoCode)` the
  scenario fixture uses), not a synthetic minimal refdata, so a refdata
  drift that breaks the cell is caught here as well as in the scenario
  test:
  - HMI+GMS → `active: true`
  - HMI+SMS → `active: false`
  - JOINT+GMS → `active: false`
  - JOINT+SMS → `active: false`
  - PHSI (no species row) → `active: false`
- **Engine / isolation tests** — unmodified (engine untouched).

## Non-functional requirements

- `npm test` green (modulo the pre-existing favicon failure).
- `npm run lint` clean; no new runtime dependencies.
- The committed diff: `resolvers.js`, `scenarios.js`, `scenarios.test.js`,
  and the `chedpp-plants/README.md` *Current implementation vs the
  correct rule* section updated to past tense (the rule is now correct).
- **Engine (`src/server/engine/*`) and `plugin.js` are untouched.**
- `obligations.json` / `journey.json` / `refdata.json` shape unchanged
  (the species fields read are already there from Story 00).

## Acceptance criteria

- [ ] `requiresGmsDeclaration` derives from
  `regulatory_authority === 'HMI' && marketing_standard === 'GMS'`
  read off `refdata.species`; no `has_gms` field is read.
- [ ] `lookupRouting` no longer emits `has_gms` (removed; unused).
- [ ] **`grep -rn "has_gms" src/server/journeys/chedpp-plants/` returns
  zero hits** — including in comments, tests, and scenario docstrings.
- [ ] Each new scenario is submittable (`submittable: true`,
  `unsatisfied: 0`, `deferred: 0`) — carrying billing data, and (for
  `import-hmi-gms`) the GMS declaration.
- [ ] The chosen `HMI+GMS` species has **no** varieties (focused GMS
  signal).
- [ ] Resolver unit tests use the **actual chosen species** for each
  cell (catch refdata drift at unit-test level too).
- [ ] Three new scenarios (`import-hmi-gms`, `import-hmi-sms`,
  `import-joint-gms`) exist in `scenarioMap`, each using a real
  refdata species matching its cell.
- [ ] `scenarios.test.js` parity pins updated: apples and peppers
  re-pinned; three new pins added; empty-notification inverse still
  holds.
- [ ] Resolver unit tests cover all five cells of the variance table
  (PHSI, HMI+GMS, HMI+SMS, JOINT+GMS, JOINT+SMS).
- [ ] The `APPLES` docstring no longer claims "HMI commodity".
- [ ] `chedpp-plants/README.md` updated: the "Current implementation
  vs the correct rule" section reads in the past tense.
- [ ] Full `npm test` green.

## Risks and pre-emptive mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Picking species fixtures that don't actually exist in the refdata, producing brittle scenarios. | §2 selection rule: pick from `refdata.species` via jq; record the chosen `(code, eppo)` in `scenarios.js` constants; add a startup-time assertion that each fixture's species exists. |
| R2 | The corrected predicate accidentally changes other obligations through a shared flag. | Verified: `has_gms` is read **only** by `requiresGmsDeclaration` (grep). Removing the field is safe. Resolver unit tests cover the cells; scenario parity catches any unexpected ripple. |
| R3 | New scenarios overlap with existing ones in irrelevant axes (purpose, billing, varieties) and add noise without adding signal. | Each new scenario covers exactly one missing cell and keeps other axes minimal (use a standard purpose, no varieties unless required to make the HMI+GMS variety/class flow meaningful). |
| R4 | The `HMI+GMS` scenario inadvertently exercises the variety/class page too if the chosen species has varieties, entangling two concerns into one fixture. | §2 selection rule: pick a **no-varieties** HMI+GMS species. Variety/class coverage is a separate scenario if wanted later. |
| R5 | Re-pinned scenario counts drift if the obligations set changes. | Acknowledged; the per-scenario pin is the project's standard regression contract — drift there is a feature, not a bug. |

## Verification

```bash
TZ=UTC npx vitest run src/server/journeys/chedpp-plants
npm test
# Expected: green + 1 pre-existing favicon failure; apples + peppers
# re-pinned; three new scenarios pinned; all five variance cells covered
# by resolver unit tests.

# Confirm has_gms is gone:
grep -rn "has_gms" src/server/journeys/chedpp-plants/
# Expected: zero hits.
```

Visual scrutiny (requires `01-env-selected-journey.md`):
`JOURNEY=chedpp-plants npm run dev` → `/explorer?scenario=import-hmi-gms`
should show `gms-declaration` as satisfied; `import-joint-gms` should
show it inactive — visibly demonstrating the rule.

## What NOT to change

- The engine (`src/server/engine/*`) — untouched.
- The plugin — untouched.
- `obligations.json` / `journey.json` — untouched (the obligation set
  hasn't changed, only how `gms-declaration` activates).
- `refdata.json` shape — Story 00 owns it; this story only *reads*
  the species fields.
- The five PHSI scenarios — they cover other axes (purpose, propagation,
  test-and-trial) and stay as they are.
- **Multi-commodity routing** — the real IPAFFS rule is any-species
  across the notification; our resolver applies the predicate via
  `facts.commodity = commodities[0]`. That single-commodity simplification
  is a separately-deferred concern; this story does not address it.

## Relationship to the other stories

- **After `00-normalise-plants-refdata.md`** (hard prereq — reads the
  normalised `species` table).
- **Independent of `01` and `02`.** Can be played before or after
  either. Playing before `01` means the corrected behaviour is in place
  by the time the UI exposes plants. Playing after `01` lets the new
  scenarios be visually scrutinised in the explorer immediately.
- **Closes the recommendation** logged in
  `gms-declaration-rule-investigation.md` §6.
