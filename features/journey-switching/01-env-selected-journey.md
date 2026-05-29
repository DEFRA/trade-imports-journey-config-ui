# Story: Env-selected journey (switch by restart)

## Goal

The explorer serves **one journey per running process**, selected at
boot by a `JOURNEY` environment variable (default `eu-live-animals`).
To switch journeys, restart the app with a different value:

```bash
npm run dev                              # eu-live-animals (default)
JOURNEY=chedpp-plants npm run dev        # chedpp-plants
```

This demonstrates, in the GOV.UK-styled UI, that the evaluation engine
is genuinely journey-agnostic: the same build, with one config value
changed, drives an entirely different journey's obligations, screens,
and scenarios through the identical engine and route code.

## Why

This project is a **spike** — it demonstrates concepts in dev/demo
environments and will not become a production service. There is no
production deployment to reason about; `JOURNEY` simply selects which
journey a given dev/demo instance serves. Further productionisation is
for the dev team to investigate later.

The engine refactor (modelling stories 01–11) and the
notification-shape migration (eu-live-animals + chedpp-plants) made the
engine reusable across journeys. Today that reuse is only demonstrable
from a Node script — the explorer UI is hardcoded to `'eu-live-animals'`
in three controllers, so chedpp-plants is registered in the engine but
unreachable through the browser.

The audience for this story is **non-engineer stakeholders who need to
see engine reuse in the actual UI**. Engineers already have the
node-script proof; this makes it clickable.

We deliberately build the *smallest* thing that achieves that:
restart-to-switch. No UI picker, no path-parameter routing, no live
in-session switching — those are heavier, separately-scoped options
(see the journey-switching comparison in conversation history).

### What this story is honestly about

The headline is "select journey by env var", but the **actual work** is
re-sourcing three journey-data imports through the engine facade so the
explorer stops hard-importing `eu-live-animals`. That decoupling — not
the config flag — is the bulk of the change and carries the only real
risk (see R1). Naming it plainly here so the story isn't mistaken for a
one-line config tweak.

## Context

- Explorer controllers live in `src/server/routes/explorer/`. Three
  sites hardcode `'eu-live-animals'` as the journey key:
  - `api-controller.js:23` — `evaluate('eu-live-animals', …)`
  - `journey-controller.js:98-99` — `evaluate` + `getJourney`
  - `tasklist-controller.js:63-64` — `evaluate` + `getJourney`
- Three sites import journey data **directly** (bypassing the facade)
  and must be re-sourced:
  - `journey-controller.js:1` — `import { scenarios }`
  - `debug-controller.js:2` — `import { obligations }`
  - `obligation-fragments.js:1` — `import { obligations, scenarios }`
- The engine facade `server.app.evaluationEngine` already exposes
  `evaluate(journeyKey, notification)`, `getJourney(journeyKey)` →
  `{ obligations, refdata, journeyMap, scenarios, resolvers }`, and
  `listJourneys()`. Both journeys are registered (startup logs
  "2 journey(s), 51 total obligations").
- Config is `src/config/config.js` (convict singleton). The session is
  Hapi `yar`, in-memory — wiped on restart, which is why
  restart-to-switch needs no session-namespacing.
- **commodity-config is the one view that does NOT generalise** — it
  reads raw, journey-specific refdata vocabulary (animals'
  `purpose`/`identifiers`/`quantity` + `cph_number`/`permanent_address`/
  `transporter_address` flags), which plants refdata does not have
  (plants uses `regulatory_authority`/`marketing_standard` +
  `has_gms`/`has_varieties`/… ). `02-journey-agnostic-variance.md`
  fixes this; this story leaves commodity-config eu-live-animals-only.

## Specification

### 1. Add `journey` config

In `src/config/config.js`, add to the convict schema:

```javascript
journey: {
  doc: 'The journey this dev/demo instance serves.',
  format: String,
  default: 'eu-live-animals',
  env: 'JOURNEY'
}
```

### 2. Fail fast on an unknown journey at startup

Valid journey keys are owned by the evaluation-engine plugin's
`JOURNEYS` map, not config. But journey **selection** is an explorer
concern, not an engine one — the engine stays selection-agnostic. So
the fail-fast check lives in the **explorer plugin's `register`**
(`src/server/routes/explorer/index.js`), not the engine plugin.

This works because `server.js` registers `evaluationEngine` *before*
`router` (which registers `explorer`), and `server.app` is shared
server-wide — so `server.app.evaluationEngine` is already bound when
the explorer plugin registers. Assert at the top of `register(server)`:

```javascript
// src/server/routes/explorer/index.js
import { config } from '#config/config.js'
// inside register(server), before server.route([...]):
const configured = config.get('journey')
const known = server.app.evaluationEngine.listJourneys()
if (!known.includes(configured)) {
  throw new Error(
    `Configured JOURNEY "${configured}" is not registered. ` +
    `Known journeys: ${known.join(', ')}`
  )
}
```

A bad `JOURNEY` must crash boot with a clear message — never silently
fall back to the default (that would mislead a demo). This runs at
plugin registration, which happens *inside* `createServer()` — so the
fail-fast test must `config.set('journey', …)` **before** calling
`createServer()` (see §Tests).

### 3. Read the journey key per-request, not at module load

Every controller reads the key **inside the handler**:

```javascript
import { config } from '#config/config.js'
// inside handler(request, h):
const journeyKey = config.get('journey')
```

Reading per-request (not as a module-top-level const) is both the R1
mitigation and what makes the tests in §Tests work via `config.set(...)`.

### 4. Replace the three hardcoded literals

In `api-controller.js`, `journey-controller.js`, `tasklist-controller.js`,
pass `journeyKey` to the facade: `evaluate(journeyKey, …)` /
`getJourney(journeyKey)`.

### 5. Re-source the three direct-import sites via the facade

- **`journey-controller.js`** — drop `import { scenarios }`; use
  `getJourney(journeyKey).scenarios` for the dropdown. (This is what
  makes the dropdown show *plants* scenarios when `JOURNEY=chedpp-plants`.)
- **`debug-controller.js`** — drop `import { obligations }`; pass the
  configured journey's `obligations` + `scenarios` into
  `generateObligationFragments(...)`.
- **`obligation-fragments.js`** — change
  `generateObligationFragments()` to take `(obligations, scenarios)` as
  arguments instead of importing them statically. Makes the fragments
  generator journey-agnostic.

After this, `grep -rn "journeys/eu-live-animals" src/server/routes/`
returns **one** hit — `commodity-config-controller.js` (deferred, §7).

### 6. Thread `journeyKey` + `showCommodityConfig` into every view context

The nav is a **shared partial** (`explorer-nav.njk`) rendered on every
explorer page, so the data it needs must be present in *every*
view controller's context. This is **one named threading task**, not a
per-page afterthought. Each of the four view controllers
(`journey-controller`, `tasklist-controller`, `debug-controller`,
`commodity-config-controller`) adds two fields to the object it passes
to `h.view(...)`:

- `journeyKey` — the configured key (from §3), surfaced in the nav as a
  small indicator, e.g. "Journey: chedpp-plants". Use the **raw key**;
  do not introduce a human-readable label (journey adapters export no
  display name, and adding one is out of scope).
- `showCommodityConfig` — `journeyKey === 'eu-live-animals'` for this
  story; gates the Commodity Config nav link and route (§7). When
  `02-journey-agnostic-variance.md` lands, this becomes `true` for all
  journeys and the flag retires.

`POST /explorer/debug/evaluate` returns JSON, not a view, so it is
exempt. In `explorer-nav.njk`: render the journey indicator from
`journeyKey`, and wrap the Commodity Config `<li>` in
`{% if showCommodityConfig %}`.

This is a deliberate change to the rendered output **for all journeys,
including the default** — see Acceptance Criteria, which says
"functionally unchanged", not "byte-for-byte".

### 7. commodity-config: interim gate for non-animals

commodity-config stays eu-live-animals-only **for this story** — it
reads raw animals refdata vocabulary that plants doesn't share. This
gate is **interim**: `02-journey-agnostic-variance.md` makes the view
journey-agnostic and removes this gate entirely. Land order between 01
and 02 is flexible (see story 02's "Relationship to story 01"). For
this story:

`commodity-config-controller.js` reads `config.get('journey')`
per-request to decide gate-vs-render; its *data* still comes from its
(deferred) direct `eu-live-animals` refdata import. The decoupling of
that import is 02's job, not this story's.

- When `journeyKey === 'eu-live-animals'`: unchanged — works exactly as
  today, keeps its direct `eu-live-animals` refdata import.
- When `journeyKey !== 'eu-live-animals'`: **hide the Commodity Config
  nav item** (via the `showCommodityConfig` flag from §6) and have the
  route render a "Commodity config is not available for this journey —
  see the commodity-config interoperability investigation" notice
  instead of blank variance output.

Do **not** decouple commodity-config's refdata import or attempt to
generalise it here.

## Tests

- **New — non-default journey drives the explorer:** in `beforeAll`,
  `config.set('journey', 'chedpp-plants')` (reset in `afterAll`), boot
  via `createServer()` + `initialize()`, then:
  - `GET /explorer?scenario=import-apples` → response contains a
    **plants-only** obligation name (`packer-identification` — exists in
    plants, absent in animals) and a plants scenario label in the
    dropdown.
  - `GET /explorer/tasklist` (with that scenario in session) → renders
    plants task list (assert a plants-specific screen/section).
  - Assert an **animals-only** obligation (`livestock-holding`) does
    NOT appear — proves the switch actually changed the journey, not
    just "rendered something".
- **New — scenario-param mismatch:** `GET /explorer?scenario=import-cattle`
  while journey is chedpp-plants → empty state (no crash). `import-cattle`
  is not a plants scenario; `scenarios['import-cattle']` is undefined.
  Pin this so the behaviour is intentional, not incidental.
- **New — unknown journey fails fast:** `config.set('journey', 'nope')`
  **before** calling `createServer()`, then assert `createServer()`
  rejects with the §2 message. Validation runs at explorer-plugin
  registration, which happens *inside* `createServer()` — so setting the
  config after server creation would be too late. Reset config in
  `afterEach`/`afterAll`.
- **New — commodity-config gating:** with journey chedpp-plants,
  `GET /explorer/commodity-config` returns the "not available" notice
  (assert the notice text), and the nav item is absent.
- **Existing — default unchanged:** all current explorer route tests run
  with no `JOURNEY` set / `config` defaulting to eu-live-animals and
  pass. The only intentional default-journey output change is the nav
  "Journey: eu-live-animals" indicator (§6). **Verified:** no existing
  test asserts nav markup (`index.test.js` has no nav-HTML assertions),
  so **no nav-assertion update is required**. If implementation adds a
  nav-markup assertion, it must allow for the indicator.

Test mechanism is **`config.set('journey', …)` in `beforeAll` +
`config.set('journey', 'eu-live-animals')` in `afterAll`**, relying on
§3's per-request read. No `vi.resetModules()` or env-before-import
gymnastics needed because nothing captures the key at module load.

Test selection per `.claude/skills/valuable-unit-tests/SKILL.md`: the
high-value cases are (a) a non-default journey genuinely changes the
rendered obligations, (b) a bad journey fails fast, (c) the
commodity-config gate. Don't re-test the engine — stories 01–11 own it.

## Non-functional requirements

- `npm test` green (modulo the pre-existing favicon failure).
- Default behaviour **functionally unchanged**: with no `JOURNEY`, the
  explorer serves eu-live-animals as today. The single intended visual
  delta is the nav journey indicator (§6).
- `JOURNEY=chedpp-plants npm run dev` boots cleanly and serves plants
  through `/explorer`, `/explorer/tasklist`, `/explorer/debug`.
- `npm run lint` clean; no new dependencies.
- Engine, plugin journey-evaluation logic, journey adapters, journey
  maps, obligations, resolvers — untouched. The plugin gains only the
  startup validation (§2).
- `JOURNEY` scopes only the explorer journey selection; it affects no
  other route (`/health`, static assets, etc. are unchanged).

## Acceptance criteria

- [ ] `config.js` has a `journey` setting (`env: JOURNEY`, default
  `eu-live-animals`).
- [ ] Plugin startup throws a clear error if `JOURNEY` names an
  unregistered journey.
- [ ] Controllers read `config.get('journey')` per-request (not at
  module load).
- [ ] The three hardcoded `'eu-live-animals'` literals are replaced with
  the configured key.
- [ ] The three direct journey-data imports (`journey-controller`
  scenarios, `debug-controller` obligations, `obligation-fragments`) are
  re-sourced via the facade. `grep -rn "journeys/eu-live-animals"
  src/server/routes/` → only `commodity-config-controller.js` remains.
- [ ] `generateObligationFragments(obligations, scenarios)` takes its
  data as arguments.
- [ ] With `JOURNEY=chedpp-plants`: `/explorer`, `/explorer/tasklist`,
  `/explorer/debug` render plants obligations + scenarios; an
  animals-only obligation does not appear.
- [ ] Every view controller threads `journeyKey` + `showCommodityConfig`
  into its view context; nav shows the active journey key.
- [ ] commodity-config: unchanged for eu-live-animals; nav-hidden +
  notice for other journeys. Its refdata import is NOT decoupled.
- [ ] Default boot (no env) is functionally unchanged; all existing
  tests pass (no nav-markup assertion exists today, so none needs
  updating).
- [ ] New tests: non-default-journey render (incl. animals-only absent),
  scenario-param mismatch, unknown-journey fail-fast, commodity-config
  gate.

## Risks and pre-emptive mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | The three direct imports are module-level statics; reading `config.get('journey')` at module top-level would bind the journey at import time and break both switching and testability. | §3 — resolve journey data **inside the request handler** via the facade. `obligation-fragments` takes data as args, holding no journey state. |
| R2 | commodity-config silently renders blank for non-animals (animals-specific refdata vocabulary — confirmed: plants refdata has no `purpose`/`identifiers`/`quantity` or the three animals routing flags). | §7 — gate it: hide nav item + render an explicit notice for non-animals. Do not generalise (separate investigation). |
| R3 | An unknown `JOURNEY` silently serves the default, confusing a demo. | §2 — fail fast at boot, listing known journeys. |
| R4 | The `dev` script chain (`npm run server:watch` → nodemon → node) doesn't propagate the env var. | Verify `JOURNEY=chedpp-plants npm run dev` actually reaches `config` (verification step). |
| R5 | Stale notification from a previous run leaks across journeys. | Non-issue: `yar` is in-memory, wiped on restart. Documented so no one adds spurious session-clearing. |
| R6 | A reader assumes live multi-journey switching exists. | Story + nav indicator make it explicit: one process, one journey, chosen at boot. |
| R7 | `journey-controller`'s reverse scenario-match (`JSON.stringify` equality of session notification vs each scenario) behaves oddly across journeys. | Pre-existing behaviour; the scenario-param-mismatch test pins the empty-state outcome. Not introduced by this story. |

## Verification

```bash
npm test
# Expected: same pass count + 1 pre-existing favicon failure.

# Explorer hard-imports only commodity-config's journey data now:
grep -rn "journeys/eu-live-animals\|journeys/chedpp-plants" src/server/routes/
# Expected: only commodity-config-controller.js.

npm run dev                 # default → eu-live-animals; nav: "Journey: eu-live-animals"
JOURNEY=chedpp-plants npm run dev
#   /explorer shows plants scenarios (import-apples, import-bulbs, …)
#   /explorer/tasklist renders plants task list
#   /explorer/debug fragments panel shows plants obligation fragments
#   Commodity Config nav item hidden; route shows the "not available" notice
#   nav: "Journey: chedpp-plants"

JOURNEY=does-not-exist npm run dev
#   Expected: boot throws "Configured JOURNEY ... is not registered. Known journeys: ..."
```

## What NOT to change

- The engine (`src/server/engine/*`) and journey adapters (obligations,
  resolvers, journey maps, refdata) — untouched.
- The plugin's evaluation/lookup logic — only startup validation (§2)
  is added.
- **No UI picker, no path-parameter routing, no live in-session
  switching.**
- **No generalisation or decoupling of commodity-config** — it stays
  eu-live-animals-only; the cross-journey question is a separate
  investigation.
- No journey display-label adapter field — use the raw key.
- No session namespacing — restart-to-switch makes it unnecessary.

## Follow-on (separate story)

**`02-journey-agnostic-variance.md`** — makes commodity-config render
for both journeys via a per-journey **refdata-view descriptor** (two
rendering concepts: variance-annotated *dimensions* + as-is *details*
for non-variance data like quantity and routing flags), removing this
story's §7 interim gate **and its gate tests**. Each journey declares
its own `refdata-view.js`; the already-generic annotate/classify/absent
core consumes the dimensions. It's a view refactor, kept separate from
this journey-selection plumbing.
