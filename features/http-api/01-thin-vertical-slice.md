# Story 01: Thin vertical slice — Swagger, first endpoint, first consumer

## Goal

Land the HTTP API architecture end-to-end on the thinnest possible
slice. One configuration endpoint (`GET /api/config/journeys`), one
client method (`client.listJourneys()`), one refactored UI consumer
(the `/journey-selection` controller), a working Swagger UI at
`/documentation`, and a reusable test helper that boots Hapi on an
ephemeral port. After this story, the pattern every subsequent story
follows is in place and proven on a real route.

## Why

Walking-skeleton-first. Stories 02 and 03 add endpoints, client
methods, and refactor handlers in volume. Before any of that is worth
doing, we must prove that the wiring works: a Hapi plugin under a
new path, Joi schemas that hapi-swagger renders, a client that reads
`server.info.uri` at startup, a test helper that boots the server on
port 0, and a refactored controller that uses real loopback `fetch`
instead of the in-process facade. If anything in that chain is
broken, this story surfaces it on the smallest possible surface.

The `/journey-selection` controller was chosen as the first consumer
because it uses only `listJourneys` (the smallest facade method), it
is a dedicated page (not a shared partial — refactoring it doesn't
force changes elsewhere), and it has a single existing test we can
extend without unwinding fixtures.

## Context

Feature-level context lives in `features/http-api/design.md`. Read
that first if you have not.

This story does **not** refactor `nav-context.js` or any explorer
controller. Those become async in Story 02 once the patterns are
proven here.

Relevant existing files:
- `src/server/plugins/evaluation-engine/plugin.js` — the facade
  every HTTP route delegates to. Untouched in this story.
- `src/server/routes/journey-selection/controller.js` — the
  consumer being refactored.
- `src/server/routes/journey-selection/controller.test.js` — the
  test being extended.
- `src/server/server.js` — server bootstrap; hapi-swagger
  registration lands here.
- `src/config/config.js` — convict config; `apiBaseUrl` added here.

## Specification

### 1. Dependencies

Add to `package.json` (`dependencies`):

- `hapi-swagger` (latest version compatible with Hapi 21)
- `joi` (latest version compatible with `hapi-swagger`)

`@hapi/inert` and `@hapi/vision` are already present (used by
Nunjucks/static-assets); they double as hapi-swagger's dependencies.

### 2. New plugin: `src/server/plugins/http-api/`

```
src/server/plugins/http-api/
  plugin.js              # Hapi plugin definition; registers routes
  config-routes.js       # GET /api/config/journeys
  schemas.js             # Joi: JourneyListResponse, ErrorResponse
  plugin.test.js         # Integration test via server.inject
```

`plugin.js` exports a Hapi plugin named `'http-api'` that registers
all routes from `config-routes.js`. It delegates to
`server.app.evaluationEngine` (no duplication of dispatch logic).

`config-routes.js` exports an array of one route definition for
`GET /api/config/journeys`. The route uses Joi response validation
and is tagged `['api', 'config']` so hapi-swagger groups it under
the `config` tag.

Response shape:

```json
{
  "journeys": [
    { "key": "eu-live-animals", "name": "EU Live Animals",
      "obligationCount": 23, "sectionCount": 6 },
    { "key": "chedpp-plants", "name": "CHEDPP Plants",
      "obligationCount": 28, "sectionCount": 7 }
  ]
}
```

`name` is sourced from each journey's `journeyMap.name` if present,
otherwise from the key.

### 3. New client: `src/server/clients/journey-api-client.js`

Pure module. No Hapi imports. Exports:

- `createJourneyApiClient({ baseUrl, traceId? })` — factory returning
  a client object whose methods are async and use Node's built-in
  `fetch`. `baseUrl` defaults to `config.get('apiBaseUrl')`.
- `clientForRequest(request)` — helper that reads
  `request.headers['x-cdp-request-id']` and returns
  `createJourneyApiClient({ traceId })`. Trace id is forwarded as
  the `x-cdp-request-id` header on every outbound request (so the
  loopback fetch is correlated in logs).
- `ApiError extends Error` — thrown on non-2xx responses; carries
  `status` and `body` properties.

Methods in Story 01:

- `client.listJourneys()` → returns the `journeys` array from the
  response. Throws `ApiError` on non-2xx.

### 4. New config field

`src/config/config.js`:

```js
apiBaseUrl: {
  doc: 'Base URL for loopback HTTP calls to /api/* namespaces',
  format: String,
  default: '',
  env: 'API_BASE_URL'
}
```

In `src/server/server.js`, immediately after `server.start()`:

```js
if (!config.get('apiBaseUrl')) {
  config.set('apiBaseUrl', server.info.uri)
}
```

This lets production fall back to the running URL when `API_BASE_URL`
isn't explicitly set. In tests, vitest's `globalSetup` (§5) sets
`API_BASE_URL` *before* any test file imports the client, so convict
picks it up via its `env` declaration without needing the post-start
hook. Both paths converge on the same effective value.

### 5. Test server via vitest globalSetup

`createServer()` in `src/server/server.js` does not accept a port
argument; it reads `PORT` from convict. So we configure the test
port via env var and boot the server once per test run via
vitest's `globalSetup` hook. All test files share the same server.

**`vitest.config.js`** — add `globalSetup`:

```js
export default defineConfig({
  test: {
    globalSetup: ['./test-helpers/setup.js'],
    // ... existing config
  }
})
```

**`test-helpers/setup.js`** — new file:

```js
import { createServer } from '#server/server.js'

export default async function setup() {
  process.env.PORT ||= '3001'                    // avoid the dev server's 3000
  const server = await createServer()
  await server.start()
  process.env.API_BASE_URL = server.info.uri     // picked up by clients
  return async () => server.stop({ timeout: 1000 })
}
```

**`package.json`** — pin the test port for clarity:

```jsonc
"test":       "TZ=UTC PORT=3001 vitest run --coverage",
"test:watch": "TZ=UTC PORT=3001 vitest"
```

**Rationale for one shared server** (rather than per-file
`bootServer()`):
- Vitest runs test files in parallel workers. A per-file boot on a
  fixed port would collide; a per-file boot on port 0 would require
  `createServer` to accept an override it currently doesn't.
- Convict reads `apiBaseUrl` at module load time; per-file boots
  cause race conditions when files share workers.
- For a spike, test isolation comes from per-test session/journey
  setup (existing pattern in `index.test.js`), not per-test server
  boot.

Tests that need to make real HTTP calls read
`process.env.API_BASE_URL`. The journey-api-client picks it up
automatically via `config.get('apiBaseUrl')` (Story 01 §4).

### 6. Refactor: `/journey-selection` controller

`src/server/routes/journey-selection/controller.js`:

```js
import { clientForRequest } from '#server/clients/journey-api-client.js'
import { navContext } from '../explorer/nav-context.js'

export const journeySelectionController = {
  async handler(request, h) {
    const client = clientForRequest(request)
    const journeys = await client.listJourneys()
    return h.view('journey-selection/index', {
      pageTitle: 'Journey Selection',
      heading: 'Journey Selection',
      breadcrumbs: [
        { text: 'Home', href: '/' },
        { text: 'Journey Selection' }
      ],
      journeys,
      ...navContext(request)
    })
  }
}
```

`navContext(request)` stays sync in this story — the explorer routes
that use it have not been async-ified yet.

The picker partial (`partials/journey-picker.njk`) currently reads
the journey list from `navContext`'s output. If the new `journeys`
context value shadows that, leave the partial alone — Story 02 will
align it once `navContext` is itself fetching over HTTP.

### 7. Plugin registration

`src/server/plugins/router.js`:

```js
import { httpApi } from './http-api/plugin.js'
...
await server.register([home, journeySelection, explorer, httpApi])
```

Register order is irrelevant for `httpApi` (it does not need
plugin ordering); place it after the existing UI plugins.

### 8. hapi-swagger registration

`src/server/server.js`, alongside the existing Inert + Vision
registration:

```js
import HapiSwagger from 'hapi-swagger'

await server.register([
  { plugin: HapiSwagger, options: {
    info: {
      title: 'Journey Configuration & Evaluation',
      version: '0.1.0',
      description: 'Two HTTP namespaces over the journey-evaluation engine.'
    },
    tags: [
      { name: 'config', description: 'Read-only journey configuration' },
      { name: 'engine', description: 'Evaluate notifications against journeys' }
    ],
    grouping: 'tags',
    documentationPath: '/documentation'
  }}
])
```

Tags `config` and `engine` are declared in this story even though
only `config` has endpoints yet — Story 03 will populate `engine`.

## Tests

Test selection follows `.claude/skills/valuable-unit-tests/SKILL.md`.

### Route-level integration test — `src/server/plugins/http-api/plugin.test.js`

Use `server.inject` (no real loopback needed at this layer). Covers:
- `GET /api/config/journeys` returns 200 with `{ journeys: [...] }`.
- Each entry has `key`, `name`, `obligationCount`, `sectionCount`.
- Both registered journeys appear; counts match
  (`eu-live-animals`: 23 obligations, 6 sections; `chedpp-plants`:
  28 obligations, 7 sections).
- Joi response validation passes (failure would 500 in Hapi).

### Client unit test — `src/server/clients/journey-api-client.test.js`

Use `vitest-fetch-mock` (already in dev deps). Covers:
- `client.listJourneys()` calls `${baseUrl}/api/config/journeys`.
- `clientForRequest(request)` forwards `x-cdp-request-id` from the
  request headers as an outbound header.
- Non-2xx response throws `ApiError` carrying `status` and `body`.

### Smoke test for globalSetup — `test-helpers/setup.test.js`

A single integration smoke proving the whole bootstrap chain wired:

- `process.env.API_BASE_URL` is set and starts with `http://`.
- `fetch(process.env.API_BASE_URL + '/api/config/journeys')` returns 200.

If this test passes, globalSetup ran, the server is listening, the
env var was populated, and the route registered. Any later integration
test failure is then in the test, not the harness.

### Controller test — extension of `src/server/routes/journey-selection/controller.test.js`

Convert the existing test from direct facade access to using the
globalSetup-booted server (the test reads `process.env.API_BASE_URL`
or hits the route via `fetch`/`server.inject` against the shared
server). Covers:
- Page renders with title `"Journey Selection | …"`, heading
  `"Journey Selection"`, breadcrumbs, picker form.
- Rendered HTML contains both journey keys (`eu-live-animals`,
  `chedpp-plants`) — proves the HTTP fetch from the handler
  succeeded.
- Network behaviour: this is the first test that exercises the real
  loopback path from a UI handler. If the wiring is broken, it fails
  here.

## Acceptance Criteria

- [ ] `hapi-swagger` and `joi` added to `package.json` dependencies.
- [ ] `src/server/plugins/http-api/{plugin.js,config-routes.js,schemas.js,plugin.test.js}` exist.
- [ ] `GET /api/config/journeys` returns the journey list with `key`, `name`, `obligationCount`, `sectionCount` for both registered journeys.
- [ ] Joi response schema for `JourneyListResponse` and `ErrorResponse` declared in `schemas.js`.
- [ ] `src/server/clients/journey-api-client.js` exports `createJourneyApiClient`, `clientForRequest`, and `ApiError`.
- [ ] `apiBaseUrl` declared in `src/config/config.js`; populated from `server.info.uri` after `server.start()` when unset; overridable via `API_BASE_URL` env var.
- [ ] `test-helpers/setup.js` exists; `vitest.config.js` references it via `globalSetup`; one server boots per `npm test` invocation on `PORT` (default 3001 in tests via `package.json` script); `process.env.API_BASE_URL` is populated for downstream tests; server is stopped on teardown.
- [ ] `src/server/routes/journey-selection/controller.js` handler is `async` and calls `await client.listJourneys()`.
- [ ] `src/server/plugins/router.js` registers the `http-api` plugin.
- [ ] `src/server/server.js` registers `hapi-swagger`; `/documentation` renders a Swagger UI with `config` and `engine` tag groups (engine empty in this story).
- [ ] Engine isolation test (`src/server/engine/_isolation.test.js`) still passes.
- [ ] `npm test` green.
- [ ] `npm run dev`; `/journey-selection` renders both journeys; the server log shows the loopback `GET /api/config/journeys` initiated by the handler. (Loopback fetches from page handlers are server-initiated and do **not** appear in browser DevTools — the visibility story for this story is server logs + `curl` + Swagger; browser-visible API calls land in Story 03.)
- [ ] `curl http://localhost:3000/api/config/journeys` returns valid JSON with both journeys.

## Verification

```bash
# Set test port for vitest (globalSetup boots a real server)
export PORT=3001

# Targeted
TZ=UTC npx vitest run src/server/plugins/http-api/plugin.test.js
TZ=UTC npx vitest run src/server/clients/journey-api-client.test.js
TZ=UTC npx vitest run src/server/routes/journey-selection/controller.test.js
TZ=UTC npx vitest run test-helpers/setup.test.js

# Engine isolation invariant (must stay green)
TZ=UTC npx vitest run src/server/engine/_isolation.test.js

# Full suite + lint
TZ=UTC npm test
npm run lint

# Manual smoke
npm run dev
# - Visit / → follow nav → /journey-selection renders both journeys
# - Server log shows the loopback GET /api/config/journeys initiated by the
#   journey-selection handler. (Loopback fetches from page handlers are
#   server-initiated and do NOT appear in browser DevTools. Browser-visible
#   API calls arrive in Story 03 on the debug page.)
# - Visit /documentation → Swagger UI shows config tag group with the one endpoint
# - curl http://localhost:3000/api/config/journeys returns the journey list

# No @hapi imports in the new HTTP plugin's engine boundary
rg "@hapi" src/server/clients
# Expected: no matches in client module (HTTP client is framework-free)
```

## Known unknowns

None.

## What NOT to change

- Do not refactor `nav-context.js` or its `navContext` function — Story 02 owns that.
- Do not refactor any explorer controller (`src/server/routes/explorer/*-controller.js`) — Stories 02 and 03 own that.
- Do not add any additional `/api/...` endpoints — Story 02 owns the rest of config, Story 03 owns engine.
- Do not modify `src/server/engine/*` or `src/server/journeys/*` data files (`obligations.json`, `journey.json`, `refdata.json`).
- Do not modify `src/server/plugins/evaluation-engine/plugin.js`.
- Do not modify `src/client/javascripts/explorer.js`.
- Do not introduce URL versioning, CORS, or authentication.
- Do not change the `/journey-selection` URL, page title, or breadcrumb structure.