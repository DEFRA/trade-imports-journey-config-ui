# Story 04: Parity test, smoke checklist, and SOLUTION.md update

## Goal

Land the facade-vs-HTTP parity test as the long-term canary for
drift between `server.app.evaluationEngine.evaluate(...)` (in-process
facade) and `POST /api/engine/journeys/{key}/evaluate?withTrace=true`
(HTTP public API). Capture the manual smoke checklist as committed
documentation. Update `SOLUTION.md` so the demo's "How to run this
over HTTP" story is discoverable from the project's main design doc.

## Why

Stories 01-03 produce two implementations of the same engine output:
the existing in-process facade and the new HTTP surface. They are
asserted equivalent today by code review and individual tests, but
that equivalence will drift as the codebase evolves (Joi schemas
loosened, response transformations added, future authentication
hooks injecting headers). A small dedicated parity test catches
that drift at PR time.

`SOLUTION.md` is the project's main design doc; it must mention the
new APIs and where to point Postman so visitors who read it can
immediately exercise the architecture.

Capturing the manual smoke checklist (from the senior QA review) in
the repo makes "did we actually test the demo" a checkable artefact
rather than an ad-hoc afterthought.

## Context

Feature-level context: `features/http-api/design.md`. The smoke
checklist already lives there; this story carries it into
`SOLUTION.md` and references it from a script if one is added.

Story 03 must be merged before this story begins. The parity test
exercises endpoints that don't exist until then.

Reference for scenario fixtures:
- `src/server/journeys/eu-live-animals/scenarios.js` (7 scenarios)
- `src/server/journeys/chedpp-plants/scenarios.js` (10 scenarios)

Reference for the facade output:
- `src/server/plugins/evaluation-engine/plugin.js#evaluate`

## Specification

### 1. Parity test

New file: `src/server/plugins/http-api/parity.test.js`.

The matrix is **scenarios × journeys × `withTrace` modes**.
`withTrace=false` is the default for `/sections` and `/screens`
consumers (most page renders); `withTrace=true` is what the debug
page uses. Both must round-trip identically.

For every `(scenario, journey, withTrace)` triple:

1. Compute the facade output. For `withTrace=true`:
   `evaluationEngine.evaluate(journeyKey, scenario.notification)`
   (which today returns the traced shape internally). For
   `withTrace=false`: the same call with trace fields stripped to
   match the public-API contract.
2. Compute the HTTP output: `POST` against
   `/api/engine/journeys/{key}/evaluate` (with `?withTrace=true`
   appended only when the row asks for it), scenario notification
   as the raw body.
3. **Compare wire-equivalent forms.** Round-trip the facade output
   through `JSON.parse(JSON.stringify(facadeResult))` before
   comparing — this normalises `Date` objects, drops `undefined`
   fields, and matches what a Postman caller would actually
   receive. `expect(httpResult).toEqual(JSON.parse(JSON.stringify(facadeResult)))`.

Use `test.each` with rows pulled dynamically from
`scenarios.scenarioMap` of each journey crossed with
`[withTrace=true, withTrace=false]`. The test self-extends when
scenarios or modes are added.

If the two outputs ever diverge, the test fails with a diff
pointing at the field. Typical causes (documented in the test's
header comment): Joi schema stripped an unknown field; HTTP
response transformation diverged from facade output; one path
serialises `Date` objects while the other doesn't; the trace-
stripping behaviour differs between facade and route.

The test uses the shared server booted by `vitest globalSetup`
(`test-helpers/setup.js`) and the journey-api-client to send the
HTTP request — same path the UI exercises.

### 2. `SOLUTION.md` update

Add a new section after "The mechanics" titled **"How the demo
runs over HTTP"**.

Content covers:

- The two API namespaces and what each answers.
- `/documentation` as the entry point for Swagger.
- Three concrete Postman recipes:
  1. `GET /api/config/journeys` — list journeys.
  2. `GET /api/config/journeys/chedpp-plants/commodities/0808108090`
     — per-commodity driver.
  3. `POST /api/engine/journeys/eu-live-animals/evaluate?withTrace=true`
     with a notification copied from `/explorer/debug`.
- A paragraph explaining that "two APIs" is demo framing (one
  process, two URL namespaces over a shared facade) and that the
  per-commodity endpoint is the FE's SDUI narrative primitive.
- A link to `features/http-api/design.md` for the deeper context.

Keep the section ≤80 lines; SOLUTION.md is already long.

### 3. Smoke checklist mirror

Two options the Plan agent picks between:

(a) Reference the checklist in `design.md` from `SOLUTION.md` and
leave it in `design.md`. Cheaper.

(b) Add a `scripts/smoke.md` (markdown) committed alongside the
package script. Slightly more discoverable.

Prefer (a) unless reviewers ask for (b). The checklist already
lives in `design.md`.

### 4. Deferred decisions ledger

Confirm the three deferred questions (DQ1, DQ2, DQ3) in `design.md`
are still accurate after the implementation. If any has been
resolved during Stories 02-03, update.

If new deferred decisions emerged during implementation, add them
to `design.md` § *Deferred questions*. Do not let them rot in
commit messages or PR discussion.

## Tests

Headline test of this story is the parity test (§1). It is both
the artefact and the demonstration.

### Optional supplementary tests (Plan agent's discretion)

- A test that asserts every endpoint declared in
  `src/server/plugins/http-api/*` has a corresponding Joi response
  schema with at least one `example` value. Prevents new endpoints
  from shipping without Swagger examples.
- A test that asserts `SOLUTION.md` mentions `/documentation` and
  `/api/engine` and `/api/config` by literal string (cheap link
  rot check).

Neither is required for the story to land. Add only if they pull
their weight.

## Acceptance Criteria

- [ ] `src/server/plugins/http-api/parity.test.js` exists; runs `test.each` over **(scenario × journey × `withTrace`∈{true,false})**; passes for every row.
- [ ] Parity test uses the shared server booted by vitest `globalSetup` (`test-helpers/setup.js`) and the `journey-api-client` to send requests.
- [ ] Parity test compares **wire-equivalent forms**: `JSON.parse(JSON.stringify(facadeResult))` against `httpResult`. Catches `Date`→string, `undefined`-stripping, and key-order divergence.
- [ ] Parity test failure messages are useful (i.e. on a contrived divergence the diff points at the field).
- [ ] `SOLUTION.md` includes a "How the demo runs over HTTP" section under "The mechanics" or equivalent.
- [ ] `SOLUTION.md` section includes three concrete Postman recipes and a link to `features/http-api/design.md`.
- [ ] `design.md`'s deferred-questions section reflects the post-implementation state.
- [ ] Engine isolation test still passes.
- [ ] `npm test` green.

## Verification

```bash
# Parity test specifically
TZ=UTC npx vitest run src/server/plugins/http-api/parity.test.js

# Confirm the parity test actually fails on a divergence (sanity check,
# only do this as a one-off manual experiment; revert before merging):
#   1. Temporarily modify the public API to add a stray field to the response.
#   2. Re-run the parity test → expect a clear failure pointing at the field.
#   3. Revert the change.

# Full suite + isolation invariant
TZ=UTC npx vitest run src/server/engine/_isolation.test.js
TZ=UTC npm test
npm run lint

# Documentation lint (manual): visit /documentation and click "Try it
# out" on each /api/engine endpoint with the embedded example bodies;
# every endpoint returns 200 with a valid response.
npm run dev
# Then in browser: /documentation → "Try it out" → execute each engine endpoint.

# Run the full smoke checklist from features/http-api/design.md
# (12 steps, ~5 minutes manual).
```

## Known unknowns

None blocking.

If the parity test surfaces persistent edge-case divergences (e.g.
the HTTP response serialises a `Date` as ISO string while the
facade returns a `Date` object), the resolution is to align the
shapes — not to weaken the parity test.

## What NOT to change

- Do not modify the engine or facade — this story is purely additive (parity test + docs).
- Do not modify the in-process or HTTP API surfaces. If they diverge during implementation, fix the implementation; do not relax the parity test.
- Do not retire the proxy at `/explorer/debug/evaluate`. That decision is DQ1 in `design.md` — a separate future conversation.
- Do not extract pure validators from `src/client/javascripts/explorer.js`. DQ2 — deferred refactor.
- Do not introduce URL versioning, CORS, or authentication.
