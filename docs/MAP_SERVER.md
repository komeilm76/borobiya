# Borobiya — Map Server (Offline Vector)

> TL;DR: the offline target self-hosts **Martin 1.16.1**, **OSRM 26.10.0**, and **Photon 1.3.0**. Map areas are selectable (whole countries and/or cities) from `map-server/regions.json`; the repository-pinned default snapshot is 2026-10-18 (every source has an official MD5, ODbL 1.0), and setup can instead resolve the latest common dated snapshot or a specific date. The default selection is Tehran (`ir-tehran`). All map content is stored in the standardized external map library described in [`MAP_LIBRARY.md`](./MAP_LIBRARY.md). `prepare-regions-pbf.sh` downloads/verifies the needed extracts, crops each city, and merges them into one shared dataset PBF for Planetiler, all OSRM profiles, and Nominatim→Photon. Live acceptance passed on the target Ubuntu VM on 2026-10-20 (real MVT tile, car/bicycle/foot routes, and forward/reverse geocoding for the Tehran dataset); see `docs/PROGRESS.md`. For the 4-vCPU/6-GiB Ubuntu 24.04 VM, follow [`UBUNTU_VM_RUNBOOK.md`](./UBUNTU_VM_RUNBOOK.md).

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
Geofabrik snapshots per selected area (ODbL 1.0, regions.json)
              │ download + verify official MD5s
              ▼
       Osmium smart crops + merge
              │ <map-library>/datasets/<date>/<fingerprint>/borobiya.osm.pbf
     ┌────────┼──────────────────┐
     │        │                  │
     ▼        ▼                  ▼
Planetiler  OSRM extract       Nominatim import
     │      car/bicycle/foot       │
     ▼        │                    ▼
borobiya.pmtiles │           Nominatim PostgreSQL
     │        ▼                    │ Photon import
     ▼    OSRM MLD services         ▼
Martin       │                 Photon 1.3.0
     │        │                    │
     └────────┴──── gateway ───────┘
         /borobiya/{z}/{x}/{y}
         POST /route
         GET /geocode and /reverse
```

Only the initial data download/import needs external access. Serving tiles, routes, and geocoding uses local services and the generated local data.

---

## 3. Tool Choices and Pinned Versions

The following latest stable (non-prerelease) releases were selected from the projects’ official release pages on **2026-10-19**. Container images use release-version tags (never `latest`); JARs use their versioned release artifacts and recorded SHA-256 checksums.

| Capability | Selected release | Pinned artifact | Rationale / source |
|------------|------------------|-----------------|--------------------|
| Tile serving | **Martin 1.16.1** | `ghcr.io/maplibre/martin:1.16.1` | Official Martin image; supports PMTiles, MBTiles, and PostGIS, while this project configures file-backed PMTiles only. [Release](https://github.com/maplibre/martin/releases/tag/martin-v1.16.1). |
| Region crop | **Osmium Tool 1.16.0** | `osmium extract --strategy=smart --bbox=... --set-bounds` | Produces a reference-complete crop for the configured WGS84 box; the manifest records the installed Osmium version. `smart` preserves intersecting multipolygon relations for Nominatim address/country context. Pinned to Ubuntu 24.04's `osmium-tool` package so the target VM needs no override; `prepare-regions-pbf.sh` fails closed on any other installed version until `MAP_OSMIUM_VERSION` is deliberately changed. [Manual](https://docs.osmcode.org/osmium/latest/osmium-extract.html). |
| Tile generation | **Planetiler 0.10.2** | [`planetiler.jar`](https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar); SHA-256 `f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d` | Produces PMTiles from the shared cropped PBF; Java 21+ is required for the JAR. [Release](https://github.com/onthegomap/planetiler/releases/tag/v0.10.2). |
| Routing | **OSRM 26.10.0** | `ghcr.io/project-osrm/osrm-backend:v26.10.0-debian` | Official GHCR image; upstream publishes only suffixed version tags (`-debian` is the multi-arch manifest—there is no bare `v26.10.0` tag). The release includes car, bicycle, and foot Lua profiles. [Release](https://github.com/Project-OSRM/osrm-backend/releases/tag/v26.10.0). |
| Nominatim import | **Nominatim 5.3** | `mediagis/nominatim:5.3-2026-06-23T09-03` | Imports the *same cropped PBF* through local `PBF_PATH` into a local PostGIS database. No replication feed or online lookup is configured. [Project](https://github.com/mediagis/nominatim-docker). |
| Geocoding | **Photon 1.3.0** | [`photon-1.3.0.jar`](https://github.com/komoot/photon/releases/download/1.3.0/photon-1.3.0.jar); SHA-256 `a89707c0045e4807b2a1180e132e68e108d998709f48b6c94b98a6e281f571a5` | Java 21+; embedded OpenSearch is the default, and external OpenSearch requires 3.x. Photon imports from the Nominatim DB created from the shared crop; raw OSM PBF is **not** a Photon import format. [Release](https://github.com/komoot/photon/releases/tag/1.3.0). |
| Styles, sprites, glyphs | **Martin 1.16.1** | `/style/{id}`, `/sprite/{id}.*`, `/font/{stack}/{range}` | Martin serves style JSON and generates sprite sheets and glyph PBF ranges from local SVG/TTF assets on demand; no external runtime requests. [Style docs](https://maplibre.org/martin/using/sources-styles/). |

The versions are pinned for this pipeline. Upgrade them deliberately: review release notes, refresh artifact checksums, and rerun tile-serving, routing-profile, and geocoding checks. Photon 1.3.0 accepts a Nominatim database or a Photon JSON dump—not a raw PBF—so the committed import path runs the exact cropped PBF through the pinned Nominatim container first.

---

## 4. Data Pipeline

### 4.1 Approved canonical sources (region catalog)

All approved inputs live in **`map-server/regions.json`**: selectable whole-country and city areas for Iran, Turkey, Afghanistan, Armenia, Azerbaijan, Iraq, Pakistan, Turkmenistan, Saudi Arabia, Oman, Bahrain, Kuwait, Qatar, the United Arab Emirates, Germany, France, the United Kingdom, and the Netherlands, mapped to Geofabrik extracts. The committed default is the immutable **2026-10-18 snapshot** — dated `*-261018.osm.pbf` URLs. Sources with committed checksums use their catalog MD5; the twelve added country sources resolve their official pinned-date `.md5` sidecars on first online use and cache verified metadata in the external map library. Setup can instead resolve the latest common dated snapshot or a specific date; these are also verified against official sidecars and stored by concrete date in the library. Never hand-substitute a moving `*-latest` URL. `python3 map-server/scripts/regions.py list` prints the catalog; `validate-catalog` checks its integrity (it runs in the setup script's preflight and in `test_regions.py`).

Default area example (Tehran, `ir-tehran`):

| Item | Value |
|------|-------|
| Provider / data license | Geofabrik GmbH / OpenStreetMap data, ODbL 1.0 |
| Iran source data timestamp (catalogued example) | `2026-10-18T20:25:06Z` |
| Exact PBF URL | [`https://download.geofabrik.de/asia/iran-261018.osm.pbf`](https://download.geofabrik.de/asia/iran-261018.osm.pbf) (229,852,435 bytes) |
| Official Geofabrik MD5 | `a23eb2f21e426677bd243b2712ec1bc8` (sidecar: `https://download.geofabrik.de/asia/iran-261018.osm.pbf.md5`) |
| Source PBF SHA-256 | Computed on first download and stored per source in its external-library `source.json` plus the active dataset's version-3 manifest. PBFs are not present in this checkout. |
| Attribution | `© OpenStreetMap contributors` → [ODbL/copyright information](https://www.openstreetmap.org/copyright) |

Selection rules (enforced by `regions.py resolve`): IDs are `<country>` or `<country>-<city>`; a whole country supersedes its cities; bounding boxes may overlap, including adjacent whole countries, because all extracts in one build use the same selected snapshot date and `osmium merge` emits an object found in multiple inputs only once. To add an area, extend `regions.json` with a pinned source URL and either its reviewed catalog MD5 or an explicit official-sidecar checksum policy (if new), plus city bbox/center/verify points; then run `validate-catalog` and the unit tests.

Data files live outside the checkout in the map library by default and must not be committed. Keep the source URLs, data date, MD5s, and computed SHA-256 values (the manifest records them) with any externally distributed derived data. Both MapLibre styles and the app footer expose the linked attribution.

### 4.2 One verified merged dataset for all pipelines

Set the project environment and prepare the data once. `MAP_REGION_IDS` selects the areas; `MAP_SNAPSHOT` selects `pinned`, `latest`, or a specific date and `MAP_SOURCE_POLICY` selects `cache-first`, `refresh`, or `offline`; `MAP_LIBRARY_DIR` is the external standardized store; `MAP_BBOX` is the area-union bounds in WGS84 west,south,east,north form; `MAP_REGION` is the fixed dataset slug (`borobiya`) that names the merged PBF, the PMTiles/Martin source, and the OSRM graphs. Osmium's `smart` strategy creates reference-aware city crops and preserves intersecting multipolygon relations needed by Nominatim; `osmium merge` combines the crops (whole-country areas merge straight from their extract) into the single `borobiya.osm.pbf` that is the only allowed input to Planetiler, OSRM, and Nominatim (the Photon import reads the resulting Nominatim database). `scripts/setup-ubuntu-vm.sh` keeps the selection, snapshot, bbox, and absolute library paths in sync; the manual equivalent is:

```bash
# From the repository root. For local use, copy .env.example to .env first.
set -a; source .env; set +a
if [[ -z "${MAP_LIBRARY_DIR:-}" ]]; then
  if [[ -n "${XDG_DATA_HOME:-}" ]]; then
    [[ "$XDG_DATA_HOME" == /* ]] || { echo 'XDG_DATA_HOME must be absolute; set MAP_LIBRARY_DIR explicitly.' >&2; exit 1; }
    MAP_LIBRARY_DIR="$XDG_DATA_HOME/borobiya/map-library"
  elif [[ -n "${HOME:-}" && "$HOME" == /* ]]; then
    MAP_LIBRARY_DIR="$HOME/.local/share/borobiya/map-library"
  else
    echo 'Set MAP_LIBRARY_DIR to an external absolute path (or set absolute HOME/XDG_DATA_HOME).' >&2
    exit 1
  fi
fi
[[ "$MAP_LIBRARY_DIR" == /* ]] || { echo 'MAP_LIBRARY_DIR must be absolute.' >&2; exit 1; }
export MAP_LIBRARY_DIR
eval "$(python3 map-server/scripts/regions.py resolve "$MAP_REGION_IDS" \
  --snapshot "${MAP_SNAPSHOT_DATE:-pinned}" \
  --source-policy "${MAP_SOURCE_POLICY:-cache-first}" \
  --library "$MAP_LIBRARY_DIR")"
export MAP_DATA_VERSION="$SNAPSHOT_DATE"

# Downloads/caches the selected snapshot sources, verifies official MD5s,
# crops + merges the selected areas, and writes the version-3 manifest.
./map-server/scripts/prepare-regions-pbf.sh
./map-server/scripts/verify-map-pbf.sh "$MAP_PBF"

# Planetiler 0.10.2: creates borobiya.pmtiles + checksum/settings metadata.
./map-server/scripts/generate-tiles.sh

# OSRM 26.10.0: creates all three MLD graphs + source hash metadata.
./map-server/scripts/build-routing.sh

# The same merged PBF is mounted as Nominatim's local PBF_PATH for the Photon import; see §7.
```

Prerequisites for preparation are `curl`, Osmium Tool, Python 3, and SHA-256/MD5 utilities. The manifest records the exact installed Osmium version. Install with `sudo apt-get install osmium-tool` on Debian/Ubuntu or `brew install osmium-tool` on macOS. The script and `.env.example` both pin `MAP_OSMIUM_VERSION=1.16.0`, the Ubuntu 24.04 archive version on the target VM. If `osmium --version` reports a different release, set `MAP_OSMIUM_VERSION` to that reviewed installed version in `.env` and reload it (`set -a; source .env; set +a`) before running the script; the exact checked version is recorded in provenance. If downloads need a host proxy, see the Proxy section in [`UBUNTU_VM_RUNBOOK.md`](./UBUNTU_VM_RUNBOOK.md). Planetiler uses a conservative 3 GiB Java heap by default (`PLANETILER_HEAP=3g`) for 6 GiB machines; it additionally needs Java 21+. The routing build needs Docker and defaults to two OSRM build threads. Re-running preparation with the same selection is a verified no-op; changing `MAP_REGION_IDS`/`MAP_BBOX` re-merges from cached downloads/crops (`MAP_CROP_OVERWRITE=1` is only for replacing a manifest-less leftover dataset file). `verify-map-pbf.sh` checks the merged hash, selected areas, union bbox, per-source pins, and ODbL record before tile/routing generation. The PMTiles archive, source PBFs, manifests, Photon index, Nominatim database, and OSRM graphs remain ignored local data.

`map-server/scripts/generate-tiles.sh` verifies Planetiler 0.10.2 by SHA-256 and writes `borobiya.pmtiles` plus metadata containing the dataset-PBF hash and area list. `build-routing.sh` uses that same verified dataset for each profile and records the input/manifest hashes beside each graph. `verify-tiles.sh`, `verify-routing.sh`, and `verify-geocoding.sh` are live per-area smoke tests driven by the catalog's test points. Live acceptance passed on the target Ubuntu VM on 2026-10-20 (real MVT tile, car/bicycle/foot routes, and forward/reverse geocoding for the Tehran dataset); see `docs/PROGRESS.md`.

### 4.3 Styles, sprites, and glyphs

The committed styles are MapLibre Style Spec v8 documents with the same vector source, layer IDs/order, filters, and layout. The theme-specific differences are in layer paint values:

- `map-server/styles/light.json`
- `map-server/styles/dark.json`

Martin serves these as `/style/light` and `/style/dark`. Through the Compose Nginx gateway, use `/map/style/light` and `/map/style/dark`.

The style resources use root-relative URLs, not hard-coded hosts. This works both when a browser loads the style through `/map/style/light` and when it loads the style directly from Martin. The Vite dev proxy and Nginx gateway forward `/borobiya/`, `/sprite/`, and `/font/` to Martin on the same origin:

```json
{
  "sources": {
    "borobiya": {
      "type": "vector",
      "tiles": ["/borobiya/{z}/{x}/{y}"],
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
# No postgres block: Martin serves files only (see below).
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

The actual file is `map-server/martin.yaml`. Compose mounts the active library dataset directory (`MAP_DATASET_DIR`) at `/data`, where Martin discovers PMTiles sources; the dataset archive is always named `borobiya.pmtiles`, so its source ID is `borobiya` and its MVT route is `/borobiya/{z}/{x}/{y}` (an optional `.pbf` suffix redirects) regardless of which areas the dataset contains — the committed styles therefore never change when the selection does. `styles.paths` publishes JSON files by filename, so they are available at `/style/light` and `/style/dark`. The configured SVG folder and TTF fonts back the `/sprite/` and `/font/` APIs. Martin is deliberately **not connected to PostgreSQL**: it publishes no database tile sources, so the connection contributed only failure modes (Martin exited whenever application-database credentials drifted) and risk—Martin's default auto-publish would otherwise expose spatial application tables, including private `users.last_location` data, as public tile sources. If a reviewed public Postgres tile source is ever needed, add it explicitly with `auto_publish: false` and named tables/functions only.

Start Martin (no database dependency):

```bash
docker compose up -d map-server
```

Verify the style and dynamically served assets (these can be checked before tile generation):

```bash
curl http://localhost:8000/style/light | jq .sources
curl http://localhost:8000/sprite/borobiya.json | jq
curl 'http://localhost:8000/font/Borobiya%20Sans/0-255' -o /tmp/glyphs.pbf
# Through the Nginx /map/ prefix:
curl http://localhost:8080/map/style/dark | jq .name
```

After `borobiya.pmtiles` has been generated, verify a real MVT response (defaults to the first selected area; pass an area ID to check another):

```bash
./map-server/scripts/verify-tiles.sh
MARTIN_URL=http://localhost:8080/map ./map-server/scripts/verify-tiles.sh de-Frankfurt
```

Styles and assets are statically validated in this checkout; the generated archive itself is a local build artifact (see the live-acceptance note in §4.2).

---

## 6. OSRM Routing Setup

OSRM chooses a transport profile while building the graph with `osrm-extract`; a single prepared graph cannot switch between car, bicycle, and foot at request time. The Compose setup therefore uses three isolated graph directories and three OSRM services. The official OSRM 26.10.0 image includes `/opt/car.lua`, `/opt/bicycle.lua`, and `/opt/foot.lua`. OSRM's HTTP profile name for its bundled bicycle rules is `bike`, so the gateway maps the public `bicycle` value to `/route/v1/bike`.

### Build graphs

`build-routing.sh` defaults to the active library dataset PBF (`MAP_PBF=$MAP_DATASET_DIR/${MAP_REGION}.osm.pbf`) and refuses to proceed unless the provenance manifest verifies the selected areas (`MAP_REGION_IDS`), snapshot, union `MAP_BBOX`, merged-PBF hash, source pins/sidecar checksums, and ODbL record. From the repository root, load the same `.env` used for tile generation and build all three profiles:

```bash
set -a; source .env; set +a
./map-server/scripts/build-routing.sh
```

It runs the pinned `ghcr.io/project-osrm/osrm-backend:v26.10.0-debian` image against that exact merged dataset PBF, extracts and prepares MLD graphs for car, bicycle, and foot **sequentially** (never concurrently), then publishes them to `$MAP_DATASET_DIR/routing/{car,bicycle,foot}/<MAP_REGION>.osrm`. `OSRM_BUILD_THREADS` defaults to 2 and is passed to extract/partition/customize for the 6 GiB VM. Each profile directory also records the dataset-PBF SHA-256, source-manifest SHA-256, area list, and build thread count. The output is part of the external active dataset bundle. To use an audited nonstandard location, set `MAP_OSRM_DATA_DIR` both for this command and in the Compose `.env`; setup normally writes the standardized library path for you.

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

That live check passed on the target VM on 2026-10-20 for all three profiles (see `docs/PROGRESS.md`).

---

## 7. Photon Setup (Nominatim import from the shared dataset)

Photon 1.3.0 does **not** accept raw `.osm.pbf` input. The configured reproducible path is: the Nominatim 5.3 container imports `$MAP_DATASET_DIR/${MAP_REGION}.osm.pbf` through local `PBF_PATH`; Photon then imports that Nominatim PostgreSQL database using the pinned Photon 1.3.0 JAR. No online Photon service, replication feed, or remote search is used at runtime.

### Import once

The following commands assume the shared dataset has already been prepared and verified in §4. The Nominatim service is in an opt-in profile and binds its database only to loopback; do not expose port 5433 publicly.

```bash
set -a; source .env; set +a
./map-server/scripts/verify-map-pbf.sh "$MAP_PBF"
./map-server/scripts/download-photon.sh

# Start Nominatim; its PBF_PATH is the same merged dataset file used by Planetiler and OSRM.
# First startup performs the import. Wait for the health check to report healthy.
docker compose --profile geocoding-import up -d nominatim
docker compose --profile geocoding-import ps nominatim
docker compose --profile geocoding-import logs --tail=100 nominatim
# Re-run `ps` until the service is healthy before starting the Photon import.
```

Once Nominatim reports healthy, import its local database into Photon. The command runs from the host with Java 21+; `photon_data/` is written under the bind-mounted, Git-ignored directory so the Photon container can serve that exact index.

```bash
mkdir -p "$MAP_PHOTON_DATA_DIR"
cd "$MAP_PHOTON_DATA_DIR"
java -Xms512m -Xmx2g -jar "$OLDPWD/map-server/photon/photon-1.3.0.jar" import \
  -host 127.0.0.1 -port "$NOMINATIM_DB_PORT" \
  -database nominatim -user nominatim -password "$NOMINATIM_PASSWORD" \
  -languages fa,en
sha256sum "$MAP_PBF" | awk '{print $1}' > "$MAP_PHOTON_DATA_DIR/.borobiya-pbf.sha256"
cd "$OLDPWD"

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

The smoke test checks a non-empty forward search and reverse lookup using the selected area's catalog test points (Tehran default: `Azadi Square`). It also verifies GeoJSON shape, not just HTTP 200. The gateway returns 503 if the optional Photon service is not running. The Nominatim database and Photon index are local ignored data; a clean import may take time and needs adequate free disk and memory. If the area selection changes, do not reuse an old Nominatim database or Photon index—rebuild both from the newly verified dataset (Photon's import `-languages` and serve `-default-language` follow the selection; `scripts/setup-ubuntu-vm.sh` automates the reset and stamps the index with the dataset checksum).

The shared query contract defaults forward geocoding to five results (maximum 20). Bounding boxes use `west,south,east,north`; reverse coordinates are validated against WGS84 ranges. The live `/geocode` and `/reverse` checks passed offline on the target VM on 2026-10-20 (see `docs/PROGRESS.md`).

---

## 8. ENV Configuration

```env
MAP_LIBRARY_DIR=             # blank: ~/.local/share/borobiya/map-library; setup writes absolute
MAP_DATASET_DIR=             # setup-managed active dataset directory
MAP_DATA_DIR=                # setup-managed alias of MAP_DATASET_DIR
MAP_PHOTON_DATA_DIR=         # setup-managed <dataset>/geocoding
MAP_SNAPSHOT=pinned          # pinned | latest | YYYY-MM-DD
MAP_SNAPSHOT_DATE=2026-10-18 # concrete installed snapshot
MAP_SOURCE_POLICY=cache-first # cache-first | refresh | offline
MAP_REGION_IDS=ir-tehran     # selected areas from map-server/regions.json (comma-separated)
MAP_REGION=borobiya          # fixed dataset slug (archive/graph names, map config)
MAP_BBOX=51.0,35.5,51.7,35.9  # union of selected areas, west,south,east,north WGS84
MAP_DATA_VERSION=2026-10-18  # equals MAP_SNAPSHOT_DATE
MAP_MIN_ZOOM=0
MAP_MAX_ZOOM=14              # Planetiler 0.10.2 supports up to 16
MAP_OSMIUM_VERSION=1.16.0  # must match `osmium --version`; Ubuntu 24.04 apt version
MAP_PBF=                   # setup-managed <dataset>/borobiya.osm.pbf
PHOTON_DEFAULT_LANGUAGE=fa   # follows the first selected area's country
PLANETILER_HEAP=3g
OSRM_BUILD_THREADS=2
OSRM_RUNTIME_THREADS=1
MAP_SERVER_URL=http://localhost:8000
MAP_STYLE_LIGHT=http://localhost:8000/style/light
MAP_STYLE_DARK=http://localhost:8000/style/dark
MAP_ROUTING_URL=http://localhost:8001/route
MAP_ROUTING_PORT=8001
MAP_OSRM_DATA_DIR=         # setup-managed <dataset>/routing
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

**Geographic coverage:** The default selection is Tehran (`ir-tehran`); any catalog areas can be combined (cities and/or whole countries, including adjacent countries whose rectangular bounds overlap). `prepare-regions-pbf.sh` builds the one shared merged dataset for the selection; Planetiler bounds, `/map-config` bounds, OSRM graphs, and the Nominatim→Photon import all derive from it, and generated tile/route metadata store its SHA-256 + area list while `MAP_DATA_VERSION` records the installed snapshot date. Switching areas or snapshot is a data operation, not a code change: resolve the standardized library dataset, rebuild tiles/graphs/geocoding from it, and activate it after acceptance — `scripts/setup-ubuntu-vm.sh` does exactly this, including the Nominatim/Photon reset and pruning replaced releases. Styles, Martin config, and Compose are selection-independent because the dataset slug (`borobiya`) never changes. Note that very distant multi-city selections enlarge the union bbox Planetiler processes (more download/compute for natural-earth/water data), and whole large countries are heavy builds on a 6 GiB VM.

Disk/RAM guide:

| Region | PMTiles | OSRM graph (per profile) | Photon index | RAM to serve |
|--------|---------|--------------------------|--------------|---------------|
| Tehran | ~0.5 GB | ~0.8 GB (rough estimate) | ~1.2 GB | Benchmark pending |
| Iran | ~3–5 GB | ~2 GB (rough estimate) | ~4 GB | Benchmark pending |

The graph estimates are per profile; this Compose design runs three separate OSRM processes and three graphs. Memory figures from the earlier single-profile plan are not valid for that deployment, so benchmark the full set before sizing.

---

## 9. Client Integration (MapLibre)

`packages/client/src/components/map/MapCanvas.vue` is the reusable MapLibre initializer. It loads the same-origin `/map/style/light` style, centers on the configured bounds (the selected areas' union from `/map-config`; the initial fallback bounds are Tehran's), displays style-source attribution plus navigation and metric-scale controls, and applies validated zoom bounds and geographic bounds from `/map-config` — including a one-time recenter when the fallback starting point lies outside the served areas (unless the caller passed an explicit center). If configuration is unavailable, it starts with the documented Tehran fallback bounds and shows a non-blocking toast. The component also imports MapLibre's local CSS and removes the map instance/aborts config fetch on unmount. Its `styleUrl` prop is reactive: changing it to `/map/style/dark` or `/map/style/light` calls `map.setStyle(url, { diff: true })` on the existing map, preserving the current camera transform and DOM-backed markers; `setStyle(url)` is also exposed for imperative callers.

A map view can compose it directly:

```vue
<template>
  <MapCanvas class="map-panel" aria-label="نقشهٔ تعاملی تهران" />
</template>

<script setup lang="ts">
import MapCanvas from "@/components/map/MapCanvas.vue";
</script>
```

The light and dark Martin styles share sources, sprite and glyph endpoints, and every layer's non-paint structure; `map-server/scripts/verify-styles.py` checks that parity and validates all referenced SVG sprites. Both styles set a 150ms global paint transition with zero delay. T1.5.2 is implemented by the reactive `styleUrl` prop and exposed `setStyle(url)` method: both use `map.setStyle(url, { diff: true })` so only style changes are applied to the existing map. This keeps camera and marker state intact and avoids reloading the shared source/sprite/glyph configuration. Tehran map rendering was confirmed on the target VM, but no live end-to-end theme-switch timing was recorded. The 150ms paint transition is not a total style-switch latency SLA; the remaining measurement is tracked as P1-M1 in [`PROGRESS.md`](./PROGRESS.md#phase-1-acceptance-follow-ups). MapLibre GL JS 6.15.0 includes its right-to-left text shaping support, so the client does not need an external runtime RTL plugin.

### 9.1 Map Server outage cache and recovery

The client registers `packages/client/public/map-cache-worker.js` when the browser supports Service Workers (secure origins: HTTPS or localhost). It applies a network-first strategy to same-origin map styles, vector tiles, sprites, and glyph ranges, storing successful responses in a dedicated Cache Storage bucket capped at 512 resources. Network errors and HTTP 5xx responses use a matching cached resource when available; API, map configuration, routing, and geocoding requests are deliberately excluded. A cache fallback posts a message to `MapCanvas.vue`, which displays a deduplicated accessible toast. MapLibre's in-memory tile cache is also configured for eight zoom levels to keep previously loaded coverage available for the current page session. A retry action reloads the current style on the same map instance.

The service worker does not make a first-time visit offline-capable: resources must have loaded successfully once while online. Browsers on plain-HTTP LAN origins cannot use Service Workers, so those deployments retain only MapLibre's in-memory fallback unless served over HTTPS. `packages/client/src/services/map-cache-worker.test.ts` exercises network caching, offline/5xx fallback, cache misses, and request scoping. A real browser outage run is not yet recorded; it must verify worker control, cached rendering, the fallback toast, and recovery together (P1-A1 in [`PROGRESS.md`](./PROGRESS.md#phase-1-acceptance-follow-ups)).

Navigation pitch (see ARCHITECTURE.md §9.3):

```ts
map.easeTo({ pitch: profile==="car"?60: profile==="bicycle"?45:0, bearing: followBearing, zoom: profile==="car"?17:16, duration: 1000 });
```

---

## 10. Data Refresh, Cache Policy, and Activation

The default build remains intentionally date-pinned. Updates are explicit operator actions, never an unattended moving `*-latest` substitution:

- `./scripts/setup-ubuntu-vm.sh --update-map` resolves the newest common dated Geofabrik snapshot for every selected source.
- `--snapshot YYYY-MM-DD` selects one specific dated snapshot.
- Non-pinned dated files are verified against Geofabrik's official `.md5` sidecars and stored by concrete date in the external map library.
- `MAP_SOURCE_POLICY=cache-first` (default) reuses verified library files; `refresh` downloads again to staging and atomically replaces them only after checksum verification; `offline` never downloads map sources.

Setup builds a fingerprinted dataset directory in the library, recreates the map services against it, and runs the per-area acceptance checks. Only then does it update the library `current.json`/`datasets/current` pointer and prune the replaced release/dataset bundle. Ordinary reruns keep the persisted concrete snapshot date and do not drift to a newer release. Continuous Geofabrik replication/diff updates, cron scheduling, a promotion API, cache-busting headers, and zero-downtime activation are **not implemented**. See [`MAP_LIBRARY.md`](./MAP_LIBRARY.md) for the storage layout, retention rule, migration, and offline boundary.

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

