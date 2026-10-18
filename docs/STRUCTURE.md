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
  "packageManager": "bun@1.1.0"
}
```

Alternative: use `pnpm`/`npm` workspaces — but Bun is mandated, so `bun workspaces` via `workspaces` field.

---

## 3. `packages/shared` — Contract Package

**Purpose:** No runtime dependency — only Zod schemas + inferred types + km-api route descriptors.

```text
packages/shared/
├── package.json              # name: "@borobiya/shared"
├── src/
│   ├── schemas/
│   │   ├── auth.ts           # loginSchema, registerSchema, forgotSchemas, completeSecurityQuestionsSchema
│   │   ├── user.ts           # userProfileSchema, devicesSchema
│   │   ├── location.ts       # shareSchema, historyShareSchema, locationUpdateSchema
│   │   ├── sos.ts            # sosRequestSchema, dispatchSchema, missionStatusSchema, cancellationSchemas
│   │   ├── admin.ts          # createUserSchema, toggleActiveSchema, categorySchemas, incidentTypeSchemas
│   │   ├── search.ts         # userSearchSchema, geocodeSchemas
│   │   ├── common.ts         # paginationSchema, idSchema, errorSchema
│   │   └── index.ts          # barrel export
│   ├── api/
│   │   ├── auth.routes.ts    # km-api definitions (method, url, schema, meta)
│   │   ├── user.routes.ts
│   │   ├── admin.routes.ts
│   │   ├── public.routes.ts
│   │   ├── sos.routes.ts
│   │   └── index.ts
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
├── package.json              # name: "@borobiya/server", deps: fastify, pg/postgres, drizzle/prisma, socket.io, zod, argon2
├── src/
│   ├── app.ts                # createFastifyApp()
│   ├── server.ts             # entry: listen
│   ├── config/
│   │   ├── env.ts            # zod-validated env (DATABASE_URL, JWT_SECRET, etc.)
│   │   ├── cors.ts
│   │   └── rateLimit.ts
│   ├── plugins/
│   │   ├── auth.ts           # decorate authenticate + authorize(roles)
│   │   ├── swagger.ts        # fastify-swagger + zod-to-json-schema
│   │   ├── socket.ts         # socket.io init + auth middleware
│   │   └── errorHandler.ts
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
| `tsconfig.json` | Root strict config, path alias `@/*` → `packages/*/src` |
| `package.json` | Workspaces + root scripts |

`.env.example` must include (per spec §3.5 + §17.2 + §24.1):

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://borobiya:secret@localhost:5432/borobiya
JWT_SECRET=
JWT_REFRESH_SECRET=
LOCATION_HISTORY_RETENTION_DAYS=90
LOCATION_HISTORY_MAX_SHARE_DAYS=30
RATE_LIMIT_WINDOW_MS=900000
MAP_SERVER_URL=http://localhost:8000
MAP_REGION=tehran
MAP_BBOX=44.0,25.0,63.0,39.0
MAP_DATA_VERSION=2025-05-01
VITE_API_URL=http://localhost:3000
VITE_MAP_URL=http://localhost:8000
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
    "paths": {
      "@/*": ["./packages/*/src/*"],
      "@shared/*": ["./packages/shared/src/*"],
      "@client/*": ["./packages/client/src/*"],
      "@server/*": ["./packages/server/src/*"]
    }
  }
}
```

Vite mirrors with `resolve.alias`.

---

## 12. Implementation Checklist for Init

- [ ] `mkdir -p packages/{shared,server,client} map-server/{styles,osrm,photon} data/maps docs/DIAGRAMS`
- [ ] `bun init` at root + each package
- [ ] Copy `.env.example` from ARCHITECTURE appendix
- [ ] Add `docker-compose.yml` (4 services)
- [ ] Commit `docs/` first (this PR)

