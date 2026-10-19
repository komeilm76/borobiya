# Borobiya — Map Server (Offline Vector)

> TL;DR: The target design is fully offline: self-host **Martin 1.16.1** (vector tiles and styles), **OSRM 26.10.0** (routing), and **Photon 1.3.0** (geocoding) as separate services, with configurable OSM-derived data. **Current scaffold status:** Martin is configured to serve committed light/dark styles, SVG-derived sprites, and dynamically generated glyphs; the Tehran PMTiles archive is still not generated, so its tile route remains unverified. The pinned Planetiler generation and MVT smoke-test scripts exist, but generation is blocked in this environment by missing Java 21+ and the candidate PBF's reuse terms are unresolved. Routing, geocoding, and a real Martin runtime check remain pending.

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
                         │  │ + Martin serve               │──► GET /{sourceID}/{z}/{x}/{y}
                         │  │ + Styles light/dark JSON     │──► GET /style/{id}
                         │  │ + Sprites + Glyphs           │──► /sprite/* /font/*
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
| Styles, sprites, glyphs | **Martin 1.16.1** | `/style/{id}`, `/sprite/{id}.*`, `/font/{stack}/{range}` | Martin serves style JSON and generates sprite sheets and glyph PBF ranges from local SVG/TTF assets on demand; no external runtime requests. [Style docs](https://maplibre.org/martin/using/sources-styles/). |

The versions are exact pins, not compatibility ranges. Upgrade them deliberately: review release notes, refresh JAR checksums, and rerun the tile-serving, routing-profile, and geocoding checks. Photon’s input constraint is called out here because the later offline-index task must select/provision a Nominatim or Photon-JSON import path before a PBF-to-geocoder command can be documented.

---

## 4. Data Pipeline

### 4.1 Source

- **OSM PBF dumps:** `https://download.geofabrik.de/asia/iran-latest.osm.pbf` or `https://openstreetmap.fr/extracts/`.
- For dev, use **Tehran cut** (~100 MB): `https://download.geofabrik.de/asia/iran/…` + `osmium-tool` extract by bbox.

### 4.2 Steps

```bash
# 1–2. Download/cut a Tehran extract if needed, verify the pinned Planetiler JAR,
#    and generate map-server/data/tehran.pmtiles (Java 21+, curl, osmium if no PBF exists).
./map-server/scripts/generate-tiles.sh

# Optional alternative for small GeoJSON-only areas:
tippecanoe -o map-server/data/tehran.mbtiles -zg --drop-densest-as-needed data/tehran.geojson

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

`map-server/scripts/generate-tiles.sh` downloads/crops the Tehran PBF if needed, verifies Planetiler 0.10.2 by SHA-256, and generates the ignored PMTiles archive. `map-server/scripts/verify-tehran-tiles.sh` checks Martin health and an MVT tile response. Routing, geocoding, and update scripts (`build-routing.sh`, `build-geocode.sh`, `update.sh`) remain future work.

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
MAP_STYLE_LIGHT=http://localhost:8000/style/light
MAP_STYLE_DARK=http://localhost:8000/style/dark
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
const mapUrl = import.meta.env.VITE_MAP_URL ?? "/map";
const map = new maplibregl.Map({
  container: "map",
  style: `${mapUrl}/style/light`,
  center: [51.38, 35.68],
  zoom: 11
});
// Both styles share sources and assets, so MapLibre can swap without external requests.
function toggleTheme(dark: boolean) {
  map.setStyle(`${mapUrl}/style/${dark ? "dark" : "light"}`);
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

