# Borobiya — Project Structure

> TL;DR: Monorepo with `packages/shared`, `packages/server`, `packages/client`, `map-server/`, plus root `docker-compose.yml` & `.env.example`. Frontend views are literally namespaced by API prefix: `views/_auth`, `views/_public`, `views/_user`, `views/_admin`.

---

## 1. Root Overview

```text
borobiya/
├── docs/                     # ← you are here (this folder)
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── STRUCTURE.md          # this doc
│   ├── ROADMAP.md
│   ├── TASKS.md
│   ├── PROGRESS.md
│   ├── API.md
│   ├── SECURITY.md
│   ├── MAP_SERVER.md
│   ├── WORKFLOWS.md
│   ├── USER_MANUAL.md
│   ├── DEVELOPMENT.md
│   └── DIAGRAMS/
│       ├── ERD.md
│       ├── SOS_FLOW.md
│       ├── LOCATION_SEQUENCE.md
│       └── MAP_PIPELINE.md
│
├── packages/
│   ├── shared/               # Zod schemas + TS types — single source of truth
│   ├── server/               # Fastify API + Socket.IO + PostGIS
│   └── client/               # Vue + Vuetify + Tailwind + MapLibre + Ionic
│
├── map-server/               # Independent vector tile + routing + geocoding
│   ├── tiles/                # (gitignored) *.pmtiles / *.mbtiles lives here
│   ├── styles/               # MapLibre style JSONs (light/dark)
│   ├── martin-config.yaml
│   ├── osrm/
│   └── photon/
│
├── data/                     # (gitignored) local OSM extracts, sample tiles
│   └── maps/
│       └── tehran.pmtiles
│
├── android/                  # Capacitor output (generated, not committed initially)
│
├── docker-compose.yml
├── docker-compose.override.yml   # local dev overrides
├── .env.example
├── .env                      # (gitignored) real secrets
├── .gitignore
├── lefthook.yml / .husky/
├── package.json              # root (workspaces)
├── tsconfig.json
└── README.md                 # Project prompt/spec (frozen source-of-truth)
```

---

## 2. Monorepo Workspaces (`package.json`)

```json
{
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "concurrently \"bun --filter server dev\" \"bun --filter client dev\"",
    "build": "bun --filter '*' build",
    "test": "vitest run",
    "lint": "eslint . && vue-tsc --noEmit && tsc -p tsconfig.server.json --noEmit",
    "map:update": "bun run --filter map-server update",
    "db:setup": "bun --filter server db:setup",
    "cap:sync": "bun --filter client build && npx cap copy android"
  },
  "packageManager": "bun@1.4.3",
  "devDependencies": {
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  }
}
```

Alternative: use `pnpm`/`npm` workspaces — but Bun is mandated, so `bun workspaces` via `workspaces` field.

---

## 3. `packages/shared` — Contract Package

**Purpose:** Shared Zod schemas, inferred types, and `km-api` route descriptors; runtime dependencies are Zod and `km-api`. No Fastify, Vue, or database imports—the server adds handler wiring separately.

```text
packages/shared/
├── package.json              # name: "@borobiya/shared"; Zod + km-api runtime dependencies
├── src/
│   ├── schemas/
│   │   ├── auth.ts           # loginSchema, registerSchema, forgotSchemas, completeSecurityQuestionsSchema
│   │   ├── user.ts           # userProfileSchema, devicesSchema
│   │   ├── location.ts       # shareSchema, historyShareSchema, locationUpdateSchema
│   │   ├── sos.ts            # sosRequestSchema, dispatchSchema, missionStatusUpdateSchema, cancellationSchemas
│   │   ├── admin.ts          # user status, category, incident type, and cancellation-reason schemas
│   │   ├── search.ts         # userSearchSchema, geocodeQuerySchema, reverseGeocodeQuerySchema
│   │   ├── common.ts         # paginationQuerySchema, idSchema, errorSchema
│   │   └── index.ts          # barrel export
│   ├── api/
│   │   ├── define-route.ts   # method/url/schema/meta adapter to km-api
│   │   ├── common.ts         # path, query, response, and error helpers
│   │   ├── auth.routes.ts
│   │   ├── public.routes.ts
│   │   ├── user.routes.ts
│   │   ├── location.routes.ts
│   │   ├── sos.routes.ts
│   │   ├── admin.routes.ts
│   │   ├── index.ts          # grouped descriptors + complete route registry
│   │   └── index.test.ts
│   ├── types/
│   │   ├── enums.ts          # Severity, MissionStatus, CancellationType, IncidentSlug
│   │   └── models.ts         # Inferred TS types from Zod (or standalone)
│   └── index.ts
├── tsconfig.json             # strict: true, rootDir: src
└── README.md
```

**Rules:**
- No `fs`, `fastify`, `vue` imports — pure types/schemas.
- Every schema has `export type Foo = z.infer<typeof fooSchema>`.
- `packages/server` and `packages/client` both depend on `@borobiya/shared` via workspace symlink.

---

## 4. `packages/server` — Fastify API

```text
packages/server/
├── package.json              # Fastify, security plugins, @borobiya/shared, dotenv, zod; DB/socket deps later
├── src/
│   ├── app.ts                # createFastifyApp() + public health route
│   ├── server.ts             # validated config + listen entrypoint
│   ├── config/
│   │   ├── env.ts            # Zod-validated host, port, DB URL, secrets, CORS, rate limits
│   │   └── env.test.ts
│   ├── plugins/
│   │   ├── security.ts       # Helmet, CORS allowlist, global rate-limit shell
│   │   ├── auth.ts           # decorate authenticate + authorize(roles), future
│   │   ├── swagger.ts        # OpenAPI wiring, T1.0.6
│   │   ├── socket.ts         # socket.io init + auth middleware, future
│   │   └── errorHandler.ts
│   ├── app.test.ts           # inject, security headers, CORS, and rate limit
│   ├── modules/
│   │   ├── auth/             # routes, service, repository per domain
│   │   │   ├── auth.routes.ts      # imports api defs from @borobiya/shared
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.controller.ts
│   │   │   └── auth.test.ts
│   │   ├── user/
│   │   ├── admin/
│   │   ├── sos/              # requests, proposals, missions, ratings
│   │   ├── location/
│   │   ├── search/
│   │   └── public/
│   ├── db/
│   │   ├── schema.ts         # drizzle/prisma schema (PostGIS types)
│   │   ├── migrate.ts
│   │   ├── seed.ts           # security_questions (15), cancellation_reasons, admin user
│   │   └── client.ts         # postgres pool
│   ├── jobs/
│   │   ├── cron.ts            # node-cron entry
│   │   ├── expireShares.ts
│   │   ├── pruneHistory.ts
│   │   └── expireSos.ts
│   ├── realtime/
│   │   ├── rooms.ts
│   │   ├── events.ts          # typed emit helpers
│   │   └── heartbeat.ts
│   ├── lib/
│   │   ├── hash.ts           # argon2 wrapper + normalizeAnswer()
│   │   ├── jwt.ts
│   │   └── geo.ts            # ST_Distance helpers
│   └── types/
│       └── fastify.d.ts      # augment FastifyRequest.user
├── drizzle.config.ts / prisma/schema.prisma
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── Dockerfile
```

**Naming:**
- Routes: `*.routes.ts` (km-api descriptor + handler wiring).
- Service: pure logic, takes DB client as arg.
- Repository: SQL queries (if not using ORM directly).
- No barrel that hides circular deps — import explicit.

---

## 5. `packages/client` — Vue + Ionic

```text
packages/client/
├── package.json              # name: "@borobiya/client"
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── router/
│   │   └── index.ts          # prefix-based guards (_auth/_public/_user/_admin)
│   ├── stores/               # Pinia
│   │   ├── auth.ts
│   │   ├── theme.ts          # dark/light + map style
│   │   ├── map.ts
│   │   ├── location.ts
│   │   ├── sos.ts
│   │   └── index.ts
│   ├── composables/
│   │   ├── useAuth.ts
│   │   ├── useMap.ts         # MapLibre init + setStyle + fitBounds
│   │   ├── useGeolocation.ts # VueUse + Capacitor Geolocation
│   │   ├── useSocket.ts
│   │   ├── useNavigation.ts  # pitch/bearing per profile
│   │   └── usePriorityDevice.ts
│   ├── views/
│   │   ├── _auth/
│   │   │   ├── Login.vue
│   │   │   ├── Register.vue
│   │   │   ├── ForgotPassword.vue
│   │   │   └── CompleteSecurityQuestions.vue
│   │   ├── _public/
│   │   │   ├── Landing.vue
│   │   │   └── Health.vue
│   │   ├── _user/
│   │   │   ├── Dashboard.vue
│   │   │   ├── Map.vue
│   │   │   ├── LocationShares.vue
│   │   │   ├── SosHistory.vue
│   │   │   ├── Settings.vue
│   │   │   └── Devices.vue
│   │   └── _admin/
│   │       ├── Dashboard.vue
│   │       ├── Users.vue
│   │       ├── Categories.vue
│   │       ├── Incidents.vue
│   │       └── Dispatch.vue
│   ├── components/
│   │   ├── common/           # AppBar, BottomSheet, ThemeToggle
│   │   ├── map/              # MapCanvas.vue, MarkerCluster.vue, RoutePolyline.vue
│   │   ├── sos/              # SosButton.vue, SosForm.vue, ProposalCard.vue, MissionTimeline.vue
│   │   └── location/         # ShareDialog.vue, PriorityDeviceModal.vue, TimeSlider.vue
│   ├── lib/
│   │   ├── api.ts            # axios/bun fetch wrapper + Zod parse + refresh retry
│   │   ├── socket.ts         # socket.io-client singleton
│   │   └── mapStyles.ts      # light/dark import
│   ├── assets/
│   │   ├── icons/            # SVG only (vector)
│   │   └── sprites/
│   ├── styles/
│   │   ├── tailwind.css
│   │   └── vuetify-theme.ts
│   └── generated/            # (gitignored) zopia output → zod.ts
├── public/
│   └── favicon.svg
├── index.html
├── vite.config.ts            # vue + vuetify + tailwind + @ path alias + proxy to :3000/:8000
├── capacitor.config.ts
├── tsconfig.json
├── tailwind.config.js
└── ionic.config.json
```

**Ionic specifics:**
- `capacitor.config.ts` points to `dist/` after `vite build`.
- Plugins: `@capacitor/geolocation`, `@capacitor/camera`, `@capacitor/preferences` (for tokens).
- Android folder at `android/` after `npx cap add android` — gitignored initially, committed after first build.

---

## 6. `map-server/` — Independent Vector Tiles

```text
map-server/
├── README.md
├── docker-compose.map.yml    # optional separate compose
├── martin-config.yaml        # sources: pmtiles/mbtiles + postgis
├── styles/
│   ├── light.json            # MapLibre style — same sources, light paint
│   ├── dark.json
│   ├── sprites/              # icon sprite sheet + json
│   └── glyphs/               # font pbf glyphs {fontstack}/{range}.pbf
├── osrm/
│   ├── profiles/             # car.lua, bicycle.lua, foot.lua
│   ├── prepare.sh            # osrm-extract + partition + customize
│   └── data/                 # (gitignored) *.osrm*
├── photon/
│   ├── photon.json
│   └── data/                 # (gitignored) ES index
├── scripts/
│   ├── generate-tiles.sh     # planetiler/tippecanoe pipeline
│   ├── build-routing.sh
│   ├── build-geocode.sh
│   └── update.sh             # orchestrates all + version stamp
├── Dockerfile                # optional custom Martin image
└── data/                     # (gitignored) downloaded OSM PBFs
```

---

## 7. Root Config Files

| File | Purpose |
|------|---------|
| `.env.example` | Documented env vars (see Appendix §24.1 of spec) |
| `docker-compose.yml` | api + postgres + map-server + nginx + optional redis |
| `.gitignore` | See §10 below |
| `lefthook.yml` | pre-commit: lint + typecheck; pre-push: test + build |
| `tsconfig.json` | Strict shared TypeScript defaults and explicit `@shared/*`, `@client/*`, and `@server/*` aliases; package configs define their own source includes |
| `package.json` | Workspaces + root scripts |

`.env.example` must include (per spec §3.5 + §17.2 + §24.1):

```env
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
DATABASE_URL=postgresql://borobiya:change-me@localhost:5432/borobiya
JWT_SECRET=replace-with-a-random-secret-of-at-least-32-characters
JWT_REFRESH_SECRET=replace-with-a-different-random-secret-of-at-least-32-characters
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
LOCATION_HISTORY_RETENTION_DAYS=90
LOCATION_HISTORY_MAX_SHARE_DAYS=30
MAP_SERVER_URL=http://localhost:8000
MAP_REGION=tehran
MAP_BBOX=51.0,35.5,51.7,35.9
MAP_DATA_VERSION=development
VITE_API_URL=/api
VITE_MAP_URL=/map
```

---

## 8. Database Migrations

- Tool: **Drizzle Kit** or **Prisma Migrate** (decision logged in ARCHITECTURE ADR).
- Folder: `packages/server/migrations/` or `prisma/migrations/`.
- Seed: `packages/server/src/db/seed.ts` — 15 security questions, cancellation reasons, default admin.

---

## 9. Naming Conventions

| What | Convention | Example |
|------|------------|---------|
| Files (TS/Vue) | kebab-case or PascalCase for components | `auth.service.ts`, `SosButton.vue` |
| Variables/functions | camelCase | `priorityDeviceId` |
| Constants/ENV | UPPER_SNAKE | `LOCATION_HISTORY_RETENTION_DAYS` |
| DB columns | snake_case | `cancellation_reason_id` |
| API routes | kebab, prefix `_auth/_public/_user/_admin` | `/_user/sos/requests` |
| Zod schemas | `xxxSchema` | `loginSchema` |
| Inferred types | `XxxInput` / `Xxx` | `LoginInput` |
| Commit | `feat/fix/docs: ...` | `feat: add dispatch endpoint` |
|Branch | `feat/xxx`, `fix/xxx`, `arena/…` | `arena/071fb407-borobiya` |

---

## 10. `.gitignore` Essentials

```gitignore
node_modules/
dist/
.mtiles/
.pmtiles
*.osrm*
.env
.env.local
data/maps/
map-server/tiles/
map-server/data/
android/
packages/client/src/generated/
coverage/
```

---

## 11. Path Aliases (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["packages/shared/src/*"],
      "@client/*": ["packages/client/src/*"],
      "@server/*": ["packages/server/src/*"]
    }
  }
}
```

The explicit aliases map one workspace at a time; a broad `@/*` mapping is intentionally avoided because it is ambiguous. Vite mirrors these aliases with `resolve.alias`.

---

## 12. Implementation Checklist for Init

- [ ] `mkdir -p packages/{shared,server,client} map-server/{styles,osrm,photon} data/maps docs/DIAGRAMS`
- [ ] `bun init` at root + each package
- [ ] Copy `.env.example` from ARCHITECTURE appendix
- [ ] Add `docker-compose.yml` (4 services)
- [ ] Commit `docs/` first (this PR)

