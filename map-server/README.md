# Map server

The Compose `map-server` service runs Martin 1.16.1 from `map-server/martin.yaml`. It mounts the map data, styles, SVG sprite sources, and fonts read-only. Martin publishes styles at `/style/light` and `/style/dark`, creates sprite PNG/JSON responses from `sprites/borobiya/*.svg`, and generates font glyph ranges from the bundled TTF files on demand. Through the Nginx gateway, load styles at `/map/style/light`; their root-relative `/tehran/`, `/sprite/`, and `/font/` assets are also proxied to Martin on the same origin. The routing gateway exposes public `GET /map-config` settings and accepts the project's `POST /route` contract, adapting it to one of three separate local OSRM 26.10.0 profile services.

## Assets

- `styles/light.json` and `styles/dark.json` share one vector source and layer structure; only paint values differ by theme.
- `sprites/borobiya/*.svg` are source artwork for the `borobiya` sprite set; Martin produces the sprite sheet dynamically.
- `fonts/` contains Noto Sans Regular and Noto Naskh Arabic Regular. Martin's `Borobiya Sans` alias uses Arabic/Persian as a fallback; see `fonts/README.md` and `fonts/OFL.txt` for sources and licensing.
- `data/` is Git-ignored and contains generated `.pmtiles`/`.mbtiles` archives. The intended `tehran.pmtiles` source is served as `/tehran/{z}/{x}/{y}`.
- `python3 scripts/verify-styles.py` checks source parity, theme layer parity, and SVG references without extra dependencies.

## Data status

A clean checkout contains no committed map dataset. `scripts/generate-tiles.sh` requires an explicitly supplied reuse-approved `MAP_PBF`, uses `MAP_REGION`, `MAP_BBOX`, `MAP_DATA_VERSION`, and zoom settings, and writes the region-named PMTiles archive plus a JSON build manifest. `scripts/verify-tehran-tiles.sh` checks Martin's health endpoint and MVT route. The local candidate PBF's reuse terms are unresolved, Java 21+ is unavailable in the current agent environment, and no PMTiles archive or real Martin tile request has been produced. T1.4.2 remains incomplete; the generator will not select the candidate PBF implicitly.

Routing scaffolding is present: `scripts/build-routing.sh` builds separate car, bicycle, and foot graphs from an explicitly supplied reuse-approved region PBF; Compose runs each graph in an OSRM 26.10.0 service; `routing-gateway/` adapts the project's `POST /route` contract. The current environment has no Docker/OSRM runtime and the candidate PBF is not approved, so no graph or real offline route has been tested. T1.4.4 remains incomplete. From the repository root, run `node --test map-server/routing-gateway/*.test.mjs` for the offline adapter tests; see [the map-server plan](../docs/MAP_SERVER.md) for graph generation and real smoke-test commands. T1.4.6 wires the public map settings through Compose and the `/map-config` endpoint; geocoding remains a future task.
