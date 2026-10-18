# Borobiya — Development Guide

> TL;DR: Two ways to dev — **Docker on Ubuntu (recommended, prod-like)** or **Bare Bun on Windows (no Docker)**. Both hit the same API + Map Server endpoints. Strict `bun` + `strict: true` TS everywhere.

---

## 1. Prerequisites

| Requirement | Version | Docker path | Windows path |
|-------------|---------|-------------|--------------|
| Bun | 1.1+ | Container image `oven/bun:1.1` | `powershell -c "irm bun.sh/install.ps1|iex"` |
| Node.js fallback | 20+ | Not needed if Bun image | If Bun fails, use Node 20 |
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
# Client runs on host for HMR (Vite proxies to Docker)
cd packages/client
bun install
bun run dev   # http://localhost:5173 → proxies /api to :3000, /tiles to :8000 via vite.config.ts
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
bun run db:setup      # create db + migrate + seed (wraps above)
bun run map:dev        # starts local Martin binary with data/maps/tehran.pmtiles
# In another terminal
bun run dev            # concurrently: api:3000 + client:5173
```

`map:dev` details: runs `map-server/scripts/martin-local.sh` which:

- Checks `data/maps/tehran.pmtiles` exists (downloads sample ~100MB if missing — warn user).
- Starts `bin/martin.exe --config map-server/martin-config.yaml` on `:8000`.

### 3.3 Windows Caveats

- No PostGIS Docker → use host PG (ensure `postgis` extension installed; Windows PG may need `CREATE EXTENSION` as superuser).
- Martin binary: download from `github.com/maplibre/martin/releases` — `martin-windows-x86_64.zip`, extract to `bin/`.
- OSM Tile generation (Planetiler/OSRM) may be skipped on Windows — use prebuilt `tehran.pmtiles` from release assets.

---

## 4. Env File (`.env.example` → `.env`)

```env
# API
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://borobiya:secret@localhost:5432/borobiya
JWT_SECRET=change-me-32-chars-min-please-use-openssl
JWT_REFRESH_SECRET=change-me-32-chars-different-from-above
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Rate & Retention
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
LOCATION_HISTORY_RETENTION_DAYS=90
LOCATION_HISTORY_MAX_SHARE_DAYS=30
SOS_PHOTO_MAX_SIZE_MB=5
SOS_REQUEST_AUTO_EXPIRE_HOURS=24
MISSION_STATUS_TIMEOUT_HOURS=6

# Map
MAP_SERVER_URL=http://localhost:8000
MAP_REGION=tehran
MAP_BBOX=51.0,35.5,51.7,35.9
MAP_DATA_VERSION=2025-05-01
MAP_MAX_ZOOM=14
MAP_MIN_ZOOM=0
MAP_STYLE_LIGHT=http://localhost:8000/styles/light.json
MAP_STYLE_DARK=http://localhost:8000/styles/dark.json
MAP_ROUTING_URL=http://localhost:8000/route
MAP_GEOCODE_URL=http://localhost:8000/geocode
MAP_REVERSE_URL=http://localhost:8000/reverse

# Client (Vite needs VITE_ prefix)
VITE_API_URL=http://localhost:3000
VITE_MAP_URL=http://localhost:8000
VITE_API_PREFIX=/
```

Never commit `.env`.

---

## 5. Scripts Reference

| Command | Where | What |
|---------|-------|------|
| `bun install` | root | Install all workspaces |
| `bun run dev` | root | Concurrent `server` + `client` dev |
| `bun --filter server dev` | root | API only (`fastify --watch`) |
| `bun --filter client dev` | root | Vite HMR only |
| `bun run build` | root | Build all |
| `bun run lint` | root | ESLint + `vue-tsc --noEmit` + `tsc --noEmit` |
| `bun test` / `bun --filter server test` | root/server | Vitest |
| `bun run db:setup` | server | Create DB + migrate + seed |
| `bun run db:migrate` | server | Run migrations |
| `bun run db:seed` | server | Seed questions + reasons + admin |
| `bun run map:dev` | root | Local Martin dev server |
| `bun run map:update --region=iran` | map-server | Full pipeline (see MAP_SERVER.md §4) |
| `bunx zopia --input http://localhost:3000/docs/json --output packages/client/src/generated/zod.ts` | client | Codegen shared types |

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
bun test                    # all
bun --filter server test    # api
bun --filter client test    # composables, stores
bun --filter shared test    # zod schemas
```

- Zod tests: register invalid (duplicate Q, weak pass) should fail; login rate-limit triggers.
- API tests: `fastify.inject()` — no HTTP server needed.
- Frontend: `@vue/test-utils` + `vitest` for stores.

---

## 9. Common Issues

| Symptom | Fix |
|---------|-----|
| `ECONNREFUSED :5432` | PG not running — `docker compose up postgres` or Windows service |
| `relation "users" does not exist` | Run `bun run db:migrate` |
| Map blank, 404 tiles | `map-server` down — `docker compose logs map-server`, check `map-data` volume has `.pmtiles` |
| `ALREADY_AUTHENTICATED` on `_auth` | You are logged in — guard redirects; clear storage or hit logout |
| `SECURITY_QUESTIONS_REQUIRED` | User was created by admin — complete 5Q at `/complete-security-questions` |
| Vite HMR slow | `bun --filter client dev -- --host 0.0.0.0` |
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

