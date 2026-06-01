# Story 00: Normalise the plants (CHEDPP) refdata

> **Prerequisite** for `01-env-selected-journey.md` and
> `02-journey-agnostic-variance.md`. A spike that demonstrates the art of
> the possible should not do so on incoherent reference data. This story
> makes the plants refdata coherent *before* it is surfaced in the UI.
> Read `plants-refdata-model.md` first — it is the contract this story
> implements. The `has_gms` semantics question is **out of scope** here
> and handed to `gms-declaration-rule-investigation.md`.

## Goal

Replace the flat, denormalised `chedpp-plants/refdata.json` with an
explicit two-grain shape — `{ commodities, species, classes-per-commodity }`
— that stores each fact once, drops the derived/duplicated flags, and
restores the per-commodity `classes` linkage the original build dropped.
This is **behaviour-preserving**: all seven committed scenarios keep their
pinned `(satisfied, inactive)` counts. The obligation **engine is not
touched**.

## Why

`build-chedpp-refdata.js` denormalised six in-memory indexes (two grains
+ a global) into `routing`/`content`/`definitions`. The result restates
the same facts at multiple grains, stores three booleans that are pure
derivations (`has_gms`, `has_varieties`, `requires_billing`), and
**dropped** the `commodity_class` → quality-classes linkage (it hardcoded
a 3-value array). See `plants-refdata-model.md` for the full breakdown.

The display stories (01/02) *surface* this data; surfacing it in its
current shape would show redundant and incomplete data. Normalising first
is the cheaper, honest order.

> **Found-but-deferred:** `has_gms` is also a *misnomer* — it is `true`
> for SMS, so it means "has a marketing standard," not "is GMS." Whether
> that is wrong, and what the correct GMS-declaration rule is, is a ~92%
> behaviour question owned by `gms-declaration-rule-investigation.md`.
> This story therefore **preserves** today's behaviour exactly
> (`has_gms` derived as `marketing_standard != null`) and changes no
> evaluation outcome.

## Context

- **Producer:** `cdp-fieldconfig-analysis-frontend/.../scripts/build-chedpp-refdata.js`
  (cross-repo). We do **not** edit it; reconstruction happens **here**.
- **Only evaluation consumer of plants refdata:**
  `src/server/journeys/chedpp-plants/resolvers.js` — `lookupRefdata`
  reads `refdata.routing` with a `code|eppo` → `code|` fallback and
  returns one merged object; six `tests.*` read its fields.
- **Plugin guard:** `src/server/plugins/evaluation-engine/plugin.js`
  (lines ~19–23) asserts **every** journey has `refdata.routing` as an
  object. Plants drops `routing`, so this cross-journey guard must become
  journey-agnostic.
- **The engine** (`src/server/engine/*`) passes `refdata` opaquely to
  `testFn(factValue, refdata)` — it never inspects shape. Untouched.
- **The explorer does NOT read plants refdata yet** —
  `commodity-config-controller.js` imports *animals* refdata directly and
  plants commodity-config is gated off (story 01 §7). So this story's
  blast radius excludes the explorer. **Dependency note for story 02:**
  the shared `config-utils#extractCommodityOptions` reads
  `refdata.routing`; after this story plants has no `routing`, so story 02
  must make that util grain-aware / per-journey when it wires plants
  commodity-config. Story 00 leaves it untouched (animals still has
  `routing`).
- **Sources reachable on this machine** (to vendor, not to depend on live):
  - `commodity_class-IMTA-*.dat` — `imports/ipaffs-files/commoditycode/`
    (and `imports/ipaffs-docker-local/data-management/commodity_class/`).
  - The `dbo_*.csv` species sources —
    `cdp-fieldconfig-analysis-frontend/analysis/data/` (not needed if we
    reconstruct from the committed flat file — see §2).
- **Parity baseline** — `chedpp-plants/scenarios.test.js` pins, per
  scenario, `(satisfied, inactive)` and asserts `submittable`,
  `unsatisfied=0`, `deferred=0`, plus the empty-notification inverse.
- **Coverage note:** group-only commodities (Wood, Machinery — a group but
  no phytosanitary species, hence no `inspection_responsibility` rows) are
  already absent from the flat `content`/`routing`. Reconstruct-from-flat
  preserves that — they remain absent. This is consistent, not new loss.

## Specification

### 1. Contain the one-shot migration tooling (git-ignored)

The reconstruction is a **one-shot migration**: it reads the *current
flat* `refdata.json` (+ a vendored `commodity_class` snapshot) and writes
the normalised `refdata.json` once. Because its inputs are not committed,
it is not reproducible from a clean clone — that is acceptable for a
one-shot migration, and matches the instruction to keep the "AI explosion"
out of the repo.

All tooling lives in `data-reconstruction/` (added to `.gitignore`):
the scripts, the vendored `commodity_class` snapshot, a snapshot of the
pre-migration flat `refdata.json` (the round-trip oracle), and the
dev-time tests. **Nothing under `data-reconstruction/` is committed.**

```
# .gitignore (add)
data-reconstruction/
```

Ongoing verification does not depend on this tooling — it is a **committed
invariant test on the output** (§6), not the migration scripts.

### 2. Reconstruct from the committed flat file (+ one vendored source)

The transform is a **pure function of the pre-migration flat
`refdata.json`** plus the vendored `commodity_class` snapshot —
deterministic. Everything except classes is a lossless de-normalisation of
data already in the file; only `classes` needs an external source.

- Emit `{ commodities, species, classes-per-commodity }` per
  `plants-refdata-model.md` §"Target normalised shape":
  - `species[code|eppo]` ← `content[code|eppo]` + `varieties` from
    `definitions.varieties[code|eppo]` (omit `varieties` when none).
  - `commodities[code]` ← commodity-grain flags read off the `code|`
    fallback routing rows (`requires_test_and_trial`,
    `requires_finished_or_propagated`, `propagation`) + `group` from
    `definitions.groups[code]`. Include every commodity code that has a
    `code|` fallback row.
  - **Drop** `has_gms`, `has_varieties`, `requires_billing` (derived at
    read time — §4). Do **not** change their effective values.
- **Round-trip oracle (dev-time, in `data-reconstruction/`):** re-flatten
  the normalised output back to `routing`/`content`/`definitions` and
  assert it equals the snapshotted pre-migration file **with an explicit
  allowlist of permitted differences and nothing else**:
  - re-derived `has_gms` = `marketing_standard != null`, `has_varieties` =
    `varieties?.length > 0`, `requires_billing` = species-row present —
    must equal the originals **byte-for-byte**;
  - `definitions.classes` literal replaced by per-commodity `classes`.
  Any diff outside this allowlist fails the migration.

### 3. Restore the `classes` linkage

`commodity_class` is `(commodity_code, class)`. **Pin a specific IMTA
revision deliberately** (don't just take "highest") and record it in
`_meta`; confirm its commodity codes resolve against `commodities` and its
row count matches the exploration doc (~82). Group by commodity code into
a **deterministically ordered** class list (use the source `display_order`
if present, else the canonical `Extra Class` → `Class I` → `Class II`
order) and attach as `commodities[code].classes`. Commodities without
classes omit the key (absence = "no quality classes", rendered explicitly
downstream).

### 4. Adapt the evaluation consumer (behaviour-preserving)

`resolvers.js`: replace `lookupRefdata(refdata.routing, commodity)` with a
read-time merge that reconstructs the **identical** routing object from
the two tables (see `plants-refdata-model.md` §"How evaluation reads it"),
deriving the flags to reproduce today's values **exactly**:

- `has_gms` ← `marketing_standard != null`  *(unchanged — see Goal note)*
- `has_varieties` ← `(varieties?.length ?? 0) > 0`
- `requires_billing` ← species row present
- commodity flags ← `commodities[code]`
- PHSI-only (no species row) → falls back to `commodities[code]` with
  `has_gms=false, has_varieties=false, requires_billing=false`.

Keep `buildRefdataKey`. Update the six `tests.*` call sites and exports.

### 5. Relax the plugin guard

`plugin.js`: change the per-journey assertion from "must have
`refdata.routing`" to journey-agnostic ("`refdata` is a non-null object").
Refdata shape is a journey concern; the plugin should not assert it.
Animals (keeps `routing`) and plants (doesn't) both pass.

### 6. Commit an invariant test on the normalised refdata

A new **committed** test (e.g. `chedpp-plants/refdata.test.js`) asserts
the *output* is well-formed, independent of the git-ignored tooling:

- no legacy keys (`routing`/`content`/`definitions` absent);
  `commodities` + `species` present.
- **referential integrity:** every `species["code|eppo"]` has a matching
  `commodities["code"]`.
- `classes`, where present, is a non-empty array of strings.
- `_meta` records the `commodity_class` revision used.

This is the durable, CI-able guarantee that the committed data is coherent.

## Tests

- **Committed invariant test** (§6) — the output is well-formed and
  referentially consistent.
- **Scenario parity** (`chedpp-plants/scenarios.test.js`) — all seven
  `(satisfied, inactive)` counts and the inverse check are **unchanged**
  (this story changes no evaluation outcome).
- **Resolver unit** — `lookupRouting` returns the expected merged object
  for: (a) an HMI+GMS species; (b) a **JOINT+GMS** species (`has_gms`
  still `true` — pins the preserved behaviour, the thing the GMS
  investigation may later change); (c) a PHSI-only commodity (fallback,
  all species flags false).
- **Plugin guard** — a journey whose refdata lacks `routing` registers
  cleanly; a non-object refdata still fails.
- **Engine + isolation tests** — pass unmodified (proves the engine is
  untouched).
- **Round-trip** (dev-time, git-ignored) — §2 allowlist equality.

## Non-functional requirements

- `npm test` green (modulo the pre-existing favicon failure).
- `npm run lint` clean; **no new runtime dependencies** (Node built-ins
  only for the tooling).
- **Committed diff:** `refdata.json` (rewritten), `resolvers.js`,
  `plugin.js`, new `refdata.test.js`, `.gitignore`. **No** change to
  `scenarios.test.js` (behaviour preserved). Nothing under
  `data-reconstruction/` committed.
- Engine, animals journey, chedpp `obligations.json` / `journey.json`, and
  the scenario notification builders are untouched.

## Acceptance criteria

- [ ] `refdata.json` is `{ _meta, commodities, species }` with
  `classes` per commodity; no `routing`/`content`/`definitions`; no stored
  `has_gms`/`has_varieties`/`requires_billing`.
- [ ] `commodities[code].classes` is populated from a pinned
  `commodity_class` revision (linkage restored; revision recorded in
  `_meta`); absence means no classes.
- [ ] `data-reconstruction/` is git-ignored and uncommitted
  (`git status --porcelain data-reconstruction` empty).
- [ ] Dev-time round-trip passes with the explicit allowlist (§2).
- [ ] Committed invariant test (§6) passes: no legacy keys, every species
  resolves to a commodity, classes well-formed.
- [ ] `resolvers.js` reads the two-grain shape via a read-time merge;
  **all seven scenario counts unchanged**; resolver unit cases pass.
- [ ] Plugin guard is journey-agnostic; animals + plants both register.
- [ ] Engine (`src/server/engine/*`) and its tests are unmodified.
- [ ] `has_gms` evaluation semantics are **unchanged** (correction is
  owned by `gms-declaration-rule-investigation.md`).
- [ ] Full `npm test` green.

## Risks and pre-emptive mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Scope creep pulls the `has_gms` semantics fix back in, entangling a ~92% behaviour swing with the migration's parity gate. | Explicitly out of scope; the read-time derivation reproduces today's value; resolver unit case (b) pins JOINT+GMS `has_gms=true`. The fix is gated behind `gms-declaration-rule-investigation.md`. |
| R2 | Reconstruct-from-flat loses information the flat file already lost. | Only `classes` is sourced externally; everything else round-trips losslessly against the snapshotted flat file (§2 allowlist). Classes coverage asserted against source row count. |
| R3 | The vendored `commodity_class` revision is inconsistent with the group/config era used by the original build. | Pin the revision deliberately; record in `_meta`; assert its codes resolve against `commodities` and row count ≈ 82 (§3). |
| R4 | Relaxing the plugin guard removes a safety net. | The guard still rejects a missing/garbage adapter ("refdata is an object"); per-journey shape validation was never the plugin's job. Covered by the guard test. |
| R5 | `data-reconstruction/` accidentally committed (the "AI explosion"). | `.gitignore` entry + acceptance check that `git status --porcelain data-reconstruction` is empty. |
| R6 | The committed data drifts/corrupts later with no in-repo regenerator. | The committed invariant test (§6) + scenario parity catch any incoherence on every CI run; the one-shot regeneration is intentionally dev-time only. |

## Verification

```bash
# One-shot reconstruction + dev-time round-trip (local, git-ignored):
node data-reconstruction/reconstruct.js   # writes refdata.json
node data-reconstruction/verify.js        # round-trip allowlist equality

TZ=UTC npx vitest run src/server/journeys/chedpp-plants
npm test
# Expected: green + 1 pre-existing favicon failure; seven scenario counts unchanged.

# Engine untouched; tooling not committed:
git status --porcelain src/server/engine            # empty
git status --porcelain data-reconstruction          # empty (ignored)

# New shape, no legacy keys:
jq -e '.commodities and .species and (has("routing")|not) and (has("content")|not) and (has("definitions")|not)' \
  src/server/journeys/chedpp-plants/refdata.json
```

## What NOT to change

- The engine (`src/server/engine/*`) — it never inspects refdata.
- The animals journey (keeps its `routing` shape).
- chedpp `obligations.json` / `journey.json` — referenced by id /
  notification path, not refdata shape.
- The scenario notification builders or their pinned expectations — this
  story changes no evaluation outcome.
- `has_gms` evaluation semantics — owned by the GMS investigation.
- `build-chedpp-refdata.js` in the analysis repo — left as provenance.
- The explorer commodity-config view — surfacing the new shape is
  `02-journey-agnostic-variance.md`.