# trade-imports-journey-config-ui

[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_trade-imports-journey-config-ui&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=DEFRA_trade-imports-journey-config-ui)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_trade-imports-journey-config-ui&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=DEFRA_trade-imports-journey-config-ui)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_trade-imports-journey-config-ui&metric=coverage)](https://sonarcloud.io/summary/new_code?id=DEFRA_trade-imports-journey-config-ui)

A demonstration of journey configuration and obligation evaluation surfaced as HTTP APIs. The journey-config service answers *"what is the journey?"*; the engine service answers *"how does this notification evaluate against the journey?"*. A Hapi UI consumes both over loopback, so the architecture is visible in the browser Network tab and reproducible from `curl` or Postman. For the deeper architecture story, see [SOLUTION.md](./SOLUTION.md).

## Quick start

```bash
git clone https://github.com/DEFRA/trade-imports-journey-config-ui.git
cd trade-imports-journey-config-ui
nvm use            # selects the Node version pinned in .nvmrc
npm install
npm run dev        # http://localhost:3000
```

`npm run dev` starts the server with auto-reload on changes under `src/server/` and `src/config/`.

## Architecture at a glance

One Hapi process exposes three URL namespaces. UI routes consume them over `fetch` (loopback). An ESLint rule plus a transitive-import isolation test enforce that no UI route reaches the engine in-process; the codebase could be lifted to a separate deployment and pointed at a different host via `apiBaseUrl`.

| Namespace | Question it answers | Headline endpoints |
| --- | --- | --- |
| `/api/config/*` | What is the journey? | `GET /api/config/journeys`, `GET /api/config/journeys/{key}/commodities/{code}` |
| `/api/engine/*` | How does this notification evaluate? | `POST /api/engine/journeys/{key}/evaluate`, `.../sections`, `.../screens` |
| `/ui/session/*` | UI state ("in-memory database" for cross-page flows) | `PUT /ui/session/notification` |

## Exploring the API

With the dev server running:

- **Swagger UI** at <http://localhost:3000/documentation>. Three tag groups (`config`, `engine`, `ui-state`) render as collapsible sections. Every endpoint has a Joi-schema response and a worked example; "Try it out" runs the request from the browser.
- **OpenAPI JSON** at <http://localhost:3000/swagger.json>. Same spec, machine-readable. Useful for tooling.

## Sample requests

Five `curl` recipes that exercise the demo end-to-end. The dev server listens on port 3000.

List the registered journeys:

```bash
curl http://localhost:3000/api/config/journeys
```

Per-commodity driver (plants, `0808108090` apples, `MABSD` species). Returns the journey-shaped driver: `regulatoryAuthority`, `marketingStandard`, `varieties`, `classes`, `validityPeriod`:

```bash
curl http://localhost:3000/api/config/journeys/chedpp-plants/commodities/0808108090/species/MABSD
```

Page-variance for the same commodity. Returns one row per screen whose presence is driven by commodity-level conditions, with the activation reason from the journey's resolver:

```bash
curl http://localhost:3000/api/config/journeys/chedpp-plants/commodities/0805108010/page-variance/species/CIDAU
```

Evaluate a notification. The request body is the notification JSON directly (no envelope). `withTrace=true` adds per-obligation diagnostic steps:

```bash
curl -X POST \
  'http://localhost:3000/api/engine/journeys/eu-live-animals/evaluate?withTrace=true' \
  -H 'content-type: application/json' \
  -d '{"origin":{"country":"NL"},"commodities":[{"id":"21044150"}]}'
```

Same notification, rolled up into the task-list SDUI shape:

```bash
curl -X POST \
  http://localhost:3000/api/engine/journeys/eu-live-animals/sections \
  -H 'content-type: application/json' \
  -d '{"origin":{"country":"NL"},"commodities":[{"id":"21044150"}]}'
```

## Postman

Postman can import the OpenAPI spec directly from the running server:

1. Start the dev server: `npm run dev`.
2. In Postman: **File → Import → Link**.
3. Paste `http://localhost:3000/swagger.json` and click **Continue → Import**.

Postman creates a collection grouped by tag with every endpoint, request shape, and example body populated from the Joi schemas. No collection file is checked into the repo; the OpenAPI spec is the single source of truth.

## Running the tests

```bash
npm test       # vitest with coverage; TZ=UTC, PORT=3001
npm run lint   # eslint + stylelint
```

The test suite covers four layers: engine framework isolation, route-level API tests (`server.inject`), UI handler integration tests (real HTTP loopback through the journey-api-client), and a parity test that pins facade-versus-HTTP equivalence across every scenario × journey × `withTrace` combination.

## Local development

### Node.js

The project uses [nvm](https://github.com/creationix/nvm) to pin the Node version. From the project root:

```bash
nvm use
```

### Git hooks

```bash
npm run git:hooks
```

Optional. Installs Husky hooks that run lint and format checks on commit.

### Production mode

```bash
npm start
```

Runs the same server with `NODE_ENV=production`.

### Npm scripts

`npm run` lists every available script. The full set is defined in [package.json](./package.json).

### Update dependencies

```bash
ncu --interactive --format group
```

Uses [npm-check-updates](https://github.com/raineorshine/npm-check-updates). The `--interactive --format group` flags review each update group before applying.

### Formatting

Prettier handles line breaks. On Windows, Prettier and `git`'s line-ending handling can disagree. Disable git's auto-conversion globally to match:

```bash
git config --global core.autocrlf false
```

## Docker

### Development image

> [!TIP]
> On Apple Silicon, add `--platform linux/amd64` to the `docker run` command for compatibility with x86-only base images, or `--platform=linux/arm64` to the `docker build` command to build natively.

Build:

```bash
docker build --target development --no-cache --tag trade-imports-journey-config-ui:development .
```

Run:

```bash
docker run -p 3000:3000 trade-imports-journey-config-ui:development
```

### Production image

```bash
docker build --no-cache --tag trade-imports-journey-config-ui .
docker run -p 3000:3000 trade-imports-journey-config-ui
```

### Docker Compose

A local environment that bundles Localstack (AWS services: S3, SQS), Redis, MongoDB, this service, and a commented-out backend example.

```bash
docker compose up --build -d
```

## Server-side caching

The service uses Catbox: `CatboxRedis` when deployed, `CatboxMemory` for local development. Override with `SESSION_CACHE_ENGINE=redis|memory`. `CatboxMemory` is not safe for production; the cache is not shared between instances and does not persist across restarts.

## Redis

Redis is an in-memory key-value store shared across instances of a service. Each frontend service gets a namespaced prefix matching the service name; `my-service` has access to keys prefixed `my-service`. If the service does not need a shared session cache, disable it with `SESSION_CACHE_ENGINE=false`, or change the default in `src/config/index.js`.

## Proxy

The forward-proxy is set up by default. Using `import { fetch } from 'undici'` is sufficient, because `setGlobalDispatcher(new ProxyAgent(proxyUrl))` is called at startup.

For HTTP clients that do not use Undici's global dispatcher, pass the dispatcher explicitly:

```javascript
import { ProxyAgent } from 'undici'

return await fetch(url, {
  dispatcher: new ProxyAgent({
    uri: proxyUrl,
    keepAliveTimeout: 10,
    keepAliveMaxTimeout: 10
  })
})
```

## Dependabot

An example Dependabot configuration ships at [.github/example.dependabot.yml](.github/example.dependabot.yml). Rename it to `.github/dependabot.yml` to enable.

## SonarCloud

Setup instructions are in [sonar-project.properties](./sonar-project.properties).

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable information providers in the public sector to license the use and re-use of their information under a common open licence. It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
