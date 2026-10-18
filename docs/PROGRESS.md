# Borobiya — Progress

> Track % done per feature, blockers, changelog. Update in every PR alongside `TASKS.md`.

---

## Overall: 17% — Phase 1 Foundation underway (2026-10-18)

The documentation baseline, first seven foundation tasks, and the initial Drizzle schema/migration/seed/user-state tasks are complete. Shared schemas, route contracts, a validated Fastify skeleton with an OpenAPI contract catalog, a Persian-first Vue client shell, root API/client orchestration, and a local Compose service stack now exist; only the health handler is live, while domain handlers, API database integration, map assets, feature views, and product functionality remain unimplemented. Percentages are milestone estimates, not a count of source lines.

| Area | % | Status |
|------|---|--------|
| Documentation (`docs/`) | 100% | ✅ 12 docs + 4 diagrams authored; manual screenshots remain placeholders |
| Monorepo scaffold | 100% | ✅ T1.0.1–T1.0.7 complete; root dev orchestration and local Compose service scaffold are in place |
| Auth & Users | 0% | ⬜ Account-state, session, security-question, cancellation-reason, and PostGIS location schema/migrations plus seeds exist; API handlers, runtime DB integration, security enforcement, and UI remain |
| Map Server | 0% | ⬜ Not started |
| Location Sharing | 0% | ⬜ Not started |
| SOS Rescue | 0% | ⬜ Not started |
| Search & Routing | 0% | ⬜ Not started |
| UI/UX & a11y | 0% | ⬜ Not started |
| CI/CD & Android | 0% | ⬜ Not started |

---

## Phase Scoreboard

### Phase 1 — Foundation (Auth & Map) — 16%

| Milestone | % | Notes |
|-----------|---|-------|
| Monorepo + Contracts | 100% | T1.0.1–T1.0.7 root config, shared contracts, Fastify shell, Vue/Vuetify client scaffold, OpenAPI/Zopia wiring, root dev orchestration, and Compose service scaffold done |
| Auth system | 0% | Account-state/security schema, migrations, and bootstrap seed exist; handlers, API DB integration, security enforcement, and UI remain |
| Map Server | 0% | — |
| Client Map canvas | 0% | — |

### Phase 2 — Location Sharing — 0%

| Milestone | % | Notes |
|-----------|---|-------|
| Live share + expiry | 0% | — |
| History share + retention | 0% | — |
| Multi-device priority | 0% | — |

### Phase 3 — SOS Rescue — 0%

| Milestone | % | Notes |
|-----------|---|-------|
| Incidents/categories | 0% | — |
| SOS request | 0% | — |
| Dispatch + nearest | 0% | — |
| Proposals | 0% | — |
| Live mission + routing | 0% | — |
| Cancellation + re-dispatch | 0% | — |

### Phase 4 — Polish — 0%

| Milestone | % | Notes |
|-----------|---|-------|
| Rating + history | 0% | — |
| Search + geocode | 0% | — |
| UI/UX + perf | 0% | — |
| Deploy + Android | 0% | — |

---

## Checklist Against Spec §23 (Summary)

See [TASKS.md § Checklist](./TASKS.md#checklist-against-spec-23-39-mandatory) for per-item tracking. The 39 product requirements remain unchecked until their acceptance criteria are implemented and verified.

---

## Blockers & Risks

| # | Issue | Impact | Owner | Status |
|---|-------|--------|-------|--------|
| 1 | Docker/Compose are not installed and Bun is not on `PATH` in the current agent environment | Compose runtime cannot be checked; Bun 1.4.3 is invoked through `npm exec` for install, tests, and typecheck | Environment | 🟡 Validation limitation |
| 2 | Map data size — Iran PBF is large | Start with a Tehran subset; full pipeline later | TBD | 🟡 Mitigated via configurable `MAP_REGION` |
| 3 | Fastify does not yet use the database client | Auth handlers cannot persist data; migration and seed commands are explicit developer operations only | TBD | 🟡 Next: T1.2.1 registration and API database integration |
| 4 | No Ubuntu VPS provisioned yet | Deployment pipeline cannot be tested against production infrastructure | TBD | 🔵 Pending procurement |

---

## Changelog

### 2026-10-18 — User state and PostGIS last-location schema (T1.1.4)

- Added `is_active`, `is_suspended`, and `must_complete_security_questions` with safe defaults; added nullable `avg_rating NUMERIC(2,1)` constrained to 0–5.
- Added nullable `last_location GEOGRAPHY(Point,4326)`, enabled PostGIS in the migration, and created the GiST index required by future spatial lookup. Drizzle uses a custom geography type; app coordinates should be projected with spatial SQL.
- Validation: frozen-lockfile install; 46 workspace tests; all three typechecks; client production build; migration/journal/snapshot and PostGIS ordering assertions; `db:migrate --help`; and repeat `db:generate` with no schema changes all passed. The migration could not be applied because Docker, `psql`, and a local PostgreSQL server are unavailable.

### 2026-10-18 — Initial reference-data and admin seed (T1.1.3)

- Added a migration for `cancellation_reasons` and a seed command that inserts 15 Persian security questions, the documented 5 requester + 6 rescuer reasons, and an Argon2id-hashed bootstrap admin.
- Seed operations are idempotent; an existing admin password is never overwritten. The `admin` / `admin123` fallback is allowed only when `NODE_ENV` is `development` or `test`; other environments require a unique `ADMIN_SEED_PASSWORD`.
- The reasons share the key `other`; uniqueness is scoped to `(type, key)` to permit both documented reason lists.
- Validation: frozen-lockfile install; 44 workspace tests; all three typechecks; client production build; Argon2id hash/verify; migration/journal/snapshot assertions; `db:migrate --help`; and repeat `db:generate` with no schema changes all passed. The seed could not be run against PostgreSQL in this environment.

### 2026-10-18 — Initial auth-table migration (T1.1.2)

- Added the Drizzle-generated migration, journal, and snapshot for `users`, `security_questions`, `user_security_answers`, and `user_sessions`, including the username/role checks, uniqueness, foreign keys, and sessions user index.
- Added the explicit `db:migrate` command; migrations are not applied at API startup.
- Validation: frozen-lockfile install; 39 workspace tests; shared/server/client typechecks; client production build; `db:migrate --help`; and a second `db:generate` run reporting no schema changes all passed. The migration could not be applied because Docker, `psql`, and a local PostgreSQL server are unavailable.

### 2026-10-18 — Drizzle ORM and initial database schema (T1.1.1)

- Selected Drizzle ORM with Postgres.js and recorded ADR-011, including the PostGIS/raw-SQL rationale and migration tradeoffs.
- Added initial schema declarations for `users`, `security_questions`, `user_security_answers`, and `user_sessions`, a Drizzle Kit config/generation script, and an explicit database client factory. The factory is not called by the Fastify app; no migration was retained or applied.
- Validation: frozen-lockfile install, server typecheck/tests, and a temporary generated-migration smoke test (output inspected then removed) passed. PostgreSQL runtime integration was not exercised because Docker was unavailable.

### 2026-10-18 — Root dev orchestration and Compose scaffold (T1.0.7)

- Added root `bun run dev` using Bun's parallel workspace runner to start the Fastify API and Vite client together, plus an API Dockerfile, Compose services for PostGIS, Martin, API, and Nginx, and a gateway config for `/api`, `/docs`, and `/map`.
- Added Compose/Postgres host settings to `.env.example` and documented the actual scaffold limits: API config validates a database URL but does not connect, and map data/styles/routing assets are absent. Updated quick-start and development docs; marked T1.0.7 complete.
- Validation: root dev command, workspace tests/typechecks/build, Compose YAML syntax/structure validation, and `git diff --check` passed. Docker/Compose runtime validation could not run because Docker is not installed in the agent environment.

### 2026-10-18 — OpenAPI and Zopia generation (T1.0.6)

- Added Swagger UI at `/docs` and OpenAPI 3.0 JSON at `/docs/json`; the document is generated from all 59 shared Zod route descriptors, including cookie parameters, bearer security, request media types, optional bodies, and no-content responses.
- Kept unimplemented domain endpoints out of Fastify's runtime route table and marked them `x-borobiya-runtime-status: contract-only`; only the existing health handler is live. Added the global 429 response to the OpenAPI catalog and aligned the rate-limit payload with the shared error shape.
- Added `bun --filter @borobiya/client generate:api`, which fetches the live OpenAPI document and invokes Zopia into the ignored `packages/client/src/generated/api/` directory.
- Validation: server tests/typecheck, client typecheck/build, OpenAPI path/operation assertions, and Zopia generation smoke test passed.

### 2026-10-18 — Vue client foundation (T1.0.5)

- Added the `@borobiya/client` Vue 3/Vite workspace with Vuetify, Tailwind CSS 4, Pinia, VueUse, Vue Router, Persian locale, and RTL shell styling.
- Added 17 route placeholders across `/_auth`, `/_public`, `/_user`, and `/_admin`, a responsive shared shell, and a minimal route-map test suite.
- Configured Vite to bind to `0.0.0.0`, allow the Arena preview host, and proxy same-origin `/api` and `/map` requests server-side; backend targets are not exposed to browser code.
- Validation: frozen-lockfile install, 2 client tests, client typecheck, and production build passed. Feature views, auth guards, MapLibre, Capacitor, and root `bun run dev` remain future work.

### 2026-10-18 — Fastify server foundation (T1.0.4)

- Added the `@borobiya/server` workspace with Fastify 5, workspace shared contracts, dotenv loading, and Node type support.
- Added Zod environment validation for `HOST`, `PORT`, PostgreSQL URL, distinct 32+ character JWT secrets, explicit CORS origins, and global rate-limit settings; defaults bind to `0.0.0.0` for container/preview access.
- Registered Helmet, a strict credentials-aware CORS allowlist, and the global in-memory IP rate limit; added a public health endpoint and sensitive-field log redaction.
- Added 7 server tests for env validation, health/security headers, CORS, and rate limiting. At that milestone the server was only a skeleton: no database connection, auth middleware, domain handlers, Redis, or OpenAPI wiring (the contract catalog was added in T1.0.6).
- Validation: frozen-lockfile install, all shared/server tests and typechecks, and `git diff --check` passed.

### 2026-10-18 — Shared route descriptors (T1.0.3)

- Added `km-api` 0.4.1 and a `defineRoute({ method, url, schema, meta })` adapter that preserves Borobiya descriptors while producing km-api configs.
- Added 59 route contracts across auth, public, user, location, SOS, and admin APIs. Handler registration and OpenAPI server wiring remain future tasks.
- Added route tests for unique operation IDs/method paths, path-parameter alignment, OpenAPI path conversion, auth/deprecation mapping, and public exports.
- Validation: frozen-lockfile install, all 23 Vitest tests across six files, shared TypeScript typecheck, route subpath/path-helper smoke test, and `git diff --check` passed.

### 2026-10-18 — Shared contracts (T1.0.2)

- Added the private `@borobiya/shared` workspace package with Zod schemas for auth, users, location, SOS, admin, search, common responses, and enums; exported inferred types and package subpaths.
- Added 19 tests across five files covering password/question invariants, location sharing rules, coordinate and query parsing, SOS bounds, dispatch recipients, admin inputs, cancellation reasons, and the public schema barrel.
- Added TypeScript 5 and Vitest development tooling plus `bun.lock`; pinned compatible package ranges for the documented Node 20+ fallback.
- Validation: `bun install --frozen-lockfile`, all 19 Vitest tests, package TypeScript typecheck, and a package self-reference import smoke test passed with Bun 1.4.3 invoked through `npm exec`.

### 2026-10-18 — Phase 1 kickoff (T1.0.1)

- Added the private Bun workspace manifest, strict shared TypeScript configuration, secret/data-aware `.gitignore`, and documented `.env.example`.
- Aligned the active development guide with the explicit global rate limit (100 requests/minute) and same-origin browser proxy paths (`/api`, `/map`); corrected the TypeScript workspace alias example.
- Marked T1.0.1 complete. Monorepo + Contracts was 14%; no auth, map, or feature code was claimed complete.
- Validation: Node config/environment assertions, TypeScript 5 inherited-config check, Git ignore checks, `git diff --check`, and Bun 1.4.3 empty-workspace install dry-run passed. Docker/Compose runtime checks remain unavailable.

### 2025-10-18 — Docs Bootstrap

- Created 12 markdown docs + 4 diagram docs on branch `arena/071fb407-borobiya`.
- Covers ARCHITECTURE, STRUCTURE, ROADMAP, TASKS, PROGRESS, API, SECURITY, MAP_SERVER, WORKFLOWS, USER_MANUAL, DEVELOPMENT, plus DIAGRAMS (ERD, SOS_FLOW, LOCATION_SEQUENCE, MAP_PIPELINE).
- Established the initial documentation baseline; implementation followed as a separate phase.

### 2025-05-01 — Spec Released

- Frozen `README.md` with 24 sections + 39 checklist items.

---

## How to Update This File

In every feature PR, edit the relevant **%** in tables above:

```markdown
| Monorepo + Contracts | 80% | Shared schemas done, client scaffold pending |
```

And append to Changelog:

```markdown
### YYYY-MM-DD — Short title
- What landed, link to PR #n
- New % and blockers
```

Keep it human-readable and AI-parseable (tables with `|`).

---

## Demo Readiness

| Demo | Ready? | Link |
|------|--------|------|
| P1 Auth + Map offline | ⬜ | — |
| P2 Live sharing | ⬜ | — |
| P3 Full SOS | ⬜ | — |
| MVP ship (deploy + APK) | ⬜ | — |
