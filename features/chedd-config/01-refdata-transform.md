# Story 01: CHED-D refdata transform

## Goal

A deterministic transform turns the committed CHED-D Part-1 staging artifact into a journey `refdata.json` in the shape the evaluation engine consumes, with a verifier that proves the reduction holds against the staging invariants. After this story, `src/server/journeys/chedd-products/refdata.json` exists as a committed, reproducible artifact — the data foundation every later chedd story builds on. Nothing is registered or wired; this story produces a file and its verifier.

## Why

The staging artifact (`features/chedd-config/chedd-products-staging.json`, 1.06 MB, 2,176 commodities) is a field-config precursor, not the journey shape — the pipeline summary is explicit that it "still needs a final transformation step into the modern obligation engine's 3-file shape (`journey.json` / `obligations.json` / `refdata.json`)". This story delivers the `refdata.json` third of that step.

Rejected during design (recorded here so they aren't re-litigated): denormalising the resolved internal-market option arrays into every commodity (~doubles the file to ~2.1 MB to save a dictionary lookup); a two-grain `code|species` shape (CHED-D has no species axis — `species_description` is free-text product data, not a key dimension). The chosen shape is single-grain, keyed by bare commodity code, with the internal-market sets kept normalised.

## Context

- Input: `features/chedd-config/chedd-products-staging.json`. Read `features/chedd-config/journey-config-pipelines-summary.md` for the staging data model and the three reader-time reconstructions, and `chedd-products-staging-audit.md` for the per-build invariants (the 31 anomalies, the 9 combo outliers, frequency-ordered sets).
- Output-shape template: `src/server/journeys/eu-live-animals/refdata.json` — the `routing` / `content` / `definitions` idiom this story mirrors (a single-grain journey).
- Build + verify precedent: `data-reconstruction/reconstruct.js` and `data-reconstruction/verify.js` (the chedpp normaliser) — the same build + verify-oracle pattern, in the same directory.
- Staging key facts to preserve: 2,176 commodity codes; 31 anomalies with no `internalMarket`; 9 outliers carrying `combo_type_options_override`; 5 internal-market sets; `complement_id === combo_complement_id` for every row; `routing[c].has_internal_market === ('internalMarket' in content[c])` by construction.

## Specification

New `data-reconstruction/build-chedd-refdata.js` (a pure projection) and `data-reconstruction/verify-chedd.js`, emitting the committed `src/server/journeys/chedd-products/refdata.json`.

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

`verify-chedd.js` is a completeness + invariant oracle (not a full re-flatten, since the transform is near-identity): key parity (`content` and `routing` are exactly the 2,176 staging codes, no extras, no drops); re-prove `routing[c].has_internal_market === ('internal_market' in content[c])` for every code; reference integrity (every `internal_market` is a key in `definitions.internal_market_sets`); exactly the 31 anomalies lack `internal_market`; exactly the 9 outliers carry `combo_type_options_override`; `complement_id === combo_complement_id` held in the source before the drop; round-trip the renamed fields against staging modulo an explicit allowlist; `_meta.counts` self-consistency. Exit non-zero on any failure (`process.exit(1)`), as `verify.js` does.

## Tests

A focused unit test for `build-chedd-refdata.js` over a small hand-built staging fixture (a handful of commodities including one anomaly and one combo-outlier), asserting the projection rules (the two renames, the drop, the set unwrap) and determinism (two runs are byte-identical). `verify-chedd.js` is itself the integration oracle over the real artifact; a test invokes it and asserts a clean exit. Test selection follows `.claude/skills/valuable-unit-tests/SKILL.md`.

Explicitly excluded: no refdata-view, resolver, or HTTP tests here — those land in story 03 when the data is consumed.

## Acceptance Criteria

- [ ] `node data-reconstruction/build-chedd-refdata.js` writes `src/server/journeys/chedd-products/refdata.json` deterministically (re-running produces a byte-identical file).
- [ ] `refdata.json` has exactly 2,176 `routing` entries and 2,176 `content` entries over the same code set.
- [ ] Exactly 31 commodities have `has_internal_market: false` and no `content.internal_market`.
- [ ] Exactly 9 commodities carry `content.combo_type_options_override`.
- [ ] Every `content[c].internal_market` resolves to a key in `definitions.internal_market_sets`.
- [ ] `node data-reconstruction/verify-chedd.js` exits 0.

## Verification

```bash
node data-reconstruction/build-chedd-refdata.js
node data-reconstruction/verify-chedd.js          # exits 0
TZ=UTC npx vitest run data-reconstruction/build-chedd-refdata.test.js
npm run lint
```

## What NOT to change

The staging artifact (read-only input). The existing `data-reconstruction/*` chedpp scripts. The journey registry, the HTTP routes, and the two existing journeys — this story produces a file, it does not wire anything in. No `refdata-view.js`, `resolvers.js`, or `index.js` yet (story 03).
