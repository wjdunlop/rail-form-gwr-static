# Rail Form — Great Western Demo

A public, static GitHub Pages deployment of the Great Western railway simulation.

The site runs entirely in the browser and opens the `paddington-west` scenario automatically. It includes the seven-day working timetable, geographically mapped track and station geometry, passenger origin–destination demand, train inspection, operations controls and performance metrics.

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

## Scope

This repository contains the standalone Great Western demonstration only. Development tooling, raw publisher downloads, national-model payloads and unrelated scenarios are deliberately excluded.
