# Borobiya — Map Server (Offline Vector)

> TL;DR: The target design is fully offline: self-host **Martin 1.16.1** (vector tiles and styles), **OSRM 26.10.0** (routing), and **Photon 1.3.0** (geocoding) as separate services, with configurable OSM-derived data. **Current scaffold status:** Martin is configured to serve committed light/dark styles, SVG-derived sprites, and dynamically generated glyphs; the Tehran PMTiles archive is still not generated, so its tile route remains unverified. The pinned Planetiler generation and MVT smoke-test scripts exist, but generation is blocked in this environment by missing Java 21+ and the candidate PBF's reuse terms are unresolved. Separate OSRM profile services, a graph builder, and the `POST /route` adapter are configured, but a real route test is still blocked by the same unapproved data and missing Docker/OSRM runtime. Photon indexing and a real Martin runtime check remain pending.

---

## 1. What “Offline Vector” Means

| Term | Precise Definition | Forbidden |
|------|--------------------|-----------|
| **Not Tile** | Vector tiles `/{z}/{x}/{y}.pbf` (MVT/protobuf) rendered client-side by MapLibre GL JS | Raster `256x256.png/jpg` (Google/OSM raster) |
| **Fully Offline** | Works on LAN with ZERO internet. No runtime `maps.googleapis.com`, `api.mapbox.com` | Any online provider |
| **Independent** | Map Server deployable on separate VM/box, own lifecycle | Tied to API server process |

Clients use:
- `https://borobiya.local/api` → API
- `https://map.borobiya.local` or the local `/map` prefix → Martin tiles/styles/assets
- `https://borobiya.local/route` (or local port 8001) → project routing adapter
- `https://borobiya.local/map-config` → public region/bounds/version/zoom settings; the gateway serves these at `/config`

---

## 2. Architecture

```
                         ┌─────────────────────────────────┐
                         │      Map Server  :8000          │
                         │  ┌─────────────┐                │
Internet ──download once─►│  │  OSM PBF    │  (geofabrik)   │
(no runtime need)        │  └──────┬──────┘                │
                         │         │ planetiler/tippecanoe  │
                         │  ┌──────▼──────┐                │
                         │  │ PMTiles/MBTiles              │
                         │  │ + Martin serve               │──► GET /{sourceID}/{z}/{x}/{y}
                         │  │ + Styles light/dark JSON     │──► GET /style/{id}
                         │  │ + Sprites + Glyphs           │──► /sprite/* /font/*
                         │  └─────────────┘                │
                         │  ┌─────────────┐                │
                         │  │ OSRM graphs │ car/bicycle/foot│──► POST /route (adapter)
                         │  │ MLD services│                │──► OSRM /route/v1/{profile}
                         │  └─────────────┘                │
                         │  ┌─────────────┐                │
                         │  │ Photon index│                │──► GET /geocode?q=& GET /reverse?lat=&lon=
                         │  │ (ES + OSM)  │                │
                         │  └─────────────┘                │
                         └─────────────────────────────────┘
```

---

## 3. Tool Choices and Pinned Versions

The following latest stable (non-prerelease) releases were selected from the projects’ official release pages on **2026-10-19**. Container images use release-version tags (never `latest`); JARs use their versioned release artifacts and recorded SHA-256 checksums.

| Capability | Selected release | Pinned artifact | Rationale / source |
|------------|------------------|-----------------|--------------------|
| Tile serving | **Martin 1.16.1** | `ghcr.io/maplibre/martin:1.16.1` | Official Martin image; serves PMTiles, MBTiles, and PostGIS sources. [Release](https://github.com/maplibre/martin/releases/tag/martin-v1.16.1). |
| Tile generation | **Planetiler 0.10.2** | [`planetiler.jar`](https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar); SHA-256 `f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d` | Produces PMTiles from OSM extracts; Java 21+ is required for the JAR. [Release](https://github.com/onthegomap/planetiler/releases/tag/v0.10.2). |
| Routing | **OSRM 26.10.0** | `ghcr.io/project-osrm/osrm-backend:v26.10.0` | Official GHCR image; the release includes car, bicycle, and foot Lua profiles. [Release](https://github.com/Project-OSRM/osrm-backend/releases/tag/v26.10.0). |
| Geocoding | **Photon 1.3.0** | [`photon-1.3.0.jar`](https://github.com/komoot/photon/releases/download/1.3.0/photon-1.3.0.jar); SHA-256 `a89707c0045e4807b2a1180e132e68e108d998709f48b6c94b98a6e281f571a5` | Java 21+; embedded OpenSearch is the default, and external OpenSearch requires 3.x. Photon imports from a Nominatim database or Photon JSON dump, **not a raw OSM PBF**. [Release](https://github.com/komoot/photon/releases/tag/1.3.0). |
| Styles, sprites, glyphs | **Martin 1.16.1** | `/style/{id}`, `/sprite/{id}.*`, `/font/{stack}/{range}` | Martin serves style JSON and generates sprite sheets and glyph PBF ranges from local SVG/TTF assets on demand; no external runtime requests. [Style docs](https://maplibre.org/martin/using/sources-styles/). |

The versions are exact pins, not compatibility ranges. Upgrade them deliberately: review release notes, refresh JAR checksums, and rerun the tile-serving, routing-profile, and geocoding checks. Photon’s input constraint is called out here because the later offline-index task must select/provision a Nominatim or Photon-JSON import path before a PBF-to-geocoder command can be documented.

---

## 4. Data Pipeline

### 4.1 Source

- **OSM PBF dumps:** `https://download.geofabrik.de/asia/iran-latest.osm.pbf` or `https://openstreetmap.fr/extracts/`.
- For dev, use **Tehran cut** (~100 MB): `https://download.geofabrik.de/asia/iran/…` + `osmium-tool` extract by bbox.

### 4.2 Steps

```bash
# 1–2. Generate region-named tiles from a reuse-approved region PBF.
# MAP_BBOX is west,south,east,north; Planetiler clips to it and uses the zoom range.
MAP_PBF=/path/to/reuse-approved-tehran.osm.pbf \
MAP_REGION=tehran \
MAP_BBOX=51.0,35.5,51.7,35.9 \
MAP_DATA_VERSION=2026-10-19 \
MAP_MIN_ZOOM=0 MAP_MAX_ZOOM=14 \
  ./map-server/scripts/generate-tiles.sh
# Creates map-server/data/tehran.pmtiles and tehran.metadata.json.

# Optional alternative for small GeoJSON-only areas:
tippecanoe -o map-server/data/tehran.mbtiles -zg --drop-densest-as-needed data/tehran.geojson

# 3. Build separate OSRM graphs from an approved PBF cropped for the same region.
MAP_PBF=/path/to/reuse-approved-tehran.osm.pbf MAP_REGION=tehran \
  ./map-server/scripts/build-routing.sh

# 4. Photon 1.3.0 cannot import an .osm.pbf directly. It needs a Nominatim
# PostgreSQL database or a Photon JSON dump; choose/provision that input in T1.4.5.
# See §7 for the pinned Photon import and serve commands.

# 5. Start local services after generating data; MAP_* values come from .env.
docker compose --profile routing up -d
```

`map-server/scripts/generate-tiles.sh` requires an explicit reuse-approved `MAP_PBF`, validates `MAP_REGION`, `MAP_BBOX`, `MAP_DATA_VERSION`, and the zoom range, verifies Planetiler 0.10.2 by SHA-256, and writes `<region>.pmtiles` plus a checksum/settings manifest. `build-routing.sh` uses the same explicit region PBF to create profile-specific `<region>.osrm` graphs. `verify-tehran-tiles.sh` and `verify-routing.sh` are local runtime smoke tests. The generated PMTiles and OSRM graphs are Git-ignored; no source PBF is selected implicitly. Real-data checks remain pending an approved PBF and runnable container environment. Geocoding and update scripts (`build-geocode.sh`, `update.sh`) remain future work.

### 4.3 Styles, sprites, and glyphs

The committed styles are MapLibre Style Spec v8 documents with the same vector source, layer IDs/order, filters, and layout. The theme-specific differences are in layer paint values:

- `map-server/styles/light.json`
- `map-server/styles/dark.json`

Martin serves these as `/style/light` and `/style/dark`. Through the Compose Nginx gateway, use `/map/style/light` and `/map/style/dark`.

The style resources use root-relative URLs, not hard-coded hosts. This works both when a browser loads the style through `/map/style/light` and when it loads the style directly from Martin. The Vite dev proxy and Nginx gateway forward `/tehran/`, `/sprite/`, and `/font/` to Martin on the same origin:

```json
{
  "sources": {
    "tehran": {
      "type": "vector",
      "tiles": ["/tehran/{z}/{x}/{y}"],
      "minzoom": 0,
      "maxzoom": 14
    }
  },
  "sprite": "/sprite/borobiya",
  "glyphs": "/font/{fontstack}/{range}"
}
```

The tile source uses the default Planetiler OpenMapTiles profile (`water`, `transportation`, `place`, `poi`, and related layers). Sprite source files live in `map-server/sprites/borobiya/*.svg`; Martin builds and caches the PNG/JSON sprites at request time, for example `/sprite/borobiya.json` and `/sprite/borobiya.png`. No generated sprite binaries are committed.

The style uses the `Borobiya Sans` font alias. `map-server/fonts/` contains Noto Sans Regular for Latin and Noto Naskh Arabic Regular as its Arabic/Persian fallback. Martin reads the licensed TTFs and dynamically serves requested glyph ranges at `/font/{fontstack}/{range}`; pre-generated glyph PBFs and `font-maker` are not required. Font provenance, checksums, copyright, and the SIL Open Font License 1.1 are documented alongside the files in `map-server/fonts/README.md` and `OFL.txt`.

Run the dependency-free style/source/layer/SVG consistency check with `python3 map-server/scripts/verify-styles.py`. The JSON style documents were also checked against MapLibre's style specification during implementation.

---

## 5. Martin Config (`map-server/martin.yaml`)

Compose mounts the checked-in Martin config and all style assets read-only. Its container paths are:

```yaml
postgres:
  connection_string: ${DATABASE_URL}
pmtiles:
  paths: [/data]
styles:
  paths: [/styles]
sprites:
  paths: [/sprites/borobiya]
fonts:
  paths: [/fonts]
  aliases:
    Borobiya Sans: [Noto Sans Regular, Noto Naskh Arabic Regular]
```

The actual file is `map-server/martin.yaml`. Martin discovers PMTiles sources from `/data`; when the archive is named `tehran.pmtiles`, its source ID is `tehran` and its MVT route is `/tehran/{z}/{x}/{y}` (an optional `.pbf` suffix redirects). `styles.paths` publishes JSON files by filename, so they are available at `/style/light` and `/style/dark`. The configured SVG folder and TTF fonts back the `/sprite/` and `/font/` APIs. Configure PostGIS table discovery with `postgres.auto_publish` when tile tables are added.

Start the local dependencies:

```bash
docker compose up -d postgres map-server
```

Verify the style and dynamically served assets (these can be checked before tile generation):

```bash
curl http://localhost:8000/style/light | jq .sources
curl http://localhost:8000/sprite/borobiya.json | jq
curl 'http://localhost:8000/font/Borobiya%20Sans/0-255' -o /tmp/glyphs.pbf
# Through the Nginx /map/ prefix:
curl http://localhost:8080/map/style/dark | jq .name
```

After `tehran.pmtiles` has been generated, verify a real MVT response:

```bash
./map-server/scripts/verify-tehran-tiles.sh
MARTIN_URL=http://localhost:8080/map ./map-server/scripts/verify-tehran-tiles.sh
```

This checkout's styles and assets are statically validated, but this environment has not run Martin or produced the PMTiles archive.

---

## 6. OSRM Routing Setup

OSRM chooses a transport profile while building the graph with `osrm-extract`; a single prepared graph cannot switch between car, bicycle, and foot at request time. The Compose setup therefore uses three isolated graph directories and three OSRM services. The official OSRM 26.10.0 image includes `/opt/car.lua`, `/opt/bicycle.lua`, and `/opt/foot.lua`. OSRM's HTTP profile name for its bundled bicycle rules is `bike`, so the gateway maps the public `bicycle` value to `/route/v1/bike`.

### Build graphs

Use a Tehran PBF whose reuse terms have been confirmed. The ignored candidate PBF in `map-server/data/` is not approved and must not be used until its licensing is resolved. The build script does not download or select a dataset implicitly:

```bash
MAP_PBF=/absolute/path/to/reuse-approved-tehran.osm.pbf MAP_REGION=tehran \
  ./map-server/scripts/build-routing.sh
```

It runs the pinned `ghcr.io/project-osrm/osrm-backend:v26.10.0` image, extracts and prepares MLD graphs for all three bundled profiles, then publishes them to `map-server/osrm/data/{car,bicycle,foot}/<MAP_REGION>.osrm`. That output directory is Git-ignored. To build to a different location, set `MAP_OSRM_DATA_DIR` both for this command and in the Compose `.env`.

After successful graph generation, start the local Compose stack with routing enabled:

```bash
docker compose --profile routing up -d
```

`routing-gateway` runs in the default profile and can answer `/health` without graph data; the three OSRM services are in Compose's `routing` profile. Once the profiles are enabled, the gateway forwards only to the local `osrm-car`, `osrm-bicycle`, or `osrm-foot` service. No public routing service or external network is used.

### Project API and OSRM adapter

The project contract remains a simple `POST /route`; its body is translated to OSRM's native `POST /route/v1/{profile}` JSON API (coordinates are converted from `{lat,lon}` objects to `[longitude,latitude]` arrays):

```json
{
  "from": { "lat": 35.68, "lon": 51.38 },
  "to": { "lat": 35.70, "lon": 51.41 },
  "profile": "car",
  "alternatives": true
}
```

`profile` must be `car`, `bicycle`, or `foot`; `alternatives` may be a boolean or an integer from 0 to 3. The response contains `routes`, each with `distance_m`, `duration_s`, encoded `polyline`, and OSRM `legs`, plus the selected `profile` and snapped `waypoints`. The route adapter listens on `http://localhost:8001/route`; the Compose Nginx gateway also forwards same-origin `/route` on port 8080. The Vite dev proxy forwards `/route` to `MAP_ROUTING_URL`.

`GET /map-config` is the public, same-origin configuration endpoint (gateway path `/config`). It returns only `{ region, bbox, dataVersion, minZoom, maxZoom }`; invalid region, bounds, version, or zoom environment values prevent the gateway from starting. Both Nginx and Vite proxy this endpoint to the same routing gateway, and the client validates the response before using it.

Run the deterministic, network-free gateway tests with Node.js:

```bash
node --test map-server/routing-gateway/*.test.mjs
```

After the approved graphs and OSRM services are running, exercise the real offline route endpoint for all three profiles:

```bash
./map-server/scripts/verify-routing.sh
```

This checkout cannot yet pass the real route smoke test: Docker/OSRM are unavailable in the current environment and the local candidate PBF's reuse terms are unresolved. T1.4.4 remains open until graphs are built from an approved dataset and the smoke test succeeds.

---

## 7. Photon Setup

```bash
# Photon 1.3.0 requires Java 21+. Import from a prepared Nominatim database.
# (Alternatively, import a Photon JSON dump with `import -import-file <file>`.)
export NOMINATIM_PASSWORD=replace-me
java -jar photon-1.3.0.jar import -host localhost -port 5432 \
  -database nominatim -user nominatim -password "$NOMINATIM_PASSWORD"

# Run from the directory containing photon_data; bind on LAN/container interfaces.
java -jar photon-1.3.0.jar serve -listen-ip 0.0.0.0 -listen-port 2322

# Verify
curl 'http://localhost:2322/api?q=azadi&limit=5' | jq
curl 'http://localhost:2322/reverse?lat=35.7&lon=51.38' | jq
```

Photon 1.3.0 has an embedded OpenSearch mode by default; external OpenSearch 3.x is optional. The repository scaffold does not yet provision Nominatim or a Photon JSON dump, and a raw PBF cannot be used as `-import-file` input. T1.4.5 must settle and test the offline import path.

Map endpoints exposed as:

```
GET /geocode?q=Azadi+Square&limit=5&bbox=51.0,35.5,51.7,35.9
GET /reverse?lat=35.70&lon=51.40
```

The shared client contract defaults geocoding to 5 results and allows `limit` from 1 to 20. Bounding boxes use `west,south,east,north` order. Reverse-geocode coordinates are validated against WGS84 latitude/longitude ranges.

Response:

```json
{ "features": [{ "properties": { "name":"Azadi Square","city":"Tehran","country":"Iran" }, "geometry": {"coordinates":[51.38,35.7]}}] }
```

---

## 8. ENV Configuration

```env
MAP_REGION=tehran          # lowercase slug; must match the archive/graph names
MAP_BBOX=51.0,35.5,51.7,35.9  # west,south,east,north in WGS84
MAP_DATA_VERSION=development  # version slug published by GET /map-config
MAP_MIN_ZOOM=0
MAP_MAX_ZOOM=14              # Planetiler 0.10.2 supports up to 16
MAP_SERVER_URL=http://localhost:8000          # API tells clients
MAP_STYLE_LIGHT=http://localhost:8000/style/light
MAP_STYLE_DARK=http://localhost:8000/style/dark
MAP_ROUTING_URL=http://localhost:8001/route
MAP_ROUTING_PORT=8001
MAP_OSRM_DATA_DIR=./map-server/osrm/data
MAP_GEOCODE_URL=http://localhost:8000/geocode
MAP_REVERSE_URL=http://localhost:8000/reverse
```

**Geographic coverage:** Defaults target Tehran. The pipeline names archives and OSRM graphs from `MAP_REGION`, clips tile output to `MAP_BBOX`, and stamps `MAP_DATA_VERSION` plus zoom bounds in the build manifest. For another region, provide a matching approved PBF and update the Compose environment/volumes. The committed MapLibre styles still name the Tehran source, so matching runtime style/client source wiring for non-Tehran regions remains future work; do not treat changing `MAP_REGION` alone as a complete region switch.

Disk/RAM guide:

| Region | PMTiles | OSRM graph (per profile) | Photon index | RAM to serve |
|--------|---------|--------------------------|--------------|---------------|
| Tehran | ~0.5 GB | ~0.8 GB (rough estimate) | ~1.2 GB | Benchmark pending |
| Iran | ~3–5 GB | ~2 GB (rough estimate) | ~4 GB | Benchmark pending |

The graph estimates are per profile; this Compose design runs three separate OSRM processes and three graphs. Memory figures from the earlier single-profile plan are not valid for that deployment, so benchmark the full set before sizing.

---

## 9. Client Integration (MapLibre)

`packages/client/src/components/map/MapCanvas.vue` is the reusable MapLibre initializer. It loads the same-origin `/map/style/light` style, starts at Tehran (`[51.389, 35.6892]`, zoom 11), displays style-source attribution plus navigation and metric-scale controls, and applies validated zoom bounds and geographic bounds from `/map-config`. If configuration is unavailable, it starts with the documented Tehran defaults and shows a non-blocking toast. The component also imports MapLibre's local CSS and removes the map instance/aborts config fetch on unmount. Its `styleUrl` prop is reactive: changing it to `/map/style/dark` or `/map/style/light` calls `map.setStyle(url, { diff: true })` on the existing map, preserving the current camera transform and DOM-backed markers; `setStyle(url)` is also exposed for imperative callers.

A map view can compose it directly:

```vue
<template>
  <MapCanvas class="map-panel" aria-label="نقشهٔ تعاملی تهران" />
</template>

<script setup lang="ts">
import MapCanvas from "@/components/map/MapCanvas.vue";
</script>
```

The light and dark Martin styles share sources, sprite and glyph endpoints, and every layer's non-paint structure; `map-server/scripts/verify-styles.py` checks that parity and validates all referenced SVG sprites. Both styles set a 150ms global paint transition with zero delay. T1.5.2 is implemented by the reactive `styleUrl` prop and exposed `setStyle(url)` method: both use `map.setStyle(url, { diff: true })` so only style changes are applied to the existing map. This keeps camera and marker state intact and avoids reloading the shared source/sprite/glyph configuration. The paint-transition budget is below 200ms, but live end-to-end rendering time cannot be measured until approved map data is available. MapLibre GL JS 6.15.0 includes its right-to-left text shaping support, so the client does not need an external runtime RTL plugin.

### 9.1 Map Server outage cache and recovery

The client registers `packages/client/public/map-cache-worker.js` when the browser supports Service Workers (secure origins: HTTPS or localhost). It applies a network-first strategy to same-origin map styles, vector tiles, sprites, and glyph ranges, storing successful responses in a dedicated Cache Storage bucket capped at 512 resources. Network errors and HTTP 5xx responses use a matching cached resource when available; API, map configuration, routing, and geocoding requests are deliberately excluded. A cache fallback posts a message to `MapCanvas.vue`, which displays a deduplicated accessible toast. MapLibre's in-memory tile cache is also configured for eight zoom levels to keep previously loaded coverage available for the current page session. A retry action reloads the current style on the same map instance.

The service worker does not make a first-time visit offline-capable: resources must have loaded successfully once while online. Browsers on plain-HTTP LAN origins cannot use Service Workers, so those deployments retain only MapLibre's in-memory fallback unless served over HTTPS. `packages/client/src/services/map-cache-worker.test.ts` exercises network caching, offline/5xx fallback, cache misses, and request scoping. A real Map Server outage test still requires the unavailable local map runtime/data.

Navigation pitch (see ARCHITECTURE.md §9.3):

```ts
map.easeTo({ pitch: profile==="car"?60: profile==="bicycle"?45:0, bearing: followBearing, zoom: profile==="car"?17:16, duration: 1000 });
```

---

## 10. Update Mechanism

**Manual:**

```bash
bun run map:update --region=iran   # downloads PBF, generates, rebuilds graphs, stamps version
```

**Semi-auto (cron weekly):**

```bash
0 3 * * 1 /app/map-server/scripts/check-update.sh  # fetch HEAD Last-Modified, compare MAP_DATA_VERSION, build to /data/staging, notify admin
```

**Promotion:**

- Admin hits `POST /_admin/map/promote { version: "2025-05-08" }`
- Server swaps symlink `/data/current → /data/v2025-05-08` and reloads Martin (`SIGHUP`) — zero downtime.
- Fallback via header `X-Map-Data-Version` for client cache bust.

Distribution:

- Docker: volume `map-data:/data`
- Windows dev: `data/maps/` folder + local Martin/Valhalla binaries (exe)

---

## 11. Verification & Troubleshooting

- **Tiles not loading:** Check Martin logs, curl tile, verify bbox/MAP_MIN_ZOOM, CORS on style.
- **Routing 500:** OSRM graph version mismatch — rebuild after PBF update; check Lua profile path.
- **Geocode empty offline:** Photon index not loaded; ensure `languages` includes needed, bbox filter not too strict.
- **Dark theme labels invisible:** Glyph `halo-color` contrast — dark needs light halo.
- **LAN test:** `iptables -A OUTPUT -d 8.8.8.8 -j DROP` or unplug WAN — map must still render, route, geocode.

---

## 12. Security

- Map Server has no auth for tiles/styles (safe) — but `geocode`/`route` should respect same CORS allowlist as API.
- If Map Server exposed publicly, add Nginx basic auth or token passthrough.

