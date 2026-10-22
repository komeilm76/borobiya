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
│   ├── server/               # Fastify API with database-backed auth/account routes
│   └── client/               # Vue + Vuetify + Tailwind + Pinia + VueUse + MapLibre
│
├── map-server/
│   ├── README.md             # map-server setup and runtime-data status
│   ├── scripts/              # region catalog, source/crop pipeline, library manager, Planetiler reference-layer fetcher, verifiers
│   ├── routing-gateway/      # route/geocoding adapter and map-config endpoint
│   ├── styles/, sprites/, fonts/ # committed MapLibre assets
│   └── photon/               # Photon Dockerfile; release JAR is ignored
│
├── docker-compose.yml        # API, PostGIS, map stack, and local gateway
├── nginx.conf                # local HTTP gateway for /api, /docs, /map, and map APIs
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
    ├── app.ts                # creates Fastify app; health/catalog, auth/session/recovery, admin list/detail/create/status, the incident-type catalog and responder categories, profile, onboarding, user search, and the live-location surface are live
    ├── app.test.ts           # Fastify inject/security/CORS/rate-limit/OpenAPI tests
    ├── server.ts             # validates environment and listens
    ├── admin/
    │   ├── users.ts          # current-admin auth, user list/detail/create/status handlers
    │   ├── users.test.ts     # admin auth, list/detail, creation, status, state, and conflict tests
    │   ├── authorize.ts      # the admin identity check the other admin route files share (token → live session → role/state)
    │   ├── incidents.ts      # incident-type catalog: ordered list, create with a derived-or-explicit slug, rename/clear; 409 names the type holding the slug
    │   ├── incidents.test.ts # auth, ordering/no-store, slug-rule refusals and conflicts, blank-description folding, audit-on-change-only tests
    │   ├── categories.ts     # responder categories: list, create/update with the incident-type set, assign and remove members
    │   ├── categories.test.ts# set-replacement semantics, unknown-id issues, 404-vs-400 split, and no-audit-on-no-op tests
    │   └── normalize.ts      # the blank-to-NULL and zod-issue rules both catalog route files share, kept in one place
    ├── config/
    │   ├── env.ts            # host, port, DB URL syntax, JWT secrets, CORS, rate limits
    │   └── env.test.ts
    ├── auth/
    │   ├── login.ts          # login route, JWTs, refresh cookie, and IP+username limit
    │   ├── login.test.ts     # token/session/account-status regression tests
    │   ├── devices.ts        # GET /_user/devices: live-session device list for the Active Devices table
    │   ├── devices.test.ts   # payload mapping, fail-closed guard, empty list, and cap tests
    │   ├── device-label.ts   # human device labels: client-supplied name, User-Agent summary, bounds
    │   ├── device-label.test.ts # browser/platform recognition and truncation cases
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
    ├── location/
    │   ├── shares.ts         # live-share create, revoke, and active list handlers for /_user/location, plus priority-device resolution and the shared recipient-issue mapping
    │   ├── history.ts        # the whole `/_user/location/history` surface: grant creation with its ENV range bound and batched recipient rules, the windowed owner and receiver reads, the grant lists, and the delete
    │   ├── history.test.ts   # auth guard, range limit, recipient batch rules, contract bounds, window resolution, no-leak 404s, and store call shapes
    │   ├── shares.test.ts    # creation, validation, idempotence, revoke, list, and guard tests
    │   ├── live.ts           # shared broadcast service: throttle-independent validation, priority-device rule, fix persistence, peer selection + REST fallback route
    │   ├── live.test.ts      # service rules and REST fallback status/ack tests
    │   ├── jobs.ts           # in-process maintenance timers: expire overdue shares and repair stale priority pins (1m) and prune history past retention (daily, batched)
    │   └── jobs.test.ts      # batching, cadence, failure isolation, and no-overlap tests
    ├── users/
    │   ├── search.ts         # GET /_user/users/search: term-bounded username search with the filters this build can honor, and a refusal for the ones it cannot
    │   └── search.test.ts    # required term, refused filters, cleared controls, filter mapping, coordinate pairing, and page/total mapping
    ├── realtime/
    │   ├── socket.ts         # Socket.IO server: handshake auth, rooms, location:update handling, per-connection throttle
    │   └── socket.test.ts    # handshake rejection codes, room fan-out, priority-device, and throttle tests
    ├── db/
    │   ├── client.ts         # Drizzle/Postgres.js factory used by runtime handlers
    │   ├── admin-user-store.ts # current-admin checks, user list/detail, status transactions, session revocation, audit writes
    │   ├── admin-user-store.test.ts # list/detail, persistence/default/conflict, and status/audit assertions
    │   ├── incident-type-store.ts # catalog list/create/update in one transaction, unique-slug conflict reads, and audit rows
    │   ├── category-store.ts # category CRUD, the incident-type link set, and member assignment/removal on the pivots
    │   ├── incident-type-store.test.ts # rendered SQL for the conflict lookup and set replacement, plus PGlite-backed behavior cases
    │   ├── category-store.test.ts  # links/membership queries, no-op detection, and the two-category-per-account case
    │   ├── device-store.ts   # live-session reads for the Active Devices table (never selects the token hash)
    │   ├── login-store.ts    # credential lookup and persisted refresh sessions
    │   ├── recovery-store.ts # persisted recovery challenges, reset tokens, and atomic reset
    │   ├── location-history-store.ts # grant creation with the duplicate window rule, grant lists and delete, windowed reads sampled inside the query, fix persistence, and the batched retention prune — one transaction per fix: PostGIS users.last_location upsert + location_history insert
    │   ├── location-share-store.ts # share-target classification, atomic creation/reuse with the pinned device, owner-only revocation, active share lists, and stale-pin repair
    │   ├── location-share-store.test.ts # classification, insert, reuse, revoke, timed-extension, and list-mapping assertions
    │   ├── owner-lock.ts     # the per-owner transaction-scoped advisory lock used by both share stores, so concurrent requests never race a unique index
    │   ├── user-search-store.ts # partial username match over reachable accounts with rating/online filters, session-derived liveness, and PostGIS distance in kilometres
    │   ├── user-search-store.test.ts # escaped patterns, parameter order, the position fallback, and page/count mapping
    │   ├── security-questions-store.ts # user profile/state, question catalog, and atomic onboarding persistence
    │   ├── security-questions-store.test.ts # onboarding persistence contract assertions
    │   ├── registration-store.ts # username/question queries and atomic user/answer write
    │   ├── schema.ts         # auth, user-state, PostGIS location, session, cancellation-reason, audit, location share/history, incident-type catalog, responder-category, and `sos_requests` tables
    │   ├── schema.test.ts    # Drizzle user-column, PostGIS, catalog-constraint, and migration-text assertions (0010–0012 included)
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
        ├── security.ts       # Helmet, CORS allowlist, global rate limit, no-store default
        ├── error-envelope.ts # one sanitized envelope for failures no handler answered
        ├── error-envelope.test.ts
        └── swagger.ts        # OpenAPI contract catalog and Swagger UI/runtime status
```

Fastify creates a PostgreSQL client for the registration, login/session, recovery, admin, onboarding, device, user-search, location share/history, incident-catalog, and responder-category stores; queries run on demand. Migrations and the idempotent seed command remain explicit developer operations and are not run at startup. Public health/security-question catalog, T1.2.1–T1.2.7 auth/session/recovery/admin-create/profile/onboarding handlers, and T1.3.1–T1.3.2 admin status/list/detail handlers are live with their relevant contracts. Status changes, refresh-session revocation on deactivation, and the audit insert are transactional. Admin list filters and device detail use current tables. The incident-type catalog and responder categories are live end to end (T3.1.2–T3.1.3) and nothing is seeded for them: an installation starts with an empty catalog by design, because default categories would assign responder groups nobody chose. User search still cannot report `hasCategory=true` and `GET /_user/map` search still refuses `category=`, because no read projects category membership into a profile yet — that projection is the other half of T3.1.4. SOS, missions, and geocoding handlers remain unwired. The app-scoped `/_user` hook also guards the Phase 2 share routes, so an inactive, suspended, revoked-session, or unfinished-onboarding account cannot create a share. Realtime (`location:update` with its REST fallback), the history grant and read surface, username user search, and the maintenance timers (share expiry, stale-pin repair, history retention prune) are present; the remaining admin/domain handlers (SOS, missions, geocoding and the rest of search) are not.

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
│   ├── theme-init.js         # synchronous pre-paint theme selection
│   └── map-cache-worker.js   # network-first cache for same-origin map resources
└── src/
    ├── main.ts               # Vue + Pinia + router + theme bootstrap + map cache registration
    ├── App.vue               # shared shell, session bootstrap, theme menu, and logout control
    ├── env.d.ts
    ├── api/
    │   ├── http.ts           # same-origin JSON requests and structured API errors
    │   ├── http.test.ts
    │   ├── error-message.ts  # localized auth/API errors
    │   ├── security-questions.ts # cached public question catalog
    │   ├── map-config.ts     # same-origin validated map settings
    │   ├── admin-users.ts    # typed admin user list and status calls
    │   ├── location.ts       # share create/revoke/list, history grants, both history reads, picker search
    │   ├── location.test.ts
    │   ├── devices.ts        # GET /_user/devices, the only ids the priority rule accepts
    │   └── devices.test.ts
    ├── components/
    │   ├── map/
    │   │   ├── MapCanvas.vue # MapLibre canvas, outage toast/retry, and cache-aware lifecycle
    │   │   ├── HistoryPlaybackPanel.vue # range presets, hand-typed window, transport, scrub slider
    │   │   ├── LiveCompanionPanel.vue # who is on the map, how old each position is, and why it might be empty
    │   │   └── map-canvas-options.ts # map defaults, runtime bounds/zoom, and theme/style helpers
    │   ├── settings/
    │   │   └── DevicePriorityPanel.vue # live-session table + per-share priority chooser
    │   └── sharing/
    │       ├── ShareDialog.vue # recipient picker, timed/permanent modes, device chooser
    │       └── ShareLists.vue  # My Shares / Shared With Me / history grants, confirm-to-revoke
    ├── router/
    │   ├── index.ts          # namespaced routes and auth-guard wiring
    │   ├── guards.ts         # guest-only, authenticated, admin, and onboarding redirects
    │   ├── guards.test.ts
    │   └── index.test.ts
    ├── services/
    │   ├── map-cache.ts      # Service Worker registration/activation for map requests
    │   ├── map-cache-worker.test.ts
    │   ├── socket-options.ts # same-origin Socket.IO path and handshake auth options
    │   ├── socket-options.test.ts
    │   ├── socket-events.ts  # the realtime event names, in a module that imports nothing
    │   └── socket.ts         # lazily connected realtime client with token rotation and close()
    ├── stores/
    │   ├── index.ts          # Pinia instance
    │   ├── auth.ts           # in-memory access token, refresh-cookie restoration, user state
    │   ├── auth.test.ts
    │   └── theme.ts          # persisted theme preference and system-change synchronization
    ├── device/
    │   ├── capacitor.ts      # the only Capacitor import in the client, behind a lazy platform probe
    │   ├── capacitor.test.ts
    │   ├── native-label.ts   # plugin facts → bounded `login.deviceName`, user-assigned name ignored
    │   └── native-label.test.ts
    ├── composables/
    │   ├── use-history-playback.ts # window, cursor, transport loop, and the two history reads
    │   ├── use-history-playback.test.ts
    │   ├── use-live-companions.ts # share bootstrap, peer subscription, connect/disconnect, ageing clock (opens socket.io lazily)
    │   ├── use-live-companions.test.ts
    │   ├── use-device-settings.ts # the two lists, per-minute clock, and the re-pin posts
    │   ├── use-device-settings.test.ts
    │   ├── use-priority-device.ts # "am I the broadcasting device?", derived, never enforced
    │   ├── use-priority-device.test.ts
    │   ├── useSystemTheme.ts # reactive prefers-color-scheme signal
    │   ├── location-broadcast.ts # pure geolocation→payload mapping, 3-5s pacing, and ack parsing
    │   ├── location-broadcast.test.ts
    │   ├── device-identity.ts # this session's deviceId read from its own access token
    │   ├── useLiveLocationBroadcast.ts # geolocation watch + throttled location:update over Socket.IO
    │   ├── use-target-search.ts # 300ms picker debounce, aborts, and stale-response guard
    │   └── use-target-search.test.ts
    ├── history/
    │   ├── playback.ts       # frames, interpolation, sampled window rules, GeoJSON + style descriptors
    │   ├── playback.test.ts
    │   ├── playback-map-sync.ts # the lookup that names playback's three collections for the shared planner
    │   └── playback-map-sync.test.ts
    ├── live/                 # live companion markers (T2.1.8)
    │   ├── companion-locations.ts # peer registry as the allow-list, forward-only fixes, staleness, GeoJSON + style descriptor + copy
    │   └── companion-locations.test.ts
    ├── settings/
    │   ├── priority-device.ts # repin bodies that cannot extend an expiry, device rows, refusal copy
    │   └── priority-device.test.ts
    ├── map/                  # the rules every client-drawn map overlay shares
    │   ├── overlay-sync.ts   # structural GeoJSON, the source/layer descriptors, the sync/removal plans (maplibre is never imported here)
    │   └── overlay-sync.test.ts
    ├── sharing/
    │   ├── share-form.ts     # share draft rules: validation, payloads, 409 devices, refusal + duration words
    │   └── share-form.test.ts
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
        ├── _user/UserDashboardView.vue # responsive dashboard with map widget
        ├── _user/UserDevicesView.vue   # Active Devices and the priority-device chooser (spec §7.3)
        ├── _user/UserMapView.vue       # full-height theme-aware MapLibre view + playback wiring
        ├── _user/PlaceholderView.vue
        └── _admin/PlaceholderView.vue
```

Login, registration, recovery, onboarding, and the corresponding route guards are live in the client. The reusable MapLibre canvas loads same-origin local styles, applies validated runtime bounds/zoom settings, supports reactive diff-based light/dark changes, and reports server failures with cached-resource fallback/retry. The app-wide theme menu synchronizes Vuetify, Tailwind's manual `dark:` variant, persisted system/light/dark preference, and the operating-system preference; a synchronous head script applies the initial theme before the app bundle. The protected user map and dashboard now compose the canvas, follow the resolved app theme, and provide routes between the full-height map and dashboard widget. The dashboard also owns the sharing surface: `ShareLists` reads both directions of `GET /_user/location/shares` (plus history grants) and `ShareDialog` writes `POST /_user/location/share` through the picker, with the priority-device chooser standing behind the server's `409`. Following the repository's client convention, the decisions live in pure modules (`sharing/share-form.ts`, `composables/use-target-search.ts`, `api/location.ts`) that are unit-tested, while the `.vue` files only render and dispatch. Device detection lives in `src/device/`: `capacitor.ts` probes the native shell lazily (the only place `@capacitor/core` / `@capacitor/device` are imported, and the plugin itself is loaded only when the shell exists) and `native-label.ts` maps the plugin's facts into the bounded `login.deviceName` the Active Devices table shows, while `composables/use-priority-device.ts` answers the same question for any screen that needs it. History playback is live on the map (`components/map/HistoryPlaybackPanel.vue` renders `composables/use-history-playback.ts`, and the view paints through `history/playback-map-sync.ts`). `/_user/devices` is the Active Devices screen: `settings/priority-device.ts` builds the one write that re-points a share without touching its expiry, and `components/settings/DevicePriorityPanel.vue` renders it. Routing and Android packaging remain future work. Live companion markers arrived with T2.1.8: `live/companion-locations.ts` decides who may appear (the share list is the allow-list), when a dot is stale, and that a position never moves backwards; `composables/use-live-companions.ts` owns the socket and the ageing clock; and `UserMapView.vue` paints both overlays through `map/overlay-sync.ts`, where the maplibre ordering rules now live once. The client opens `socket.io-client` lazily so the map route does not carry 42 kB of transport, and the panel rather than the map carries the words: ages, accuracy, and the reason an empty map is empty.

---

## 6. `map-server/` — Independent Vector Tiles

```text
map-server/
├── README.md                 # map-server setup and runtime-data status
├── martin.yaml               # Martin's PMTiles, style, sprite, and font configuration
├── styles/                   # committed light/dark MapLibre styles
├── sprites/                  # committed SVG source artwork for Martin sprites
├── fonts/                    # licensed TTFs and provenance
├── scripts/                  # region catalog, source/crop pipeline, library manager, Planetiler reference-layer fetcher, verifiers
├── routing-gateway/          # route/geocoding adapter, public map config, and tests
└── photon/                   # Photon Dockerfile; versioned JAR is ignored

# Runtime map content is stored outside the checkout by default:
<MAP_LIBRARY_DIR>/              # sources, crops, merged dataset, PMTiles, OSRM, Photon index
```

Compose runs Martin 1.16.1 from the read-only active dataset directory in `MAP_DATASET_DIR`, with committed styles, SVG sprites, licensed fonts, and `martin.yaml`. Routing gateway, three optional OSRM profile services, Photon, and the import-only Nominatim service are configured; generated PMTiles, graphs, and Photon index are intentionally not committed and are built in the external map library. T1.4.7's cache/reuse, safe cache-clear, and whole-country/city-crop selection implementation is complete. The original Tehran pipeline passed tile/routing/geocoding acceptance on the target VM on 2026-10-20; the user reports successful setup and core app/map tests on Ubuntu 24.04 on 2026-10-21. A dedicated external-Internet-offline library acceptance run remains a non-blocking operational follow-up per the user's decision; see [`PROGRESS.md`](./PROGRESS.md), [`MAP_SERVER.md`](./MAP_SERVER.md), and [`MAP_LIBRARY.md`](./MAP_LIBRARY.md).

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

Use the root [`.env.example`](../.env.example) as the source of truth for the complete template. The API requires a valid PostgreSQL URL string and distinct non-placeholder JWT secrets at startup. Auth, recovery, session, onboarding, and user/admin account routes use the database on demand; migrations and seeds are explicit operations, not automatic startup steps.

---

## 8. Database Migrations

- ORM selected for this project: Drizzle ORM with the Postgres.js driver; decision rationale is in [`ARCHITECTURE.md` ADR-011](./ARCHITECTURE.md#adr-011--drizzle-orm--postgresjs).
- Drizzle migrations cover `users`, `security_questions`, `user_security_answers`, `user_sessions`, and (in T1.1.3) `cancellation_reasons`; T1.1.4 enables PostGIS and adds user-state/rating/location fields plus a GiST index. Phase 2 adds `location_shares`, then `location_history` and `location_history_shares` (`0007`), the partial index the maintenance sweep seeks over active pinned shares (`0008`), and the point cap stored on a history grant (`0009`), all under `packages/server/drizzle/`.
- `bun --filter @borobiya/server db:generate` generates later schema changes; `bun --filter @borobiya/server db:migrate` explicitly applies pending migrations; `bun --filter @borobiya/server db:seed` inserts reference/bootstrap data. None run by Fastify startup. Database-backed routes include registration/login, refresh/logout, recovery, onboarding, and user/admin account management; SOS, live-location, and mission persistence remain future work.

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

- [x] Bun workspaces, shared contracts, Fastify API, Vue client, and root `bun run dev`
- [x] Compose API/PostGIS/Martin/routing gateway/Nginx plus optional OSRM, Photon, and Nominatim profiles
- [x] Drizzle/Postgres.js schema, checked-in migrations, explicit seeding, Argon2id passwords, and runtime migrator
- [x] Registration/login, refresh/logout, recovery, security-question onboarding, session authorization, and admin account-management routes
- [x] MapLibre canvas, local styles/sprites/fonts, runtime map config, light/dark switching, and map-resource cache fallback
- [x] T1.4.7 map-data cache/reuse, safe cache removal, and whole-country/city-crop area selection (with associated library code/tests)
- [x] Original Tehran tile/routing/geocoding acceptance on the target VM (2026-10-20)
- [ ] P1-G1: external-library Internet-offline acceptance (non-blocking follow-up per user decision 2026-10-21)
- [ ] SOS, live-location sharing, mission workflows, route/search UI, and Android/Capacitor integration
- [ ] Root build/lint scripts, CI, and production TLS/deployment hardening

