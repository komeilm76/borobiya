# Borobiya — Map Server (Offline Vector)

> TL;DR: The target design is fully offline: self-host **Martin 1.16.1** (vector tiles), **OSRM 26.10.0** (routing), and **Photon 1.3.0** (geocoding) as separate services, with configurable OSM-derived data. **Current scaffold status:** Compose pins Martin 1.16.1 and runs it with an empty, ignored `map-server/data/` directory and PostGIS connection; no project tiles, style/sprite/font assets, OSRM graph, Photon index, or data-generation scripts are present yet. Endpoint examples below describe the planned service, not currently available product features.

---

## 1. What “Offline Vector” Means

| Term | Precise Definition | Forbidden |
|------|--------------------|-----------|
| **Not Tile** | Vector tiles `/{z}/{x}/{y}.pbf` (MVT/protobuf) rendered client-side by MapLibre GL JS | Raster `256x256.png/jpg` (Google/OSM raster) |
| **Fully Offline** | Works on LAN with ZERO internet. No runtime `maps.googleapis.com`, `api.mapbox.com` | Any online provider |
| **Independent** | Map Server deployable on separate VM/box, own lifecycle | Tied to API server process |

Clients only call:
- `https://borobiya.local/api` → API
- `https://map.borobiya.local` or `https://borobiya.local:8000` → Map Server

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
                         │  │ + Martin serve               │──► GET /tiles/{z}/{x}/{y}.pbf
                         │  │ + Styles light/dark JSON     │──► GET /styles/*.json
                         │  │ + Sprites + Glyphs           │──► /sprites/* /fonts/*
                         │  └─────────────┘                │
                         │  ┌─────────────┐                │
                         │  │ OSRM graph  │ osrm-extract   │──► POST /route?profile=car|bike|foot
                         │  │ Valhalla alt│                │──► POST /route/multi (waypoints)
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
| Style hosting | Static files via **nginx** or Martin | — | Same-origin and cacheable; selected releases are recorded above. | — |

The versions are exact pins, not compatibility ranges. Upgrade them deliberately: review release notes, refresh JAR checksums, and rerun the tile-serving, routing-profile, and geocoding checks. Photon’s input constraint is called out here because the later offline-index task must select/provision a Nominatim or Photon-JSON import path before a PBF-to-geocoder command can be documented.

---

## 4. Data Pipeline

### 4.1 Source

- **OSM PBF dumps:** `https://download.geofabrik.de/asia/iran-latest.osm.pbf` or `https://openstreetmap.fr/extracts/`.
- For dev, use **Tehran cut** (~100 MB): `https://download.geofabrik.de/asia/iran/…` + `osmium-tool` extract by bbox.

### 4.2 Steps

```bash
# 1. Download
curl -L https://download.geofabrik.de/asia/iran-latest.osm.pbf -o data/iran.osm.pbf

# Optional: cut to Tehran bbox for dev
osmium extract --bbox 51.0,35.5,51.7,35.9 data/iran.osm.pbf -o data/tehran.osm.pbf

# 2. Generate vector tiles with pinned Planetiler 0.10.2 (Java 21+)
curl -fL https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar \
  -o data/planetiler-0.10.2.jar
echo 'f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d  data/planetiler-0.10.2.jar' | sha256sum -c -
java -Xmx4g -jar data/planetiler-0.10.2.jar \
  --osm-path=data/tehran.osm.pbf --output=data/tehran.pmtiles --download
# or Tippecanoe for small region:
tippecanoe -o data/tehran.mbtiles -zg --drop-densest-as-needed data/tehran.geojson

# 3. Build routing graphs (OSRM)
osrm-extract -p map-server/osrm/profiles/car.lua data/tehran.osm.pbf
osrm-partition data/tehran.osrm && osrm-customize data/tehran.osrm
osrm-routed --algorithm mld data/tehran.osrm --port 5000
# Repeat for bicycle.lua / foot.lua (or Valhalla build_tiles)

# 4. Photon 1.3.0 cannot import an .osm.pbf directly. It needs a Nominatim
# PostgreSQL database or a Photon JSON dump; choose/provision that input in T1.4.5.
# See §7 for the pinned Photon import and serve commands.

# 5. Deploy to volume
cp data/tehran.pmtiles map-server/data/
cp data/tehran.osrm* map-server/osrm/data/
# Restart services via scripts/update.sh
```

Planned scripts for `map-server/scripts/` are `generate-tiles.sh`, `build-routing.sh`, `build-geocode.sh`, and `update.sh` (orchestrator + version stamp); none are implemented in the current scaffold.

### 4.3 Styles

Two JSONs share same `sources` but different `layers.paint`:

- `map-server/styles/light.json`
- `map-server/styles/dark.json`

Minimal example:

```json
{
  "version": 8,
  "sources": {
    "borobiya": { "type": "vector", "tiles": ["http://localhost:8000/tiles/{z}/{x}/{y}.pbf"], "minzoom": 0, "maxzoom": 14 }
  },
  "layers": [
    { "id": "background", "type": "background", "paint": { "background-color": "#ffffff" } },
    { "id": "roads", "type": "line", "source": "borobiya", "source-layer": "roads", "paint": { "line-color": "#cccccc" } }
  ],
  "glyphs": "http://localhost:8000/fonts/{fontstack}/{range}.pbf",
  "sprite": "http://localhost:8000/sprites/sprite"
}
```

Dark variant flips `background-color` to `#121212`, road colors, label halo.

Sprites/glyphs generated once: OpenMapTiles style + `font-maker`.

---

## 5. Martin Config (`martin-config.yaml`)

```yaml
postgres:
  connection_string: ${DATABASE_URL}  # optional PostGIS sources
pmtiles:
  paths:
    - /data/tehran.pmtiles
mbtiles:
  paths:
    - /data/tehran.mbtiles
```

Martin 1.16.1 uses `paths` for local PMTiles/MBTiles; configure PostGIS table discovery with its `postgres.auto_publish` settings when the tile tables are added.

Start:

```bash
martin --config martin-config.yaml --listen-addresses 0.0.0.0:8000
```

Verify:

```bash
curl http://localhost:8000/tiles/5/18/12.pbf -o /tmp/tile.pbf && file /tmp/tile.pbf
curl http://localhost:8000/styles/light.json | jq .sources
```

---

## 6. OSRM Setup

**Pinned Docker image example (OSRM is not yet in the root Compose scaffold):**

```yaml
osrm:
  image: ghcr.io/project-osrm/osrm-backend:v26.10.0
  command: osrm-routed --algorithm mld /data/tehran.osrm --port 8000 --max-table-size 1000
  volumes: [map-data:/data:ro]
```

**Profiles:** Provide Lua files per transport:

- `car.lua` — motorway/primary, one-way respected
- `bicycle.lua` — cycleways preferred, footways allowed
- `foot.lua` — sidewalks, pedestrian streets

**API (on Map Server):**

```
POST /route
Body { from:{lat,lon}, to:{lat,lon}, profile:"car"|"bicycle"|"foot", alternatives: true }
→ { routes: [{ distance_m, duration_s, polyline: "encoded", legs: []}, ...] } // 2-3 alternatives

POST /route/multi
Body { waypoints:[{lat,lon}], profile, optimize?:boolean } → TSP if optimize, returns ordered
```

Document exact payloads in Swagger if proxying via API (recommended: Map Server directly, API just config passthrough).

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
MAP_REGION=tehran          # iran | tehran | middle-east | custom
MAP_BBOX=44.0,25.0,63.0,39.0
MAP_DATA_VERSION=2025-05-01
MAP_MAX_ZOOM=14
MAP_MIN_ZOOM=0
MAP_SERVER_URL=http://localhost:8000          # API tells clients
MAP_STYLE_LIGHT=http://localhost:8000/styles/light.json
MAP_STYLE_DARK=http://localhost:8000/styles/dark.json
MAP_ROUTING_URL=http://localhost:8000/route
MAP_GEOCODE_URL=http://localhost:8000/geocode
MAP_REVERSE_URL=http://localhost:8000/reverse
```

**Geographic coverage:** Start with `tehran` (500MB–1GB) for dev. Scaling to `iran` (~4–6GB tiles + 2GB OSRM + 3GB Photon) requires no code change — only `MAP_REGION` + volume swap.

Disk/RAM guide:

| Region | PMTiles | OSRM graph | Photon index | RAM to serve (min) |
|--------|---------|-----------|--------------|-------------------|
| Tehran | 0.5 GB | 0.8 GB | 1.2 GB | 2 GB |
| Iran | 3–5 GB | 2 GB | 4 GB | 4–8 GB |

Document on provisioning ticket.

---

## 9. Client Integration (MapLibre)

```ts
import maplibregl from "maplibre-gl";
const map = new maplibregl.Map({
  container: "map",
  style: import.meta.env.VITE_MAP_STYLE_LIGHT, // http://localhost:8000/styles/light.json
  center: [51.38, 35.68],
  zoom: 11
});
// Theme toggle
function toggleTheme(dark: boolean) {
  const style = dark ? VITE_MAP_STYLE_DARK : VITE_MAP_STYLE_LIGHT;
  map.setStyle(style); // preserves camera/markers
}
```

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

