# Environment variables (development and VM)

[`.env.example`](../.env.example) is the runnable template; this is its **complete active-key reference**. A blank template value means “set by the VM helper, explicitly supply it if needed, or use the consumer's fallback,” **not** an empty string that can be passed indiscriminately to the API. `docker compose` interpolates this file, the host API reads it via dotenv, and Vite loads it from the repository root. They are different processes: a value used by one is not necessarily used by the others. Never paste `.env`, full `docker compose config`, proxy settings or database URLs into a support request.

| Key | Consumer and meaning |
|-----|----------------------|
| `NODE_ENV` | API and seed; `development` enables local-only bootstrap fallback, `production` requires a unique admin seed password. VM helper manages the deployment mode. |
| `HOST` | Host Bun API bind address; Compose overrides with `0.0.0.0`. Not a public browser origin. |
| `PORT` | Host Bun API listen port; Compose pins the container to 3000. |
| `DATABASE_URL` | **Host API/migrations/seed** PostgreSQL URL. Hostname is `localhost` on a local DB, not Compose's `postgres`; Compose builds its **own** container URL from `POSTGRES_*`. URL-encode credentials or use URL-safe passwords. |
| `ADMIN_SEED_PASSWORD_B64` | VM setup helper stores the bootstrap password as base64 for safe `.env` transport (not encryption); helper decodes it to `ADMIN_SEED_PASSWORD` at seed time. Direct `db:seed` does **not** read this key. |
| `JWT_SECRET` | API access-token signing secret, unique, at least 32 characters, not a placeholder. VM helper can generate it. |
| `JWT_REFRESH_SECRET` | API refresh-token signing secret; different from `JWT_SECRET`, at least 32 characters. |
| `CORS_ORIGINS` | API comma-separated exact HTTP(S) origins (scheme + host + optional port, no wildcard/path); for browsers outside localhost configure approved HTTPS origins through the VM helper. |
| `PUBLIC_DOMAIN` | VM/Caddy production edge hostname without scheme; VM helper derives it from the validated HTTPS `CORS_ORIGINS`. Blank for development; not an API setting. |
| `TRUSTED_PROXY_IPS` | API comma-separated trusted reverse-proxy peer IPs/CIDRs; blank on a direct host API. Compose supplies its pinned private subnet; never trust `0.0.0.0/0`. |
| `POSTGRES_USER` | Compose database role; used to build the container API URL and DB healthcheck. No effect on a host API's `DATABASE_URL`. |
| `POSTGRES_PASSWORD` | Compose Postgres role password. Change before first start; use URL-safe characters. Changing `.env` later does **not** rotate a populated database role. |
| `POSTGRES_DB` | Compose database name; used by API URL and healthcheck. |
| `POSTGRES_PORT` | Host loopback published database port; 5432 **inside** the Compose network remains unchanged. |
| `API_PORT` | Host loopback published API port; 3000 inside Compose remains unchanged. |
| `MAP_SERVER_PORT` | Host loopback published Martin port; 3000 in its container is unchanged. |
| `MAP_ROUTING_PORT` | Host loopback published routing gateway port; independent from the OSRM profile containers. |
| `MAP_ELEVATION_DIR` | Optional **absolute external host directory** with staged Skadi HGT and `manifest.json`, mounted read-only in the gateway. Blank uses an isolated empty fallback (no invented elevation). Stage real tiles separately; the PBF is not a DEM. VM coverage not yet accepted. |
| `NOMINATIM_HTTP_PORT` | Host loopback published **import-only** Nominatim HTTP port. |
| `NOMINATIM_DB_PORT` | Host loopback published **import-only** Nominatim PostgreSQL port; not the app database. |
| `NOMINATIM_IMPORT_STYLE` | Import-only container's import style (`full` default), needed by the Photon import. |
| `NOMINATIM_PASSWORD` | Import-only Nominatim DB password; replace before import. Separate from `POSTGRES_PASSWORD`. |
| `NOMINATIM_THREADS` | Import worker count; defaults are conservative for 6 GiB. |
| `NOMINATIM_SHM_SIZE` | Import-only container shared-memory allocation. |
| `NOMINATIM_POSTGRES_SHARED_BUFFERS` | Import database PostgreSQL shared buffers. |
| `NOMINATIM_POSTGRES_MAINTENANCE_WORK_MEM` | Import database PostgreSQL maintenance work memory. |
| `NOMINATIM_POSTGRES_AUTOVACUUM_WORK_MEM` | Import database PostgreSQL autovacuum work memory. |
| `NOMINATIM_POSTGRES_WORK_MEM` | Import database PostgreSQL per-sort work memory. |
| `NOMINATIM_POSTGRES_EFFECTIVE_CACHE_SIZE` | Import database planner cache estimate (not a memory reservation). |
| `PHOTON_PORT` | Host loopback published Photon port; Photon is a local geocoder, not an Internet API. |
| `PHOTON_JAVA_TOOL_OPTIONS` | Photon JVM initial/max heap, used by its Compose service. |
| `NGINX_PORT` | Host loopback published Nginx gateway port; the base Compose stack does not serve the built SPA. VM launcher supplies the web override. |
| `RATE_LIMIT_WINDOW_MS` | API global rate-limit window in milliseconds; specific auth/SOS routes may enforce stricter limits. |
| `RATE_LIMIT_MAX` | API global requests per window, per derived client IP. Proxy trust must be correct first. |
| `LOCATION_HISTORY_RETENTION_DAYS` | API location-history prune retention; must be at least `LOCATION_HISTORY_MAX_SHARE_DAYS`. |
| `LOCATION_HISTORY_MAX_SHARE_DAYS` | API maximum history-sharing grant window; API refuses startup if larger than retention. |
| `LOCATION_HISTORY_READ_POINTS` | API maximum default sampled points returned per history read (1–10,000). |
| `SOS_PHOTO_MAX_SIZE_MB` | API photo-upload size ceiling (1–100 MiB, default 5); not a body-size override for other endpoints. |
| `UPLOAD_DIR` | Host API photo storage path (`data/uploads` relative to checkout); Compose overrides to a persistent named-volume path. Do not discard that volume. |
| `MAP_SERVER_URL` | Vite **server-side** proxy target for Martin; never embedded in browser calls. |
| `MAP_LIBRARY_DIR` | External map library root; blank resolves to `${XDG_DATA_HOME:-$HOME/.local/share}/borobiya/map-library` on Unix. VM helper writes an absolute path. |
| `MAP_DATASET_DIR` | Active generated dataset directory (merged PBF, PMTiles); VM helper writes the external library's active release path. |
| `MAP_DATA_DIR` | Build-script alias of `MAP_DATASET_DIR`; set together only for the same active release. |
| `MAP_OSRM_DATA_DIR` | Built car/bicycle/foot graph directory; setup derives it from the active dataset. Mounted read-only into OSRM profiles. |
| `MAP_PHOTON_DATA_DIR` | Photon index directory; setup derives it from the external library. Mounted for the Photon service. |
| `MAP_SNAPSHOT` | Requested Geofabrik date: `pinned`, `latest`, or `YYYY-MM-DD`. `latest` is resolved/persisted, not silently updated every boot. |
| `MAP_SNAPSHOT_DATE` | Concrete resolved date; setup writes this after resolving `MAP_SNAPSHOT`. |
| `MAP_SOURCE_POLICY` | `cache-first`, `refresh`, or `offline` for map source data; offline refuses missing cached source assets. Does not imply Docker images or JARs are present. |
| `MAP_REGION_IDS` | Comma-separated approved area IDs in `map-server/regions.json`; setup derives the union bbox and source selection. |
| `MAP_REGION` | Stable generated dataset/graph slug, normally `borobiya`; not an area selector. |
| `MAP_BBOX` | WGS84 west,south,east,north **union of installed areas**; setup keeps it in sync with selected IDs. |
| `MAP_OSMIUM_VERSION` | Expected installed Osmium Tool version; build refuses an unreviewed version instead of silently changing extract behavior. |
| `MAP_PLANETILER_SOURCES_DIR` | Optional external shared cache of Planetiler reference layers; blank uses `<MAP_LIBRARY_DIR>/planetiler-sources`. |
| `MAP_NATURAL_EARTH_URL` | Optional reviewed mirror for Planetiler Natural Earth archive; no automatic fallback when set. |
| `MAP_LAKE_CENTERLINES_URL` | Optional reviewed mirror for OSM lake-centerline reference layer; no automatic fallback when set. |
| `MAP_WATER_POLYGONS_URL` | Optional reviewed mirror for OSM water-polygons reference layer; no automatic fallback when set. Never substitute small test fixtures. |
| `PHOTON_DEFAULT_LANGUAGE` | Photon result-language preference; setup derives it from first selected area. |
| `PLANETILER_HEAP` | Java heap for local Planetiler generation; default `3g` for a 6 GiB VM. |
| `OSRM_BUILD_THREADS` | OSRM graph-extraction/partition/customize build threads. Build profiles sequentially. |
| `OSRM_RUNTIME_THREADS` | OSRM profile server workers per service; independent of build concurrency. |
| `MAP_PBF` | Absolute path to the active verified merged dataset PBF; setup writes it. Not a DEM. |
| `MAP_DATA_VERSION` | Map-config public version slug; setup keeps it equal to installed snapshot date. |
| `MAP_MIN_ZOOM` | Minimum style/tile zoom exposed in `/map-config`; checked against generated data. |
| `MAP_MAX_ZOOM` | Maximum generated tile zoom (Planetiler supports 0–16; checked-in styles currently request through z14). Existing VM tile archives need rebuilding before the style source maxzoom is raised. |
| `MAP_VIEW_MAX_ZOOM` | Maximum map **camera** zoom in `/map-config` (default 18, range 0–20); overzooms existing tiles without requesting missing higher-zoom tiles. Does not create missing alleys or extra map data. |
| `MAP_ROUTING_URL` | Vite **server-side** routing-gateway target and host-side verify script URL. Browser uses same-origin `/route`. |
| `MAP_GEOCODE_URL` | Host-side geocoding verification script URL; browser uses same-origin `/geocode`. |
| `MAP_REVERSE_URL` | Host-side reverse-geocoding verification script URL; browser uses same-origin `/reverse`. |
| `API_PROXY_TARGET` | Vite **server-side** target for host/Compose API. Do not point browser code at it. |
| `VITE_API_URL` | Browser-visible **same-origin relative path prefix** for API requests (`/api`); never set to localhost/third-party URL. |
| `VITE_MAP_URL` | Browser-visible **same-origin relative path prefix** for map resources (`/map`); never set to localhost/third-party URL. |

**Intentional non-template values:** `OPENAPI_SERVER_PATH` defaults to `/` on a host API and `/api` in Compose; set only when the public gateway prefix changes. `ADMIN_SEED_PASSWORD` is the plaintext value passed **only to the seed process**; the VM helper derives it from `ADMIN_SEED_PASSWORD_B64`. `ELEVATION_DIR`, the three `OSRM_*_URL`s and `PHOTON_*_URL`s are container-internal upstream settings supplied by Compose, not browser or host `.env` credentials. `SETUP_*`, `MAP_REQUIRE_ELEVATION`, download/proxy diagnostics and cache-maintenance flags are command-specific overrides described next to their respective commands, not permanent app configuration. The proposed SOS auto-expiry and mission-timeout variables are not implemented; adding them to `.env` would not start those jobs.

**Platforms:** For Windows without Docker, set a host PostgreSQL/PostGIS `DATABASE_URL` and use PowerShell commands in [DEVELOPMENT.md](./DEVELOPMENT.md#3-windows-without-docker-powershell--local-postgresql). The native map-data pipeline is not supported there. On Ubuntu 24.04 prefer the [VM helper](./UBUNTU_VM_QUICKSTART.md) for paths, passwords, database migrations and the offline map library. Neither a copied `.env.example` nor `docker compose up` alone produces PMTiles, routing graphs, Photon indexes or DEM tiles.
