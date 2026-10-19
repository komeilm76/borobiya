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
│   ├── shared/               # Zod schemas + API contracts
│   ├── server/               # Fastify API skeleton; Dockerfile lives here
│   └── client/               # Vue + Vuetify + Tailwind + Pinia + VueUse scaffold
│
├── map-server/
│   ├── README.md             # Runtime data location and current asset limitations
│   └── data/                 # (gitignored; created/populated locally) Martin tile sources
│
├── docker-compose.yml        # api, postgres, map-server, nginx
├── nginx.conf                # local HTTP gateway for /api, /docs, and /map
├── .dockerignore
├── .env.example
├── .env                      # (gitignored) local secrets/config
├── .gitignore
├── package.json              # Bun workspaces + root `dev` orchestration
├── tsconfig.json
└── README.md
```

---

## 2. Monorepo Workspaces (`package.json`)

```json
{
  "name": "borobiya",
  "private": true,
  "packageManager": "bun@1.4.3",
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "bun run --parallel --no-orphans --filter @borobiya/server --filter @borobiya/client dev"
  }
}
```

The root `dev` script uses Bun's built-in parallel workspace runner; it does not add a third-party concurrency dependency. Root build/lint/database/map scripts are not wired yet.

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
├── Dockerfile                # workspace-aware Bun API image
├── drizzle/                  # checked-in SQL migrations, journal, and schema snapshots
├── drizzle.config.ts         # Drizzle Kit schema/migration configuration
├── package.json              # Fastify, Drizzle, Postgres.js, Argon2, jose JWTs, security plugins, and Swagger
├── tsconfig.json
└── src/
    ├── app.ts                # creates Fastify app; health/catalog, auth/session/recovery, admin list/detail/create/status, profile, and onboarding handlers are live
    ├── app.test.ts           # Fastify inject/security/CORS/rate-limit/OpenAPI tests
    ├── server.ts             # validates environment and listens
    ├── admin/
    │   ├── users.ts          # current-admin auth, user list/detail/create/status handlers
    │   └── users.test.ts     # admin auth, list/detail, creation, status, state, and conflict tests
    ├── config/
    │   ├── env.ts            # host, port, DB URL syntax, JWT secrets, CORS, rate limits
    │   └── env.test.ts
    ├── auth/
    │   ├── login.ts          # login route, JWTs, refresh cookie, and IP+username limit
    │   ├── login.test.ts     # token/session/account-status regression tests
    │   ├── register.ts       # registration route, Argon2id hashing, and IP+username limit
    │   ├── register.test.ts  # registration behavior/rate-limit regression tests
    │   ├── rate-limit.ts     # bounded per-IP+username limiter key generation
    │   ├── rate-limit.test.ts # bounded-key regression tests
    │   ├── session.ts        # refresh rotation and logout routes
    │   ├── user-security-questions.ts # user auth guard, GET /_user/me, and onboarding completion
    │   ├── user-security-questions.test.ts # profile, guard, validation, hashing, and completion tests
    │   ├── forgot-password.ts # server-selected recovery challenges and reset flow
    │   ├── recovery-decoys.ts # keyed stable decoy pool for non-enumerable recovery requests
    │   └── recovery-decoys.test.ts
    ├── db/
    │   ├── client.ts         # Drizzle/Postgres.js factory used by runtime handlers
    │   ├── admin-user-store.ts # current-admin checks, user list/detail, status transactions, session revocation, audit writes
    │   ├── admin-user-store.test.ts # list/detail, persistence/default/conflict, and status/audit assertions
    │   ├── login-store.ts    # credential lookup and persisted refresh sessions
    │   ├── recovery-store.ts # persisted recovery challenges, reset tokens, and atomic reset
    │   ├── security-questions-store.ts # user profile/state, question catalog, and atomic onboarding persistence
    │   ├── security-questions-store.test.ts # onboarding persistence contract assertions
    │   ├── registration-store.ts # username/question queries and atomic user/answer write
    │   ├── schema.ts         # auth, user-state, PostGIS location, session, cancellation-reason, audit tables
    │   ├── schema.test.ts    # Drizzle user-column and PostGIS migration assertions
    │   ├── seed.ts           # transactional, idempotent reference/admin seeder
    │   ├── seed-config.ts    # production-safe bootstrap password policy
    │   ├── seed-data.ts      # Persian questions and localized cancellation reasons
    │   └── seed-data.test.ts
    ├── security/
    │   ├── password.ts      # Argon2id hash/verify helpers
    │   ├── password.test.ts
    │   ├── tokens.ts        # HS256 access/refresh JWT signing and verification
    │   └── tokens.test.ts   # token use, expiry, claim, and legacy-claim checks
    └── plugins/
        ├── security.ts       # Helmet, CORS allowlist, global rate limit
        └── swagger.ts        # OpenAPI contract catalog and Swagger UI/runtime status
```

Fastify creates a PostgreSQL client for the registration, login/session, recovery, admin, and onboarding stores; queries run on demand. Migrations and the idempotent seed command remain explicit developer operations and are not run at startup. Public health/security-question catalog, T1.2.1–T1.2.7 auth/session/recovery/admin-create/profile/onboarding handlers, and T1.3.1–T1.3.2 admin status/list/detail handlers are live with their relevant contracts. Status changes, refresh-session revocation on deactivation, and the audit insert are transactional. Admin list filters and device detail use current tables; category membership and missions remain empty until their later domain migrations. The onboarding auth hook is ready for future `/_user` handlers; remaining user/admin/domain handlers, realtime, and background jobs are not present yet.

---

## 5. `packages/client` — Vue + Vuetify

```text
packages/client/
├── package.json              # name: "@borobiya/client"; Vue 3, Vuetify, Tailwind, Pinia, VueUse, Zopia
├── README.md
├── index.html                # Persian-first RTL document shell
├── vite.config.ts            # Vue/Vuetify/Tailwind, @/client/shared aliases, same-origin API/map proxies
├── scripts/
│   └── generate-api.ts       # fetches /docs/json and runs Zopia
├── tsconfig.json
├── public/
│   ├── favicon.svg
│   └── theme-init.js         # synchronous pre-paint theme selection
└── src/
    ├── main.ts               # Vue + Pinia + router + synchronized Vuetify theme bootstrap
    ├── App.vue               # shared shell, session bootstrap, theme menu, and logout control
    ├── env.d.ts
    ├── api/
    │   ├── http.ts           # same-origin JSON requests and structured API errors
    │   ├── http.test.ts
    │   ├── error-message.ts  # localized auth/API errors
    │   ├── security-questions.ts # cached public question catalog
    │   └── map-config.ts     # same-origin validated map settings
    ├── components/
    │   └── map/
    │       ├── MapCanvas.vue # MapLibre canvas, Tehran default, reactive diff-based light/dark styles
    │       └── map-canvas-options.ts # map options, runtime bounds/zoom, and style switch helper
    ├── router/
    │   ├── index.ts          # namespaced routes and auth-guard wiring
    │   ├── guards.ts         # guest-only, authenticated, admin, and onboarding redirects
    │   ├── guards.test.ts
    │   └── index.test.ts
    ├── stores/
    │   ├── index.ts          # Pinia instance
    │   ├── auth.ts           # in-memory access token, refresh-cookie restoration, user state
    │   ├── auth.test.ts
    │   └── theme.ts          # persisted theme preference and system-change synchronization
    ├── composables/
    │   └── useSystemTheme.ts # reactive prefers-color-scheme signal
    ├── theme/
    │   ├── theme-preference.ts # theme persistence and system/light/dark resolution
    │   ├── theme-preference.test.ts
    │   └── theme-init.test.ts # pre-paint bootstrap coverage
    ├── plugins/
    │   └── vuetify.ts        # Persian locale, RTL, initial light/dark palette
    ├── styles/
    │   ├── tailwind.css      # manual dark variant + app shell light/dark styling
    │   └── auth.css          # responsive light/dark authentication and onboarding layouts
    └── views/
        ├── PlaceholderPage.vue
        ├── _auth/LoginView.vue
        ├── _auth/RegisterView.vue
        ├── _auth/ForgotPasswordView.vue
        ├── _auth/PlaceholderView.vue
        ├── _public/PlaceholderView.vue
        ├── _user/CompleteSecurityQuestionsView.vue
        ├── _user/PlaceholderView.vue
        └── _admin/PlaceholderView.vue
```

Login, registration, recovery, onboarding, and the corresponding route guards are live in the client. The reusable MapLibre canvas loads the local light style, applies validated runtime bounds/zoom settings, and supports reactive diff-based light/dark style changes on the same map instance. The app-wide theme menu synchronizes Vuetify, Tailwind's manual `dark:` variant, persisted system/light/dark preference, and the operating-system preference; a synchronous head script applies the initial theme before the app bundle. Full map/dashboard views, graceful map-server degradation, Capacitor, and Android packaging remain future work.

---

## 6. `map-server/` — Independent Vector Tiles

```text
map-server/
├── README.md                 # map-server setup and runtime-data status
├── martin.yaml               # Martin's PMTiles, style, sprite, and font configuration
├── styles/                   # committed light/dark MapLibre styles
├── sprites/                  # committed SVG source artwork for Martin sprites
├── fonts/                    # licensed TTFs and provenance
├── scripts/                  # tile, routing, and asset verification/build scripts
├── routing-gateway/          # project POST /route adapter and tests
├── data/                     # local generated PMTiles; ignored by Git
└── osrm/data/                # local car/bicycle/foot OSRM graphs; ignored by Git
```

Compose runs Martin 1.16.1 against the read-only `map-server/data/` bind mount and PostGIS. Committed light/dark styles, SVG sprite sources, Noto Sans/Noto Naskh Arabic fonts, and `martin.yaml` configure the style runtime. The ignored PMTiles archive is not generated. Compose also defines three optional OSRM profile services plus a project-contract routing gateway; the OSRM graphs are not generated, and the real offline route test remains pending an approved PBF and Docker/OSRM runtime. See [`MAP_SERVER.md`](./MAP_SERVER.md) for the design and runbook; Photon is not configured yet.

---

## 7. Root Config Files

| File | Purpose |
|------|---------|
| `.env.example` | Local API and Compose environment template; copy to ignored `.env` |
| `.dockerignore` | Excludes secrets, dependencies, build output, and map datasets from image contexts |
| `docker-compose.yml` | `api`, `postgres`, `map-server`, routing gateway, optional OSRM profile services, and `nginx`; no Redis service |
| `nginx.conf` | Local HTTP proxy for `/api/`, `/docs`, `/map/`, `/map-config`, and `/route` |
| `.gitignore` | Excludes local secrets, generated output, and large map data |
| `tsconfig.json` | Strict shared TypeScript defaults and explicit workspace aliases |
| `package.json` | Workspaces + root `dev` script |

`.env.example` includes API validation settings plus these Compose variables: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `API_PORT`, `MAP_SERVER_PORT`, and `NGINX_PORT`. The sample JWT/Postgres values are placeholders and must be changed outside local scaffolding.

Use the root [`.env.example`](../.env.example) as the source of truth for the complete template. The API requires a valid PostgreSQL URL string and distinct non-placeholder JWT secrets at startup. Registration queries open database connections on demand; migrations and seeds are not automatic.

---

## 8. Database Migrations

- ORM selected for this project: Drizzle ORM with the Postgres.js driver; decision rationale is in [`ARCHITECTURE.md` ADR-011](./ARCHITECTURE.md#adr-011--drizzle-orm--postgresjs).
- Drizzle migrations cover `users`, `security_questions`, `user_security_answers`, `user_sessions`, and (in T1.1.3) `cancellation_reasons`; T1.1.4 enables PostGIS and adds user-state/rating/location fields plus a GiST index under `packages/server/drizzle/`.
- `bun --filter @borobiya/server db:generate` generates later schema changes; `bun --filter @borobiya/server db:migrate` explicitly applies pending migrations, and `bun --filter @borobiya/server db:seed` inserts reference/bootstrap data. None run by Fastify startup; runtime database access currently supports registration and login sessions.

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

## 12. Foundation Status

- [x] Bun workspaces, shared contracts, Fastify skeleton, and Vue client scaffold
- [x] Root `bun run dev` orchestration for API + client
- [x] Docker Compose services (`api`, `postgres`, `map-server`, `nginx`) and local gateway config
- [x] `.env.example`, `.gitignore`, and Docker build exclusions
- [x] Drizzle/Postgres.js decision, schema/migrations, seed data, and Argon2id bootstrap
- [x] Registration handler with database-backed persistence and Argon2id hashes
- [x] Login handler with Argon2id verification, 15m/7d JWT issuance, session persistence, and rate limiting
- [ ] Refresh/logout, recovery, and remaining auth/domain handlers
- [ ] Map tile/style/routing/geocoding data and generation pipeline
- [ ] Root build/lint scripts, CI, and production TLS/deployment hardening

