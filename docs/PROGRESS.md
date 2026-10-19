# Borobiya — Progress

> Track % done per feature, blockers, changelog. Update in every PR alongside `TASKS.md`.

---

## Overall: 21% — Phase 1 Foundation underway (2026-10-19)

The documentation baseline, first seven foundation tasks, initial Drizzle schema/migration/seeds/user-state tasks, T1.2.1–T1.2.7 auth/session/recovery/onboarding/client tasks, and T1.3.1–T1.3.3 admin user-management tasks are complete. Shared schemas, route contracts, Fastify/OpenAPI infrastructure, a Persian-first Vue client, root API/client orchestration, and a local Compose service stack now exist. Health, auth/session/recovery handlers, the public security-question catalog, admin user list/detail/create/status handlers, authenticated profile/onboarding routes, and client auth pages/guards are live. Live-PostgreSQL verification, remaining user/admin/domain handlers, map assets, feature views, and other product functionality are still pending. Percentages are milestone estimates, not a count of source lines.

| Area | % | Status |
|------|---|--------|
| Documentation (`docs/`) | 100% | ✅ 12 docs + 4 diagrams authored; manual screenshots remain placeholders |
| Monorepo scaffold | 100% | ✅ T1.0.1–T1.0.7 complete; root dev orchestration and local Compose service scaffold are in place |
| Auth & Users | 41% | 🟡 Registration, login, refresh/logout, recovery, admin user list/detail/create/status + audit and no-delete regression coverage, onboarding, frontend auth flows, and guards are implemented; remaining user/admin handlers remain |
| Map Server | 0% | ⬜ Not started |
| Location Sharing | 0% | ⬜ Not started |
| SOS Rescue | 0% | ⬜ Not started |
| Search & Routing | 0% | ⬜ Not started |
| UI/UX & a11y | 0% | ⬜ Not started |
| CI/CD & Android | 0% | ⬜ Not started |

---

## Phase Scoreboard

### Phase 1 — Foundation (Auth & Map) — 20%

| Milestone | % | Notes |
|-----------|---|-------|
| Monorepo + Contracts | 100% | T1.0.1–T1.0.7 root config, shared contracts, Fastify shell, Vue/Vuetify client scaffold, OpenAPI/Zopia wiring, root dev orchestration, and Compose service scaffold done |
| Auth system | 41% | T1.2.1–T1.2.7 and T1.3.1–T1.3.3 complete: Argon2id registration/login/recovery/admin-created users and onboarding answers, audited status changes, paginated admin user search/detail, tested no-delete invariant, 15m/7d tokens, atomic refresh rotation/logout, single-use password reset, current-admin authorization, Persian auth/recovery/onboarding views, cookie-backed session restoration, and mandatory onboarding guards; remaining user/admin handlers remain |
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
| 3 | No live PostgreSQL is available in the current agent environment | Registration, login, refresh/logout, recovery, admin user list/detail/create/status, and onboarding are tested with injected stores; Drizzle persistence queries and migrations cannot be exercised against a live database here | Environment | 🟡 Validation limitation; apply migrations and smoke-test auth/admin/onboarding flows with PostgreSQL |
| 4 | No Ubuntu VPS provisioned yet | Deployment pipeline cannot be tested against production infrastructure | TBD | 🔵 Pending procurement |

---

## Changelog

### 2026-10-19 — No-delete invariant (T1.3.3)

- Added a Fastify runtime regression test asserting `DELETE /_admin/users/:id` returns `404`, and an OpenAPI assertion that the user detail path has no DELETE operation. No delete handler or contract was introduced.
- Validation: 183 workspace tests (28 shared, 139 server, 16 client), all three typechecks, client production build, and `git diff --check` passed.

### 2026-10-18 — Admin user list and detail (T1.3.2)

- Implemented admin-only `GET /_admin/users` with case-insensitive username search, active/category filters, and bounded pagination, plus `GET /_admin/users/:id` with profile and session-device details. Both endpoints recheck the admin's current account state, validate input, and return no-store responses.
- Category assignment tables and mission tables are later tasks: the current schema treats all users as unassigned (`hasCategory=true` returns an empty page) and detail missions are empty until T3.5.1. Updated runtime OpenAPI status and docs.
- Validation: 182 workspace tests (28 shared, 138 server, 16 client), all three typechecks, client production build, and `git diff --check` passed. No live PostgreSQL is available, so the Drizzle reads remain unverified against a database.

### 2026-10-18 — Admin user status and audit trail (T1.3.1)

- Implemented admin-only `PATCH /_admin/users/:id/status` with signed access-token verification, current-admin role/active/suspended checks, UUID/body validation, idempotent no-op handling, and `USER_NOT_FOUND` responses.
- Added a Drizzle migration for `admin_audit_log`. Status changes, audit events with before/after active state, and refresh-session revocation on deactivation run in one row-locked transaction; reactivation does not revive old sessions. Updated OpenAPI runtime status, tests, and API/security/structure documentation.
- Validation: 174 workspace tests (28 shared, 130 server, 16 client), all three typechecks, client production build, a repeat Drizzle generation with no schema changes, and `git diff --check` passed. No live PostgreSQL is available, so migration application and database-backed transaction integration remain unverified.

### 2026-10-18 — Authentication UI and route guards (T1.2.7)

- Replaced the auth/onboarding placeholders with Persian RTL login, registration, three-step password recovery, and security-question completion forms. Added same-origin API handling, localized errors, unique question selection, and tests for API calls and client session state.
- Added an auth store that keeps access tokens in memory, restores them with the HttpOnly refresh cookie, reloads completed profiles, and detects the server onboarding gate. Router guards enforce guest-only auth pages, protected user/admin routes, safe return paths, role checks, and onboarding redirects. Implemented `GET /_public/security-questions` and `GET /_user/me` as support endpoints for catalog loading and session restoration.
- Validation: 160 workspace tests (28 shared, 116 server, 16 client), all three typechecks, client production build, and `git diff --check` passed. No live PostgreSQL is available, so database integration remains unverified.

### 2026-10-18 — Security-question onboarding and authorization gate (T1.2.6)

- Implemented authenticated `POST /_user/complete-security-questions`, validating five unique IDs against the catalog, normalizing answers with the registration normalization rule, hashing sequentially with Argon2id, and atomically inserting all five hashes while clearing `mustCompleteSecurityQuestions`.
- Added a `/_user` pre-handler that verifies the access JWT and current account state, blocks other registered user routes for incomplete accounts with `403 SECURITY_QUESTIONS_REQUIRED`, and refuses answer replacement after completion. Updated OpenAPI runtime status, contracts, API/security/task documentation, and auth/persistence/schema tests.
- Validation: 145 workspace tests (28 shared, 115 server, 2 client), all three typechecks, client production build, Drizzle generation reported no schema changes, and `git diff --check` passed. No live PostgreSQL is available, so the transaction has not been integration-tested against a database.

### 2026-10-18 — Auth hardening bug review

- Fixed token verification accepting signed JWTs with no `exp` claim and rejecting malformed UUID subject/session claims before they reach persistence queries.
- Bound login password input to the largest value accepted at account creation; malformed stored Argon2 hashes now fail with generic `INVALID_CREDENTIALS` after dummy verification rather than returning a server error.
- Centralized per-IP+username rate-limit key generation; invalid, oversized, and uppercase username variants now share a bounded invalid bucket instead of aliasing valid lowercase usernames. Unknown recovery accounts now draw from a stable, HMAC-keyed five-question decoy pool, closing the repeated-request question-catalog leak.
- Validation: 129 workspace tests (27 shared, 100 server, 2 client), all three typechecks, client production build, Drizzle generation/no-schema-change check, migration CLI help, and `git diff --check` passed. PostgreSQL integration remains unavailable.

### 2026-10-18 — Admin user creation (T1.2.5)

- Implemented admin-only `POST /_admin/users` with signed/expiring access-token checks, current admin role/active/suspended-state verification, strict body validation, Argon2id password hashing, optional active-state handling, and race-safe duplicate-username conflicts.
- The Drizzle store inserts only a regular user row, explicitly sets `mustCompleteSecurityQuestions=true`, and does not create security-answer rows. Existing schema support required no migration. Added route, access-control, persistence/schema-contract, and OpenAPI tests; documented runtime status and security behavior.
- Validation: frozen-lockfile install; 118 workspace tests (27 shared, 89 server, 2 client); all three typechecks; client production build; Drizzle generation reported no schema changes; migration CLI help; and `git diff --check` passed. No live PostgreSQL is available, so database-backed persistence/migration application remains unverified.

### 2026-10-18 — Forgot-password recovery (T1.2.4)

- Implemented request/verify/reset routes with random server-selected three-of-five questions, a persisted ten-minute challenge, normalized Argon2id answer verification, generic failures/decoys, and five-per-15-minute route limits.
- Added single-use opaque reset tokens (SHA-256 hashes only in storage), atomic password reset, invalidation of outstanding reset/challenge tokens, and revocation of all refresh sessions. Added schema migration, store/route tests, OpenAPI runtime status, and API/security/task documentation.
- Validation: frozen-lockfile install; 99 workspace tests (27 shared, 70 server, 2 client); all three typechecks; client production build; Drizzle generation with no unexpected schema changes; migration CLI help; and `git diff --check` passed. No live PostgreSQL is available, so migration application and database-backed integration remain unverified.

### 2026-10-18 — Refresh rotation and logout (T1.2.3)

- Implemented `POST /_auth/refresh` and `POST /_auth/logout` with cookie parsing, signed/unexpired token verification, persisted session/account matching, atomic single-use hash rotation, current role/account-state checks, and idempotent session revocation/cookie clearing.
- Browser clients receive rotated refresh tokens only through HttpOnly cookies; native clients omit `Origin` and receive the token in JSON. Added unique JWT `jti` values with stable `sessionId` claims and rollout compatibility for legacy T1.2.2 tokens; added a unique refresh-hash index/migration.
- Updated shared contracts, OpenAPI runtime status, API/security docs, and T1.2.3 completion status. Route tests cover transport, stale/concurrent rotation, invalid/expired/legacy tokens, account states, guest-only behavior, and logout idempotency.
- Validation: frozen-lockfile install; 80 workspace tests (26 shared, 52 server, 2 client); all three typechecks; client production build; Drizzle generation with no unexpected schema changes; migration CLI help; and `git diff --check` passed. No live PostgreSQL is available, so migration application and database-backed integration remain unverified.

### 2026-10-18 — User login and token issuance (T1.2.2)

- Implemented `POST /_auth/login` with Zod validation, Argon2id verification (including a dummy hash for unknown usernames), generic invalid-credential responses, inactive/suspended account checks, and a 5-attempt/15-minute per-IP+username limit.
- Successful login creates a session with only a SHA-256 refresh-token hash, signs 15-minute access and 7-day refresh JWTs, and returns the refresh token in a secure HttpOnly cookie for browser requests or the body for native requests. The `mustCompleteSecurityQuestions` user flag remains available to support the later onboarding gate.
- Updated the API/OpenAPI status, login/cookie contract, guest-only behavior, and documentation to clarify that the login must issue a usable token for required security-question completion.
- Validation: frozen-lockfile install; 65 workspace tests (26 shared, 37 server, 2 client); all three typechecks; client production build; Drizzle generation with no schema changes; migration CLI help; and `git diff --check` passed. No live PostgreSQL service is available for store integration testing.

### 2026-10-18 — User registration (T1.2.1)

- Implemented `POST /_auth/register`: Zod validation, five unique existing question IDs, duplicate-username conflict checks (including insert races), sequential Argon2id hashing of the password and `trim().toLowerCase()` answers, and atomic user/answer persistence.
- Added guest-only 403 handling, a 5-attempt/15-minute per-IP+username limit, runtime OpenAPI status, route regression tests, and updated API/security/task documentation. Login and remaining auth flows are still pending.
- Validation: 55 workspace tests (26 shared, 27 server, 2 client), all three typechecks, client production build, Drizzle generation with no schema changes, and migration CLI help passed. No live PostgreSQL service is available for transaction/migration integration testing.

### 2026-10-18 — Completed-task bug review

- Fixed the OpenAPI server base URL mismatch: Swagger “Try it out” now targets `/api` first behind Compose/Nginx and keeps `/` as the direct-API alternative; host development still defaults to `/`.
- Replaced the ASCII-only, unbounded new-password check with Unicode letter/decimal-digit validation and a 1024-character limit; aligned seed-password errors and documentation. Corrected the README login example to allow legacy credentials as the actual login schema does.
- Validation: frozen-lockfile install; 48 workspace tests; all three typechecks; client production build; repeat `db:generate` with no schema changes; `db:migrate --help`; gateway-path assertions; and `git diff --check` all passed.

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
