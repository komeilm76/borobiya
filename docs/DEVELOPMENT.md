# Borobiya — Development Guide

> TL;DR: Two ways to dev — **Docker on Ubuntu (recommended, prod-like)** or **Bare Bun on Windows (no Docker)**. Both hit the same API + Map Server endpoints. Strict `bun` + `strict: true` TS everywhere.

---

## 1. Prerequisites

| Requirement | Version | Docker path | Windows path |
|-------------|---------|-------------|--------------|
| Bun | 1.4.3+ (project pin: 1.4.3) | Container image `oven/bun:1.4.3` | `powershell -c "irm bun.sh/install.ps1|iex"` |
| Node.js fallback | Server: 20+; client Vite: `^20.19.0 || >=22.12.0` | Not needed if Bun image | Vite requires Node 20.19+ or 22.12+ |
| PostgreSQL + PostGIS | PG 16, PostGIS 3.4 | Docker service `postgis/postgis:16-3.4` | Install `postgresql-16` + `postgis` extension |
| Git | 2.40+ | host | host |
| Docker + Compose | 25+ | host | optional (WSL2) |
| Android Studio | Hedgehog+ | for APK | for APK |
| Java 17 | For Planetiler | container | for tile generation |

**Verify:**

```bash
bun --version
psql --version
docker --version && docker compose version
```

---

## 2. Docker (Ubuntu) — Recommended

### 2.1 Clone & Env

```bash
git clone https://github.com/komeilm76/borobiya.git
cd borobiya
cp .env.example .env
# Edit .env: fill JWT_SECRET (32+ random), DATABASE_URL, MAP_* urls
openssl rand -base64 32  # generate secrets
```

### 2.2 Launch

```bash
docker compose up -d
# Check
docker compose ps
docker compose logs -f api
curl http://localhost:3000/_public/health
curl http://localhost:8000/styles/light.json | head
```

`docker-compose.yml` services:

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4
    volumes: [pgdata:/var/lib/postgresql/data]
    environment: { POSTGRES_USER: borobiya, POSTGRES_DB: borobiya, POSTGRES_PASSWORD: secret }
    ports: ["5432:5432"]
  api:
    build: ./packages/server
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [postgres, map-server]
  map-server:
    image: maplibre/martin:v0.12
    volumes: [map-data:/data:ro, ./map-server/styles:/styles:ro, ./map-server/martin-config.yaml:/config.yaml:ro]
    ports: ["8000:8000"]
    command: ["--config", "/config.yaml", "--listen", "0.0.0.0:8000"]
  nginx:
    image: nginx:stable
    ports: ["80:80", "443:443"]
    volumes: ["./nginx.conf:/etc/nginx/nginx.conf:ro"]
```

### 2.3 DB Setup

```bash
docker compose exec api bun run db:migrate
docker compose exec api bun run db:seed   # 15 security questions + admin + cancellation reasons
# Create admin manually:
curl -X POST http://localhost:3000/_admin/users -H "Authorization: Bearer ..." -d '{"username":"admin","password":"Admin1234"}'
```

### 2.4 Dev Loop

```bash
# Logs
docker compose logs -f api map-server
# Shell
docker compose exec api sh
# Rebuild after dep change
docker compose up -d --build api
# Reset DB
docker compose down -v && docker compose up -d
```

### 2.5 Client

```bash
# Client runs on host for HMR (Vite proxies same-origin paths to Docker)
cd packages/client
bun install
bun run dev   # http://localhost:5173 → /api to Fastify, /map to Map Server via vite.config.ts
```

Or run client in Docker via `docker-compose.override.yml` that adds `client` service.

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
# After copying .env.example to .env and replacing the JWT placeholders:
bun --filter @borobiya/server dev
# In another terminal:
bun --filter @borobiya/client dev
```

Root `bun run dev`, database setup, migrations/seeds, and the local Map Server scripts are planned for later foundation tasks; they are not wired yet.

### 3.3 Windows Caveats

- No PostGIS Docker → use host PG (ensure `postgis` extension installed; Windows PG may need `CREATE EXTENSION` as superuser).
- Martin binary: download from `github.com/maplibre/martin/releases` — `martin-windows-x86_64.zip`, extract to `bin/`.
- OSM Tile generation (Planetiler/OSRM) may be skipped on Windows — use prebuilt `tehran.pmtiles` from release assets.

---

## 4. Env File (`.env.example` → `.env`)

```env
# API
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
DATABASE_URL=postgresql://borobiya:change-me@localhost:5432/borobiya
JWT_SECRET=replace-this-with-a-random-secret-of-at-least-32-characters
JWT_REFRESH_SECRET=replace-this-with-a-different-random-secret-of-at-least-32-characters
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
# Explicit reverse-proxy IPs/CIDRs only; leave empty for direct access.
TRUSTED_PROXY_IPS=
API_PROXY_TARGET=http://127.0.0.1:3000

# Global rate limit: 100 requests per minute; auth/SOS routes apply stricter limits.
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
LOCATION_HISTORY_RETENTION_DAYS=90
LOCATION_HISTORY_MAX_SHARE_DAYS=30
SOS_PHOTO_MAX_SIZE_MB=5
SOS_REQUEST_AUTO_EXPIRE_HOURS=24
MISSION_STATUS_TIMEOUT_HOURS=6

# Independent Map Server (server-to-server URLs for local development)
MAP_SERVER_URL=http://localhost:8000
MAP_REGION=tehran
MAP_BBOX=51.0,35.5,51.7,35.9
MAP_DATA_VERSION=development
MAP_MAX_ZOOM=14
MAP_MIN_ZOOM=0
MAP_STYLE_LIGHT=http://localhost:8000/styles/light.json
MAP_STYLE_DARK=http://localhost:8000/styles/dark.json
MAP_ROUTING_URL=http://localhost:8000/route
MAP_GEOCODE_URL=http://localhost:8000/geocode
MAP_REVERSE_URL=http://localhost:8000/reverse

# Browser-facing paths stay same-origin; Vite and the production proxy forward them.
VITE_API_URL=/api
VITE_MAP_URL=/map
```

Copy this template to `.env`, replace the placeholders, and never commit `.env`. Generate independent JWT secrets with `openssl rand -base64 32`; do not use the example strings in production.

---

## 5. Scripts Reference

| Command | Where | What |
|---------|-------|------|
| `bun install` | root | Install all workspaces |
| `bun run dev` | root | Concurrent API + client (root orchestration planned for T1.0.7) |
| `bun --filter @borobiya/server dev` | root | Fastify API skeleton (`bun --watch`) |
| `bun --filter @borobiya/server test` | root | Server environment and Fastify inject tests |
| `bun --filter @borobiya/server typecheck` | root | Strict server TypeScript check |
| `bun --filter @borobiya/client dev` | root | Vite on `0.0.0.0:5173`, with same-origin `/api` and `/map` proxies |
| `bun --filter @borobiya/client test` | root | Client route-map tests |
| `bun --filter @borobiya/client typecheck` | root | Vue SFC and TypeScript check |
| `bun --filter @borobiya/client build` | root | Typecheck and production Vite build |
| `bun --filter @borobiya/client preview` | root | Preview the production build |
| `bun run build` | root | Build all (root orchestration planned for T1.0.7) |
| `bun run lint` | root | ESLint + `vue-tsc` + `tsc` (root lint script planned) |
| `bun --filter @borobiya/shared test` | root | Shared schema and route-contract tests |
| `bun run db:setup` | server | Planned with database/migration tasks; not wired yet |
| `bun run db:migrate` | server | Planned with database/migration tasks; not wired yet |
| `bun run db:seed` | server | Planned with database/seed tasks; not wired yet |
| `bun run map:dev` | root | Planned; local Martin scripts are not wired yet |
| `bun run map:update --region=iran` | map-server | Planned; see MAP_SERVER.md §4 |
| `bunx zopia --input http://localhost:3000/docs/json --output packages/client/src/generated/zod.ts` | client | Planned with T1.0.6 OpenAPI/codegen wiring |

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

# Fastify server skeleton
bun --filter @borobiya/server test
bun --filter @borobiya/server typecheck

# Vue client scaffold
bun --filter @borobiya/client test
bun --filter @borobiya/client typecheck
bun --filter @borobiya/client build
```

- Shared-contract tests use Vitest and cover the documented Zod invariants and route descriptors.
- Server tests use `fastify.inject()`; no network listener or database is needed.
- Client tests verify namespaced routes and placeholder registration; feature/component tests will be added with those features.
- Before starting the API, copy `.env.example` to `.env` and replace the placeholder JWT secrets. Startup validates `DATABASE_URL`, secrets, CORS origins, trusted proxy IP/CIDRs, host/port, and rate-limit values; no database connection is opened yet.
- The Vite browser client uses same-origin `/api` and `/map` paths; its server-side dev proxy reads backend targets from the root `.env`.

---

## 9. Common Issues

| Symptom | Fix |
|---------|-----|
| `ECONNREFUSED :5432` | PG not running — `docker compose up postgres` or Windows service |
| `relation "users" does not exist` | Run `bun run db:migrate` |
| Map blank, 404 tiles | `map-server` down — `docker compose logs map-server`, check `map-data` volume has `.pmtiles` |
| `ALREADY_AUTHENTICATED` on `_auth` | You are logged in — guard redirects; clear storage or hit logout |
| `SECURITY_QUESTIONS_REQUIRED` | User was created by admin — complete 5Q at `/_user/complete-security-questions` |
| Vite HMR slow | `bun --filter @borobiya/client dev` (already binds to `0.0.0.0`) |
| Port conflicts 3000/5173/8000 | Change in `.env` + `vite.config.ts` proxy |

---

## 10. First Contribution Walkthrough

1. Read `docs/ARCHITECTURE.md` + `docs/API.md` + `docs/SECURITY.md`.
2. Pick a task in `docs/TASKS.md` (e.g., `T1.2.1` register endpoint).
3. Create branch `feat/register-endpoint` from `main` (or work on assigned `arena/...`).
4. Add Zod schema in `packages/shared/src/schemas/auth.ts`.
5. Implement route in `packages/server/src/modules/auth/auth.routes.ts`.
6. Test via `curl` + Vitest.
7. Update `docs/PROGRESS.md` % for that milestone.
8. Push, open PR targeting `main`, ensure `lefthook` passes.

