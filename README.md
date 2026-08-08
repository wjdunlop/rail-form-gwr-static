# Rail Form — Great Western and Transport for Wales demos

A public, static GitHub Pages deployment of the Great Western and Transport for
Wales railway simulations.

- Great Western: <https://wjdunlop.github.io/rail-form-gwr-static/?scenario=paddington-west&profile=1>
- Transport for Wales: <https://wjdunlop.github.io/rail-form-gwr-static/tfw/>

The site runs entirely in the browser. The root opens `paddington-west`; `/tfw/`
opens `tfw-network`. Both include a seven-day working timetable, geographic
track geometry, passenger origin–destination demand, train inspection,
operations controls and performance metrics.

The demand overlay follows exact mapped rail corridors, including services that
skip intermediate stations. Solid arrows show stopping demand; dashed arrows
show non-stopping demand on the opposite side of the railway. Arrow width and
colour represent modeled passengers per hour.

## Public deployment

This repository is intentionally public and the Pages site is intentionally **not password protected**. StatiCrypt encryption is therefore not applied: StatiCrypt's purpose is password-based encryption, which would conflict with the public-access requirement.

## Currently deployed

The published site is built from this repository's `main` branch. Its reviewed
application runtime is synchronized from
[`wjdunlop/rail-form`](https://github.com/wjdunlop/rail-form) base commit
`ceb7dee` (`perf: bound extreme-speed rendering`).

| Public route | Scenario | Included browser products |
| --- | --- | --- |
| `/rail-form-gwr-static/` | `paddington-west` | Great Western station, GTCL track, CIF timetable, NESA, ORR ODM and external-demand modules |
| `/rail-form-gwr-static/tfw/` | `tfw-network` | TfW station, exact-track, CIF timetable and ORR ODM modules |

The shared deployment also includes the simulation shell, geographic context,
passenger-demand and timetable-load models, train/station inspection, demand
overlays, metrics, activity log, persistence, and static data-licence page.
Passenger journeys, transfers, queues, loads and completion counts are modeled;
fares, revenue, capital, and other financial outcomes are not calculated or
displayed.
The public interface is a read-only timetable and infrastructure model. It does
not expose purchasing, capital, construction, editable fleet allocation,
conditional dispatch controls, line deletion, or game objectives.
Only `paddington-west` and `tfw-network` are exposed by the public scenario
registry. Avanti, the GB national runtime, development tests, raw publisher
downloads, local profiling captures and credentials are not deployed.

The deployed content counts are:

- Great Western: 120 stations, 124 corridors, 248 routed directional paths,
  7,553 weekly workings and 10,394 ORR ODM flows.
- Transport for Wales: 291 stations, 356 corridors, 7,436 weekly workings and
  35,708 ORR ODM flows.

Each public route now opens with a route-specific loading page summarizing its
model coverage. The simulation header provides a compact railway clock, an
explicit pause/resume button, a single 1×–1024× speed selector, and a weekday
plus time picker. Applying a specific time pauses the model at that point in
the permanent seven-day timetable loop.

Modeled demand changes continuously with railway time: the browser interpolates
between routed 30-minute demand keyframes on every simulation tick. At high
speeds, exact model time is retained while passenger generation and movement
are processed in adaptive 15–300-second virtual batches and drawing is capped at
30 fps (64×–128×), 10 fps (256×), or 4 fps (512×–1024×), keeping long
accelerated runs responsive.

The Feedback control is present but intentionally disabled until its Google
Form URL is supplied. To enable it on both routes, set the same URL in the
`rail-feedback-url` meta tag in `index.html` and `tfw/index.html`, then update
the HTML cache-busting build identifier, test both routes, commit and publish.

## Updating the static deployment

The development repository is the source of truth; this repository is a
reviewed public subset. Do not copy the development tree wholesale.

1. Commit and push the intended development state to `wjdunlop/rail-form`
   first. Record that source commit in the **Currently deployed** section above.
2. Copy changed shared browser assets from the development repository while
   retaining this repository's public-only `index.html`, `tfw/index.html`,
   `src/scenarios/browser-loader.js`, `src/scenarios/registry.js`, README and
   licensing notices unless those files are deliberately being reviewed too.
3. Copy only the scenario products required by the two published routes:
   `paddington-west*`, `tfw-network*`, shared runtime modules, geographic
   context and styles. Never copy `.env`, credentials, raw downloads, national
   runtime payloads, test captures or unrelated scenarios.
4. Update cache-busting query strings in both HTML entrypoints whenever a
   changed asset might otherwise remain in a visitor's browser cache.
5. Run syntax/unit checks in the development repository and serve this
   repository locally for both-route browser smoke tests.
6. Review `git diff --check`, the complete staged file list and the licensing
   page, then commit and push this repository's `main` branch.
7. Wait for the GitHub Actions `pages-build-deployment` workflow to succeed.
   Verify both public routes with a fresh cache-busting `?build=<commit>` query
   and parse the live station, timetable, demand and track modules to confirm
   their expected counts.

Useful pre-publish checks from this repository:

```sh
git diff --check
node --check app.js
node --check src/scenarios/registry.js
node --check src/scenarios/browser-loader.js
python3 -m http.server 4173
```

After pushing, use the static repository commit in the inspection URL:

```text
https://wjdunlop.github.io/rail-form-gwr-static/?scenario=paddington-west&profile=1&build=<static-commit>
https://wjdunlop.github.io/rail-form-gwr-static/tfw/?build=<static-commit>
```

## Run locally

```sh
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173/`.

## Data provenance

The committed browser products are derived from:

- Network Rail GTCL railway geography and topology
- Network Rail CIF/working timetable data
- Network Rail National Electronic Sectional Appendix references
- ORR 2024/25 Origin Destination Matrix data
- NaPTAN station locations
- OpenStreetMap railway and station mapping
- Ordnance Survey open built-up-area and greenspace context

Source URLs, attribution and pinned provenance are embedded in the scenario modules and displayed in the application. Network Rail and Ordnance Survey open data are used under their applicable Open Government Licence terms; OpenStreetMap data is © OpenStreetMap contributors.

The full required notices—including the GTCL Crown/Ordnance Survey statement,
Network Rail attribution, ORR ODM OGL3 terms, OSM ODbL share-alike notice,
OS OpenData acknowledgement, NaPTAN and Natural Earth status—are in
[DATA_LICENCES.md](DATA_LICENCES.md) and are linked from the map itself.

## Western coverage

- 120 mapped stations
- 124 adjacent corridors and 248/248 GTCL-routed directional paths
- 1,104 selected GTCL track-centre assets with zero ordinary corridor fallbacks
- Paddington–Cardiff–Swansea–Carmarthen
- Reading–Newbury–Westbury–Taunton–Exeter–Plymouth–Penzance
- 7,553 dated GWR workings across the permanent seven-day loop
- 6,518 passenger and 908 empty coaching-stock workings, plus departmental and freight movements found in the GWR timetable feed
- 10,394 ORR ODM flows representing 64,140,038 annual journeys

Station coverage has two authority levels: 65 core stations include pinned OSM
platform surfaces/roads, while 55 western additions currently use CIF platform
identities and NaPTAN coordinates pending detailed platform import.

Five directional paths use explicitly tagged opposite-road GTCL geometry where
one published flow is omitted during product supersession. “248 routed” does
not assert 248 independently published roads.

## Transport for Wales coverage

- 291 mapped stations across Wales and cross-border routes
- 356 rail corridors and 5,541 selected GTCL track assets
- 7,436 dated weekly workings: 6,398 passenger, 651 empty-stock and 387
  departmental/freight movements
- 35,708 ORR ODM flows representing 47,526,128 annual journeys
- 40 service families covering the South Wales Metro, Marches, North Wales,
  Cambrian, Heart of Wales and English cross-border routes

## Scope

This repository contains the standalone Great Western and Transport for Wales
demonstrations only. Development tooling, raw publisher downloads,
national-model payloads and unrelated scenarios are deliberately excluded.

The current Great Western data snapshot was introduced in commit `4235bdf`.
The Transport for Wales route was added as a separate reviewed browser product.
The browser runtime is synchronized separately from the development workspace
as a reviewed static asset set; generated source archives, unrelated regional
products and credentials are never copied here. Publication is verified by parsing
cache-busted live station, CIF, ODM and GTCL modules after the Pages Actions run,
because the legacy Pages build API can lag the actual deployment.

This repository currently has no software `LICENSE` file. The dataset licences
in [DATA_LICENCES.md](DATA_LICENCES.md) apply to data and derivatives and do not
grant a licence to the application code.
