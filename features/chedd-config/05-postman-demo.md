# Story 05: CHED-D demo coverage in the Postman suite

## Goal

The curated Postman collection exercises `chedd-products` end-to-end over its HTTP surface, the way it already does for plants and animals. After this story a reviewer can walk CHED-D's distinctive variance — the internal-market conditional, an anomaly commodity, and a combo-override outlier — through real requests, and the shape-agnostic requests can be flipped to chedd via the `{{journey}}` variable.

## Why

`docs/postman/journey-config-demo.postman_collection.json` is a first-class curated artifact (it has dedicated `docs(postman)` commits) and the human-facing way to exercise the API. It covers plants and animals but not CHED-D; without this, the third journey ships with no demo path and the collection silently implies only two journeys exist. This is demo/documentation work, kept separate from the automated test net (story 04) because it serves a different audience and a different failure mode (a broken demo is not a broken build).

## Context

- The collection: `docs/postman/journey-config-demo.postman_collection.json`. Structure: folder 1 _Discovery_ (one config request per journey, hardcoded); folder 2 _Refdata exploration_ (parameterised by the `journey` collection variable, default `chedpp-plants`); folder 3 _Plants narrative_ and folder 5 _Animals narrative_ (journey-specific, walking specific commodity codes with commodity-driver + page-variance requests); folder 4 _Plants engine_; folder 6 _UI session_.
- The collection variable `journey` (default `chedpp-plants`) already flips folder 2 between journeys; folder 2's fourth request hardcodes a plants-shaped `commodity`/`species` query, so a chedd flip needs chedd-shaped params.
- Real chedd commodity codes from `features/chedd-config/chedd-products-staging.json`: `1001` (internal-market active), `84181020` (anomaly, no internal market), `200710` (combo-override outlier).
- The HTTP surface to exercise (auto-discovered once story 03 registers the journey): `GET /api/config/journeys/{key}`, `…/commodities`, `…/commodities/{code}`, `…/commodities/{code}/page-variance`, `POST /api/engine/journeys/{key}/evaluate`.

## Why separate / sequencing

Depends on story 02 (the notification shape of the evaluate request body), story 03 (journey registered and serving over HTTP), and story 04 (the scenarios and commodity codes worth showcasing). It comes last because it demonstrates the finished surface; nothing else depends on it.

## Specification

Extend `docs/postman/journey-config-demo.postman_collection.json` (and update its collection description + the `journey` variable's doc):

1. **Folder 1 (Discovery):** add a "CHED-D journey configuration" request — `GET {{baseUrl}}/api/config/journeys/chedd-products` — alongside the existing plants and animals ones.
2. **`journey` variable:** update its description to note it now also accepts `chedd-products` for the folder-2 shape-agnostic requests (leave the default `chedpp-plants`).
3. **New narrative folder — "6. CHED-D narrative"**, inserted immediately after "5. Animals narrative" and renumbering "6. UI session" → "7. UI session" (mirroring folder 5's structure), one sub-entry per distinctive commodity, each with a commodity-driver request and a page-variance request, with descriptions in the house tone explaining what makes the example interesting:
   - `1001` — internal-market active (the conditional fires).
   - `84181020` — anomaly: no internal market (the conditional is inactive).
   - `200710` — combo-override outlier.
4. **One engine request:** `POST {{baseUrl}}/api/engine/journeys/chedd-products/evaluate` with a CHED-D notification body taken from a story-04 scenario (e.g. `import-wheat`), showing a submittable evaluation.

Keep the collection valid (importable into Postman / runnable by Newman) and the demo-arc ordering coherent.

## Tests

No application code, and **no CI automation** for the collection (verified: no `newman`/`postman` in `package.json` or `.github`). The only automated check is that the collection JSON parses; everything else is manual import + run against the dev server. Do not add a Newman CI step here — that would be a separate infrastructure story.

## Acceptance Criteria

- [ ] Folder 1 has a `chedd-products` config request.
- [ ] The `journey` variable's description documents `chedd-products` as a valid value.
- [ ] A "6. CHED-D narrative" folder (with "UI session" renumbered to 7) walks `1001`, `84181020`, and `200710`, each with commodity-driver + page-variance requests.
- [ ] An engine `evaluate` request for `chedd-products` is present and returns a submittable result against the dev server.
- [ ] The collection still imports cleanly (valid JSON, valid Postman schema).

## Verification

```bash
npm run dev
# Validate the collection JSON parses:
node -e "JSON.parse(require('fs').readFileSync('docs/postman/journey-config-demo.postman_collection.json','utf8')); console.log('collection JSON valid')"
# Newman is not configured in this repo; import into Postman and run the new CHED-D requests manually (or install newman ad hoc):
#   newman run docs/postman/journey-config-demo.postman_collection.json --env-var baseUrl=http://localhost:3000
# Confirm the CHED-D narrative requests return 200 and the evaluate request is submittable.
```

## What NOT to change

The plants and animals folders and their requests. The `journey` variable's default (`chedpp-plants`). The application code, routes, or journey module — this story only edits the Postman collection and its inline docs. If a request reveals a bug, file it; don't fix app code here.
