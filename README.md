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
