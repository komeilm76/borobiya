# Borobiya — Progress

> Track % done per feature, blockers, changelog. Update in every PR alongside `TASKS.md`.

---

## Overall project estimate: 24% (unchanged planning figure) — Phase 1 v0.1.0 released; Phase 2 at T2.1.5/T2.3.4 (2026-10-21)

All numbered Phase 1 implementation tasks, T1.0–T1.5, are checked complete. On 2026-10-21, the user reported a successful Ubuntu 24.04 setup and passed interactive checks for admin/user login, registration, themes, admin user listing/deactivation, and the map view; the exact scope is listed in [Phase 1 human acceptance](#phase-1-human-acceptance). T1.4.7 remains complete and limited to map-data cache/reuse, safe cache removal, and whole-country/city-crop selection. PR #2 was merged to `main` as `95a88a3`, and the Phase 1 Foundation `v0.1.0` release was published on 2026-10-21. Phase 2 has started at T2.1.1: the `location_shares` schema/migration is complete, and T2.1.2 adds the first share handler — `POST /_user/location/share`. Share revocation/listing, realtime `location:update`, expiry processing, history sharing, and multi-device behavior remain unstarted and are not claimed complete. The 24% whole-project estimate is unchanged; it is a planning figure rather than a per-task measurement.

The separate external-Internet-offline map-library run, live browser outage simulation, extended database-flow evidence, and style-switch timing remain follow-ups. The user explicitly confirmed on 2026-10-21 that these remaining checks do not block the Phase 1 release or starting Phase 2. Record them as known follow-ups, not release/Phase 2 gates; do not claim the untested behavior passed. The agent workspace cannot reproduce the user's VM/browser/database checks. The 24% figure is a whole-project planning estimate, not a Phase 1 completion percentage, and has not been recalculated for the initial Phase 2 schema task.

Phase 1 runtime scope includes the shared contracts/scaffold, authentication and account-management flows, map-server pipeline, and client map/theme views. The Phase 1 auth/account endpoints are implemented; other contract-only user/admin domain operations map to later-phase work (T2–T4), not unnamed Phase 1 leftovers. See the handler-scope note below.

| Area | Implementation | Status / open evidence |
|------|----------------|------------------------|
| Documentation (`docs/`) | 100% | ✅ 12 docs + 4 diagrams authored; manual screenshots remain placeholders |
| Monorepo scaffold | 100% | ✅ T1.0.1–T1.0.7 complete; root dev orchestration and local Compose service scaffold are in place |
| Phase 1 Auth & account foundation | 100% (code scope) | ✅ T1.1–T1.3 scope is implemented; user reports setup, registration/login, admin list/deactivation, and denied login after deactivation passed on Ubuntu 24.04. Extended DB evidence remains P1-A2, non-blocking. Later user/admin domain endpoints map to T2–T4. |
| Map Server | 100% (code scope) | ✅ T1.4.1–T1.4.7 implementation complete; original-stack tile/routing/geocoding VM checks passed 2026-10-20 and user reports current Ubuntu setup passed. Dedicated external-Internet-offline library verification remains P1-G1, non-blocking. |
| Client Map canvas | 100% (code scope) | ✅ T1.5.1–T1.5.5 implementation complete; user reports map render/zoom/fullscreen and light/dark/system modes passed. Live outage fallback P1-A1 and latency measurement P1-M1 remain non-blocking follow-ups. |
| Location Sharing | 42% (8/19 tasks) | ✅ T2.1.1 schema, T2.1.2–T2.1.4 share create/revoke/list API, T2.2.1/T2.2.2 history tables, and T2.1.5 + T2.3.4 realtime broadcast with the priority-device rule complete; expiry/retention jobs, share-UI screens, history share/read APIs, and the device-selection flow remain |
| SOS Rescue | 0% | ⬜ Not started |
| Search & Routing | 0% | ⬜ Not started |
| UI/UX & a11y | 0% | ⬜ Not started |
| CI/CD & Android | 0% | ⬜ Not started |

---

## Phase Scoreboard

### Phase 1 — Foundation (Auth & Map)

**Implementation status:** every named T1.0–T1.5 task in `TASKS.md` is checked complete. **Core human acceptance:** the user reports the Ubuntu 24.04 smoke tests below passed. **Release/Phase 2 decision:** remaining P1 follow-ups are explicitly non-blocking per the user's 2026-10-21 direction.

| Milestone | Implementation status | Human acceptance / follow-up |
|-----------|-----------------------|-------------------------------|
| Monorepo + Contracts | Complete (T1.0.1–T1.0.7) | No additional manual acceptance listed |
| Auth & account foundation | Complete (T1.1–T1.3) | Core user/admin flows passed per report; extended DB flow coverage remains P1-A2 |
| Map Server | Complete (T1.4.1–T1.4.7) | Setup reported successful; strict external-Internet-offline library run remains P1-G1 |
| Client Map canvas | Complete (T1.5.1–T1.5.5) | Theme/map interactions passed per report; outage fallback P1-A1 and timing P1-M1 remain |

### Phase 1 human acceptance

**Source:** user-reported manual tests on Ubuntu 24.04, 2026-10-21. The agent did not independently access the VM. These results are recorded as passed without inventing logs, browser versions, regions, or timing data.

| Manual check | Result reported |
|--------------|-----------------|
| Set up the project on Ubuntu 24.04 | Pass |
| Log in with the admin account | Pass |
| Register a user and log in with that user | Pass |
| Switch between light, dark, and system theme | Pass |
| View the user list in the admin panel | Pass |
| Open the map in the panel, zoom in/out, and use fullscreen | Pass |
| Deactivate an account as admin; verify that account can no longer log in | Pass |

This smoke test supports the Phase 1 release decision. It does not claim a cold-cache/offline service-worker test, an HTTP 5xx outage test, an external-Internet-disconnected map-library run, every recovery/session endpoint, or a measured style-switch latency.

### Phase 1 acceptance follow-ups

These follow-ups track additional evidence, not missing feature implementation. Their checkboxes are mirrored in [`TASKS.md`](./TASKS.md#phase-1-acceptance-follow-ups-separate-from-implementation-tasks); all remain non-blocking for release/Phase 2 per the user decision.

#### P1-G1 — External map-library migration and offline acceptance — **OPEN / non-blocking follow-up**

The earlier live check validated the original Tehran layout. This follow-up checks that the newer project-independent library layout works on the actual Ubuntu VM: the active pointer and manifest agree, existing project-local data migrates only when its provenance is verified (otherwise the old files are preserved and setup safely rebuilds), and the prepared dataset can be used without downloading map sources from Geofabrik. Before disconnecting external Internet, stage the required Docker images, Java, Osmium, Planetiler/Photon JARs, verified sources/crops, PMTiles, OSRM graphs, and Photon index. Then run setup with `--offline` and the tile, car/bicycle/foot routing, and forward/reverse geocoding checks for each selected area while LAN access remains available. Record the selection/snapshot, migration result or “not applicable,” and sanitized command results. Local code-side checks are green: 50 map-server tests passed, including simulated manifest migration/offline-cache cases. A safe `./scripts/setup-ubuntu-vm.sh --dry-run --offline --yes --regions ir-tehran` also showed this sandbox lacks Docker, Java, Osmium, and cached source/PBF/PMTiles/OSRM/Photon artifacts; it made no changes. This confirms the agent cannot perform the real VM migration/offline run. The tests do not prove the real VM library pointer, mounted artifacts, or services work offline. The user reports the Ubuntu 24.04 setup succeeded, but did not explicitly report disconnecting external Internet or testing the library migration path. Per the user's 2026-10-21 decision, P1-G1 remains an operational follow-up and does not block the Phase 1 release or Phase 2; it is not part of T1.4.7.

#### P1-A1 — Live browser map-outage fallback — **OPEN / non-blocking follow-up**

The worker's unit tests cover cache writes, cached responses on network errors and 5xx, cold-cache failure, and request scoping. A real browser run is still needed to prove worker registration/control, Cache Storage, MapLibre rendering, and the user-visible retry/toast work together. On HTTPS (or localhost), first load the map while online to warm the cache, then test an actual network failure and a map-server 5xx. Confirm cached map style/tile/sprite/glyph resources continue to render; with an empty cache, confirm a clean recoverable error rather than a crash. Confirm API/configuration/routing/geocoding requests are not served from this map cache. Plain-HTTP LAN cannot use Service Workers and only has the in-memory MapLibre fallback; record the origin and do not claim persistent offline support for that case. Local validation is green: all 49 client tests passed, including the 5 service-worker cache/fallback tests; those tests do not exercise an actual browser registration or MapLibre rendering. The user-reported human test did not include a map-server outage/5xx or browser-offline scenario; P1-A1 remains non-blocking by the user's decision.

#### P1-A2 — Extended PostgreSQL/account-flow evidence — **PARTIAL / non-blocking follow-up**

Most server tests use injected stores, so they validate handler logic but do not prove that Drizzle migrations, SQL queries, constraints, transactions, and session revocation work against a real PostgreSQL instance. On a disposable or safely backed-up application database, confirm Postgres health, apply migrations, run the seed twice to confirm idempotence, then exercise registration/login/refresh/logout/recovery, `GET /_user/me` and onboarding, and admin create/list/detail/status. Verify expected rows persist and revoked sessions stop authorizing access. Capture sanitized pass/fail results only; never share `.env`/`DATABASE_URL` and never remove the existing `postgres-data` volume as a shortcut. Local validation is green: 165 server tests (150 before T2.1.2) and the server typecheck passed, but the route tests use injected stores and are not live PostgreSQL integration tests. A prior VM migration attempt returned `28P01`. The user later reported a successful Ubuntu 24.04 setup and passed registration/login, admin listing/deactivation, and deactivated-account login rejection; see the human-acceptance table. Explicit migration/seed output and refresh/logout/recovery/onboarding/admin-create/detail results were not reported, so P1-A2 is partial rather than fully evidenced. These remaining checks are non-blocking for release/Phase 2 per the user's decision.

#### P1-M1 — Live light/dark switch latency — **UNMEASURED / non-blocking**

The implementation and 150 ms paint-transition configuration are tested, Tehran rendered in the target VM browser, and the user reports light/dark/system mode switching works. No timing results were supplied. The 150 ms value describes the paint transition, not the total time from a theme action until the new map style is visible. With local map data loaded and caches warm, time at least 10 light↔dark switches in the target browser and report the median/p95 plus browser/device/cache state. No total-latency SLA is documented, so this is a useful baseline, not a pass/fail gate.

**Handler-scope reconciliation:** The Phase 1 runtime handlers are already implemented: public health/security-question catalog; auth register/login/refresh/logout/recovery; `GET /_user/me` and security-question completion; admin user list/detail/create/status. The vague phrase “remaining user/admin handlers” has been removed as a Phase 1 blocker. Contract-only location sharing/devices/history belong to T2; incidents/categories, SOS, dispatch, proposals, and missions belong to T3; search and client routing polish belong to T4. They remain future work, but they are not missing T1 Phase 1 handlers. If another handler is intended for Phase 1, first add its exact route and acceptance criteria as a named task.

### Phase 2 — Location Sharing — 42% (8/19 tasks)

| Milestone | % | Notes |
|-----------|---|-------|
| Live share + expiry | 71% (5/7 tasks) | T2.1.1–T2.1.4 share storage/API and T2.1.5 live `location:update` (handshake auth, throttle, PostGIS upsert, history insert, peer fan-out, REST fallback) complete; the expiry cron and the share-dialog/lists UI remain |
| History share + retention | 33% (2/6 tasks) | T2.2.1 `location_history` and T2.2.2 `location_history_shares` exist in migration `0007_brief_hedge_knight.sql`; there is still no writer, share/read API, retention env wiring, prune job, or playback UI |
| Multi-device priority | 17% (1/6 tasks) | T2.3.4 server-side rejection of non-priority devices is live inside the realtime path; the devices API (T2.3.2), the >1-device warning/selection (T2.3.3), settings UI (T2.3.5), and the Capacitor-aware composable (T2.3.6) remain |

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

See [TASKS.md § Checklist](./TASKS.md#checklist-against-spec-23-39-mandatory) for the 39 requirement-level acceptance checks. That table is broader than the T1 implementation checklist: a T1 checkbox can be complete while a combined product requirement remains unchecked pending live acceptance or later-phase work. Keep the two trackers distinct; do not use the 39-item summary as a count of unfinished T1 tasks.

---

## Environment follow-ups & risks

| # | Issue | Impact | Owner | Status |
|---|-------|--------|-------|--------|
| 1 | Target VM, Docker/Compose, Java 21+, and a real browser are unavailable in the agent workspace | The user reports Ubuntu 24.04 setup and core app/map flows passed. The agent cannot independently reproduce that run or test the separate external-Internet-offline library path and service-worker outage path. | User VM / environment | 🟡 P1-G1 and P1-A1 remain non-blocking follow-ups |
| 2 | Map data size — Iran PBF is large | Start with a Tehran subset; full pipeline later | TBD | 🟡 Mitigated via configurable `MAP_REGION` |
| 3 | No live PostgreSQL is available in the agent environment | User reports successful account registration/login and admin deactivation behavior on Ubuntu 24.04. Automated server tests use injected stores; explicit migration/seed output and extended refresh/logout/recovery/onboarding/admin-create/detail checks remain unrecorded. | User VM / database | 🟡 P1-A2 partial, non-blocking; never reset the existing volume for testing |
| 4 | No Ubuntu VPS provisioned yet | Deployment pipeline cannot be tested against production infrastructure | TBD | 🔵 Pending procurement |

---

## Changelog

### 2026-10-21 — T2.1.5 + T2.3.4 realtime live location

- Added Socket.IO (`socket.io` on the API, `socket.io-client` on the client) mounted at `/socket.io` on the existing API port; nginx gained a `/api/socket.io/` block that forwards `Upgrade`/`Connection` with 75s read/send timeouts (above `pingInterval` 25s + `pingTimeout` 10s), and the Vite dev proxy gained a matching `ws: true` entry ordered before the generic `/api` proxy.
- The handshake runs the same checks as the `/_user` REST hook (verified access JWT, existing account with a matching role, active, unsuspended, onboarding complete, persisted live session) and every socket joins `user:{userId}`, admins also `admin`.
- `location:update` now: throttles 60 updates/min per connection, validates `locationUpdateSchema`, requires the payload's `priorityDeviceId` to equal the connection's session device (T2.3.4 `WRONG_DEVICE`), ignores every share that pins another priority device, then in one transaction upserts `users.last_location` (`ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography`) and inserts `location_history`, and finally emits `location:peer-update` to each accepting target plus an echo to the sender's own room. A fix is stored even with no active share because SOS dispatch (T3.3.1) reads `last_location`; sustained `>50/s` auto-suspend still needs the `suspendedUntil`/`suspension_reason` columns and is not implemented.
- The deprecated `POST /_user/location/update` REST fallback shares the same service and also fans out to peers, so a polled fix is not silently local-only.
- Client: `services/socket.ts` (+ `socket-options.ts`) uses the same-origin `/api/socket.io` path, passes the token in `handshake.auth`, re-reads a rotated token on reconnect, and never keeps a socket open after logout; `composables/useLiveLocationBroadcast.ts` watches geolocation with 4s pacing and reads this session's device id from its own access token claims.
- Validation: shared 35/35, server 199/199 (22 new realtime/service cases), client 58/58, all package typechecks, and the client production build pass. Fixing `io.close()` on non-listening test apps was required so inject-only apps shut down cleanly.
- Local evidence beyond unit tests: a throwaway script (not committed) ran the real stack on `127.0.0.1` with a genuine Socket.IO WebSocket transport and injected stores — both clients connected, `location:update` acked `{ ok: true, peers: [target] }`, the fix reached the peer room, a payload naming another device acked `WRONG_DEVICE` without persisting, `POST /_user/location/update` returned 200 and also reached the peer, and an unauthenticated handshake was refused with `UNAUTHORIZED`. A temporary local app.close() rejection from `io.close()` on a never-listening server was found and fixed as part of this work.
- **Still not verified:** live browsers, the nginx/Vite proxy upgrade paths, the target VM, and real PostGIS writes (no PostgreSQL in this workspace). Reconnect/token-rotation behavior is coded but unexercised. See the new P2-A1 follow-up.

#### P2-A1 — Live broadcast acceptance — **OPEN (Phase 2 follow-up)**

Two browsers signed in as the share target and owner on the target VM should show the dot moving within ~5s while the owner walks, confirm the marker stops immediately after revoke, confirm a second device cannot overwrite the priority device, and confirm the polling fallback works when WebSocket is blocked. A local (non-VM, non-browser) real-WebSocket run already proved the server-side handshake/ack/fan-out/rejection path; the remaining gap is the browser, the proxy upgrade, and real PostGIS persistence. Record browser/origin (HTTP LAN has no Service Worker), the observed latency, and sanitized server logs. Nothing here is claimed until that run is reported.

### 2026-10-21 — T2.2.1/T2.2.2 location history storage

- Added `location_history` and `location_history_shares` to the Drizzle schema in one migration (`0007_brief_hedge_knight.sql`), because both tables belong to the same history-sharing slice and one migration keeps the applied-migration story simple.
- `location_history`: `bigserial` id, cascading `user_id` FK, `double precision` lat/lon/accuracy, `timestamptz` observation timestamp plus `created_at`, latitude/longitude/accuracy checks, and the composite `(user_id, timestamp)` index. Deliberate, documented deviations: no geography column or GiST index (reads are user- and time-scoped, never radius queries) and no monthly partitioning (optional in the ERD/ARCHITECTURE, and it would complicate the FK/migration path while retention is still a `DELETE` job).
- `location_history_shares`: non-cascading owner/target FKs, `to_time > from_time` and no-self-share checks, a unique `(owner_id, target_user_id, from_time, to_time)` grant so a repeated identical request cannot stack duplicates, and owner/target `(…, from_time)` indexes.
- Validation: server 177/177 (3 new schema/migration assertions), server/shared/client typechecks, shared 35/35 and client 49/49 tests pass; a repeat `db:generate` reported no further schema changes. These tables are storage only: no writer, reader, or retention job exists yet (T2.1.5, T2.2.3–T2.2.5), and nothing here was executed against live PostgreSQL.

### 2026-10-21 — T2.1.4 active share lists

- Implemented `GET /_user/location/shares`: two owner-scoped queries return only active shares (unrevoked and either permanent or still inside `expiresAt`), newest first and capped at 100 rows per list.
- Received shares are joined to `users` so each item carries `owner.username` and the owner's PostGIS `last_location` (`ST_Y`/`ST_X` as `lat`/`lon`, `null` when unknown), which removes the need for a second request to draw a peer marker. The shared response schema gained `LocationShareOwner`/`ReceivedLocationShare` types.
- OpenAPI marks `locationListShares` implemented; `docs/API.md` §5.3 documents the list semantics.
- Validation: shared 35/35, server 174/174, client 49/49, and all three package typechecks passed. The `ST_Y/ST_X` cast is reviewed SQL but not yet executed against live PostGIS.

### 2026-10-21 — T2.1.3 live-share revocation

- Implemented `DELETE /_user/location/share/:shareId`: a single owner-scoped `UPDATE ... WHERE is_revoked = false` flips `isRevoked`, and a follow-up owner-scoped read distinguishes an already-revoked id from a missing one.
- Unknown ids and ids owned by another account both return `404 SHARE_NOT_FOUND` with one shared message; already-revoked ids return `200` with an empty body so client retries stay idempotent. The contract gained the documented 404 response and `locationRevokeShare` is now marked implemented in OpenAPI.
- Validation: shared 34/34, server 170/170 (5 new revoke cases), client 49/49, and all three package typechecks passed. (The commit message for `8e33a5d` stated 35 shared tests; the new assertions extended an existing case, so 34/34 is the correct figure.) Share revocation is not yet pushed to receivers over realtime (T2.1.5), so a peer's marker clears on the next list/update cycle.

### 2026-10-21 — T2.1.2 live-share creation

- Implemented `POST /_user/location/share`: shared Zod bounds (1-50 unique recipients, `durationMinutes` 1-43200, `note` <= 500), batched recipient checks that reject self/unknown/inactive/suspended targets with structured `400 VALIDATION_ERROR` issue codes, and one transaction that writes or reuses `location_shares` rows.
- Repeat requests are idempotent per owner/target/mode: an active permanent share is reused, and a timed share is only extended when the new expiry is later. The response now reports `shares`, `createdShareIds`, and `reusedShareIds` instead of the placeholder `shareId` shape, and `docs/API.md` §5.3 was updated to match.
- Reuse of the app-scoped `/_user` hook means share creation requires a verified access token backed by an active, unsuspended, onboarding-complete account; the OpenAPI operation is now marked `implemented`.
- Validation: shared 34/34, server 165/165, client 49/49, and all three package typechecks passed. Tests use injected stores; the constraint/transaction behavior is not yet proven against live PostgreSQL (see P1-A2-style follow-up evidence rules).

### 2026-10-21 — Phase 1 v0.1.0 released; Phase 2 T2.1.1 started

- PR #2 was merged to `main` at `95a88a3`; GitHub release `v0.1.0` was published against that merge commit.
- Implemented T2.1.1: Drizzle `location_shares` schema and migration, owner/target foreign keys, mode/expiry/self-share constraints, revocation/device/note metadata, and owner/target/expiry indexes.
- Validation: server tests 150/150, server typecheck, repeat `db:generate` (no schema changes), and `git diff --check` passed. No live PostgreSQL was available, so migration application/runtime constraint behavior remains unverified.
- This starts storage only; T2.1.2–T2.1.7 share creation, revoke/list APIs, socket updates, expiry processing, and UI remain incomplete. The Phase 1 P1 follow-ups remain separately tracked and non-blocking.

### 2026-10-21 — Ubuntu 24.04 human acceptance reported; Phase 2 unblocked

- The user reports successful setup on Ubuntu 24.04; admin login; user registration/login; light, dark, and system themes; admin user listing; map display, zoom, and fullscreen; and deactivation with subsequent login rejection.
- Recorded those exact manual checks as passed without claiming unreported service-worker outage, external-Internet-offline, or latency results.
- Per the user's explicit decision, P1-G1, P1-A1, P1-A2 extended evidence, and P1-M1 are follow-ups and do not block the Phase 1 release or Phase 2. T1.4.7's scope remains unchanged.

### 2026-10-21 — Reconciled Phase 1 implementation and acceptance tracking

- Replaced the stale Phase 1 `20%`, Auth `42%`, and Client Map `75%` figures with separate implementation-complete and acceptance-open statuses for the named T1.0–T1.5 scope.
- Added P1-G1 (external-library target-VM migration/offline check), P1-A1 (real browser map-outage test), P1-A2 (live PostgreSQL/account-flow evidence), and P1-M1 (non-blocking style-switch latency baseline), with concrete evidence criteria and boundaries. At that point the VM check was tracked as a gate; the user's later 2026-10-21 decision explicitly made these remaining follow-ups non-blocking.
- Clarified that Phase 1 account/auth handlers are implemented; contract-only location, SOS, mission, search, and other domain handlers map to T2–T4 rather than an unnamed Phase 1 backlog. T1.4.7 remains complete and unchanged.

### 2026-10-21 — Re-ran Phase 1 local implementation checks

- Test suites passed: shared 32, server 149, client 49, map-server scripts 50, safe cache-clear 5.
- All three TypeScript checks passed. The client production build passed with existing Rollup annotation/chunk-size warnings.
- Region catalog validation reported 18 countries, 59 selectable areas, and 32 sources; setup's region list also ran successfully. A safe offline setup dry-run made no changes and confirmed the sandbox lacks Docker/Java/Osmium and cached map artifacts.
- These checks validate implementation in the repository, not target-VM migration/offline behavior, a real browser outage, or PostgreSQL-backed persistence. P1-G1, P1-A1, and P1-A2 therefore remain open; P1-M1 is still unmeasured.

### 2026-10-21 — T1.4.7 complete: map caching, safe cache removal, and crop selection

- Clarified T1.4.7's scope as three user-facing features only: reuse cached map data, safely remove map-data caches, and choose whole-country or city-cropped areas in setup. Marked the task complete after checking the implementation and tests.
- Confirmed the implementation in the external map library and setup flow, plus `scripts/clear-map-cache.sh` (dry-run by default, explicit apply confirmation, symlink/root safeguards, and preservation of app Postgres, Docker image/build cache, OS packages, Java, Osmium, and tool JARs). The region catalog now exposes 18 countries and 59 selectable areas, including the 12 requested country additions.
- Validation: 50 map-server region/library tests, 5 safe-cache-clear tests, catalog validation, setup region-list output, Bash syntax, and Python compilation passed. At the time of this entry, the target-VM migration/offline check was tracked as a separate pre-merge gate, not part of T1.4.7's scope. The user later explicitly made this follow-up non-blocking for release/Phase 2; it remains documented as P1-G1.

### 2026-10-20 — Standardized external map library, selectable snapshots, and offline cache policies

- **External standardized storage:** all map content now lives by default under `~/.local/share/borobiya/map-library` (`MAP_LIBRARY_DIR`), organized as `sources/<continent>/<country>/<source>/<date>/`, `crops/<continent>/<country>/<city>/<date>/`, and complete fingerprinted dataset bundles (merged PBF, PMTiles, OSRM graphs, Photon index, stamps, and metadata). Compose mounts the active dataset/routing/geocoding directories directly; Docker images, OS packages, Java, Osmium, and tool JARs remain separate concerns.
- **Snapshot + source policy:** setup's form and CLI now support repository-pinned (default), latest-common, or specific `YYYY-MM-DD` Geofabrik snapshots, plus `cache-first` (default), `refresh`, and `offline` source policies. Non-pinned dates are verified through official MD5 sidecars and persisted as concrete dates so ordinary reruns do not drift. Manifests are version 3 with snapshot/storage provenance; crop/source metadata is standardized in the library.
- **Activation, retention, and migration:** setup builds a fingerprinted dataset, recreates map services against it, runs acceptance, then writes `current.json`/`datasets/current` and prunes replaced releases/dataset bundles (one retained release per selected country and one active bundle). Verified project-local Tehran/catalog-era artifacts migrate into the library, including the historical exact-byte `iran-latest` manifest. Fresh-checkout recovery now correctly prioritizes the library/current dataset over `.env.example` defaults.
- **Tests/docs:** Python map-script suite expanded to 27 tests (snapshot resolution, sidecar/cache behavior, categorized paths, v3 write/verify, library current/prune, and full legacy Tehran migration). Validation: shared 32, server 146, client 49, routing-gateway 19, all typechecks, ShellCheck, style verifier, catalog validator, Compose interpolation simulation, 65 changed-doc bash blocks, dry-run/form/offline/current-recovery scenarios. Live VM migration plus Tehran/Frankfurt offline acceptance remains the gate before PR #2 merge; Phase 2 is still paused.

### 2026-10-20 — Pre-VM-test audit: adjacent-country selections and install recovery

- Corrected the resolver's unnecessary overlap rejection. The official Osmium merge behavior emits an object found in multiple sorted inputs only once, and every catalog source comes from the same pinned snapshot; adjacent whole countries (for example Germany + Netherlands + France) and overlapping city/country bounds now resolve. Regression tests cover `de,nl` and selecting all six whole countries together.
- Setup now recovers an existing selection from the dataset manifest (or from legacy Tehran artifacts) when an upgraded checkout's `.env` has no `MAP_REGION_IDS`, avoiding a surprise form or needless rebuild; `--reselect` bypasses recovery. `regions.py menu-areas` also accepts country IDs case-insensitively. The v1 migration additionally accepts the historical `iran-latest` source URL only when its provider/license/MD5/byte-count/date/timestamp fields prove byte identity with the dated pin, matching the actual pre-catalog VM manifest.
- Review pass over docs, scripts, commands, environments, and Compose interpolation found no other blockers: Photon language interpolation and the `$$` healthcheck escape, OSRM/Nominatim dataset paths, gateway defaults, script environment usage, and command error paths were rechecked. At the time, live VM execution was tracked as the PR #2 acceptance gate; the user's later 2026-10-21 decision made the remaining VM/offline follow-up non-blocking.

### 2026-10-20 — Selectable map areas: country/city form in setup, multi-area dataset

- **Area catalog:** `map-server/regions.json` + `map-server/scripts/regions.py` (18 unit tests). Six countries (Iran, Germany, Turkey, France, UK, Netherlands), 29 cities + whole-country areas; every Geofabrik source pinned to the 2026-10-18 dated snapshot with its official MD5 (verified against Geofabrik's live index/sidecars). Resolver enforces: known IDs, whole-country supersedes its cities, union bbox, per-selection Photon languages, download estimates, heavy-build flags.
- **Pipeline generalized:** `prepare-tehran-pbf.sh` → `prepare-regions-pbf.sh` (per-area verified crops under `data/crops/` + `osmium merge` into the single shared dataset, version-2 provenance manifest), `verify-tehran-tiles.sh` → `verify-tiles.sh`; routing/geocoding acceptance is per-area from catalog test points. Dataset slug is now the constant `borobiya` (styles/Martin/Nginx/Vite proxy follow it; Vite derives the tile prefix from the validated map config), so changing areas is data-only. Single-source `MAP_SOURCE_*` env vars retired in favor of `MAP_REGION_IDS` + catalog pins; Photon default language is configurable (`PHOTON_DEFAULT_LANGUAGE`).
- **Setup script form:** `setup-ubuntu-vm.sh` now asks for countries then cities (multi-select, whole-country option, summary + confirm, optional admin-password prompt) and also supports `--regions`, `--list-regions`, `--reselect`, `--yes`, `--dry-run`. Stage skipping is checksum-based (PMTiles/OSRM metadata + Photon stamp vs dataset SHA-256); changing the selection rebuilds only stale stages (stale OSRM graphs moved aside; Nominatim volume + Photon index reset). Pre-catalog Tehran-only installs migrate in place (`tehran.*` → `borobiya.*`, v1→v2 manifest conversion) instead of rebuilding.
- **Client:** the map now centers on the configured areas' bounds (bbox center + one-time recenter when the fallback start lies outside the served bounds) instead of a hard-coded Tehran center; `/map-config` default region is the dataset slug.
- Docs updated across runbook (form + steps 7–13), MAP_SERVER, DEVELOPMENT, ARCHITECTURE, DIAGRAMS, README(s), TASKS/ROADMAP (incl. stale acceptance notes). Validation: shared 32, server 146, client 49, gateway 19, regions 18, all typechecks, ShellCheck, style verifier, catalog validator, 33 runbook bash blocks, synthetic manifest/migration round-trips, dry-run + piped form end-to-end.

### 2026-10-20 — One-command VM setup script, admin password reset tool, repo re-scan

- **Live map confirmed on the VM** (Tehran renders in the LAN browser after the worker fix).
- **`scripts/setup-ubuntu-vm.sh`** automates the runbook launch end-to-end: prerequisite checks (Phase A stays manual), `.env` bootstrap with generated secrets, shared crop, PMTiles, OSRM graphs, Nominatim→Photon import with health waiting, full stack start, runtime migrations + seed, and the step-13 verification scripts, finishing with admin-login and next-step guidance. Idempotent/resumable — completed stages are skipped and existing `.env`/database passwords are never rotated. Runbook gained a short "Automated setup" section pointing to it.
- **Admin recovery:** new `db:reset-admin-password` (`src/db/reset-admin-password.ts`) sets a new bootstrap-admin password and revokes admin sessions (seed remains create-only by design); documented in the runbook and DEVELOPMENT.md. Admin credentials recap: username `admin`; password is the `ADMIN_SEED_PASSWORD` used at seed time (`admin123` only for local development seeds without one).
- **Repo re-scan fixes:** stale DEVELOPMENT.md claims that map generation was future work / no styles existed; env-var usage cross-checked client/Vite vs `.env.example` (only Vite's built-in `BASE_URL` differs). Full matrix green: shared 32/32, server 146/146, client 48/48, routing-gateway 19/19, all typechecks, ShellCheck (incl. the new setup script), style verifier, 32 runbook bash blocks.

### 2026-10-20 — Fixed blank map: MapLibre v6 worker now served explicitly (raw Vite plugin + setWorkerUrl)

- Browser console from the VM pinpointed the empty map: `Error: Worker failed to load` from MapLibre, with zero tile requests (tiles are fetched inside the worker). MapLibre GL JS v6 locates its worker as a sibling of the loaded chunk (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`), but under Vite the library runs from the pre-bundled deps chunk (dev) or a hashed bundle (build), where that sibling file does not exist — Vite even logs the missing file. A `?url` asset import was rejected as a fix because in dev it serves Vite-transformed code with an injected `@vite/client` import, which is unsafe inside a worker. Instead, a small Vite plugin (`borobiya-maplibre-worker`) serves the package's self-contained `maplibre-gl-worker.mjs` **verbatim** at `/maplibre-gl-worker.mjs` in dev and emits it as a build asset, and `MapCanvas` calls `setWorkerUrl("/maplibre-gl-worker.mjs")` before creating the map.
- Validation: client typecheck + 48/48 tests; production build emits the worker byte-identical to the packaged file (SHA-256 match); dev server returns the same raw bytes (518,806 B, no `@vite/client` injection) while the old sibling-of-chunk path 404s exactly as in the browser report.

### 2026-10-20 — Fixed Photon healthcheck Compose interpolation; actionable API port-conflict error

- VM evidence confirmed the live-E2E auth root cause: the Docker `api` container (pre-cookie-fix image) owns :3000 while `bun run dev`'s API dies with `EADDRINUSE` and `--watch` keeps waiting, so Vite kept proxying to the stale API whose unconditional `Secure` refresh cookie LAN browsers drop. The API now prints an actionable hint on `EADDRINUSE` (stop the Docker `api` service or change `PORT`) instead of only a stack trace.
- Fixed a bug in the Photon healthcheck added by the second audit: its bash `$line` variable was eaten by Compose interpolation (`WARN The "line" variable is not set`), so the probe could never match HTTP 200 and Photon showed permanently `(unhealthy)` despite serving. The variable is now `$$`-escaped; validated by simulating Compose interpolation and executing the decoded probe against a live test server.
- Validation: server 146/146 + typecheck; EADDRINUSE smoke test prints the new hint.

### 2026-10-20 — Diagnostics for live client E2E: refresh-rejection reasons, MapCanvas console errors

- Follow-up to the LAN-dev fixes: sprite/style loading improved on the VM, but `POST /_auth/refresh` still returns 401 on reload and the map renders empty in the user's browser. Code re-audit found the client restore flow (deduped refresh, `credentials: "same-origin"`, tolerant profile load), server refresh rotation, service worker (guarded, network-first), style layer names (canonical OpenMapTiles), and both styles (pass the official `gl-style-validate`) all correct, so the remaining causes are environmental and need runtime evidence instead of more speculation. The refresh handler now logs a secret-free `refreshRejectionReason` (`missing_token` / `token_invalid` / `session_mismatch` / `rotation_conflict`) while the client contract stays `INVALID_REFRESH`, and `MapCanvas` logs the underlying MapLibre/config errors to the console (`[borobiya:map] ...`) alongside the user-friendly Persian toast. Prime suspects to discriminate with that evidence: a stale Docker `api` still bound to :3000 while `bun --watch` waits after an `EADDRINUSE` crash (old image = unconditional `Secure` cookie), no fresh login since the cookie fix (the pre-fix cookie was never stored), split JWT secrets between Docker/bun APIs, or WebGL unavailable in the test browser.
- Validation: server 146/146 + typecheck; client 48/48 + typecheck; both map styles pass `@maplibre/maplibre-gl-style-spec` validation.

### 2026-10-20 — Fixed LAN-dev map loading and session persistence (Vite Host preservation, conditional Secure cookie)

- Found during live client E2E (`bun run dev`, browser on another LAN host): **(1) Map failed to load** — Martin expands the relative sprite/glyph/tile URLs in served styles to absolute URLs built from the request `Host` header (verified in Martin 1.16.1 `maplibre_style.rs`/`srv/styles.rs`), and the Vite dev proxy's `changeOrigin: true` rewrote that Host to `localhost:8000`, sending LAN browsers to their own machine. Martin-bound Vite proxies (`/map`, `/tehran/`, `/sprite/`, `/font/`) now use `changeOrigin: false` — the same Host preservation Nginx already had — and the map service-worker cache was bumped to `v2` so browsers discard style JSON cached with poisoned URLs. **(2) Reload always demanded a fresh login** (`POST /_auth/refresh` → 401) — the refresh cookie was unconditionally `Secure`, which browsers silently drop over plain HTTP on non-localhost origins. `refreshTokenCookie`/`expiredRefreshTokenCookie` now take a per-request option (`refreshCookieOptionsForRequest`: `Secure` only when `request.protocol` is HTTPS, incl. trusted `X-Forwarded-Proto`); login/refresh/logout call sites and SECURITY.md updated.
- Validation: server 146/146 tests (3 new cookie unit tests; HTTP inject suites now assert no `Secure` on plain HTTP) + typecheck; client 48/48 + typecheck; live Vite smoke test against a stub Martin proved the forwarded Host now stays `172.16.20.32:5199` (LAN-style origin) instead of the proxy target.

### 2026-10-20 — Live map acceptance passed on the Ubuntu VM: T1.4.2, T1.4.4, T1.4.5 complete

- Runbook step 13 acceptance passed end-to-end on the Ubuntu 24.04 VMware VM (4 vCPU / 6 GiB / 50 GB), against the shared Geofabrik crop built through steps 7–12:
  - **Tiles (T1.4.2):** `verify-tehran-tiles.sh` — `GET /tehran/12/2632/1612` → HTTP 200, `application/x-protobuf`, 222,867 bytes.
  - **Routing (T1.4.4):** `verify-routing.sh` — car 6,643 m / 609 s, bicycle 5,090 m / 1,489 s, foot 4,803 m / 3,464 s (2 alternatives each) between the central-Tehran probe points.
  - **Geocoding (T1.4.5):** `verify-geocoding.sh` — forward `Azadi Square` → 5 features, first «میدان آزادی»; reverse at 35.70,51.40 → «هادی خداپرست». Raw `curl` equivalents for tile/route/geocode/reverse also exercised successfully.
- `docs/TASKS.md` phase-1 checklist is now fully checked; Map Server area/milestone moved to 100%. Next: apply the second-audit stack update on the VM (one `down`/`up --build`), run in-image migrations + seed and verify auth end-to-end, capture `docker stats` for memory tuning, then client live-map E2E and Phase 2 (T2.1 live location sharing).

### 2026-10-20 — Second config/script audit: decoupled Martin from Postgres, real healthchecks, in-image migrations

- **Martin no longer connects to PostgreSQL.** `martin.yaml` published zero database sources, yet the connection made Martin exit on credential drift (seen live at step 12) and carried auto-publish privacy risk; the `postgres` block, the Compose `DATABASE_URL`, and the `depends_on: postgres` are removed. Martin now serves PMTiles/styles/sprites/fonts from files only, independent of the application database.
- **Health checks now mean something.** Postgres healthcheck authenticates (`psql SELECT 1`) instead of `pg_isready`, so a password/volume mismatch reports `unhealthy` at the source. Photon (HTTP 200 on `/status` via bash `/dev/tcp`) and all three OSRM services (TCP connect after graph load) gained healthchecks; Nominatim's grace was widened to ~70 min so a slow first import is not mislabelled `unhealthy`.
- **API/Compose hygiene.** Removed seven variables Compose passed to the API but `env.ts` never validated or used (`ADMIN_SEED_PASSWORD`, `MAP_*`); the service now receives exactly the 11 validated keys. Pinned the Compose subnet to `172.30.0.0/24` and defaulted `TRUSTED_PROXY_IPS` to it, so per-client rate limiting works behind Nginx. Pinned `nginx:1.30.6-alpine`.
- **Nginx re-resolves upstreams.** `nginx.conf` uses Docker's embedded DNS (`resolver 127.0.0.11 valid=10s`) with variable `proxy_pass` and hoisted proxy headers, so recreating an upstream container no longer leaves Nginx proxying to a stale IP until restart.
- **Migrations can run inside the API image.** New `src/db/migrate.ts` (drizzle-orm runtime migrator over the shipped `drizzle/` folder) plus `db:migrate:runtime`; the production image excludes drizzle-kit, so `docker compose run --rm api bun src/db/migrate.ts` is now the in-stack path. `seed.ts`/`drizzle.config.ts` dotenv banners silenced.
- **Smaller items:** routing gateway closes gracefully on SIGINT/SIGTERM and runs via direct `bun server.mjs`; `build-routing.sh` builds OSRM graphs as the invoking user instead of leaving root-owned files. Docs/runbook updated for all of the above (existing stacks need one `docker compose down` + `up` for the network change).
- Validation: Compose/Martin YAML assertions; Photon healthcheck command executed against a live test server (200→0, closed port→non-zero); Nginx config parsed clean with crossplane; ShellCheck clean on all scripts; routing-gateway tests 19/19; server tests 143/143 + typecheck; `migrate.ts` smoke (missing `DATABASE_URL` exits 1 with a clean message); style verifier OK; all 31 runbook bash blocks pass `bash -n`.

### 2026-10-20 — Runbook audit after live Step 12 success on the VM

- Live VM verification progressed: after the Step 11 Nominatim fix and the Step 12 secret/password recovery, the full serving stack runs on the Ubuntu 24.04 VM—`postgres`, `api`, `map-server` (Martin), and `routing-gateway` report `(healthy)`, and `osrm-car`/`osrm-bicycle`/`osrm-foot` and `photon` are `Up`. Step 13 acceptance scripts are the remaining gate for T1.4.2/T1.4.4/T1.4.5.
- Audited `docs/UBUNTU_VM_RUNBOOK.md` against the repo (Compose defaults, `.env.example`, map script pins/env names, verify-script endpoints—all consistent) and fixed what had drifted: A5 now clones/updates branch `arena/ec9ffc7e-borobiya` (was the old `arena/91f87b17-borobiya`) and names commit `7afe63d`-or-newer instead of stale `f32191e`; intro VM disk corrected to 50 GB; step 11 notes `health: starting` during the Nominatim import is expected; step 12 states the expected seven-service healthy result and that it does not start `api`/`nginx`.

### 2026-10-20 — Step 12 troubleshooting: stale API container and Martin/Postgres password mismatch

- Runbook step 12 now explains two restart-loop cases seen on the VM. (1) The step 12 `up -d` command intentionally starts only the map services, so a crash-looping `api` container from an earlier attempt (JWT placeholder secrets) survives untouched; the documented fix now uses `docker compose up -d --build --force-recreate api`. (2) `map-server` (Martin) restart-looping with `password authentication failed` means `POSTGRES_PASSWORD` changed after the `postgres-data` volume was initialized—the volume keeps the first password while Compose hands Martin the current terminal/`.env` value, and the Postgres healthcheck (`pg_isready`) cannot detect it. Documented recovery: restore the original password in `.env`, or at this pre-migration stage reset only `borobiya_postgres-data` and rerun step 12 (tiles, OSRM graphs, Photon index, and the Nominatim volume live elsewhere).

### 2026-10-19 — Fixed Nominatim restart loop at VM step 11 (read-only mount inside chown'ed project dir)

- Root cause, verified against the mediagis 5.3 image's own `start.sh`/`init.sh` (image-era commit `44bb833`): both run under `bash -ex` and recursively `chown -R nominatim:nominatim /nominatim` (`PROJECT_DIR`) before importing. Compose mounted `./map-server/data` read-only at `/nominatim/data`, so the `chown` failed with `Read-only file system`, the entrypoint exited 1, and the container restart-looped—Step 11 could never complete. Fixed by mounting the data directory read-only at `/osm` (outside `PROJECT_DIR`) and pointing `PBF_PATH` there; the crop stays read-only and host files are never re-owned. Existing failed attempts need no volume cleanup: no `import-finished` marker exists, so the entrypoint re-runs init and drops/re-imports the database on the next start (`--force-recreate` after `git pull`). Runbook step 11 documents the symptom and recovery.

### 2026-10-19 — Deeper Docker/runtime review: Martin privacy fix and API lifecycle hardening

- **Security fix:** disabled Martin Postgres auto-discovery (`postgres.auto_publish: false`). With only a connection string configured, Martin 1.16.1 defaults to publishing spatial tables/functions from the connected database, which would eventually include private `users.last_location` data after migrations. Only explicitly reviewed public tile tables/functions may be enabled later.
- API container lifecycle: `server.ts` now closes Fastify (and therefore the Postgres pool) on `SIGINT`/`SIGTERM` and also closes the app if `listen()` fails; the Dockerfile runs `bun src/server.ts` directly so Docker signals reach the server instead of a package-script wrapper. A blank `ADMIN_SEED_PASSWORD` passed by Compose is now treated as unset by the seed password resolver (tested), instead of failing as a literal empty password.
- Build/verification polish: excluded the Photon JAR from the root API build context (Photon's own build context is unaffected), added connection retries to `verify-tehran-tiles.sh` for a still-starting Martin, and documented reloading `.env` after the Step 12 JWT fix because Compose interpolation prefers stale shell variables over the edited file.
- Validation: server tests 143/143 and typecheck; routing-gateway tests 19/19 under Node; a direct `bun src/server.ts` smoke test served `/_public/health` and exited 0 on SIGTERM with the graceful-shutdown log line; Compose/Martin YAML parses. Remaining known gap (full app only, not map Step 13): database migrations still run from the host Bun toolchain—the production API image intentionally excludes `drizzle-kit`, so `db:migrate` cannot run inside the container.

### 2026-10-19 — Fixed API placeholder-secret crash-loop at VM step 12; Docker env hardening

- Root cause: following the runbook exactly still left the example `JWT_SECRET`/`JWT_REFRESH_SECRET` placeholders in `.env` (A6 only covered `NOMINATIM_PASSWORD`), so the API's fail-closed env validation crash-looped `borobiya-api-1` while the map services themselves started healthy. Runbook A6 now generates all secrets (two different JWT secrets, Nominatim + Postgres passwords, matching `DATABASE_URL`) with `openssl rand -hex` before the first `docker compose up`, warns against changing DB passwords after their volumes initialize, and step 12 documents the JWT-only fix (`sed` + `docker compose up -d api`) for already-running VMs.
- Docker audit fixes: removed the API service's whole-file `env_file: .env` dump from `docker-compose.yml`—Compose now passes only the variables `packages/server/src/config/env.ts` validates (plus `ADMIN_SEED_PASSWORD` for the seed script), so the container no longer receives the host `DATABASE_URL` or unrelated service passwords; updated `docs/SECURITY.md` to match. Silenced dotenv's "injected env" banner in the container (`quiet: true`; Compose supplies the environment there). Martin's Postgres dependency was checked and is intentional (`martin.yaml` configures a Postgres connection). Live Step 13 acceptance still requires the VM run.

### 2026-10-19 — Fixed OSRM image tag (VM step 12 blocker)

- Corrected the pinned OSRM image from `ghcr.io/project-osrm/osrm-backend:v26.10.0` (does not exist—upstream's publish workflow only creates suffixed tags plus bare `latest`, verified against the `v26.10.0` workflow run, which completed successfully) to the multi-arch `v26.10.0-debian` tag in `docker-compose.yml`, `build-routing.sh`, and `docs/MAP_SERVER.md`. The bad reference had made Compose abort every other pull/build in step 12 (`Interrupted`/`No such image` cascade, including Martin, PostGIS, and the locally built Photon image); Martin's `ghcr.io/maplibre/martin:1.16.1` tag was re-verified against upstream docs and is unchanged. Runbook step 12 now has a short failure note covering this and the local Photon build. If step 10 had failed on the same tag, the OSRM graphs must be rebuilt after `git pull`; live T1.4.2/.4/.5 checks still require the VM rerun.

### 2026-10-19 — Unblocked VM step 8: Osmium pin aligned to Ubuntu 24.04, host-proxy runbook section

- Re-pinned Osmium Tool to **1.16.0** (Ubuntu 24.04 apt) consistently in `prepare-tehran-pbf.sh`, `.env.example`, `docs/MAP_SERVER.md`, and the VM runbook. The previous default blocked the crop on the target VM whenever `.env` was stale or not loaded in the terminal, which then made `verify-map-pbf.sh` report the (not yet created) crop as missing. The script's version-mismatch error now prints the exact fix, and runbook step 8 documents both errors with a one-line `sed` fix for a stale `MAP_OSMIUM_VERSION`.
- Added a short Proxy section (Set proxy / Remove proxy) to `docs/UBUNTU_VM_RUNBOOK.md` with a dynamically detected VMware host (NAT gateway) address: terminal exports for downloads, plus compact `apt`/Docker/Java blocks only if needed. No proxy values were added to `.env` or Compose; the serving stack remains offline. Live T1.4.2/.4/.5 checks still require the user's VM run.

### 2026-10-19 — Added Ubuntu 24.04 low-memory VM runbook and resource tuning

- Added a complete Docker Engine/Compose, Java 21, Osmium, data, build, import, launch, and live verification walkthrough for the user's 4-vCPU/6-GiB/40-GB VMware VM.
- Reduced Planetiler's default Java heap to 3 GiB; OSRM builders now run profiles sequentially with two threads, OSRM runtimes use one worker and a 100-location table cap, and Nominatim/Photon use conservative memory defaults.
- Documented the Ubuntu 24.04 Osmium 1.16.0 package override and the current `iran-latest` checksum/date; real workload fit remains to be verified on the VM.

### 2026-10-19 — Shared OSM crop and offline geocoder pipeline (T1.4.2/4/5 implementation; live checks pending)

- Added a reproducible preparation flow for the approved Geofabrik Iran snapshot (2026-10-18): verifies official MD5, crops `MAP_BBOX` once with Osmium smart extraction, computes source/crop SHA-256 values, and writes an ODbL provenance manifest. Tile and OSRM builders validate the same crop; OSRM graphs record the PBF and manifest hashes.
- Added an opt-in Nominatim 5.3 import container consuming that crop, a checksum-verified Photon 1.3.0 JAR download/build path, local `/geocode` and `/reverse` gateway proxies, and live smoke scripts. Added linked OSM attribution in the app footer (both MapLibre styles already expose it).
- Validation: gateway unit/integration tests 19/19; client tests 48/48, typecheck and production build; shared tests 32/32 and typecheck; server tests 143/143 and typecheck; style, shell, synthetic crop-manifest, YAML parse, and diff checks pass. Docker, Java, Osmium, and the real PBF are unavailable here, so T1.4.2, T1.4.4, and T1.4.5 remain unchecked pending local service results; source SHA-256 will be recorded after the local download.

### 2026-10-19 — Added user map and dashboard views (T1.5.5; live map data unverified)

- Replaced the `/_user/map` and `/_user/dashboard` placeholders with a full-height MapCanvas view and a responsive dashboard map widget. Both views derive their map style from the resolved app theme and provide navigation between the two routes.
- Added a dashboard status area that distinguishes the currently available base map from future location-sharing/SOS features instead of displaying fabricated live-user or incident data. Added a full map link to the signed-in user navigation.
- Validation: 46/46 client tests, typecheck, production build, and `git diff --check` passed. Actual tile rendering remains unverified pending the Map Server runtime/data.

### 2026-10-19 — Added Map Server outage fallback (T1.5.4; implementation complete, live outage unverified)

- Added an accessible map error/configuration snackbar with a same-instance style retry; `/map-config` failure continues using safe local bounds/zoom. MapLibre's memory tile cache now retains eight zoom levels.
- Added a map-only network-first Service Worker cache for same-origin style/tile/sprite/glyph resources (512-entry cap), with cache fallback on offline/5xx and client notification; API/config/route/geocode requests are excluded. Persistent browser cache requires HTTPS or localhost, while the in-memory cache remains available on insecure LAN origins.
- Worker tests cover network caching, offline/5xx fallback, empty-cache 503, and request scoping. Full Map Server outage testing remains blocked by missing local map runtime/data.

### 2026-10-19 — Added app-wide theme preference and no-flash startup (T1.5.3; complete)

- Added a persisted `system`/`light`/`dark` theme preference, a header menu to select it, and live `prefers-color-scheme` updates when following the system. Vuetify's global theme and Tailwind's manual `dark:` variant stay synchronized with the root theme class.
- Added synchronous pre-paint `theme-init.js` and theme-color metadata updates to prevent a flash of the wrong theme; expanded dark palettes across the app shell and authentication screens.
- Added preference/resolution tests and VM tests for pre-paint system detection and explicit override. Client tests passed (38/38), typecheck and production build passed.

### 2026-10-19 — Added reactive light/dark map styles (T1.5.2; complete; live latency unverified)

- Made `MapCanvas.vue` react to `styleUrl` changes and exposed an imperative `setStyle(url)` method. Style switches use `map.setStyle(url, { diff: true })` on the existing MapLibre instance, retaining camera position and DOM-backed markers.
- Added option tests for style URL normalization and diff-based switching. Client tests passed (32/32), client typecheck passed, and `map-server/scripts/verify-styles.py` confirmed that light/dark styles share one source, 24 structurally matching layers, sprite/glyph endpoints, and all 9 SVG sprites.
- Both styles configure a 150ms global paint transition with no delay. The live end-to-end map-rendering target is not benchmarked because approved map tile data/server runtime is unavailable; app-wide theming was subsequently implemented in T1.5.3, while map/dashboard views remain T1.5.5.

### 2026-10-19 — Initialized the MapLibre canvas (T1.5.1; complete)

- Added MapLibre GL JS 6.15.0 and a reusable `MapCanvas.vue` with a Tehran center, same-origin light style, visible style-source attribution, zoom/compass navigation controls, metric scale, accessible canvas labeling, and lifecycle cleanup. The component applies validated runtime bbox/zoom settings when `/map-config` responds and starts with safe Tehran defaults if config is unavailable.
- Added pure option tests (3 passed). Client typecheck and production build passed; an explicit Vite entry build also compiled the MapCanvas component and MapLibre CSS. The real style/tiles were not exercised because no approved PMTiles archive exists; style switching was subsequently implemented in T1.5.2, while full map views and outage UX remain future tasks.

### 2026-10-19 — Added MapLibre styles and Martin assets (T1.4.3)

- Added light/dark v8 styles with the same `tehran` vector source and identical layer IDs, order, filters, and layouts; theme differences are in layer paint. Both documents validate against `@maplibre/maplibre-gl-style-spec` 26.4.4, and `map-server/scripts/verify-styles.py` provides a dependency-free parity/SVG check.
- Added `map-server/martin.yaml` and Compose mounts for the styles, SVG sprite source, fonts, and data. Config validates against Martin 1.16.1's published schema. Martin generates sprite PNG/JSON sheets and glyph PBF ranges dynamically; no generated binary assets or `font-maker` build are needed.
- Bundled Noto Sans Regular and Noto Naskh Arabic Regular under SIL OFL 1.1, with provenance/checksums; configured a Latin + Arabic/Persian fallback alias. Added the Borobiya POI SVG icons and updated endpoint/development documentation.
- T1.4.3 is complete based on static validation. Martin/Docker are unavailable here, so the style/sprite/font endpoints were not exercised against a real server; tile serving remains blocked under T1.4.2.

### 2026-10-19 — Configurable map settings through pipeline and runtime (T1.4.6; complete)

- Passed `MAP_REGION`, `MAP_BBOX`, `MAP_DATA_VERSION`, and zoom bounds through Compose and the routing gateway. Added the validated public `GET /config` response (same-origin `/map-config` through Nginx/Vite), shared Zod types, and a client fetch helper that rejects invalid responses without exposing service URLs.
- Updated Planetiler and OSRM build scripts to require an explicit reuse-approved PBF and use region/bounds/version/zoom settings; tile output is region-named with a checksummed metadata manifest. Updated the pipeline/runbook and clarified that non-Tehran runtime styles still need source wiring.
- Validation: Node and Bun gateway suites passed (12 tests each); all shared tests passed (32), all client tests passed (27), shared/client typechecks and client production build passed, Compose YAML parsed with expected settings, shell syntax checks and `git diff --check` passed. Docker runtime and real tile/route generation were not run; T1.4.2 and T1.4.4 remain open.

### 2026-10-19 — Configured OSRM routing scaffold (T1.4.4; incomplete)

- Added separate OSRM 26.10.0 Compose services for car, bicycle, and foot graphs, plus a `POST /route` gateway translating the project `{from,to,profile,alternatives}` body into OSRM's native POST API (`bicycle` maps to OSRM's `bike` URL profile). Added same-origin Nginx/Vite routing proxies and an MLD graph builder that requires an explicitly supplied reuse-approved Tehran PBF.
- Added Node/Bun tests, including a full loopback HTTP integration test against local OSRM-compatible fixtures; all 8 tests pass with both runtimes. Client typecheck/build, Compose YAML parsing, shell syntax, and `git diff --check` pass.
- T1.4.4 remains open: no actual OSRM graph or live offline route has been produced/tested because Docker/OSRM are unavailable and the local candidate PBF's reuse terms remain unresolved.

### 2026-10-19 — Started Tehran tile generation (T1.4.2; incomplete)

- Downloaded a 9.2 MB local Tehran OSM PBF sample into ignored `map-server/data/tehran.osm.pbf`; validated its PBF header, Tehran bounds (51.27–51.55 E, 35.60–35.81 N), and object counts with libosmium. A local source/checksum note is stored beside it; the sample is not committed.
- Corrected the Martin 1.16.1 tile URL in the runbook and task criteria: `tehran.pmtiles` is served at `/tehran/{z}/{x}/{y}`; `.pbf` is an optional redirect suffix, while the bare `/{z}/{x}/{y}.pbf` route is not a Martin source endpoint. Added `generate-tiles.sh` (pinned JAR checksum, explicit input PBF, MAP_BBOX/zoom handling, atomic archive and metadata output) and `verify-tehran-tiles.sh` (health, status, MVT content type, non-empty tile); the verifier's response handling passed against a local HTTP fixture (not Martin).
- T1.4.2 remains unchecked: no Java or Docker is installed, and the official Planetiler release download redirects to a host outside the sandbox network allowlist. No PMTiles archive was generated and no Martin tile request was run.

### 2026-10-19 — Pinned map-server toolchain versions (T1.4.1)

- Selected and documented Martin 1.16.1, Planetiler 0.10.2, OSRM 26.10.0, and Photon 1.3.0 from official stable releases. Pinned the Compose Martin image and updated the version-specific examples and Java prerequisite; recorded SHA-256 hashes for the Planetiler and Photon JARs.
- Corrected the Photon import guidance: Photon does not consume raw OSM PBF, so T1.4.5 must choose and provision a Nominatim database or Photon JSON dump.
- Validation: checked official release metadata/assets and version-tag conventions, audited stale version references, and ran `git diff --check`. Docker/Compose runtime validation remains unavailable in this environment.

### 2026-10-19 — Completed-task bug review: session revocation and admin navigation

- Found that clearing refresh-session hashes on logout, password reset, and deactivation did not invalidate already-issued access JWTs until their 15-minute expiry. User and admin authorization now also require the token's matching user/session/device row to retain an unrevoked refresh hash, so those JWTs stop working immediately after revocation.
- Found that admin login fell through to the regular user dashboard. Admins now land on `/_admin/users` unless a safe internal redirect is present; the admin page refreshes a near-expiry session before list/status requests.
- Validation: 196 workspace tests (28 shared, 143 server, 25 client), all three typechecks, client production build, and `git diff --check` passed. No live PostgreSQL is available for an end-to-end session-store smoke test.

### 2026-10-19 — Admin user-management UI (T1.3.4)

- Replaced the `/_admin/users` placeholder with a Persian RTL account table, debounced username search, active/inactive filters, server pagination, account setup/role/status details, and a confirmation dialog for status changes. Deactivation explains that active sessions are revoked; the signed-in admin cannot deactivate their own account from this view.
- Added a validated same-origin client for the admin list and status endpoints, request cancellation for stale searches, route/API tests, and an admin navigation link.
- Validation: 189 workspace tests (28 shared, 139 server, 22 client), all three typechecks, client production build, and `git diff --check` passed. No live PostgreSQL is available for an end-to-end API/database smoke test.

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
