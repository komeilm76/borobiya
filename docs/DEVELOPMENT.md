# Borobiya — Development Guide

> TL;DR: Use **`bun run dev`** for the API + client with hot reload, or **Docker Compose** for the API, PostGIS, Martin, routing gateway, and Nginx (OSRM/Photon are optional profiles; Nominatim is import-only). Auth, recovery, session, and user/admin account flows use Drizzle-backed PostgreSQL after explicit migrations and seed; migrations are not automatic. The map pipeline and style assets are implemented, while generated map data lives outside Git in the external map library. Strict `bun` + `strict: true` TypeScript everywhere.

---

## 1. Prerequisites

| Requirement | Version | Docker path | Windows path |
|-------------|---------|-------------|--------------|
| Bun | 1.4.3+ (project pin: 1.4.3) | Container image `oven/bun:1.4.3` | `powershell -c "irm bun.sh/install.ps1|iex"` |
| Node.js fallback | Server: 20+; client Vite: `^20.19.0 || >=22.12.0` | Not needed if Bun image | Vite requires Node 20.19+ or 22.12+ |
| PostgreSQL + PostGIS | PG 16, PostGIS 3.4 | Docker service `postgis/postgis:16-3.4` | Required to apply T1.1.4 migrations; install PostgreSQL with the PostGIS extension |
| Git | 2.40+ | host | host |
| Docker + Compose | 25+ | host | optional (WSL2) |
| Android Studio | Hedgehog+ | for APK | for APK |
| Java | 21+ for the pinned Planetiler 0.10.2 and Photon 1.3.0 JARs | Not needed for containerized Martin/OSRM | Required when running the Planetiler and Photon JARs locally |

**Verify:**

```bash
bun --version
psql --version
docker --version && docker compose version
```

---

## 2. Docker Compose (Linux, macOS, or Windows with Docker Desktop)

### 2.1 Clone & environment

```bash
git clone https://github.com/komeilm76/borobiya.git
cd borobiya
cp .env.example .env
```

Replace both JWT placeholders with different 32+ character secrets (for example, generate each with `openssl rand -base64 32`). Replace the example PostgreSQL password with a URL-safe value such as `openssl rand -hex 24`. If you change the database user/password for bare-Bun development too, keep `DATABASE_URL` in `.env` in sync. Do not commit `.env`.

### 2.2 Start the services

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f api map-server
```

The default Compose profile contains `api`, PostGIS `postgres`, Martin `map-server`, the routing gateway, and the Nginx gateway. The OSRM profile services and Photon are opt-in; Nominatim is available only for the geocoding-import workflow. Host ports are loopback-bound by default: API `3000`, PostgreSQL `5432`, Martin `8000`, routing gateway `8001`, and Nginx `8080`.

```bash
curl http://localhost:3000/_public/health       # API directly
curl http://localhost:8080/api/_public/health   # API through Nginx
curl http://localhost:8080/docs                 # Swagger UI
curl http://localhost:8000/health               # Martin
```

Nginx proxies `/api/` to Fastify, `/map/` and Martin's root-relative assets to Martin, `/map-config` to the public map-config endpoint, and `POST /route` to the routing gateway; it is a gateway only, not a built client web server. The Swagger UI served through Nginx advertises `/api` first for “Try it out” and also lists `/` for direct API access; set `OPENAPI_SERVER_PATH` if you change the gateway prefix. Use the Vite client at `http://localhost:5173` (see §2.4). Auth/reference migrations and an explicit seed command are checked in but are not run at startup; after applying them and seeding the question catalog, `POST /_auth/register` and `POST /_auth/login` use the configured PostgreSQL database. The offline map stack is implemented and running on the reference VM: Martin serves tiles from the generated PMTiles archive with the committed styles, SVG sprite sources, and glyph fonts, and the routing gateway fronts OSRM car/bicycle/foot and Photon geocoding. Build it with `docs/UBUNTU_VM_RUNBOOK.md`; generated datasets stay out of Git, and tile/route/geocode acceptance requires the runbook's step 13 verification scripts. Generated map datasets are ignored by Git; see [`map-server/README.md`](../map-server/README.md). On a bare host `TRUSTED_PROXY_IPS` is empty by default for safety; under Compose it defaults to the pinned project subnet (`172.30.0.0/24`, where the Nginx container lives) so Fastify honors forwarded client addresses from Nginx only. If you expose Nginx beyond local development, review that value for your topology.

### 2.3 Database status

Compose runs PostgreSQL from the `postgis/postgis:16-3.4` image and health-checks the database service. Drizzle migrations under `packages/server/drizzle/` create the auth/reference tables; T1.1.4's migration enables the PostGIS extension and adds account-state and `GEOGRAPHY(Point,4326)` fields plus a GiST index. Run `bun --filter @borobiya/server db:generate` to generate reviewed schema changes, then `bun --filter @borobiya/server db:migrate` to apply pending migrations to the configured `DATABASE_URL`. Neither runs at API startup; registration and login use the database client on demand after schema setup. After migration, `bun --filter @borobiya/server db:seed` inserts 15 Persian security questions, 11 cancellation reasons, and a hashed bootstrap admin; the seed is idempotent and does not overwrite an existing admin password. If that password is lost, reset it (this also revokes admin sessions) with `bun --filter @borobiya/server db:reset-admin-password '<new-password>'`, or the same script inside the API image. Local development defaults to `admin` / `admin123`, which must be changed before exposing the service. Seeding rejects that fallback unless `NODE_ENV` is `development` or `test`; set a unique `ADMIN_SEED_PASSWORD` in every other environment. `db:setup` remains unwired.

### 2.4 Client and development loop

For a local API + client with hot reload, stop the Compose stack first (the API uses host port `3000`) and run from the repository root:

```bash
bun install
bun run dev   # API + Vite concurrently; client at http://localhost:5173
```

To keep the Compose API and Martin running while using Vite on the host, start the stack and run only the client instead:

```bash
docker compose up --build -d
bun --filter @borobiya/client dev
```

The Vite dev proxy reads `API_PROXY_TARGET` and `MAP_SERVER_URL` from the root `.env` and defaults to the Compose-published host ports. Martin-bound proxy entries preserve the browser-facing `Host` header (`changeOrigin: false`) because Martin expands style asset URLs to absolute URLs built from that Host; rewriting it breaks map loading from any non-localhost origin. It proxies `/map` for Martin styles/catalog endpoints and the root-relative `/borobiya/` (dataset slug from the validated map config), `/sprite/`, and `/font/` requests used by the styles. `bun run dev` and a Compose API cannot both bind host port `3000` at the same time.

Useful commands:

```bash
docker compose logs -f api map-server       # follow service logs
docker compose up --build -d api            # rebuild/restart API after source or dependency changes
docker compose down                         # stop containers; retain Postgres volume
docker compose down -v                      # destructive: also removes persisted Postgres data
```

---

## 3. Windows Without Docker

> Required per spec §20.2 — many contributors have no Docker on Windows.

### 3.1 Install

1. **Bun:** `powershell -c "irm bun.sh/install.ps1|iex"` → reopen terminal.
2. **PostgreSQL:** Install from `postgresql.org/download/windows/` (installer includes PostGIS checkbox).
   - Create DB:
     ```sql
     CREATE USER borobiya WITH PASSWORD 'secret' CREATEDB;
     CREATE DATABASE borobiya OWNER borobiya;
     \c borobiya; CREATE EXTENSION postgis;
     ```
3. **Node:** fallback if Bun tools missing.
4. **Git:** standard.

### 3.2 Install & Run

```bash
cd borobiya
bun install
# Copy .env.example to .env and replace the two JWT placeholders first.
bun run dev   # API and Vite client concurrently
```

The API requires a syntactically valid `DATABASE_URL` in its environment. The auth/reference migrations and `db:seed` command are available for manual use against a running database; registration/login, refresh/logout, recovery, onboarding, and account-management routes use PostgreSQL after those steps. Map data is generated locally (never committed) with the `map-server/scripts/` pipeline for the areas/snapshot selected from `map-server/regions.json` (`MAP_REGION_IDS`, default `ir-tehran`; whole countries and/or cities; `MAP_SNAPSHOT=pinned|latest|YYYY-MM-DD`). All sources, crops, and generated dataset artifacts live in the standardized external map library (`MAP_LIBRARY_DIR`, default `~/.local/share/borobiya/map-library`; see `docs/MAP_LIBRARY.md`). `scripts/setup-ubuntu-vm.sh` automates the full Ubuntu VM launch in `docs/UBUNTU_VM_RUNBOOK.md`, including the library/snapshot/policy/area form (`--list-regions`, `--regions`, `--update-map`, `--offline`, `--reselect`, `--dry-run`). Docker is optional for API/client work with a local PostgreSQL/PostGIS database, but the documented tile/routing/geocoding stack and OSM build pipeline target Ubuntu with Docker.

### 3.3 Windows Caveats

- PostgreSQL/PostGIS is required for the implemented database-backed auth/account routes, migrations, and `db:seed` (use Compose on WSL2/Docker Desktop or install PostgreSQL/PostGIS locally). The API can start without querying the database, but database-backed operations will not work until setup is complete.
- The Martin/OSRM/Photon services run via Docker (see `docs/MAP_SERVER.md`); styles, sprites, and fonts are committed, while tiles/graphs/indexes are generated locally and ignored by Git. Native Windows runs of the OSM toolchain (Osmium, Planetiler) are not supported — use the Ubuntu VM runbook.

---

## 4. Env File (`.env.example` → `.env`)

```env
# API
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
DATABASE_URL=postgresql://borobiya:change-me@localhost:5432/borobiya
# Optional: admin123 fallback is accepted only when NODE_ENV=development or test.
# ADMIN_SEED_PASSWORD=
JWT_SECRET=replace-this-with-a-random-secret-of-at-least-32-characters
JWT_REFRESH_SECRET=replace-this-with-a-different-random-secret-of-at-least-32-characters
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:8080
# Explicit reverse-proxy IPs/CIDRs only; leave empty for direct access.
TRUSTED_PROXY_IPS=
# Compose-only values: use a URL-safe password; host ports are localhost-bound.
POSTGRES_USER=borobiya
POSTGRES_PASSWORD=change-me
POSTGRES_DB=borobiya
POSTGRES_PORT=5432
API_PORT=3000
MAP_SERVER_PORT=8000
NGINX_PORT=8080
API_PROXY_TARGET=http://127.0.0.1:3000

# Global rate limit: 100 requests per minute; auth/SOS routes apply stricter limits.
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
LOCATION_HISTORY_RETENTION_DAYS=90
LOCATION_HISTORY_MAX_SHARE_DAYS=30
LOCATION_HISTORY_READ_POINTS=1000
SOS_PHOTO_MAX_SIZE_MB=5
SOS_REQUEST_AUTO_EXPIRE_HOURS=24
MISSION_STATUS_TIMEOUT_HOURS=6

# Independent Map Server (server-to-server URLs for local development)
MAP_SERVER_URL=http://localhost:8000
MAP_LIBRARY_DIR=
MAP_DATASET_DIR=
MAP_SNAPSHOT=pinned
MAP_SNAPSHOT_DATE=2026-10-18
MAP_SOURCE_POLICY=cache-first
MAP_REGION_IDS=ir-tehran
MAP_REGION=borobiya
MAP_BBOX=51.0,35.5,51.7,35.9
MAP_DATA_VERSION=2026-10-18
MAP_MAX_ZOOM=14
MAP_MIN_ZOOM=0
MAP_STYLE_LIGHT=http://localhost:8000/style/light
MAP_STYLE_DARK=http://localhost:8000/style/dark
MAP_ROUTING_URL=http://localhost:8001/route
MAP_ROUTING_PORT=8001
MAP_OSRM_DATA_DIR=
MAP_GEOCODE_URL=http://localhost:8001/geocode
MAP_REVERSE_URL=http://localhost:8001/reverse

# Browser-facing paths stay same-origin; Vite and the production proxy forward them.
VITE_API_URL=/api
VITE_MAP_URL=/map
```

The repository's [`.env.example`](../.env.example) is the source of truth for the full template. Copy it to `.env`, replace the JWT placeholders with different secrets (for example, `openssl rand -base64 32` twice), and never commit `.env`. Compose uses `POSTGRES_*` values to build its container-internal database URL; use a URL-safe password, and keep the local `DATABASE_URL` credentials in sync if you also run the API directly on the host. A clean checkout intentionally has no PMTiles, OSRM graphs, or Photon index: generate these with the pipeline/runbook into `MAP_LIBRARY_DIR` before enabling the corresponding map services. The routing gateway and offline geocoding adapter are implemented; live dataset acceptance for the external-library refactor remains a target-VM gate.

---

## 5. Scripts Reference

| Command | Where | What |
|---------|-------|------|
| `bun install` | root | Install all workspaces |
| `bun run dev` | root | Runs the API and Vite client concurrently with Bun's workspace runner; requires a `.env` with a valid DB URL, distinct JWT secrets, and explicit CORS origins |
| `bun --filter @borobiya/server dev` | root | Fastify API with database-backed auth, recovery, session, and account routes (`bun --watch`) |
| `bun --filter @borobiya/server test` | root | Server environment and Fastify inject tests |
| `bun --filter @borobiya/server typecheck` | root | Strict server TypeScript check |
| `bun --filter @borobiya/client dev` | root | Vite on `0.0.0.0:5173`, with same-origin `/api` and `/map` proxies |
| `bun --filter @borobiya/client test` | root | Client API, auth/theme/router, map, attribution, and cache-worker tests |
| `bun --filter @borobiya/client typecheck` | root | Vue SFC and TypeScript check |
| `bun --filter @borobiya/client build` | root | Typecheck and production Vite build |
| `bun --filter @borobiya/client preview` | root | Preview the production build |
| `bun run build` | root | Not wired yet |
| `bun run lint` | root | Not wired yet |
| `bun --filter @borobiya/shared test` | root | Shared schema and route-contract tests |
| `bun --filter @borobiya/server db:generate` | root | Generates a Drizzle migration from `packages/server/src/db/schema.ts`; does not apply it |
| `bun --filter @borobiya/server db:migrate` | root | Applies pending Drizzle migrations to the configured `DATABASE_URL`; not run by API startup |
| `docker compose run --rm api bun src/db/migrate.ts` | root | Same migrations via the runtime migrator inside the API image (no drizzle-kit there); run before `db:seed` on a fresh database |
| `bun run db:setup` | server | Not wired yet |
| `bun --filter @borobiya/server db:seed` | root | Idempotently seeds reference data and the bootstrap admin; run after `db:migrate` |
| `bun run map:dev` | root | Planned; local Martin scripts are not wired yet |
| `./scripts/setup-ubuntu-vm.sh --update-map` | root | Resolve/download the latest common map snapshot into the external library, rebuild/verify the active dataset, then prune the replaced release |
| `bun --filter @borobiya/client generate:api` | root | Fetches `/docs/json` from the running API and writes Zopia modules to `packages/client/src/generated/api/` |

---

### OpenAPI client generation

Start the API first, then run `bun --filter @borobiya/client generate:api`. By default the script fetches `http://localhost:3000/docs/json`; set `API_OPENAPI_URL` to use another server or `ZOPIA_OUTPUT_DIR` to change the output directory. Generated code under `packages/client/src/generated/` is intentionally ignored by Git — run the generator inside the Linux VM, because the pinned `@openapi-zod-client` toolchain needs glibc (`ld-linux-x86-64.so.2`) and cannot start from a Windows/WSL-mounted toolchain; regenerate and delete rather than committing the output.

---

## 6. IDE Setup

- **VSCode:** Install `Vue - Official`, `Tailwind`, `ESLint`, `PostGIS` extensions.
- **Settings:**
  ```json
  { "editor.formatOnSave": true, "editor.defaultFormatter": "esbenp.prettier-vscode" }
  ```
- **Path aliases:** `tsconfig.json` `paths` + `vite.config.ts` `resolve.alias` must match (see STRUCTURE.md §11).

---

## 7. Debugging

- **API:** Run `bun --inspect --filter server dev` → `chrome://inspect`.
- **Client:** Vite sourcemaps, Vue DevTools.
- **DB:** `psql $DATABASE_URL` → `SELECT * FROM users; SELECT ST_AsText(last_location) FROM users;`
- **Socket:** Browser Network WS tab → `socket.io` frames.

---

## 8. Testing

```bash
# Shared API contracts
bun --filter @borobiya/shared test
bun --filter @borobiya/shared typecheck

# Fastify API
bun --filter @borobiya/server test
bun --filter @borobiya/server typecheck

# Vue client scaffold
bun --filter @borobiya/client test
bun --filter @borobiya/client typecheck
bun --filter @borobiya/client build
```

- Shared-contract tests use Vitest and cover the documented Zod invariants and route descriptors.
- Server tests use `fastify.inject()`; no network listener or database is needed.
- Client tests cover API error handling, auth state, route guards, map config/canvas options, theme behavior, attribution, and service-worker caching; live browser checks still depend on a running map stack.
- Before starting the API, copy `.env.example` to `.env` and replace the placeholder JWT secrets. Startup validates `DATABASE_URL`, secrets, CORS origins, trusted proxy IP/CIDRs, host/port, and rate-limit values; database-backed auth/account routes connect to PostgreSQL on demand, but migrations are not automatic.
- The Vite browser client uses same-origin `/api` and `/map` paths; its server-side dev proxy reads backend targets from the root `.env`.

---

## 9. Common Issues

| Symptom | Fix |
|---------|-----|
| API startup rejects `DATABASE_URL` | Use a valid `postgres://` or `postgresql://` URL; registration/login database queries run only when a route is used |
| `relation "users" does not exist` | The migration is checked in but is not applied automatically; start PostgreSQL and run `bun --filter @borobiya/server db:migrate` against the intended `DATABASE_URL` |
| Map blank, 404 tiles | Check `docker compose logs map-server` and confirm a generated `borobiya.pmtiles` exists under the active `MAP_DATASET_DIR`; styles/sprites/fonts are committed, but map data is built separately into the external library |
| `ALREADY_AUTHENTICATED` on `_auth` | You are logged in — guard redirects; clear storage or hit logout |
| `SECURITY_QUESTIONS_REQUIRED` | User was created by admin — complete 5Q at `/_user/complete-security-questions` |
| Vite HMR slow | `bun --filter @borobiya/client dev` (already binds to `0.0.0.0`) |
| Port conflicts 3000/5173/8000/8080 | Change Compose host ports in `.env`; for Vite's targets, update `API_PROXY_TARGET` and `MAP_SERVER_URL` too |

---

## 10. First Contribution Walkthrough

1. Read `docs/ARCHITECTURE.md` + `docs/API.md` + `docs/SECURITY.md`.
2. Pick the highest open task in `docs/TASKS.md` — the numbered list is the queue, and any task marked done in a
   doc but unticked there (or the reverse) is a bug to fix before starting new work.
3. Create a branch from `main` (or work on the branch assigned to you, e.g. `arena/...`).
4. Add the Zod schema in `packages/shared/src/schemas/`, and the route contract in `packages/shared/src/api/` —
   every endpoint is declared there first, marked `contract-only` until a handler registers it.
5. Implement the handler in the domain folder that already owns that surface: `packages/server/src/auth/`,
   `src/admin/`, `src/location/`, `src/users/`. There is no `src/modules/` tree — adding one starts a second
   layout that half the docs then fail to describe. Persistence goes in `src/db/<name>-store.ts`.
6. Test via Vitest (`bunx vitest run` inside the package) plus a `curl` against the running server.
7. Update `docs/PROGRESS.md` (board + changelog) and `docs/TASKS.md` in the same commit as the code.
8. Push and open a PR targeting `main`. The gates today are the three `typecheck` scripts, the three Vitest
   suites, and `bun --filter @borobiya/client build`; no hook manager is wired yet, so nothing runs them for you.

