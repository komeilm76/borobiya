# Map server

The Compose `map-server` service runs Martin 1.16.1 from `map-server/martin.yaml`. It mounts the map data, styles, SVG sprite sources, and fonts read-only. Martin publishes styles at `/style/light` and `/style/dark`, creates sprite PNG/JSON responses from `sprites/borobiya/*.svg`, and generates font glyph ranges from the bundled TTF files on demand. Through the Nginx gateway, load styles at `/map/style/light`; their root-relative `/borobiya/`, `/sprite/`, and `/font/` assets are also proxied to Martin on the same origin. The routing gateway exposes `GET /map-config`, adapts `POST /route` to three local OSRM 26.10.0 profile services, and proxies `GET /geocode` and `/reverse` to the optional offline Photon 1.3.0 service.

## Assets

- `styles/light.json` and `styles/dark.json` share one vector source and layer structure; only paint values differ by theme.
- `sprites/borobiya/*.svg` are source artwork for the `borobiya` sprite set; Martin produces the sprite sheet dynamically.
- `fonts/` contains Noto Sans Regular and Noto Naskh Arabic Regular. Martin's `Borobiya Sans` alias uses Arabic/Persian as a fallback; see `fonts/README.md` and `fonts/OFL.txt` for sources and licensing.
- `data/` is Git-ignored and contains the pinned Geofabrik source PBFs (`data/source/`), per-area Osmium crops (`data/crops/`), the merged `borobiya.osm.pbf` dataset, provenance/checksum manifests, and generated PMTiles. Martin serves `borobiya.pmtiles` as `/borobiya/{z}/{x}/{y}` whatever areas the dataset contains.
- `photon/` contains the checked-in Dockerfile; the pinned JAR, Nominatim database, and Photon index are local ignored artifacts.
- Both styles and the app footer show linked `© OpenStreetMap contributors` attribution to the ODbL/copyright page.
- `python3 scripts/verify-styles.py` checks source parity, theme layer parity, and SVG references without extra dependencies.

## Data status

A clean checkout contains no committed map dataset. Areas are selected from `regions.json` (all Geofabrik sources pinned to the 2026-10-18 snapshot with official MD5s, ODbL 1.0; default `ir-tehran`); `scripts/prepare-regions-pbf.sh` downloads/verifies the needed extracts, crops the cities, and merges the one shared `data/borobiya.osm.pbf` dataset + provenance manifest. The tile and routing builders validate that dataset's hash, areas, and bounds before use. `scripts/verify-tiles.sh` checks Martin health plus a real MVT tile for a selected area. Live acceptance (tiles/routes/geocoding) passed on the target VM on 2026-10-20; see `../docs/PROGRESS.md`.

`scripts/build-routing.sh` builds separate car, bicycle, and foot MLD graphs from that exact verified dataset; Compose runs each graph in a pinned OSRM service and `routing-gateway/` adapts the project's `POST /route` contract. `scripts/verify-routing.sh` exercises all three profiles against the live local stack for a selected area.

For geocoding, the opt-in Nominatim 5.3 container imports the same merged dataset PBF, and the pinned Photon 1.3.0 JAR imports that local database (languages follow the selected areas) into an ignored persistent index. The gateway exposes `/geocode` and `/reverse`; `scripts/verify-geocoding.sh` checks real offline GeoJSON results per area. Run `node --test map-server/routing-gateway/*.test.mjs` for local-fixture adapter/integration tests and see [the map-server plan](../docs/MAP_SERVER.md) for setup, attribution, and end-to-end smoke commands.
