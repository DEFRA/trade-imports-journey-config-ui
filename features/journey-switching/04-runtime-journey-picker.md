# Story 04: Runtime journey picker (zero-on-change)

> **Builds on** stories 01, 02, 03. The plumbing they delivered
> (per-request `config.get('journey')` reads, journey resolution via the
> engine facade, generic commodity-config view, normalised plants
> refdata) made runtime switching cheap. This story adds the single
> missing piece: a user-facing picker.

## Goal

Let a user switch journeys at runtime — without restarting — by writing
the journey key into the session via a small picker. Every view
controller continues to read the journey key per-request; the only
change is that the source now consults the session first, falling back
to `config.get('journey')` (the boot default).

Switching clears the session's `notification` (zero-on-change), so
animals state can't bleed into a plants render and vice versa.

## Why

The env-var switch from story 01 is honest but demo-hostile — switching
costs a restart. For the spike's "art of the possible" audience, a
single click is the difference between an effective demo and a
confusing one.

The plumbing is already there:

- Story 01 §3 made every view controller read `config.get('journey')`
  per-request.
- Story 02 made the explorer's last journey-coupled view
  (commodity-config) journey-agnostic.
- The engine facade (`getJourney(journeyKey)`) resolves all journey
  data per-request.

The only boot-bound piece left is *where the journey key comes from*.
This story replaces that single source.

## Context

What's already per-request (no change needed):

- `journey-controller.js`, `tasklist-controller.js`,
  `debug-controller.js`, `commodity-config-controller.js`,
  `api-controller.js` all call `config.get('journey')` inside the
  handler.
- `getJourney(journeyKey)` returns `{ obligations, refdata, journeyMap,
  scenarios, resolvers, refdataView, commodityKeys }` per journey key.
- The session only stores one journey-specific key today:
  `yar.notification` (a notification fixture loaded via `?scenario=…` or
  posted from `/explorer/debug/evaluate`).
- The nav partial renders a `Journey: <key>` indicator from
  `navContext(journeyKey)`.

What is boot-bound today:

- The explorer plugin's `register` validates `config.get('journey')`
  against `listJourneys()` once at startup (`src/server/routes/explorer/index.js:14–25`).
  A bad boot value crashes the server with a clear message.
- Controllers read `config.get('journey')` — a convict process-wide
  singleton — so without an alternative source there's nothing to vary
  per request.

Relevant journey universe today: `listJourneys()` →
`['eu-live-animals', 'chedpp-plants']`.

## Specification

### 1. Journey resolver helper

New `src/server/routes/explorer/current-journey.js`:

```js
import { config } from '#config/config.js'

/**
 * The journey key the current request should be served as.
 *
 * Session value wins when present and registered; otherwise falls back
 * to the boot default (`config.get('journey')`). The fallback handles
 * a stale session that names a now-unregistered journey — instead of
 * 500-ing on `getJourney`, the page degrades to the configured default.
 */
export const currentJourneyKey = (request) => {
  const session = request.yar.get('journey')
  const known = request.server.app.evaluationEngine.listJourneys()
  if (session && known.includes(session)) return session
  return config.get('journey')
}
```

### 2. Controllers use the resolver

In `journey-controller.js`, `tasklist-controller.js`,
`debug-controller.js`, `commodity-config-controller.js`,
`api-controller.js`:

```js
// Was:
const journeyKey = config.get('journey')
// Becomes:
const journeyKey = currentJourneyKey(request)
```

One-line change per controller. **Also remove the now-dead
`import { config } from '#config/config.js'`** from each — none of the
view controllers uses `config` for anything else. Grep after to
confirm: `grep -n "config\." src/server/routes/explorer/*-controller.js`
should return zero hits.

### 3. Picker route

New `src/server/routes/explorer/journey-picker-controller.js`:

```js
import { statusCodes } from '../../common/constants/status-codes.js'

export const journeyPickerController = {
  handler(request, h) {
    const { evaluationEngine } = request.server.app
    const target = request.payload?.journey
    const known = evaluationEngine.listJourneys()

    if (!target || !known.includes(target)) {
      return h
        .response(`Unknown journey "${target}"`)
        .code(statusCodes.badRequest)
    }

    request.yar.set('journey', target)
    request.yar.set('notification', null) // zero-on-change

    // Always redirect to /explorer rather than the referer — trusting
    // the Referer header opens an open-redirect path on this route.
    return h.redirect('/explorer')
  }
}
```

Register the POST route in `src/server/routes/explorer/index.js`:

```js
server.route([
  // ... existing routes ...
  {
    method: 'POST',
    path: '/explorer/journey',
    ...journeyPickerController
  }
])
```

### 4. Picker UI

New `src/server/common/templates/partials/journey-picker.njk`:

```njk
{# Inline journey picker, included by the explorer nav so every page
   shows it. Submits via an explicit button — no inline JS, no CSP
   complications, no breaking the codebase's "exactly one inline script
   per page" assertion (index.test.js:163). The extra click is the
   acceptable trade. #}
{% from "govuk/components/select/macro.njk" import govukSelect %}
{% from "govuk/components/button/macro.njk" import govukButton %}

<form method="post" action="/explorer/journey"
      class="govuk-!-margin-bottom-4">
  <div class="govuk-form-group govuk-!-margin-bottom-2">
    {{ govukSelect({
      id: "journey-picker",
      name: "journey",
      label: { text: "Journey", classes: "govuk-label--s" },
      items: journeyOptions
    }) }}
  </div>
  {{ govukButton({
    text: "Switch",
    classes: "govuk-button--secondary govuk-!-margin-bottom-2"
  }) }}
</form>
```

`journeyOptions` comes from the `navContext(request)` view-context
helper (next step) — every view controller passes it through.

### 5. View context: one helper, one pass

**Rewrite the existing `nav-context.js`** in place (don't create a
parallel `current-journey.js` — single home, no two-file split).
`navContext(request)` takes only the request and returns both fields,
so view controllers make one call:

```js
import { config } from '#config/config.js'

export const currentJourneyKey = (request) => {
  const session = request.yar.get('journey')
  const known = request.server.app.evaluationEngine.listJourneys()
  if (session && known.includes(session)) return session
  return config.get('journey')
}

export const navContext = (request) => {
  const journeyKey = currentJourneyKey(request)
  const known = request.server.app.evaluationEngine.listJourneys()
  return {
    journeyKey,
    journeyOptions: known.map((key) => ({
      value: key,
      text: key, // raw key — display labels are out of scope per Story 01
      selected: key === journeyKey
    }))
  }
}
```

View controllers (`journey`, `tasklist`, `debug`, `commodity-config`):

```js
// Was:
const journeyKey = config.get('journey')
return h.view('explorer/...', { ..., ...navContext(journeyKey) })

// Becomes:
const ctx = navContext(request)
const { journeyKey } = ctx
return h.view('explorer/...', { ..., ...ctx })
```

`api-controller.js` (returns JSON, no view) doesn't need the picker
options — it calls `currentJourneyKey(request)` directly.

Update `explorer-nav.njk` to include the picker partial *and* drop the
now-redundant `Journey: <key>` text indicator — the picker's
selected-option already names the active journey:

```njk
{% include "partials/journey-picker.njk" %}
{# (existing nav links unchanged) #}
```

### 6. Boot-time guard unchanged

Story 01's register-time guard in `index.js` stays — `JOURNEY=foo`
still crashes the boot with a clear message. The runtime override is
additive, not a replacement.

### 7. Cleanup the picker supersedes

A handful of artifacts from earlier stories are now obsolete and must
be removed in the same commit (no leftover dead code or stale prose):

- **`explorer-nav.njk` `Journey: <key>` text indicator** — the picker
  already names the active journey via its selected option. Delete the
  `<p class="govuk-body-s ...">Journey: …</p>` block.
- **`import { config } from '#config/config.js'`** in every view
  controller — replaced by the helper (§2). Grep verification under §2.
- **`nav-context.js` old signature** — file rewritten in place per §5;
  no `journeyKey`-as-argument form survives.
- **`chedpp-plants/README.md` "Scrutinising the scenarios" section** —
  currently says "Visual scrutiny … requires `01-env-selected-journey.md`
  to land first … `JOURNEY=chedpp-plants npm run dev` exposes these
  scenarios". Update to mention the picker as the preferred path; keep
  `JOURNEY=…` documented as the CI / boot default.

No other docs need editing — `plants-refdata-model.md` and the various
investigation briefs don't reference the journey-selection mechanism.

## Tests

New tests:

`src/server/routes/explorer/journey-picker.test.js` (integration):

- **POST /explorer/journey with a valid target** → 302 to `/explorer`;
  subsequent GET `/explorer` (with cookie) reflects the new journey
  (picker option selected; plants scenarios in the dropdown if target
  was `chedpp-plants`).
- **POST with an unknown target** → 400; session unchanged.
- **POST with no target** → 400.
- **Zero-on-change** — load `?scenario=import-cattle` (under default
  animals), POST a journey switch to `chedpp-plants`, then GET
  `/explorer/tasklist` (with cookie) and confirm the page does not
  carry the animals notification (no `Bos taurus`; empty-state-style
  render).
- **Picker is reachable from every explorer page** — assert the
  picker form's `action="/explorer/journey"` markup appears in
  `/explorer`, `/explorer/tasklist`, `/explorer/debug`,
  `/explorer/commodity-config`. Catches a future regression where a
  view controller forgets to thread `journeyOptions`.

`src/server/routes/explorer/current-journey.test.js` (focused unit):

- **Session value wins when registered** — stub
  `request.server.app.evaluationEngine.listJourneys` + `request.yar`;
  `currentJourneyKey` returns the session value.
- **Session value falls back to config when not registered** (the
  stale-session case integration tests can't easily simulate).
- **No session value → falls back to config**.

Existing tests:

- `journey-fail-fast.test.js` — unchanged. Boot guard still fires for
  bad env values.
- `journey-switching.test.js` — uses `config.set('journey', …)` in
  `beforeAll` to drive plants. After story 04, that still works:
  controllers fall through to `config.get('journey')` when no session
  value is set. Tests should pass without modification — confirm at
  implementation time.
- `index.test.js` — animals parity + scenario tests run against the
  default journey with no session; no change.
- **CSP-compliance assertions** (`index.test.js:163`,
  `:257-267`) — confirmed safe: the picker uses an explicit submit
  button, no inline `<script>`.

Existing tests:

- `journey-fail-fast.test.js` — unchanged. Boot guard still fires for
  bad env values.
- `journey-switching.test.js` — uses `config.set('journey', …)` in
  `beforeAll` to drive plants. After story 04, that still works:
  controllers fall through to `config.get('journey')` when no session
  value is set. Tests pass without modification.
- `index.test.js` — animals parity + scenario tests run against the
  default journey with no session; no change.

## Non-functional requirements

- `npm test` green (modulo the pre-existing favicon failure).
- `npm run lint` clean; no new runtime dependencies.
- **Default behaviour functionally unchanged** when no picker is
  used: `JOURNEY=chedpp-plants npm run dev` still boots into plants;
  default-journey UI tests still pass.
- Engine, plugin journey-evaluation logic, journey adapters,
  obligations, resolvers — untouched.

## Acceptance criteria

- [ ] `nav-context.js` is rewritten in place to export
  `currentJourneyKey(request)` + `navContext(request)` — no parallel
  `current-journey.js` left behind.
- [ ] All five view controllers (journey, tasklist, debug,
  commodity-config, api) source the journey key via the new helper; no
  controller calls `config.get('journey')` directly.
- [ ] `import { config } from '#config/config.js'` is removed from
  every view controller (verified by
  `grep -n "config\." src/server/routes/explorer/*-controller.js`
  returning zero hits).
- [ ] `explorer-nav.njk` no longer renders the standalone
  `Journey: <key>` text block — the picker's selected option is the
  indicator.
- [ ] `chedpp-plants/README.md` "Scrutinising the scenarios" section
  mentions the picker; `JOURNEY=…` is documented as the boot default.
- [ ] POST `/explorer/journey` is registered, validates against
  `listJourneys()`, and **always redirects to `/explorer`** (no
  referer-based redirect).
- [ ] On successful POST, `yar.notification` is cleared (zero-on-
  change).
- [ ] Stale session journey (not in `listJourneys()`) falls back to
  the boot default; covered by a unit test on `currentJourneyKey`.
- [ ] `journey-picker.njk` is included in the explorer nav; appears
  on every explorer page (journey / tasklist / debug / commodity-
  config).
- [ ] **The picker has no inline `<script>`** — uses an explicit
  submit button. `index.test.js` CSP-compliance assertions still pass
  unmodified.
- [ ] Existing tests (`index.test.js`, `journey-switching.test.js`,
  `journey-fail-fast.test.js`) pass unmodified.
- [ ] New `journey-picker.test.js` (integration) + `current-journey.test.js`
  (unit) cover the behaviours listed under §Tests.
- [ ] Story 01's fail-fast boot guard remains intact (a bad `JOURNEY=`
  still crashes the boot with the §2 message).
- [ ] Full `npm test` green.

## Risks and pre-emptive mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | A stale `yar.journey` value pointing at a removed journey would crash `getJourney` if no fallback. | `currentJourneyKey` validates against `listJourneys()` and falls through to the boot default. Covered by the unit test on `currentJourneyKey`. |
| R2 | CSRF: the picker is a POST that mutates session. Without a token an attacker could trigger a journey switch via a malicious form on another origin. | yar's session cookie is same-origin; the existing CSP + the spike's localhost-only deployment make this academic. Production use would need a CSRF token — noted in "What NOT to change". |
| R3 | `JOURNEY=…` env var no longer feels like the "real" source — confusion about which source wins. | The story explicitly states: session wins; env is the boot default. Documented in `current-journey.js`. CI runs with no session, so env still drives. The fail-fast boot guard still catches typos. |
| R4 | Removing the `Journey: <key>` text indicator changes the default-journey page rendering — any test checking that exact string would fail. | No existing test checks `Journey:` as a literal substring (`journey-switching.test.js` checks `chedpp-plants` which still appears as a picker option). Implementer to grep at start; update assertions in the picker test if any tighten. |

**Inherent limitations (not "risks we've handled" — design properties):**

- **Same-browser tabs share the same yar session.** Switching journey in
  tab A clobbers tab B's view on its next request. This is cookie-based
  session behaviour, by design. A side-by-side demo needs Approach B
  (path-parameter routing) — a separate, larger story.
- **No display-name for journey keys** — the picker shows raw keys
  (`eu-live-animals`, `chedpp-plants`). Story 01 deferred display
  labels; this story inherits that decision.

## Verification

```bash
# Tests
TZ=UTC npm test
# Expected: green + 1 pre-existing favicon failure.

# Lint
npm run lint
# Expected: no new errors.

# End-to-end smoke (manual):
npm run dev
# Visit http://localhost:3000/explorer
# - nav shows the journey picker.
# - default journey is eu-live-animals.
# - click the picker → chedpp-plants.
# - page reloads; nav indicator reflects the new journey;
#   dropdown shows plants scenarios.
# - switch back → animals scenarios reappear.

# CSRF / multi-tab not tested — documented as out of scope.
```

## What NOT to change

- The engine (`src/server/engine/*`) — untouched.
- Journey adapters — untouched.
- The plugin's evaluation/lookup logic — untouched.
- The plugin's boot-time guard — still validates `JOURNEY=…` boot
  values.
- The notification-shape per journey — unchanged.
- **No multi-tab session isolation.** Approach A is one-user-at-a-time
  by design. Multi-tab side-by-side comparison would need Approach B
  (path-parameter routing) — a separate, larger story.
- **No CSRF protection** on the picker POST. Production-readiness is
  out of scope for this spike.
- **No inline `<script>` in the picker partial** — auto-submit-on-
  change would break `index.test.js`'s "exactly one inline script per
  page" assertion. The explicit submit button is the deliberate
  trade-off.
- **No journey display-label adapter field** — keys stay raw in the
  picker, same as the Story 01 nav indicator. A future story can add a
  per-journey display name if the demo audience asks for one.

## Relationship to the other stories

- **Follows 01, 02, 03.** Each made a step toward runtime switching:
  01 made controllers per-request; 02 made the last view
  journey-agnostic; 03 made the plants data coherent for display.
  This story adds the user-facing source of the key.
- **Doesn't supersede anything.** The env-var boot default
  (`JOURNEY=…`) remains the fallback and the CI-driven source.
- **Does not require a future story.** The "art of the possible"
  demo is complete after this lands.
