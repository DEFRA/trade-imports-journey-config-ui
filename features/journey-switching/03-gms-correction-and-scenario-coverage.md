# Story 03: Normalise plants refdata, correct the GMS predicate, broaden scenarios

> **Prerequisite:** `gms-declaration-rule-investigation.md` Findings are
> complete and supply the verified rule, the gap analysis, and the
> per-scenario re-pin impact. Read `plants-refdata-model.md` first — it
> is the contract this story implements.

## Goal

One coherent sweep over plants journey-adapter correctness, with two
phases:

1. **Preflight — normalise the data.** Replace the flat denormalised
   `chedpp-plants/refdata.json` with the explicit two-grain
   `{ commodities, species, classes-per-commodity }` shape, restore the
   per-commodity `commodity_class` linkage that the original build
   dropped, and remove the stored derived flags
   (`has_gms`/`has_varieties`/`requires_billing`). Behaviour-preserving:
   all seven committed scenarios keep their pinned counts after Phase A.
2. **Main — correct the rule and broaden scenarios.** Replace the
   over-permissive `has_gms = marketing_standard != null` derivation
   with the verified IPAFFS predicate
   `regulatory_authority === 'HMI' && marketing_standard === 'GMS'`,
   add scenarios for `HMI+GMS`, `HMI+SMS`, and `JOINT+GMS` so each cell
   of the authority × marketing-standard variance is exercised, and
   re-pin `import-apples` and `import-peppers` (their `gms-declaration`
   flips from active to inactive under the corrected rule).

The obligation **engine (`src/server/engine/*`) is not touched.**

## Why

The plants refdata as currently committed has five concrete bugs
itemised in `plants-refdata-model.md`: commodity-grain flags duplicated
onto every species row; three derived booleans stored
(`has_gms`/`has_varieties`/`requires_billing`); `has_gms` is a misnomer
(true for SMS); and `commodity_class` per-commodity data was dropped at
build time. Surfacing this data in story 02 without first making it
coherent is what the user explicitly ruled out.

Independently, `gms-declaration-rule-investigation.md` confirmed —
against `ipaffs-frontend-notification/.../utils/chedpp.js:21–28` — that
the real rule is *any species with `HMI` + `GMS`*. Our resolver fires for
~5,321 species-pairs instead of ~409 — a ~92 % over-trigger, almost all
JOINT.

Phases A and B are bundled because they share files (`resolvers.js`,
`scenarios.js`, `scenarios.test.js`), and because the corrected
predicate is most naturally expressed against the normalised
`species[k]` table — separating them would mean writing the corrected
resolver twice. The phase split keeps the parity gate clean: Phase A
preserves behaviour exactly; Phase B is the one deliberate behaviour
change, isolated and tested.

## Context

- **Producer of today's refdata:** `cdp-fieldconfig-analysis-frontend/
  data-analysis/field-config/scripts/build-chedpp-refdata.js` (cross-
  repo). We do **not** edit it; reconstruction happens **here**.
- **Only evaluation consumer of plants refdata:**
  `src/server/journeys/chedpp-plants/resolvers.js` — `lookupRefdata`
  reads `refdata.routing` with a `code|eppo` → `code|` fallback and
  returns one merged object; six `tests.*` read its fields.
  `requiresGmsDeclaration` reads only `routing.has_gms`.
- **Plugin guard:** `src/server/plugins/evaluation-engine/plugin.js`
  asserts **every** journey has `refdata.routing` as an object. Plants
  drops `routing` here, so this cross-journey guard becomes journey-
  agnostic.
- **The engine** (`src/server/engine/*`) passes `refdata` opaquely to
  `testFn(factValue, refdata)` — it never inspects shape. Untouched.
- **The explorer does NOT read plants refdata yet** —
  `commodity-config-controller.js` imports *animals* refdata directly
  and plants commodity-config is gated off (story 01 §7). So this
  story's blast radius excludes the explorer. The shared
  `config-utils#extractCommodityOptions` reads `refdata.routing` and
  will need a per-journey adaptation when story 02 wires plants
  commodity-config — out of scope here.
- **Sources reachable on this machine** (to vendor, not depend on live):
  - `commodity_class-IMTA-*.dat` —
    `imports/ipaffs-files/commoditycode/` and
    `imports/ipaffs-docker-local/data-management/commodity_class/`.
  - The `dbo_*.csv` species sources —
    `cdp-fieldconfig-analysis-frontend/analysis/data/` (not needed —
    Phase A reconstructs from the committed flat file).
- **Parity baseline** — `chedpp-plants/scenarios.test.js` pins per-
  scenario `(satisfied, inactive)`, plus `submittable: true`,
  `unsatisfied=0`, `deferred=0`, plus the empty-notification inverse.
- **Coverage note:** group-only commodities (Wood, Machinery — a group
  but no phytosanitary species) are already absent from the flat
  `content`/`routing`. Reconstruct-from-flat preserves that absence —
  not new data loss.
- **Today's scenarios** cover only PHSI fallback + `JOINT+SMS`
  (apples, peppers). `HMI+GMS`, `HMI+SMS`, `JOINT+GMS` are not exercised.

## Specification

### Phase A — Normalise plants refdata (behaviour-preserving)

#### A1. Contain the one-shot migration tooling (git-ignored)

The reconstruction is a **one-shot migration**: it reads the current
flat `refdata.json` (+ a vendored `commodity_class` snapshot) and
writes the normalised `refdata.json` once. Because its inputs are not
committed, it is not reproducible from a clean clone — that is
acceptable for a one-shot migration, and matches the instruction to
keep the "AI explosion" out of the repo.

All tooling lives in `data-reconstruction/` (added to `.gitignore`):
the scripts, the vendored `commodity_class` snapshot, a snapshot of
the pre-migration flat `refdata.json` (the round-trip oracle), and
the dev-time tests. **Nothing under `data-reconstruction/` is
committed.**

```
# .gitignore (add)
data-reconstruction/
```

Ongoing verification does not depend on this tooling — it comes from a
**committed invariant test** on the output (A7).

#### A2. Reconstruct from the committed flat file (+ one vendored source)

The transform is a pure function of the pre-migration flat
`refdata.json` plus the vendored `commodity_class` snapshot —
deterministic. Everything except classes is a lossless de-normalisation
of data already in the file; only `classes` needs an external source.

- Emit `{ commodities, species, classes-per-commodity }` per
  `plants-refdata-model.md` §"Target normalised shape":
  - `species[code|eppo]` ← `content[code|eppo]` + `varieties` from
    `definitions.varieties[code|eppo]` (omit `varieties` when none).
  - `commodities[code]` ← commodity-grain flags read off the `code|`
    fallback routing rows (`requires_test_and_trial`,
    `requires_finished_or_propagated`, `propagation`) + `group` from
    `definitions.groups[code]`. Include every commodity code that has a
    `code|` fallback row.
  - **Drop** `has_gms`, `has_varieties`, `requires_billing` (derived
    at read time — A5).
- **Round-trip oracle (dev-time, in `data-reconstruction/`):** re-
  flatten the normalised output back to
  `routing`/`content`/`definitions` and assert it equals the snapshotted
  pre-migration file **with an explicit allowlist of permitted
  differences and nothing else**:
  - re-derived `has_gms` = `marketing_standard != null` *(Phase A —
    parity)*, `has_varieties` = `varieties?.length > 0`,
    `requires_billing` = species-row present — must equal the originals
    byte-for-byte.
  - `definitions.classes` literal replaced by per-commodity `classes`.

  Any diff outside this allowlist fails the migration.

#### A3. Target normalised shape

Per `plants-refdata-model.md` §"Target normalised shape". Keep a
`_meta` block recording generation date, source snapshot identity (the
`commodity_class` IMTA revision), and counts.

#### A4. Restore the `classes` linkage

`commodity_class` is `(commodity_code, class)`. **Pin a specific IMTA
revision deliberately** (don't just take "highest") and record it in
`_meta`; confirm its commodity codes resolve against `commodities` and
its row count matches the exploration doc (~82). Group by commodity
code into a **deterministically ordered** class list (use the source
`display_order` if present, else the canonical `Extra Class` →
`Class I` → `Class II` order) and attach as `commodities[code].classes`.
Commodities without classes omit the key.

#### A5. Adapt the evaluation consumer (behaviour-preserving)

`resolvers.js`: replace `lookupRefdata(refdata.routing, commodity)`
with a read-time merge that reconstructs the **identical** routing
object from the two tables (see `plants-refdata-model.md` §"How
evaluation reads it"). For Phase A the derivations reproduce today's
values **exactly**:

- `has_gms` ← `marketing_standard != null`  *(Phase A only —
  Phase B replaces this)*
- `has_varieties` ← `(varieties?.length ?? 0) > 0`
- `requires_billing` ← species row present
- commodity flags ← `commodities[code]`
- PHSI-only (no species row) → fallback with `has_gms=false`,
  `has_varieties=false`, `requires_billing=false`.

Keep `buildRefdataKey`. Update the six `tests.*` call sites and the
exports.

**Phase A gate:** all seven scenarios keep their pinned
`(satisfied, inactive)` counts. Phase B re-pins apples and peppers —
no other scenario moves.

#### A6. Relax the plugin guard

`plugin.js`: change the per-journey assertion from "must have
`refdata.routing`" to journey-agnostic ("`refdata` is a non-null
object"). Refdata shape is a journey concern; the plugin should not
assert it. Animals (keeps `routing`) and plants (doesn't) both pass.

#### A7. Commit an invariant test on the normalised refdata

A new **committed** test (e.g.
`chedpp-plants/refdata.test.js`) asserts the *output* is well-formed,
independent of the git-ignored tooling:

- no legacy keys (`routing`/`content`/`definitions` absent);
  `commodities` + `species` present.
- **referential integrity:** every `species["code|eppo"]` has a
  matching `commodities["code"]`.
- `classes`, where present, is a non-empty array of strings.
- `_meta` records the `commodity_class` revision used.

This is the durable, CI-able guarantee that the committed data is
coherent.

### Phase B — Correct the GMS predicate and broaden scenarios

#### B1. Correct the resolver predicate

In `chedpp-plants/resolvers.js`, `tests.requiresGmsDeclaration`
derives activation from the **species** fields directly — no stored
boolean:

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

`lookupRouting` (from A5) **drops `has_gms` entirely** — the field was
misleading and is no longer referenced. `has_varieties`,
`requires_billing`, and the commodity-grain flags stay.

#### B2. Pick real species for the missing cells

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

- **HMI+GMS: pick a species with NO varieties.** The variety/class
  page is a separate concern; bundling it into the GMS scenario
  entangles two signals.
- Pick **one species per missing cell**; record the chosen
  `(commodityCode, eppoCode)` in a scenario constant in `scenarios.js`.
- Add a small startup-time assertion in `scenarios.js` (or in the
  scenario test setup) that each chosen species actually exists in
  `refdata.species` with the expected authority + standard — so a
  refdata regeneration that drops the species fails loudly instead of
  silently breaking the scenario.

#### B3. Add the three missing scenarios

Add to `scenarioMap` (parallel to existing fixtures, using the chosen
species):

| New scenario | Cell | gms-declaration | Notes |
|---|---|---|---|
| `import-hmi-gms` | HMI + GMS | **active** | Canonical positive case; the GMS declaration page should appear. |
| `import-hmi-sms` | HMI + SMS | inactive | HMI inspects, but Specific Marketing Standards apply — no GMS declaration. |
| `import-joint-gms` | JOINT + GMS | inactive | The "surprising" cell — JOINT routing doesn't fire the GMS page despite the GMS standard. |

Each scenario sets the species' notification keyDataPair fields (the
same way `importPeppers` already overrides authority+standard at
`scenarios.js:377–378`), so the fixture is self-describing.

**Submittability is non-negotiable.** Every entry in `scenarioMap` is
asserted by `scenarios.test.js` to be `submittable: true` with
`unsatisfied: 0` and `deferred: 0`. Each new fixture must carry every
field the engine needs to satisfy its obligations — for non-PHSI cells
(`HMI+GMS`, `HMI+SMS`, `JOINT+GMS`) that includes the **billing
block** (mirroring `import-apples` / `import-peppers`), and for
`HMI+GMS` specifically, the GMS declaration data
(`gmsDeclarationAccepted`) since `requiresGmsDeclaration` is now
active for that scenario.

#### B4. Re-pin scenario counts

`chedpp-plants/scenarios.test.js` parityTargets:

| Scenario | Was `(satisfied, inactive)` | Now | Reason |
|---|---|---|---|
| `import-apples` | `23, 5` | `22, 6` | `gms-declaration` moves active-satisfied → inactive (corrected predicate; apples is JOINT+SMS in refdata) |
| `import-peppers` | `22, 6` | `21, 7` | same — peppers is JOINT+SMS |
| `import-hmi-gms` | — | (new pin) | active-satisfied for the GMS path |
| `import-hmi-sms` | — | (new pin) | inactive for GMS path |
| `import-joint-gms` | — | (new pin) | inactive for GMS path |

Exact pins for new scenarios are determined at implementation time.
The empty-notification inverse check is unaffected.

#### B5. Fix the apples docstring

Update `scenarios.js` so the `APPLES` constant and the `scenarioMap`
label no longer claim apples is "HMI" — describe it accurately as a
`JOINT+SMS` example. `import-apples` remains valuable as a `JOINT+SMS`
coverage point.

## Tests

- **Round-trip equality** (dev-time, git-ignored) — A2's allowlist
  verify. Catches a sloppy migration.
- **Committed invariant test** (A7) — output well-formedness +
  referential integrity. Catches refdata corruption on every CI run.
- **Scenario parity / re-pins** — `scenarios.test.js`: all PHSI
  scenarios unchanged; apples + peppers re-pinned per B4; three new
  pins added; empty-notification inverse still holds.
- **Resolver unit tests** — added to the `resolvers.test.js`
  introduced in Phase A. One case per variance cell, using the
  **actual chosen species** for each cell:
  - HMI+GMS → `active: true`
  - HMI+SMS → `active: false`
  - JOINT+GMS → `active: false`
  - JOINT+SMS → `active: false`
  - PHSI (no species row) → `active: false`
- **Plugin guard** — a journey whose refdata lacks `routing`
  registers cleanly; a non-object refdata still fails.
- **Engine + isolation tests** — pass unmodified (proves the engine
  is untouched).

## Non-functional requirements

- `npm test` green (modulo the pre-existing favicon failure).
- `npm run lint` clean; **no new runtime dependencies** (Node
  built-ins only for the migration tooling).
- **Committed diff:** `refdata.json` (rewritten), `resolvers.js`,
  `plugin.js`, new `refdata.test.js`, new `resolvers.test.js`,
  `scenarios.js`, `scenarios.test.js`, `.gitignore`. Nothing under
  `data-reconstruction/` committed.
- Engine, animals journey, chedpp `obligations.json` /
  `journey.json` are untouched.

## Acceptance criteria

### Phase A — normalisation (behaviour-preserving)

- [ ] `refdata.json` is `{ _meta, commodities, species }` with
  `classes` per commodity; no `routing`/`content`/`definitions`; no
  stored `has_gms`/`has_varieties`/`requires_billing`.
- [ ] `commodities[code].classes` is populated from a pinned
  `commodity_class` revision (linkage restored; revision recorded in
  `_meta`); absence means no classes.
- [ ] `data-reconstruction/` is git-ignored and uncommitted
  (`git status --porcelain data-reconstruction` empty).
- [ ] Dev-time round-trip passes with the explicit allowlist (A2).
- [ ] Committed invariant test passes: no legacy keys, every species
  resolves to a commodity, classes well-formed.
- [ ] `resolvers.js` reads the two-grain shape via a read-time merge;
  **all seven scenario counts unchanged at end of Phase A.**
- [ ] Plugin guard is journey-agnostic; animals + plants both register.
- [ ] Engine (`src/server/engine/*`) and its tests are unmodified.

### Phase B — predicate correction + new scenarios

- [ ] `requiresGmsDeclaration` derives from
  `regulatory_authority === 'HMI' && marketing_standard === 'GMS'`
  read off `refdata.species`; no `has_gms` field is read.
- [ ] `lookupRouting` no longer emits `has_gms` (removed; unused).
- [ ] `grep -rn "has_gms" src/server/journeys/chedpp-plants/`
  returns **zero hits** — including comments, tests, and scenario
  docstrings.
- [ ] Three new scenarios (`import-hmi-gms`, `import-hmi-sms`,
  `import-joint-gms`) exist in `scenarioMap`, each using a real
  refdata species matching its cell.
- [ ] `scenarios.test.js` parity pins updated: apples + peppers
  re-pinned; three new pins added; empty-notification inverse holds.
- [ ] Resolver unit tests cover all five cells (PHSI, HMI+GMS,
  HMI+SMS, JOINT+GMS, JOINT+SMS).
- [ ] Each new scenario is submittable (`submittable: true`,
  `unsatisfied: 0`, `deferred: 0`) — carrying billing data, and (for
  `import-hmi-gms`) the GMS declaration.
- [ ] The chosen `HMI+GMS` species has **no** varieties (focused
  GMS signal).
- [ ] Resolver unit tests use the **actual chosen species** for each
  cell (catch refdata drift at unit-test level too).
- [ ] The `APPLES` docstring no longer claims "HMI commodity".
- [ ] `chedpp-plants/README.md` updated: the "Current implementation
  vs the correct rule" section reads in the past tense.
- [ ] Full `npm test` green.

## Risks and pre-emptive mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Phase B's predicate flip silently changes outcomes outside apples + peppers — i.e. some PHSI scenario unexpectedly flips. | Phase A is gated on **all seven** scenarios unchanged before Phase B starts. Phase B re-pins exactly apples + peppers; any other movement is a regression and stops the story. |
| R2 | Reconstruct-from-flat loses information the flat file already lost. | Only `classes` is sourced externally; everything else round-trips losslessly against the snapshotted flat file (A2 allowlist). Classes coverage asserted against source row count. |
| R3 | The vendored `commodity_class` revision is inconsistent with the group/config era used by the original build. | Pin the revision deliberately; record in `_meta`; assert its codes resolve against `commodities` and row count ≈ 82 (A4). |
| R4 | Relaxing the plugin guard removes a safety net. | The guard still rejects a missing/garbage adapter ("refdata is an object"); per-journey shape validation was never the plugin's job. Covered by the guard test. |
| R5 | `data-reconstruction/` accidentally committed (the "AI explosion"). | `.gitignore` entry + acceptance check that `git status --porcelain data-reconstruction` is empty. |
| R6 | Picking species fixtures that don't actually exist in the refdata, producing brittle scenarios. | B2 selection rule: pick from `refdata.species` via jq; record the chosen `(code, eppo)` in `scenarios.js` constants; the resolver-unit test using the actual chosen species catches refdata drift at unit level. |
| R7 | The `HMI+GMS` scenario inadvertently exercises the variety/class page if the chosen species has varieties, entangling two concerns. | B2 selection rule: pick a **no-varieties** HMI+GMS species. Variety/class coverage is a separate scenario if wanted later. |
| R8 | The corrected predicate accidentally changes other obligations through a shared flag. | Verified: `has_gms` is read **only** by `requiresGmsDeclaration`. Removing the field is safe. Resolver unit tests cover the cells; scenario parity catches any unexpected ripple. |
| R9 | The committed data drifts/corrupts later with no in-repo regenerator. | The committed invariant test (A7) + scenario parity catch any incoherence on every CI run; the one-shot regeneration is intentionally dev-time only. |

## Verification

```bash
# Phase A — one-shot reconstruction + dev-time round-trip (local,
# git-ignored):
node data-reconstruction/reconstruct.js   # writes refdata.json
node data-reconstruction/verify.js        # round-trip allowlist equality

# Phase B — re-pinned scenarios + new variance coverage:
TZ=UTC npx vitest run src/server/journeys/chedpp-plants
npm test
# Expected: green + 1 pre-existing favicon failure.

# Engine untouched; tooling not committed:
git status --porcelain src/server/engine            # empty
git status --porcelain data-reconstruction          # empty (ignored)

# New shape, no legacy keys, no stored has_gms:
jq -e '.commodities and .species and (has("routing")|not) and (has("content")|not) and (has("definitions")|not)' \
  src/server/journeys/chedpp-plants/refdata.json
grep -rn "has_gms" src/server/journeys/chedpp-plants/   # zero hits
```

Visual scrutiny (requires `01-env-selected-journey.md`, which is
already merged): `JOURNEY=chedpp-plants npm run dev` →
`/explorer?scenario=import-hmi-gms` should show `gms-declaration`
satisfied; `import-joint-gms` should show it inactive — visibly
demonstrating the corrected rule.

## What NOT to change

- The engine (`src/server/engine/*`) — it never inspects refdata.
- The animals journey (keeps its `routing` shape).
- chedpp `obligations.json` / `journey.json` — referenced by id /
  notification path, not refdata shape.
- The scenario notification builders for existing PHSI scenarios —
  only apples and peppers re-pin, and only the GMS keyDataPair on
  apples needs a docstring change.
- `build-chedpp-refdata.js` in the analysis repo — left as
  provenance.
- The explorer commodity-config view — surfacing the new shape is
  `02-journey-agnostic-variance.md`'s job, not this story's.
- **Multi-commodity routing.** The real IPAFFS rule is any-species
  across the notification; our resolver applies the predicate via
  `facts.commodity = commodities[0]`. That single-commodity
  simplification stays as a separately-deferred concern.

## Relationship to the other stories

- **After `gms-declaration-rule-investigation.md`** (Findings
  complete — provides the predicate, gap analysis, re-pin impact).
- **Independent of `01-env-selected-journey.md`** (already merged on
  `main`).
- **Prereq for `02-journey-agnostic-variance.md`.** This story
  produces the `{ commodities, species, classes }` shape that 02's
  plants `refdata-view` reads.
- **Closes the recommendation** logged in
  `gms-declaration-rule-investigation.md` §6, plus the data-
  coherence concerns raised on the original
  `00-normalise-plants-refdata.md` (now dissolved into Phase A).
