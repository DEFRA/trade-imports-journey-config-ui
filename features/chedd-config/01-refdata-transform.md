# Story 01: CHED-D refdata transform

## Goal

A deterministic transform turns the committed CHED-D Part-1 staging artifact into a journey `refdata.json` in the shape the evaluation engine consumes, with a verifier that proves the reduction holds against the staging invariants. After this story, `src/server/journeys/chedd-products/refdata.json` exists as a committed, reproducible artifact — the data foundation every later chedd story builds on. Nothing is registered or wired; this story produces a file and its verifier.

## Why

The staging artifact (`features/chedd-config/chedd-products-staging.json`, 1.06 MB, 2,176 commodities) is a field-config precursor, not the journey shape — the pipeline summary is explicit that it "still needs a final transformation step into the modern obligation engine's 3-file shape (`journey.json` / `obligations.json` / `refdata.json`)". This story delivers the `refdata.json` third of that step.

Rejected during design (recorded here so they aren't re-litigated): denormalising the resolved internal-market option arrays into every commodity (~doubles the file to ~2.1 MB to save a dictionary lookup); a two-grain `code|species` shape (CHED-D has no species axis — `species_description` is free-text product data, not a key dimension). The chosen shape is single-grain, keyed by bare commodity code, with the internal-market sets kept normalised.

## Context

- Input: `features/chedd-config/chedd-products-staging.json`. Read `features/chedd-config/journey-config-pipelines-summary.md` for the staging data model and the three reader-time reconstructions, and `chedd-products-staging-audit.md` for the per-build invariants (the 31 anomalies, the 9 combo outliers, frequency-ordered sets).
- Output-shape template: `src/server/journeys/eu-live-animals/refdata.json` — the `routing` / `content` / `definitions` idiom this story mirrors (a single-grain journey).
- Build + verify pattern reference: `data-reconstruction/reconstruct.js` and `verify.js` (the chedpp normaliser) — same projection + oracle shape to mirror, but chedd **commits** its transform under the journey dir, because `data-reconstruction/` is git-ignored (`.gitignore`) and vitest-excluded (`vitest.config.js`).
- Staging key facts to preserve: 2,176 commodity codes; 31 anomalies with no `internalMarket`; 9 outliers carrying `combo_type_options_override`; 5 internal-market sets; `complement_id === combo_complement_id` for every row; `routing[c].has_internal_market === ('internalMarket' in content[c])` by construction.

## Specification

A committed, first-class transform under the journey dir (decided: `data-reconstruction/` is git-ignored and vitest-excluded, so chedd's transform lives where it can be committed and CI-tested): `src/server/journeys/chedd-products/build-refdata.js` exports a pure `buildRefdata(staging)` plus a thin `main()` (run via `node src/server/journeys/chedd-products/build-refdata.js`) that reads the staging artifact and writes `refdata.json` beside it.

Output shape:

```jsonc
{
  "_meta": { "source": "features/chedd-config/chedd-products-staging.json",
             "cert_type": "ced", "part": "one",
             "counts": { "commodities": 2176, "internal_market_sets": 5,
                         "anomalies_no_internal_market": 31, "combo_overrides": 9 } },
  "routing": { "<code>": { "has_internal_market": <bool> } },          // 2,176, staging routing verbatim
  "content": { "<code>": { "internal_market": "internalMarket_set_NN", // ref; ABSENT on the 31 anomalies
                           "combo_complement_id": "<scalar>",
                           "product_description": "<free text>",
                           "line_item_complement": "<scalar>",
                           "combo_type_options_override": [ /* 9 outliers only */ ] } },
  "definitions": { "internal_market_sets": { "internalMarket_set_NN": [ /* unwrapped option array */ ] },
                   "line_item_packages": [ /* universal */ ] }
}
```

Transform rules: pass `routing` through verbatim; project `content` renaming staging `internalMarket → internal_market` and `species_description → product_description`, dropping the redundant `complement_id` (keep `combo_complement_id`, the one the combo reconstruction consumes); unwrap each `internalMarket_set_NN` from `{ values: [...] }` to `[...]` so it matches animals' `definitions.identifier_sets[name] = [...]`; copy `universal_data.line_item_packages`. Drop `pages` / `components` / `section_components` / `metadata` — those inform `journey.json`, not refdata. Determinism: no wall-clock in the data body, fixed key order (staging source order), reproducible byte-for-byte across runs.

Verification is a vitest block in `src/server/journeys/chedd-products/build-refdata.test.js` (not a separate node script — it's committed and runs in `npm test`): it loads the real staging + the committed `refdata.json` and asserts `JSON.stringify(buildRefdata(staging), null, 2) + '\n'` is **byte-identical** to the committed file (freshness + determinism), plus key parity (exactly the 2,176 staging codes, no extras/drops); the structural invariant `routing[c].has_internal_market === ('internal_market' in content[c])` for every code; reference integrity (every `internal_market` is a key in `definitions.internal_market_sets`); exactly the 31 anomalies lack `internal_market`; exactly the 9 outliers carry `combo_type_options_override`; and `complement_id === combo_complement_id` in the staging source before the drop. The `_meta` block carries `source.staging_generated_at` (copied from the staging metadata) — never a wall-clock — so the byte-identical check is stable.

## Tests

`src/server/journeys/chedd-products/build-refdata.test.js` (vitest, in the committed suite), two blocks. **Unit:** `buildRefdata` over a tiny hand-built fixture (one normal + one anomaly + one combo-outlier commodity) asserting the projection rules — the two renames, the `complement_id` drop, the set unwrap, `combo_type_options_override` carried only where present, no input mutation, determinism — and that the anomaly omits `internal_market` as an **absent key** (not `undefined`). **Verify:** loads the real staging + committed `refdata.json`, asserts byte-identical regeneration, and re-proves the 2,176 / 31 / 9 and structural invariants. Test selection follows `.claude/skills/valuable-unit-tests/SKILL.md`.

Explicitly excluded: no refdata-view, resolver, or HTTP tests here — those land in story 03 when the data is consumed. The `complement_id === combo_complement_id` equality is checked in the verify block against the staging source, not in the pure unit (the dropped value is gone from the output by design).

## Acceptance Criteria

- [ ] `node src/server/journeys/chedd-products/build-refdata.js` writes `refdata.json` deterministically (re-running leaves `git diff` clean).
- [ ] `refdata.json` has exactly 2,176 `routing` entries and 2,176 `content` entries over the same code set.
- [ ] Exactly 31 commodities have `has_internal_market: false` and no `content.internal_market`.
- [ ] Exactly 9 commodities carry `content.combo_type_options_override`.
- [ ] Every `content[c].internal_market` resolves to a key in `definitions.internal_market_sets`.
- [ ] `npm test` runs `build-refdata.test.js` (unit + verify) green, including the byte-identical regeneration check.

## Verification

```bash
node src/server/journeys/chedd-products/build-refdata.js   # (re)generates refdata.json
git diff --exit-code src/server/journeys/chedd-products/refdata.json   # clean => deterministic
TZ=UTC npx vitest run src/server/journeys/chedd-products/build-refdata.test.js
npm test
npm run lint
```

## What NOT to change

The staging artifact (read-only input). `vitest.config.js`'s `data-reconstruction/**` exclusion and `.gitignore` (untouched — chedd's transform lives in the journey dir instead). The existing `data-reconstruction/*` chedpp scripts. The journey registry, the HTTP routes, and the two existing journeys — this story produces the refdata + its builder/tests, it does not wire anything in. No `refdata-view.js`, `resolvers.js`, or `index.js` yet (story 03).
