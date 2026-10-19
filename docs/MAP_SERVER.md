# Borobiya — Map Server (Offline Vector)

> TL;DR: the offline target self-hosts **Martin 1.16.1**, **OSRM 26.10.0**, and **Photon 1.3.0**. The approved source is Geofabrik's date-pinned Iran OSM snapshot (ODbL 1.0). `prepare-tehran-pbf.sh` verifies it and clips one `MAP_BBOX` PBF for Planetiler, all OSRM profiles, and Nominatim→Photon. Generator/import/proxy smoke tests are scripted; live tile, route, and geocode acceptance remains open until the local Docker/Java 21 run succeeds. For the 4-vCPU/6-GiB Ubuntu 24.04 VM, follow [`UBUNTU_VM_RUNBOOK.md`](./UBUNTU_VM_RUNBOOK.md).

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
- `https://borobiya.local/geocode` and `/reverse` → offline Photon proxy on the routing gateway
- `https://borobiya.local/map-config` → public region/bounds/version/zoom settings; the gateway serves these at `/config`

---

## 2. Architecture

```
Geofabrik Iran snapshot (ODbL 1.0)
              │ download + verify official MD5
              ▼
       Osmium smart crop (MAP_BBOX)
              │ map-server/data/tehran.osm.pbf (single shared input)
     ┌────────┼──────────────────┐
     │        │                  │
     ▼        ▼                  ▼
Planetiler  OSRM extract       Nominatim import
     │      car/bicycle/foot       │
     ▼        │                    ▼
 tehran.pmtiles │           Nominatim PostgreSQL
     │        ▼                    │ Photon import
     ▼    OSRM MLD services         ▼
Martin       │                 Photon 1.3.0
     │        │                    │
     └────────┴──── gateway ───────┘
         /tehran/{z}/{x}/{y}
         POST /route
         GET /geocode and /reverse
```

Only the initial data download/import needs external access. Serving tiles, routes, and geocoding uses local services and the generated local data.

---

## 3. Tool Choices and Pinned Versions

The following latest stable (non-prerelease) releases were selected from the projects’ official release pages on **2026-10-19**. Container images use release-version tags (never `latest`); JARs use their versioned release artifacts and recorded SHA-256 checksums.

| Capability | Selected release | Pinned artifact | Rationale / source |
|------------|------------------|-----------------|--------------------|
| Tile serving | **Martin 1.16.1** | `ghcr.io/maplibre/martin:1.16.1` | Official Martin image; serves PMTiles, MBTiles, and PostGIS sources. [Release](https://github.com/maplibre/martin/releases/tag/martin-v1.16.1). |
| Region crop | **Osmium Tool 1.16.0** | `osmium extract --strategy=smart --bbox=... --set-bounds` | Produces a reference-complete crop for the configured WGS84 box; the manifest records the installed Osmium version. `smart` preserves intersecting multipolygon relations for Nominatim address/country context. Pinned to Ubuntu 24.04's `osmium-tool` package so the target VM needs no override; `prepare-tehran-pbf.sh` fails closed on any other installed version until `MAP_OSMIUM_VERSION` is deliberately changed. [Manual](https://docs.osmcode.org/osmium/latest/osmium-extract.html). |
| Tile generation | **Planetiler 0.10.2** | [`planetiler.jar`](https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar); SHA-256 `f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d` | Produces PMTiles from the shared cropped PBF; Java 21+ is required for the JAR. [Release](https://github.com/onthegomap/planetiler/releases/tag/v0.10.2). |
| Routing | **OSRM 26.10.0** | `ghcr.io/project-osrm/osrm-backend:v26.10.0` | Official GHCR image; the release includes car, bicycle, and foot Lua profiles. [Release](https://github.com/Project-OSRM/osrm-backend/releases/tag/v26.10.0). |
| Nominatim import | **Nominatim 5.3** | `mediagis/nominatim:5.3-2026-06-23T09-03` | Imports the *same cropped PBF* through local `PBF_PATH` into a local PostGIS database. No replication feed or online lookup is configured. [Project](https://github.com/mediagis/nominatim-docker). |
| Geocoding | **Photon 1.3.0** | [`photon-1.3.0.jar`](https://github.com/komoot/photon/releases/download/1.3.0/photon-1.3.0.jar); SHA-256 `a89707c0045e4807b2a1180e132e68e108d998709f48b6c94b98a6e281f571a5` | Java 21+; embedded OpenSearch is the default, and external OpenSearch requires 3.x. Photon imports from the Nominatim DB created from the shared crop; raw OSM PBF is **not** a Photon import format. [Release](https://github.com/komoot/photon/releases/tag/1.3.0). |
| Styles, sprites, glyphs | **Martin 1.16.1** | `/style/{id}`, `/sprite/{id}.*`, `/font/{stack}/{range}` | Martin serves style JSON and generates sprite sheets and glyph PBF ranges from local SVG/TTF assets on demand; no external runtime requests. [Style docs](https://maplibre.org/martin/using/sources-styles/). |

The versions are pinned for this pipeline. Upgrade them deliberately: review release notes, refresh artifact checksums, and rerun tile-serving, routing-profile, and geocoding checks. Photon 1.3.0 accepts a Nominatim database or a Photon JSON dump—not a raw PBF—so the committed import path runs the exact cropped PBF through the pinned Nominatim container first.

---

## 4. Data Pipeline

### 4.1 Approved canonical source

The project-approved input is Geofabrik's **Iran snapshot dated 2026-10-18**. The immutable archive was listed at 229,852,435 bytes; do not substitute the moving `iran-latest` URL without recording a new snapshot and checksum.

| Item | Value |
|------|-------|
| Provider / data license | Geofabrik GmbH / OpenStreetMap data, ODbL 1.0 |
| Data timestamp | `2026-10-18T20:25:06Z` |
| Exact PBF URL | [`https://download.geofabrik.de/asia/iran-261018.osm.pbf`](https://download.geofabrik.de/asia/iran-261018.osm.pbf) |
| Official Geofabrik MD5 | `a23eb2f21e426677bd243b2712ec1bc8` (sidecar: `https://download.geofabrik.de/asia/iran-261018.osm.pbf.md5`) |
| Source PBF SHA-256 | Computed by `prepare-tehran-pbf.sh` on first download and stored in the ignored `map-server/data/tehran.source.json`; record the value here after the user's local download. The PBF is not present in this checkout. |
| Attribution | `© OpenStreetMap contributors` → [ODbL/copyright information](https://www.openstreetmap.org/copyright) |

The data file is Git-ignored and must not be committed. Keep the source URL, data date, MD5, and computed SHA-256 with any externally distributed derived data. Both MapLibre styles and the app footer expose the linked attribution.

### 4.2 One verified crop for all pipelines

Set the project environment and prepare the data once. `MAP_BBOX` is west,south,east,north in WGS84; Osmium's `smart` strategy creates one reference-aware crop and preserves intersecting multipolygon relations needed by Nominatim. This exact `tehran.osm.pbf` is the only allowed input to Planetiler, OSRM, and Nominatim (the Photon import reads the resulting Nominatim database).

```bash
# From the repository root. For local use, copy .env.example to .env first.
set -a; source .env; set +a

# Downloads the date-pinned source, verifies its official MD5, crops MAP_BBOX,
# records source/crop SHA-256 values, and writes the provenance manifest.
./map-server/scripts/prepare-tehran-pbf.sh
./map-server/scripts/verify-map-pbf.sh "$MAP_PBF"

# Planetiler 0.10.2: creates tehran.pmtiles + checksum/settings metadata.
./map-server/scripts/generate-tiles.sh

# OSRM 26.10.0: creates all three MLD graphs + source hash metadata.
./map-server/scripts/build-routing.sh

# The same cropped PBF is mounted as Nominatim's local PBF_PATH for the Photon import; see §7.
```

Prerequisites for preparation are `curl`, Osmium Tool, Python 3, and SHA-256/MD5 utilities. The manifest records the exact installed Osmium version. Install with `sudo apt-get install osmium-tool` on Debian/Ubuntu or `brew install osmium-tool` on macOS. The script and `.env.example` both pin `MAP_OSMIUM_VERSION=1.16.0`, the Ubuntu 24.04 archive version on the target VM. If `osmium --version` reports a different release, set `MAP_OSMIUM_VERSION` to that reviewed installed version in `.env` and reload it (`set -a; source .env; set +a`) before running the script; the exact checked version is recorded in provenance. If downloads need a host proxy, see the Proxy section in [`UBUNTU_VM_RUNBOOK.md`](./UBUNTU_VM_RUNBOOK.md). Planetiler uses a conservative 3 GiB Java heap by default (`PLANETILER_HEAP=3g`) for 6 GiB machines; it additionally needs Java 21+. The routing build needs Docker and defaults to two OSRM build threads. To deliberately regenerate an existing crop after changing `MAP_BBOX`, set `MAP_CROP_OVERWRITE=1` after reviewing the data directory. `verify-map-pbf.sh` checks the crop hash, region, bbox, ODbL record, and strategy before tile/routing generation. The PMTiles archive, source PBFs, manifests, Photon index, Nominatim database, and OSRM graphs remain ignored local data.

`map-server/scripts/generate-tiles.sh` verifies Planetiler 0.10.2 by SHA-256 and writes `<region>.pmtiles` plus a manifest containing the cropped-PBF hash. `build-routing.sh` uses that same verified crop for each profile and records the input/manifest hashes beside each graph. `verify-tehran-tiles.sh`, `verify-routing.sh`, and `verify-geocoding.sh` are live service smoke tests. No map service or data build has yet been accepted against the user's local Docker/Java runtime; keep T1.4.2, T1.4.4, and T1.4.5 open until those commands pass.

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

`build-routing.sh` defaults to `MAP_PBF=map-server/data/${MAP_REGION}.osm.pbf` and refuses to proceed unless the provenance manifest verifies the same `MAP_REGION`, `MAP_BBOX`, crop hash, and ODbL source record. From the repository root, load the same `.env` used for tile generation and build all three profiles:

```bash
set -a; source .env; set +a
./map-server/scripts/build-routing.sh
```

It runs the pinned `ghcr.io/project-osrm/osrm-backend:v26.10.0` image against that exact cropped PBF, extracts and prepares MLD graphs for car, bicycle, and foot **sequentially** (never concurrently), then publishes them to `map-server/osrm/data/{car,bicycle,foot}/<MAP_REGION>.osrm`. `OSRM_BUILD_THREADS` defaults to 2 and is passed to extract/partition/customize for the 6 GiB VM. Each profile directory also records the cropped-PBF SHA-256, source-manifest SHA-256, and build thread count. The output directory is Git-ignored. To build to a different location, set `MAP_OSRM_DATA_DIR` both for this command and in the Compose `.env`.

After successful graph generation, start the local Compose stack with routing enabled:

```bash
docker compose --profile routing up -d
```

`routing-gateway` runs in the default profile and can answer `/health` without graph data; the three OSRM services are in Compose's `routing` profile. Each `osrm-routed` service starts with one worker thread and `--max-table-size 100`. The table-size flag caps `/table` query locations (the default), not the graph's RAM use; the thread setting limits runtime concurrency. Once the profiles are enabled, the gateway forwards only to the local `osrm-car`, `osrm-bicycle`, or `osrm-foot` service. No public routing service or external network is used.

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

Run the deterministic, network-free gateway tests with Node.js; they exercise all three OSRM profile mappings and Photon geocode/reverse forwarding against local fixtures:

```bash
node --test map-server/routing-gateway/*.test.mjs
```

After the approved graphs and OSRM services are running, the real offline smoke test sends `POST /route` for car, bicycle, and foot:

```bash
./map-server/scripts/verify-routing.sh
```

T1.4.4 remains open until that real service check succeeds using the `MAP_BBOX`-verified crop.

---

## 7. Photon Setup (Nominatim import from the shared crop)

Photon 1.3.0 does **not** accept raw `.osm.pbf` input. The configured reproducible path is: the Nominatim 5.3 container imports `map-server/data/${MAP_REGION}.osm.pbf` through local `PBF_PATH`; Photon then imports that Nominatim PostgreSQL database using the pinned Photon 1.3.0 JAR. No online Photon service, replication feed, or remote search is used at runtime.

### Import once

The following commands assume the shared crop has already been prepared and verified in §4. The Nominatim service is in an opt-in profile and binds its database only to loopback; do not expose port 5433 publicly.

```bash
set -a; source .env; set +a
./map-server/scripts/verify-map-pbf.sh "$MAP_PBF"
./map-server/scripts/download-photon.sh

# Start Nominatim; its PBF_PATH is the same cropped file used by Planetiler and OSRM.
# First startup performs the import. Wait for the health check to report healthy.
docker compose --profile geocoding-import up -d nominatim
docker compose --profile geocoding-import ps nominatim
docker compose --profile geocoding-import logs --tail=100 nominatim
# Re-run `ps` until the service is healthy before starting the Photon import.
```

Once Nominatim reports healthy, import its local database into Photon. The command runs from the host with Java 21+; `photon_data/` is written under the bind-mounted, Git-ignored directory so the Photon container can serve that exact index.

```bash
cd map-server/photon/data
java -Xms512m -Xmx2g -jar ../photon-1.3.0.jar import \
  -host 127.0.0.1 -port "$NOMINATIM_DB_PORT" \
  -database nominatim -user nominatim -password "$NOMINATIM_PASSWORD" \
  -languages fa,en
cd ../../..

# The image copies the same checksum-verified Photon JAR and serves the local index.
docker compose --profile geocoding up -d --build photon
# Optional: free Nominatim's RAM after Photon has imported its index.
docker compose --profile geocoding-import stop nominatim
```

Nominatim's host ports default to `8081` (HTTP health/diagnostics) and `5433` (PostgreSQL); Photon listens on `2322`. For a 6 GiB VM, `.env.example` uses two Nominatim import threads, 1 GiB shared memory, conservative PostgreSQL memory settings, a 2 GiB Photon import heap, and a 1.5 GiB Photon runtime heap. Nominatim must remain running while Photon imports its database; stop it afterward to free RAM. The Photon runtime serves its local index without Nominatim running. The app gateway forwards `/geocode` to Photon `/api` and `/reverse` to Photon `/reverse`, validating query inputs and returning Photon GeoJSON. Start the runtime routing/geocoding stack with:

```bash
docker compose --profile routing --profile geocoding up -d
./map-server/scripts/verify-geocoding.sh
# The same endpoints are available through the Nginx gateway:
MAP_GEOCODE_URL=http://localhost:8080/geocode MAP_REVERSE_URL=http://localhost:8080/reverse \
  ./map-server/scripts/verify-geocoding.sh
```

The smoke test checks non-empty forward search for `Azadi Square` and reverse lookup near central Tehran. It also verifies GeoJSON shape, not just HTTP 200. The gateway returns 503 if the optional Photon service is not running. The Nominatim database and Photon index are local ignored data; a clean import may take time and needs adequate free disk and memory. If changing the source PBF or `MAP_BBOX`, do not reuse an old Nominatim or Photon index—rebuild both from the newly verified crop.

The shared query contract defaults forward geocoding to five results (maximum 20). Bounding boxes use `west,south,east,north`; reverse coordinates are validated against WGS84 ranges. T1.4.5 remains open until the live `/geocode` and `/reverse` checks succeed offline.

---

## 8. ENV Configuration

```env
MAP_REGION=tehran
MAP_BBOX=51.0,35.5,51.7,35.9  # west,south,east,north in WGS84; shared by crop and map config
MAP_DATA_VERSION=2026-10-18
MAP_MIN_ZOOM=0
MAP_MAX_ZOOM=14              # Planetiler 0.10.2 supports up to 16
MAP_SOURCE_URL=https://download.geofabrik.de/asia/iran-261018.osm.pbf
MAP_SOURCE_DATE=2026-10-18
MAP_SOURCE_DATA_TIMESTAMP=2026-10-18T20:25:06Z
MAP_SOURCE_MD5=a23eb2f21e426677bd243b2712ec1bc8
MAP_SOURCE_BYTES=229852435
MAP_OSMIUM_VERSION=1.16.0  # must match `osmium --version`; Ubuntu 24.04 apt version
MAP_SOURCE_PBF=./map-server/data/source/iran-261018.osm.pbf
MAP_PBF=./map-server/data/tehran.osm.pbf
PLANETILER_HEAP=3g
OSRM_BUILD_THREADS=2
OSRM_RUNTIME_THREADS=1
MAP_SERVER_URL=http://localhost:8000
MAP_STYLE_LIGHT=http://localhost:8000/style/light
MAP_STYLE_DARK=http://localhost:8000/style/dark
MAP_ROUTING_URL=http://localhost:8001/route
MAP_ROUTING_PORT=8001
MAP_OSRM_DATA_DIR=./map-server/osrm/data
MAP_GEOCODE_URL=http://localhost:8001/geocode
MAP_REVERSE_URL=http://localhost:8001/reverse
NOMINATIM_HTTP_PORT=8081
NOMINATIM_DB_PORT=5433
NOMINATIM_PASSWORD=replace-with-a-random-password
NOMINATIM_THREADS=2
NOMINATIM_SHM_SIZE=1g
NOMINATIM_POSTGRES_SHARED_BUFFERS=512MB
NOMINATIM_POSTGRES_MAINTENANCE_WORK_MEM=1GB
NOMINATIM_POSTGRES_AUTOVACUUM_WORK_MEM=128MB
NOMINATIM_POSTGRES_WORK_MEM=32MB
NOMINATIM_POSTGRES_EFFECTIVE_CACHE_SIZE=3GB
PHOTON_PORT=2322
PHOTON_JAVA_TOOL_OPTIONS="-Xms256m -Xmx1536m"
```

**Geographic coverage:** Defaults target Tehran. `prepare-tehran-pbf.sh` creates the shared crop from the approved Iran snapshot using `MAP_BBOX`; Planetiler, each OSRM profile, and Nominatim use that same PBF. Generated tile/route manifests store its SHA-256, while `MAP_DATA_VERSION` records the source snapshot. For another region, provide a matching approved source and update the Compose environment/volumes. The committed MapLibre styles still name the Tehran source, so changing `MAP_REGION` alone is not a complete region switch.

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

## 10. Data Refresh and Promotion (Not Yet Implemented)

The current build is intentionally date-pinned. Do not replace the source with `iran-latest` or schedule an unattended update without updating the source date, exact URL, official MD5, ODbL provenance, and expected region coverage. A reviewed snapshot refresh must update the source defaults/docs, run the shared-crop pipeline again, regenerate all three datasets, and pass all live smoke checks before replacing deployed artifacts.

Automated Geofabrik replication, `bun run map:update`, update cron jobs, versioned staging promotion, cache-busting headers, and zero-downtime activation are **not implemented**. Treat any previous examples for those operations as future design only; there is no supported promotion API or update command in this checkout.

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

