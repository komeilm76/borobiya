# Map server runtime data

The Compose `map-server` service uses Martin and mounts the ignored `map-server/data/` directory read-only at `/data`. Put generated `.pmtiles` or `.mbtiles` sources there when the map-data pipeline is implemented; this directory is intentionally excluded from Git.

The scaffold currently contains no map source files, styles, sprites, or fonts. Martin may expose its health/catalog endpoints, but map tiles and the app's light/dark styles, routing, and geocoding are not available yet. See [the map-server plan](../docs/MAP_SERVER.md) for the future data pipeline.
