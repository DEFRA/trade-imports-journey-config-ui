# Story 05: Relocate journey picker to a Journey Selection page

> **Builds on** Story 04. The runtime picker now lives in the explorer's
> per-page nav (above the scenario dropdown). This story moves it to a
> dedicated page, reinstates a compact "current journey" text
> indicator on the explorer, and retires the boilerplate About page in
> favour of an honestly-named Journey Selection page.

## Goal

Move the journey picker off the explorer's per-page nav onto a
dedicated `/journey-selection` page (which replaces the boilerplate
About page in the top nav). Restore a small "Journey: <key>" text
indicator on the explorer so explorer pages remain self-describing
without the picker on them.

Switching journeys still routes through `POST /explorer/journey` —
the controller, validation, redirect target, and zero-on-change
semantics are unchanged. This is a UI relocation, not a behaviour
change.

## Why

Story 04 placed the picker inside `explorer-nav.njk` so it appeared
above the scenario dropdown on every explorer page. In use, that's
the wrong place:

- It draws attention to journey *switching* on a page whose primary
  job is to interact with the *current* journey.
- A control that mutates session state and clears the loaded
  notification deserves a deliberate destination, not nav-bar
  prominence.
- The boilerplate About page currently has empty content and a
  top-nav slot — it's the natural home for a "settings"-style
  control once renamed.

Re-adding the active-journey text indicator (deleted in Story 04 §7)
covers the gap left when the picker leaves: explorer pages still tell
you which journey you're on, without offering the switch in-line.

## Context

Today (post-Story 04):

- `partials/explorer-nav.njk` includes `partials/journey-picker.njk`
  above the explorer link list. The picker renders on `/explorer`,
  `/explorer/tasklist`, `/explorer/debug`,
  `/explorer/commodity-config`.
- `routes/about/` is GOV.UK Frontend scaffolding: empty `index.njk`
  body, `aboutController` returning `pageTitle: 'About'`, route at
  `/about`, link in `build-navigation.js`. Registered as a plugin in
  `plugins/router.js:20` (`server.register([home, about, explorer])`).
- `nav-context.js` exports `currentJourneyKey(request)` and
  `navContext(request)`. The four view controllers spread
  `navContext` into their template context; `api-controller.js` uses
  `currentJourneyKey` directly.
- The active-journey text indicator was deleted in Story 04 §7 with
  the rationale "the picker's selected option already names the
  active journey". That reasoning no longer holds once the picker
  leaves the explorer pages.

**Plugin / middleware availability** (load-bearing for §1):

- `server.js:58-70` registers `sessionCache` (yar) *before* `router`,
  so `request.yar` is global — available on the new Journey
  Selection route.
- `server.js:68-69` registers `evaluationEngine` *immediately
  before* `router`, so `request.server.app.evaluationEngine` is
  populated by the time any route handler runs.
- Therefore the Journey Selection controller can call
  `navContext(request)` directly — no guards, no fallbacks, no
  ordering risk. Already proven by every explorer controller doing
  the same.

Test surface that touches the relevant strings (the critique's
"missed cleanup" surface):

- `routes/about/controller.test.js` — `expect(result).toEqual(expect.stringContaining('About |'))`
- `config/nunjucks/context/build-navigation.test.js` — `text: 'About'` in two fixtures
- `config/nunjucks/context/context.test.js` — `text: 'About'` in two fixtures
- `routes/explorer/journey-picker.test.js` — `test.each` block asserting the picker form is on each explorer page
- `routes/explorer/journey-switching.test.js:59` —
  `expect(result).toEqual(expect.stringContaining('chedpp-plants'))` —
  currently satisfied because the picker's `<option value="chedpp-plants">`
  is in the rendered HTML. After picker removal, satisfaction comes
  only from the new text indicator. §Tests below tightens this
  assertion *during* this story rather than relying on incidental
  substring match.

## Specification

### 1. Rename the route and its module (full rename, not asymmetric)

The Story 04 critique flagged an earlier draft's asymmetry — URL +
page title + heading renamed, but folder/symbol/plugin-name kept as
`about`. That asymmetry was dishonest: a "journey selection" feature
imported from `routes/about/` reaching across into
`routes/explorer/nav-context.js` makes the codebase harder to read.

So: rename **everything**. This is a spike; there are no external
consumers of the internal symbol or folder name. Churn cost is one
commit.

Renames:

- `src/server/routes/about/` → `src/server/routes/journey-selection/`
- `aboutController` → `journeySelectionController`
- `about` plugin export → `journeySelection` plugin export
- Plugin's `name: 'about'` → `name: 'journey-selection'`
- Route path `/about` → `/journey-selection`
- Import in `src/server/plugins/router.js` and the registration
  array entry.

After these renames, no production code references `'about'` or
`/about` anywhere. (Test fixtures with the new strings are the only
acceptable matches — see §Verification grep.)

### 2. Picker rendered on the Journey Selection page

`src/server/routes/journey-selection/controller.js`:

```js
import { navContext } from '../explorer/nav-context.js'

export const journeySelectionController = {
  handler(request, h) {
    return h.view('journey-selection/index', {
      pageTitle: 'Journey Selection',
      heading: 'Journey Selection',
      breadcrumbs: [
        { text: 'Home', href: '/' },
        { text: 'Journey Selection' }
      ],
      ...navContext(request)
    })
  }
}
```

Cross-package import (`routes/journey-selection/` reaching into
`routes/explorer/`) remains a smell — Journey Selection isn't an
explorer concern, yet it reads the explorer's nav-context helper.
Acceptable for the spike with **one explicit ratchet**: the next
time a third route needs `navContext`, the helper graduates out of
`routes/explorer/` into a shared location (likely
`src/server/common/`). Recorded in the project's risks table below
(R4) so the next implementer sees it.

`src/server/routes/journey-selection/index.njk`:

```njk
{% extends 'layouts/page.njk' %}

{% block content %}
  {{ appHeading({
    text: heading,
    caption: "trade-imports-journey-config-ui"
  }) }}

  <div class="govuk-grid-row">
    <div class="govuk-grid-column-two-thirds">
      <p class="govuk-body">
        Switch the active journey. Changing journey clears any loaded
        notification — animals state can't bleed into a plants render
        and vice versa.
      </p>
      {% include "partials/journey-picker.njk" %}
    </div>
  </div>
{% endblock %}
```

### 3. Picker removed from the explorer nav; text indicator restored

`src/server/common/templates/partials/explorer-nav.njk` — remove the
picker include, add a compact text indicator:

```njk
{# Explorer navigation — shared across all explorer pages #}
<nav class="govuk-!-margin-bottom-6" aria-label="Explorer pages">
  <p class="govuk-body-s govuk-!-margin-bottom-2">
    Journey: <strong>{{ journeyKey }}</strong>
    <a class="govuk-link govuk-!-margin-left-2" href="/journey-selection">
      Change
    </a>
  </p>
  <ul class="app-explorer-nav">
    <li>…existing links…</li>
  </ul>
</nav>
```

The "Change" link routes users to Journey Selection in a single
click — keeps the switch discoverable from every explorer page
without putting the form there.

**Same-journey POST behaviour** (raised by the critique): the
`journeyPickerController` (Story 04) zeroes `yar.notification` on
*any* valid POST, including a POST where the target equals the
current journey. That stays. Rationale: a user who clicks Switch
without changing the dropdown is signalling "I want to start clean
on this journey" — clearing notification matches that intent and
costs nothing on the wrong-button case. This is explicit, not
incidental — see §AC.

### 4. Top-nav rename

`src/config/nunjucks/context/build-navigation.js`:

```js
{
  text: 'Journey Selection',
  href: '/journey-selection',
  current: request?.path === '/journey-selection'
}
```

### 5. POST endpoint stays put

`POST /explorer/journey` does not move. The picker form's
`action="/explorer/journey"` is unchanged. After a successful
switch, the handler still redirects to `/explorer` (not back to
`/journey-selection`, not to the referer) — the user came to
Journey Selection to *pick*, not to *land*. Landing on `/explorer`
immediately exercises the new journey.

This is fully covered by the existing
`journey-picker.test.js` happy-path assertion (`location ===
'/explorer'`); no new test required. (An earlier draft proposed a
fresh "POST from `/journey-selection` still redirects to
`/explorer`" test — the critique correctly noted it's redundant
since the handler doesn't read referer.)

### 6. Cleanup the picker supersedes

Strictly removed by this story (every item is testable; see
§Verification grep):

- The `{% include "partials/journey-picker.njk" %}` line in
  `partials/explorer-nav.njk`.
- The `src/server/routes/about/` folder (the rename to
  `journey-selection/` is the deletion).
- The `import { about }` line and the `about` registration entry in
  `src/server/plugins/router.js`. Replaced with the
  `journeySelection` import/registration.
- `pageTitle: 'About'`, `heading: 'About'`, breadcrumb `text: 'About'`
  — all replaced by `'Journey Selection'`.
- Route path `'/about'` in `routes/journey-selection/index.js`,
  replaced by `'/journey-selection'`.
- `text: 'About'` + `href: '/about'` in `build-navigation.js`.
- `text: 'About'` fixtures in `build-navigation.test.js` (two
  occurrences) and `context.test.js` (two occurrences).
- `'About |'` substring assertion in
  `routes/journey-selection/controller.test.js` (formerly
  `routes/about/controller.test.js`).
- The picker-on-every-explorer-page `test.each` block in
  `journey-picker.test.js`.

Strictly retained:

- `journey-picker.njk` partial (now consumed by Journey Selection).
- `nav-context.js` (both exports still used: view controllers +
  `journeySelectionController`).
- The fail-fast boot guard in `routes/explorer/index.js`.
- The Story 04 zero-on-change behaviour in the POST handler.
- The Story 04 stale-session fallback in `currentJourneyKey`.

## Tests

### Updates to existing tests

- `routes/journey-selection/controller.test.js` (renamed from
  `about/controller.test.js`):
  - `'About |'` → `'Journey Selection |'`.
  - Inject URL `/about` → `/journey-selection`.
  - Add assertion: picker form (`action="/explorer/journey"`) is
    present in the response.
- `config/nunjucks/context/build-navigation.test.js` — update both
  `'About'` strings → `'Journey Selection'`; update both `/about`
  hrefs → `/journey-selection`.
- `config/nunjucks/context/context.test.js` — same updates.
- `routes/explorer/journey-picker.test.js`:
  - Drop the per-page presence `test.each` block.
  - Add a single assertion that the picker form appears on
    `/journey-selection`.
- `routes/explorer/journey-switching.test.js:59` — **tighten** the
  assertion from `expect(result).toEqual(expect.stringContaining('chedpp-plants'))`
  to `expect(result).toEqual(expect.stringContaining('Journey: <strong>chedpp-plants</strong>'))`
  (or the equivalent stricter substring). The current loose
  assertion will silently re-pass on any incidental match if the
  indicator markup ever drifts — fix during *this* story, not "if
  it breaks".

### New tests

- `routes/explorer/journey-picker.test.js` — `test.each` over the
  four explorer pages asserting the active-journey indicator
  `Journey: <strong>eu-live-animals</strong>` is present (default
  journey, no session). Catches the regression where a controller
  forgets to spread `navContext`.
- `routes/explorer/journey-picker.test.js` — same-journey POST
  zeroes `yar.notification`: load `?scenario=import-cattle` under
  default animals → POST `journey=eu-live-animals` (same journey)
  → GET `/explorer/debug` and assert `'Bos taurus'` is absent.
  Locks the §3 explicit behaviour as a regression guard.

### Tests confirmed unmodified

- `nav-context.test.js` — pure unit tests on `currentJourneyKey`;
  no UI surface.
- `journey-fail-fast.test.js` — boot guard untouched.
- `index.test.js` — CSP "exactly one inline script per page"
  assertion still passes (no new inline scripts in this story).
- Existing `journey-picker.test.js` happy-path: POST → 302 →
  `/explorer` (covers the redirect-target AC).

## Non-functional requirements

- `npm test` green (modulo the pre-existing favicon failure).
- `npm run lint` clean (no new errors; the two pre-existing
  unrelated lint errors on `main` are out of scope).
- Default behaviour unchanged when no picker is used:
  `JOURNEY=chedpp-plants npm run dev` still boots into plants;
  every explorer page reads `Journey: chedpp-plants`.
- Engine, plugin, journey adapters, obligations, resolvers — all
  untouched.
- The Story 04 commit's behaviour (session-first resolution,
  zero-on-change, open-redirect closure, CSP single-script
  invariant) all preserved.

## Acceptance criteria

- [ ] `/about` returns 404; `/journey-selection` returns 200 with
  the picker form rendered.
- [ ] No file or symbol named `about` survives in
  `src/server/routes/`. The folder is `journey-selection/`; the
  exports are `journeySelection` / `journeySelectionController`;
  the plugin's `name` is `'journey-selection'`.
- [ ] `src/server/plugins/router.js` imports and registers the
  renamed `journeySelection` plugin.
- [ ] Top-nav link text is "Journey Selection" with href
  `/journey-selection`.
- [ ] No `/explorer/*` page renders the picker form
  (`action="/explorer/journey"` does NOT appear in those
  responses).
- [ ] Every `/explorer/*` page renders the active-journey text
  indicator: `Journey: <strong>{{ journeyKey }}</strong>` with a
  "Change" link to `/journey-selection`.
- [ ] POST `/explorer/journey` continues to redirect to
  `/explorer` (covered by existing `journey-picker.test.js`
  happy-path; no new test required).
- [ ] Same-journey POST (`journey=<current>`) clears
  `yar.notification` (regression test under §New tests).
- [ ] Story 04 zero-on-change cross-journey test unchanged and
  green.
- [ ] Story 04 stale-session unit test (`nav-context.test.js`)
  unchanged and green.
- [ ] Story 01 fail-fast boot guard unchanged and green.
- [ ] `journey-switching.test.js:59` now asserts the tightened
  indicator-aware substring (not the loose `'chedpp-plants'`).
- [ ] `npm test` green; `npm run lint` clean.

## Risks and pre-emptive mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Four-plus files assert the old `'About'` / `/about` strings; missing one leaves the suite green while the user-visible link still reads "About". | §Verification grep: zero hits for `\bAbout\b\|\b/about\b` in production code AND zero hits in `*.test.js` outside the new `journey-selection/` directory. Run before claiming AC done. |
| R2 | The text indicator depends on `journeyKey` being in every explorer view context. A controller that forgets to spread `navContext` silently renders `Journey: <strong></strong>`. | New per-page indicator `test.each` (§New tests) catches it. |
| R3 | A future bookmark to `/about` 404s. | Theoretical for the spike; the page had no content. If a stable `/about` URL is ever wanted, add an explicit redirect — out of scope here. |
| R4 | `routes/journey-selection/controller.js` cross-imports `routes/explorer/nav-context.js` — a non-explorer page reaching into explorer internals. | Acceptable for the spike. **Ratchet**: the *next* route that wants `navContext` triggers a promotion to `src/server/common/`. This ratchet is recorded here so the next implementer doesn't repeat the smell. |
| R5 | The "Change" link is a plain `<a>` — clicking it navigates without clearing notification state. A user might expect Change-link semantics to mirror the picker (which *does* clear on submit). | Intended behaviour: navigation alone preserves state; only the POST switches journeys. The picker-zero-on-change semantics still fire when the user submits. No state surprise — the user has to *commit* a switch to lose state. |
| R6 | The picker partial currently has no contextualising prose; on a dedicated page it'd look bare. | §2 adds an explanatory paragraph above the picker. |
| R7 | A test asserts the literal indicator markup (`Journey: <strong>{{ journeyKey }}</strong>`). If the indicator's exact markup drifts later, the substring assertion silently re-passes on any incidental match. | The tightened §Tests assertion uses the full literal substring `'Journey: <strong>chedpp-plants</strong>'`, so a markup drift forces a test update — exactly what we want. |

**Inherent limitations (not "risks we've handled" — design properties):**

- The cross-package import (R4) is an acknowledged smell with an
  explicit "next-route triggers a fix" ratchet, not a thing we
  intend to keep clean indefinitely.

## Verification

```bash
# Tests
TZ=UTC npm test
# Expected: new indicator + same-journey-POST tests green;
#           pre-existing favicon failure still the only red.

# Lint
npm run lint
# Expected: no new errors.

# String hygiene — production code free of stale references
# Production source (zero hits expected):
grep -RnE "\bAbout\b|/about\b|aboutController|'about'" src/server/ --include='*.js' --include='*.njk' | \
  grep -v -E "src/server/routes/journey-selection/" | \
  grep -v -E "^Binary"
# Expected: zero matches.

# Test fixtures should reference the new name only:
grep -RnE "\bAbout\b|/about\b" src/ --include='*.test.js'
# Expected: zero matches (every test fixture uses 'Journey Selection' /
# '/journey-selection').

# 404 on the old URL — automated assertion
TZ=UTC npx vitest run src/server/routes/journey-selection/controller.test.js
# Test file MUST include: GET /about → 404 (any 4xx is acceptable;
# proves the old URL is dead).

# End-to-end smoke (manual):
npm run dev
# - / shows top-nav with "Journey Selection" (not "About").
# - /journey-selection renders the picker + explanatory paragraph.
# - /explorer shows "Journey: eu-live-animals (Change)" — no picker form.
# - Clicking "Change" → /journey-selection.
# - Switching to chedpp-plants on /journey-selection → redirects to
#   /explorer; indicator reads "Journey: chedpp-plants"; plants
#   scenarios in the dropdown.
# - /about returns 404.
```

## What NOT to change

- The engine (`src/server/engine/*`) — untouched.
- Journey adapters — untouched.
- The plugin's evaluation/lookup logic — untouched.
- The plugin's boot-time guard — still validates `JOURNEY=…` boot
  values.
- `nav-context.js` exports — still the single home for journey
  resolution.
- POST `/explorer/journey` behaviour — still validates, still
  redirects to `/explorer`, still zero-on-change (including
  same-journey POST per §3).
- The picker partial markup — same `<form>`, same action, same
  CSP-safe submit-button-only design.
- yar / `sessionCache` registration — already global, no scope
  change needed.

## Relationship to the other stories

- **Follows 04.** Story 04 added the picker into the explorer nav;
  this story relocates it.
- **Does not supersede 04.** All Story 04 behaviour
  (session-first resolution, zero-on-change, open-redirect
  closure, CSP "single inline script" preservation, stale-session
  fallback) is intact.
- **Does not require a future story.** The R4 ratchet ("next
  route that wants `navContext` triggers a promotion") is a
  conditional follow-up, not a planned one.
