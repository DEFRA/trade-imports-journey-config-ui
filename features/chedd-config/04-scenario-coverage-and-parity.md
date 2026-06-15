# Story 04: CHED-D scenario coverage and cross-journey parity

## Goal

The journey's scenario fixtures cover the full CHED-D obligation graph, and its behaviour is pinned against the established journey contract. After this story the explorer's scenario picker and the evaluator are exercised across every meaningful CHED-D path, and `chedd-products` is held to the same per-journey contract test as `eu-live-animals` and `chedpp-plants` — full parity.

## Why

Story 03 ships the journey live and correct on representative scenarios; this story makes the coverage exhaustive (the way `eu-live-animals`' scenarios cover its whole obligation graph) and adds the cross-journey parity test that protects the shared contract. Splitting it keeps story 03 focused on going live; everything here is purely additive — more fixtures and tests, no rework of the contract, journey map, resolvers, or refdata-view.

## Context

- Scenario builder idiom: `src/server/journeys/eu-live-animals/scenarios.js` (the `buildNotification({…})` factory + fragment helpers; the `scenarioMap` keyed by URL-safe name, richest path first because the debug page uses the first scenario as its representative example).
- The obligation graph and the one conditional come from story 03's `obligations.json`; the notification shape from story 02.
- Real CHED-D commodity codes for the fixtures, from `features/chedd-config/chedd-products-staging.json`: food commodities, the 31 anomalies (no internal market), the 9 combo outliers.
- The facade-vs-HTTP parity test: `src/server/plugins/http-api/parity.test.js` (a hardcoded `journeys` array; matrix = scenarios × journeys × trace on/off). The per-journey scenario template: `src/server/journeys/chedpp-plants/scenarios.test.js` (its three blocks). Note `eu-live-animals` has _no_ `scenarios.test.js` — `chedpp-plants` is the fuller, current pattern to follow.

## Specification

Extend `src/server/journeys/chedd-products/scenarios.js` to the full set (~6), each a complete CED notification evaluating to `submittable: true`, `unsatisfied: 0`, `deferred: 0`:

- `import-wheat` — `1001` "Wheat and meslin", internal-market active (rich path; listed first).
- `import-feed-prep` — `230990`, food-adjacent anomaly; `intended-purpose` inactive.
- `import-refrigerator` — `84181020`, non-food anomaly.
- `import-fruit-paste` — `200710`, combo-override outlier.
- `import-preserved-apricots` — `08129025`, a second anomaly family.
- `import-mixed` — multi-commodity (wheat + fruit paste).

Anomaly scenarios omit the intended-for field so the conditional resolves inactive and the notification still satisfies (`unsatisfied: 0`). Add `src/server/journeys/chedd-products/scenarios.test.js` mirroring `chedpp-plants/scenarios.test.js`'s three blocks: (1) per-scenario `submittable: true`, `unsatisfied: 0`, `deferred: 0`; (2) per-status count pins (`[name, satisfied, inactive]`) — **derive the numbers from the green run, do not invent them**; (3) the empty-notification inverse (`unsatisfied > 0 && deferred > 0`, no data obligation silently satisfied). Facade-vs-HTTP parity is **automatic**: story 03 added `chedd-products` to `parity.test.js`'s `journeys` array, and that test iterates `Object.entries(scenarios)`, so every scenario added here gets parity coverage (× trace on/off) with no further edit.

## Tests

> Behaviour and risks: every fixture is submittable across the full obligation graph; the conditional behaves for both internal-market and anomaly commodities; the combo-outlier resolves its override. Risks: a scenario silently _deferring_ an obligation (mis-shaped notification path); the empty-notification wrapper trap (silent satisfaction).

High-value cases (in `scenarios.test.js`, per the `chedpp-plants` template): each fixture `submittable` with `unsatisfied: 0` / `deferred: 0`; per-status count pins derived from the green run; the empty-notification inverse. Parity over all three journeys is provided by `parity.test.js` once story 03 adds chedd to its `journeys` array — not re-implemented here. Selection follows `.claude/skills/valuable-unit-tests/SKILL.md`.

Explicitly excluded: no bespoke per-scenario HTTP round-trip tests (the parity matrix covers it); no snapshot tests of evaluation output (the count pins express intent better); no new engine or route tests.

## Acceptance Criteria

- [ ] All ~6 scenarios evaluate `submittable: true`, `unsatisfied: 0`, `deferred: 0`.
- [ ] At least one scenario per distinctive path: internal-market-active, anomaly (intended-purpose inactive), combo-override outlier, multi-commodity.
- [ ] The combo-outlier scenario surfaces its `combo_type_options_override`.
- [ ] `scenarios.test.js` pins satisfied/inactive counts for every scenario (numbers taken from the green run).
- [ ] `parity.test.js` exercises every chedd scenario through facade and HTTP (× trace on/off) and passes.
- [ ] The full suite is green. (Note: `vitest.config.js` enforces no coverage threshold — there is nothing to "meet"; correctness is pinned by the count assertions above.)

## Verification

```bash
npm test
TZ=UTC npx vitest run src/server/journeys/chedd-products
npm run lint
```

## What NOT to change

The obligation contract, `journey.json`, `resolvers.js`, `refdata-view.js`, and the registration from story 03 — this story adds fixtures and tests. (If a defect surfaces, fix it here, but don't expand scope.) The other journeys' scenarios. The engine and routes.
