# Map server

The Compose `map-server` service runs Martin 1.16.1 from `map-server/martin.yaml`. It mounts the map data, styles, SVG sprite sources, and fonts read-only. Martin publishes styles at `/style/light` and `/style/dark`, creates sprite PNG/JSON responses from `sprites/borobiya/*.svg`, and generates font glyph ranges from the bundled TTF files on demand. Through the Nginx gateway, load styles at `/map/style/light`; their root-relative `/tehran/`, `/sprite/`, and `/font/` assets are also proxied to Martin on the same origin. The routing gateway exposes `GET /map-config`, adapts `POST /route` to three local OSRM 26.10.0 profile services, and proxies `GET /geocode` and `/reverse` to the optional offline Photon 1.3.0 service.

## Assets

- `styles/light.json` and `styles/dark.json` share one vector source and layer structure; only paint values differ by theme.
- `sprites/borobiya/*.svg` are source artwork for the `borobiya` sprite set; Martin produces the sprite sheet dynamically.
- `fonts/` contains Noto Sans Regular and Noto Naskh Arabic Regular. Martin's `Borobiya Sans` alias uses Arabic/Persian as a fallback; see `fonts/README.md` and `fonts/OFL.txt` for sources and licensing.
- `data/` is Git-ignored and contains the pinned Geofabrik source PBF, the `MAP_BBOX`-cropped `tehran.osm.pbf`, provenance/checksum manifests, and generated PMTiles. Martin serves `tehran.pmtiles` as `/tehran/{z}/{x}/{y}`.
- `photon/` contains the checked-in Dockerfile; the pinned JAR, Nominatim database, and Photon index are local ignored artifacts.
- Both styles and the app footer show linked `© OpenStreetMap contributors` attribution to the ODbL/copyright page.
- `python3 scripts/verify-styles.py` checks source parity, theme layer parity, and SVG references without extra dependencies.

## Data status

A clean checkout contains no committed map dataset. The approved Geofabrik Iran snapshot (`iran-261018.osm.pbf`, data date 2026-10-18, ODbL 1.0) is downloaded and verified by `scripts/prepare-tehran-pbf.sh`, which uses the configured `MAP_BBOX` to create the one shared `data/tehran.osm.pbf` crop and source manifest. The tile and routing builders validate that crop's hash and bounds before use. `scripts/verify-tehran-tiles.sh` checks Martin health plus the real MVT route. Generated artifacts and live service checks are still pending, so T1.4.2 remains open.

`scripts/build-routing.sh` builds separate car, bicycle, and foot MLD graphs from that exact verified crop; Compose runs each graph in a pinned OSRM service and `routing-gateway/` adapts the project's `POST /route` contract. `scripts/verify-routing.sh` exercises all three profiles against the live local stack. T1.4.4 remains open until the real route smoke test succeeds.

For geocoding, the opt-in Nominatim 5.3 container imports the same cropped PBF, and the pinned Photon 1.3.0 JAR imports that local database into an ignored persistent index. The gateway exposes `/geocode` and `/reverse`; `scripts/verify-geocoding.sh` checks real offline GeoJSON results. T1.4.5 remains open until that check passes. Run `node --test map-server/routing-gateway/*.test.mjs` for local-fixture adapter/integration tests and see [the map-server plan](../docs/MAP_SERVER.md) for setup, attribution, and end-to-end smoke commands.
