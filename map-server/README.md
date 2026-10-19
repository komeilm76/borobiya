# Map server

The Compose `map-server` service runs Martin 1.16.1 from `map-server/martin.yaml`. It mounts the map data, styles, SVG sprite sources, and fonts read-only. Martin publishes styles at `/style/light` and `/style/dark`, creates sprite PNG/JSON responses from `sprites/borobiya/*.svg`, and generates font glyph ranges from the bundled TTF files on demand. Through the Nginx gateway, load styles at `/map/style/light`; their root-relative `/tehran/`, `/sprite/`, and `/font/` assets are also proxied to Martin on the same origin.

## Assets

- `styles/light.json` and `styles/dark.json` share one vector source and layer structure; only paint values differ by theme.
- `sprites/borobiya/*.svg` are source artwork for the `borobiya` sprite set; Martin produces the sprite sheet dynamically.
- `fonts/` contains Noto Sans Regular and Noto Naskh Arabic Regular. Martin's `Borobiya Sans` alias uses Arabic/Persian as a fallback; see `fonts/README.md` and `fonts/OFL.txt` for sources and licensing.
- `data/` is Git-ignored and contains generated `.pmtiles`/`.mbtiles` archives. The intended `tehran.pmtiles` source is served as `/tehran/{z}/{x}/{y}`.
- `python3 scripts/verify-styles.py` checks source parity, theme layer parity, and SVG references without extra dependencies.

## Data status

A clean checkout contains no committed map dataset. `scripts/generate-tiles.sh` builds `tehran.pmtiles` with the pinned Planetiler 0.10.2 JAR, and `scripts/verify-tehran-tiles.sh` checks Martin's health endpoint and MVT route. The scripts pass syntax checks, but the PBF's reuse terms are unresolved, Java 21+ is not installed in the current agent environment, and no PMTiles archive or real Martin tile request has been produced. T1.4.2 therefore remains incomplete.

See [the map-server plan](../docs/MAP_SERVER.md) for setup, endpoint, and offline-pipeline details. Routing and geocoding remain future tasks.
