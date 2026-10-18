# Borobiya — Tasks

> **Source:** Generated from the Technical Specification Checklist (§23, 39 items) + Roadmap phases. Check boxes in PRs. This is the actionable backlog.

Legend: `→` dependency, `AI` ideal for AI agent, `H` human-preferred.

---

## Phase 1 — Foundation (Auth & Map)

### 1.0 Monorepo & Contracts

- [x] **T1.0.1** Init root `package.json` (workspaces), `tsconfig.json` strict, `.gitignore`, `.env.example` → *see STRUCTURE.md §7* — completed 2026-10-18
- [x] **T1.0.2** Create `packages/shared` with Zod schemas: `auth`, `user`, `location`, `sos`, `admin`, `search`, `common` + enums — completed 2026-10-18
- [x] **T1.0.3** Add `km-api` scaffold in `packages/shared/src/api/*` (method, url, schema, meta) — completed 2026-10-18
- [x] **T1.0.4** Create `packages/server` Fastify skeleton + `app.ts`, `server.ts`, env validation, helmet, cors, rate-limit plugin shell — completed 2026-10-18
- [x] **T1.0.5** Create `packages/client` Vite+Vue3+Vuetify+Tailwind+Pinia+VueUse skeleton + `views/_auth/_public/_user/_admin` placeholders — completed 2026-10-18
- [x] **T1.0.6** Wire OpenAPI: `@fastify/swagger` + Swagger UI → `/docs` + `/docs/json`; Zopia generation script — completed 2026-10-18
- [x] **T1.0.7** Root script `bun run dev` (concurrently API+client) + Docker Compose (`api`, `postgres`, `map-server`, `nginx`) — completed 2026-10-18

### 1.1 Database & Seed

- [x] **T1.1.1** Decide ORM: Drizzle + Postgres.js (document in ARCHITECTURE ADR) + initial account/security/session schema — completed 2026-10-18
- [x] **T1.1.2** Migration: `users`, `security_questions`, `user_security_answers`, `user_sessions` (see ERD) — completed 2026-10-18
- [x] **T1.1.3** Add/migrate and seed 15 security questions + 11 scoped cancellation reasons + Argon2id bootstrap admin (`admin / admin123`, local only; must change) — completed 2026-10-18
- [x] **T1.1.4** Add `mustCompleteSecurityQuestions`, `isActive`, `isSuspended`, `avgRating`, `lastLocation (geography)` to `users` — completed 2026-10-18

### 1.2 Auth (`_auth`, `_admin` user creation)

- [x] **T1.2.1** `POST /_auth/register` — five existing unique questions, duplicate-username handling, Argon2id password/normalized-answer hashes, atomic persistence, guest-only 403, and 5/15m IP+username limit — completed 2026-10-18
- [x] **T1.2.2** `POST /_auth/login` — username+password, Argon2id verify, 5/15m per IP+username, access/refresh JWTs (15m/7d), persisted refresh hash, browser HttpOnly cookie/native body — completed 2026-10-18
- [x] **T1.2.3** `POST /_auth/refresh`, `POST /_auth/logout` — signed refresh verification, session/account matching, atomic hash rotation, browser HttpOnly cookie/native body transport, idempotent logout, account-state checks, and guest-only enforcement — completed 2026-10-18
- [x] **T1.2.4** Forgot flow: `request` (server picks 3/5 random) → `verify` → `reset` (10m single-use resetToken) — Argon2id answer checks, persisted one-time challenge/token, atomic password reset, session revocation, guest-only enforcement, and rate limits — completed 2026-10-18
- [ ] **T1.2.5** `POST /_admin/users` — admin creates user without questions, set `mustCompleteSecurityQuestions=true`
- [ ] **T1.2.6** `POST /_user/complete-security-questions` — middleware blocks all other `_user` ops until done, returns `SECURITY_QUESTIONS_REQUIRED` code
- [ ] **T1.2.7** Frontend: `/_auth/{login,register,forgot-password}` + `/_user/complete-security-questions` + guards (guest-only `_auth`, redirect if `mustCompleteSecurityQuestions`)

### 1.3 Admin User Management (No Delete!)

- [ ] **T1.3.1** `PATCH /_admin/users/:id/status` {isActive} + audit log `admin_audit_log`
- [ ] **T1.3.2** `GET /_admin/users` (q,isActive,hasCategory,pagination) + `GET /_admin/users/:id` detail (devices, missions)
- [ ] **T1.3.3** Ensure NO `DELETE /_admin/users/:id` exists (add test that asserts 404 on DELETE)
- [ ] **T1.3.4** Frontend `_admin/users` table + activate/deactivate toggle + search

### 1.4 Map Server (Independent, Offline Vector)

- [ ] **T1.4.1** Pick exact tools: Martin/Planetiler/OSRM/Photon versions + document in MAP_SERVER.md
- [ ] **T1.4.2** Download Tehran sample PBF + generate `tehran.pmtiles` + verify `/{z}/{x}/{y}.pbf` serves
- [ ] **T1.4.3** Author `styles/light.json` + `styles/dark.json` (same `sources`, different `layers` paint) + sprites/glyphs
- [ ] **T1.4.4** Configure OSRM routing for `car/bicycle/foot` profiles + test `POST /route` offline
- [ ] **T1.4.5** Configure Photon offline index + test `GET /geocode` + `GET /reverse`
- [ ] **T1.4.6** ENV wiring: `MAP_REGION`, `MAP_BBOX`, `MAP_DATA_VERSION`, `MAP_MAX_ZOOM` + update pipeline doc

### 1.5 Client Map & Theming

- [ ] **T1.5.1** MapLibre init in `components/map/MapCanvas.vue`, center Tehran, attribution, controls
- [ ] **T1.5.2** Theme switch: `map.setStyle(newStyle)` <200ms, preserve camera/markers, sprites/glyphs work both themes
- [ ] **T1.5.3** App-wide dark/light: Vuetify theme + Tailwind `dark:` + `localStorage` + `prefers-color-scheme`, no flash
- [ ] **T1.5.4** Graceful degradation if Map Server down (toast, cached tiles, no crash)
- [ ] **T1.5.5** Build `views/_user/map` (full-screen map) + `views/_user/dashboard` (map widget)

---

## Phase 2 — Location Sharing

### 2.1 Live Sharing

- [ ] **T2.1.1** Table `location_shares` (ownerId,targetUserId,mode,expiresAt,isRevoked,priorityDeviceId)
- [ ] **T2.1.2** `POST /_user/location/share` {targetUserIds, mode, durationMinutes, note} → timed/permanent
- [ ] **T2.1.3** `DELETE /_user/location/share/:shareId` — immediate revoke
- [ ] **T2.1.4** `GET /_user/location/shares` (mine + shared-with-me)
- [ ] **T2.1.5** Socket `location:update` every 3-5s (client throttled), server verify `priorityDeviceId`, upsert `users.lastLocation`, insert `location_history`
- [ ] **T2.1.6** Cron: expire `location_shares` where `expiresAt < now` (1m interval)
- [ ] **T2.1.7** Frontend: share dialog, target picker (user search), duration slider, “My Shares” + “Shared With Me” lists

### 2.2 History Sharing & Retention

- [ ] **T2.2.1** Table `location_history` (userId, lat, lon, accuracy, timestamp) + PostGIS index + optional月 partition
- [ ] **T2.2.2** Table `location_history_shares` (ownerId,targetUserId, from, to)
- [ ] **T2.2.3** `POST /_user/location/history/share` {targetUserIds, from, to, maxPoints?} — validate `to-from <= MAX_SHARE_DAYS`
- [ ] **T2.2.4** Receiver: fetch polyline + time slider (downsample if maxPoints)
- [ ] **T2.2.5** ENV `LOCATION_HISTORY_RETENTION_DAYS=90`, `LOCATION_HISTORY_MAX_SHARE_DAYS=30` + daily prune cron
- [ ] **T2.2.6** Frontend: date range picker (last 7d shortcut) + Map polyline playback + slider

### 2.3 Multi-Device Priority

- [ ] **T2.3.1** `user_sessions` per device: deviceId, deviceName, refreshTokenHash, ip, lastActiveAt, isOnline
- [ ] **T2.3.2** `GET /_user/devices` — Active Devices Table
- [ ] **T2.3.3** Warning modal if `activeDevices.length>1` on live-share/SOS start: “Select broadcasting device” → store `priorityDeviceId`
- [ ] **T2.3.4** Server: reject `location:update` if `from != priorityDeviceId` (when set)
- [ ] **T2.3.5** Settings page: device list + change priority anytime
- [ ] **T2.3.6** Frontend composable `usePriorityDevice` + Capacitor device detection

---

## Phase 3 — SOS Rescue

### 3.1 Admin Domain: Incidents & Categories

- [ ] **T3.1.1** Tables: `incident_types` (name, slug, icon, color), `categories`, `category_incident_types`, `category_users`
- [ ] **T3.1.2** `POST /_admin/incidents` + `GET /_admin/incidents` + update
- [ ] **T3.1.3** `POST /_admin/categories` {name, description, incidentTypeIds} + `POST /_admin/categories/:id/users`
- [ ] **T3.1.4** All users start in NO category; admin assigns; user can be in multiple categories (verify)
- [ ] **T3.1.5** Frontend `_admin/incidents` + `_admin/categories` + assign-users dialog

### 3.2 SOS Request (Requester)

- [ ] **T3.2.1** Table `sos_requests` (requesterId, severity, description, incidentTypeId, lat/lon/accuracy/isManual, photoUrl, status, createdAt)
- [ ] **T3.2.2** `POST /_user/sos/requests` — severity enum, 10-500 desc, incidentType dropdown, GPS auto or manual map pick, optional photo 5MB multipart
- [ ] **T3.2.3** `POST /_user/sos/requests/:id/photo` upload + storage (local volume)
- [ ] **T3.2.4** Big red SOS button (always accessible) → form in bottom sheet + map picker
- [ ] **T3.2.5** Emit `sos:new-request` to `admin` room + pulsing marker + sound + severity color

### 3.3 Dispatch & Nearest (Admin)

- [ ] **T3.3.1** Nearest SQL using `ST_Distance(lastLocation, sos.location)`, filter `category ∩ incidentType`, `isActive`, `!isSuspended`, `!isOnMission`, `lastLocation!=null`, order distance, `avgRating` tie-break, limit 10 → *AI*
- [ ] **T3.3.2** `POST /_admin/sos/requests/:id/dispatch` {rescuerIds: string[]} → create `mission_proposals` (pending) + emit `sos:proposal-received` per rescuer
- [ ] **T3.3.3** Also `GET /_admin/sos/requests/:id/nearest` suggestion endpoint
- [ ] **T3.3.4** Admin panel: alert card on map + proposal list (distance, rating, lastActiveAt, categoryName) + multi-select dispatch

### 3.4 Proposals (Rescuer)

- [ ] **T3.4.1** Table `mission_proposals` (sosRequestId, rescuerId, status: pending|accepted|declined|expired)
- [ ] **T3.4.2** `GET /_user/sos/proposals` inbox (poll + socket) — bell count
- [ ] **T3.4.3** `POST /_user/sos/proposals/:id/accept` — guard `isOnMission=false`, set proposal accepted, create `missions`, `rescuer.isOnMission=true`, auto-decline own other pendings
- [ ] **T3.4.4** `POST /_user/sos/proposals/:id/decline` {reason?}
- [ ] **T3.4.5** Guard: if `isOnMission=true`, dispatch query skips them + runtime 400 on accept
- [ ] **T3.4.6** UI: Inbox list (incidentType, severity, distance, requesterName, photo, description, map mini) + can view multiple, accept one

### 3.5 Live Mission & Navigation

- [ ] **T3.5.1** Table `missions` (sosRequestId, rescuerId, requesterId, status, cancelledBy..., createdAt/updatedAt) + `mission_status_history`
- [ ] **T3.5.2** `PATCH /_user/missions/:id/status` — enum `on_the_way → arrived → in_progress → completed` (strict order, see §11.6 table)
- [ ] **T3.5.3** Emit `mission:status-updated` to `mission:{id}` room (requester+rescuer+admin)
- [ ] **T3.5.4** On accept: `map.fitBounds([rescuerCoords, requesterCoords])` with padding
- [ ] **T3.5.5** “Go to Incident Location” button → transport chooser `car|bicycle|foot` → `POST /route` (Map Server) → 2-3 alternatives with distance/duration/elevation
- [ ] **T3.5.6** Rescuer selects route → Start Navigation → pitch `60/45/0`, bearing follow, `zoom 17/16/17`, `easeTo` throttled 1s
- [ ] **T3.5.7** Live location for all 3 via `mission:{id}` room → markers + “Online/Offline + last seen” badge
- [ ] **T3.5.8** Timeline UI (both requester & admin see status steps with timestamps)

### 3.6 Cancellation & Re-dispatch (Critical)

- [x] **T3.6.1** Seed `cancellation_reasons` (requester 5 + rescuer 6 keys, see spec §11.7C) — completed with T1.1.3 on 2026-10-18
- [ ] **T3.6.2** Requester: `POST /_user/sos/requests/:id/cancel` {cancellationReasonId, customReason?} — must pick reason before accept
- [ ] **T3.6.3** Rescuer: `POST /_user/missions/:id/cancel` {cancellationReasonId, customReason?} — hidden behind “More→Unable to continue”, confirm, rate-limit 3/h, flag >2/day
- [ ] **T3.6.4** Server: set `missions.status=cancelled_by_*`, `rescuer.isOnMission=false`, emit `mission:cancelled-by-requester/rescuer`
- [ ] **T3.6.5** Rescuer cancel → urgent socket to `admin` room: red flash + sound + “NEEDS REPLACEMENT” badge with `rescuerLocation`
- [ ] **T3.6.6** Admin re-dispatch: reuse nearest query → immediate `POST /_admin/sos/requests/:id/dispatch` to next 10
- [ ] **T3.6.7** `GET /.../:id` reflects `cancelledBy`, `cancellationReason`, `cancelledAt`

### 3.7 History & Rating

- [ ] **T3.7.1** `GET /_user/sos/requests?role=requester` + `GET /_user/sos/missions?role=rescuer` — histories
- [ ] **T3.7.2** `POST /_user/missions/:id/rate` {rating 1-5, comment?} — only if completed, only by requester
- [ ] **T3.7.3** Table `mission_ratings` + compute `users.avgRating` cache trigger
- [ ] **T3.7.4** UI: Request History + Mission History pages, star rating display, used for future dispatch tie-break

---

## Phase 4 — Polish, Ship & Scale

### 4.1 Search & Geocoding

- [ ] **T4.1.1** `GET /_user/users/search?q&category&incidentType&minRating&sort=distance` + pagination, debounced 300ms, autocomplete
- [ ] **T4.1.2** Place search via Map Server: `GET /geocode?q=&limit=5&bbox=` → Photon/Nominatim
- [ ] **T4.1.3** Reverse: `GET /reverse?lat=&lon=` on map click/long-press → bottom sheet copyable address
- [ ] **T4.1.4** Frontend: search bar + result list + “fly to” on select

### 4.2 Routing Polish

- [ ] **T4.2.1** Multi-destination (waypoint) routing: A→B→C slider, drag reorder, `optimize=true` TSP toggle
- [ ] **T4.2.2** Alternative routes UI (2-3 cards with distance/duration/elevation chart for bike/foot)
- [ ] **T4.2.3** Exit navigation → reset `pitch 0, bearing 0`

### 4.3 Realtime & Disconnection

- [ ] **T4.3.1** Socket rooms: `user:{id}`, `admin`, `mission:{id}` + typed event map
- [ ] **T4.3.2** Heartbeat ping 25s / pong 10s timeout → `isOnline=false`, `lastSeenAt`, badge “Offline · 2 min ago”
- [ ] **T4.3.3** 5min grace before mission consideration (no auto-cancel v1)
- [ ] **T4.3.4** Reconnect: refreshToken, rejoin rooms, `GET /_user/sync?since=lastDisconnectAt`
- [ ] **T4.3.5** Fallback SSE endpoint if Socket fails (optional, architecture-ready)

### 4.4 UI/UX & a11y

- [ ] **T4.4.1** Responsive breakpoints `sm,md,lg,xl`, bottom-sheets on mobile, no map occlusion
- [ ] **T4.4.2** Loading skeletons, toasts, optimistic updates everywhere
- [ ] **T4.4.3** a11y: aria-*, keyboard nav, contrast 4.5:1, WCAG AA audit pass
- [ ] **T4.4.4** Perf: lazy routes, virtual scroll (user lists), map load <2s, location <500ms
- [ ] **T4.4.5** Design tokens (8px grid, colors, typography) in `styles/tokens.ts`

### 4.5 Testing

- [ ] **T4.5.1** Vitest: Zod schema tests (register 5 unique Q, password 8+letter+number, etc.)
- [ ] **T4.5.2** Route tests: prefix guards (already-authed 403, admin-only 403, no DELETE)
- [ ] **T4.5.3** SSE/Playwright E2E: login → share → SOS → dispatch → accept → status → rate

### 4.6 Workflows & Deploy

- [ ] **T4.6.1** Lefthook/Husky: `pre-commit` lint+typecheck, `pre-push` test+build dry-run
- [ ] **T4.6.2** `deploy.yml` GitHub Action: on `main` → build images → push → SSH `docker compose pull && up -d`
- [ ] **T4.6.3** `android.yml`: on tag `v*` → `cap sync` → `./gradlew assembleRelease` → APK artifact
- [ ] **T4.6.4** `.env.example` fully documented + `DEVELOPMENT.md` Windows vs Ubuntu

### 4.7 Docs & Cleanup

- [ ] **T4.7.1** Fill `USER_MANUAL.md` screenshots, `PROGRESS.md` 100%, `DIAGRAMS/*` rendered
- [ ] **T4.7.2** `SECURITY.md` audit, `API.md` links to live Swagger, `ROADMAP.md` Future section
- [ ] **T4.7.3** Tag `v1.0.0` + release notes

---

## Checklist Against Spec §23 (39 mandatory)

Track directly — each maps to tasks above:

| # | Requirement | Tasks | Done |
|---|-------------|-------|------|
| 1 | Vector PBF not PNG | T1.4.1-3 | ☐ |
| 2 | Fully offline LAN | T1.4, T4.6 | ☐ |
| 3 | Separate Map Server | T1.4, T1.0.7 | ☐ |
| 4 | Data pipeline OSM→PBF→deploy | T1.4.2, MAP_SERVER.md | ☐ |
| 5 | Coverage via ENV | T1.4.6 | ☐ |
| 6 | Dark/Light theme app+map | T1.5.2-3 | ☐ |
| 7 | Admin Web Panel | T1.2.5, T1.3, T3.1, T3.3 | ☐ |
| 8 | User Web Platform | T1.2, T2, T3.2, T3.4-7 | ☐ |
| 9 | Android (Ionic+Vue) | T1.0.5, T4.6.3 | ☐ |
|10 | Advanced user search | T4.1.1 | ☐ |
|11 | Place+Reverse geocode | T4.1.2-3 | ☐ |
|12 | Multi-dest routing car/bike/foot | T3.5.5, T4.2.1 | ☐ |
|13 | Camera pitch per transport | T3.5.6 | ☐ |
|14 | Live+history share | T2.1-2 | ☐ |
|15 | Retention via ENV | T2.2.5 | ☐ |
|16 | Multi-device priority | T2.3 | ☐ |
|17 | Auth user/pass + 5Q | T1.2.1-2 | ☐ |
|18 | Forgot server picks 3/5 | T1.2.4 | ☐ |
|19 | Admin create without Q → force | T1.2.5-6 | ☐ |
|20 | Activate/deactivate, NO delete | T1.3.1-3 | ☐ |
|21 | Hash pass+answers argon2 | T1.2.1-2 | ☐ |
|22 | Rate-limit+auto-suspend | T1.2.2, SECURITY.md | ☐ |
|23 | Incidents+categories multi | T3.1 | ☐ |
|24 | SOS form: severity,desc,type,loc,photo | T3.2.2-4 | ☐ |
|25 | Admin SOS alert + nearest | T3.3 | ☐ |
|26 | Rescuer multi-propose, accept1, busy | T3.4 | ☐ |
|27 | Live location for 3 | T3.5.7 | ☐ |
|28 | fitBounds+route+navigate | T3.5.4-6 | ☐ |
|29 | Statuses on→arr→inProg→done | T3.5.2 | ☐ |
|30 | Cancellation with reasons + alert | T3.6 | ☐ |
|31 | Request+mission history | T3.7.1 | ☐ |
|32 | Rating | T3.7.2-3 | ☐ |
|33 | Prefixes _auth/_public/_user/_admin | T1.0.5, T1.2.7, API.md | ☐ |
|34 | Full stack TS Zod etc. | T1.0.2-5 | ☐ |
|35 | Zod+km-api+Zopia | T1.0.3, T1.0.6 | ☐ |
|36 | UI/UX prof responsive a11y | T4.4 | ☐ |
|37 | Docs Human+AI | all docs/ | ☐ |
|38 | Workflows git/deploy/android | T4.6 | ☐ |
|39 | Docker Ubuntu + Windows no-Docker | T1.0.7, T4.6.4 | ☐ |

---

## How to Use

- Pick a phase, open a PR per 2-3 tasks.
- Update this file + `PROGRESS.md` in same PR.
- For AI: `T1.2.*` and `T3.3.*` are best entry points.

