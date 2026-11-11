# Acceptance checklist

This checklist maps the original technical specification and roadmap targets to the Bun 1.4.4 runtime and the Vue 3 TypeScript client delivered in 2.0.0. Every item is either implemented and verified by an automated gate, or explicitly marked as superseded by the current architecture. Professional visual/UI acceptance against the canonical PNG references remains a separate, deliberately deferred human review; no browser-driven professional UI test, screenshot comparison or real-device run is claimed here.

## Foundation and contracts

- [x] One repository, one package manifest, one `bun.lock` and two strict TypeScript projects (`tsconfig.server.json` for Bun, `tsconfig.client.json` for Vue).
- [x] The runtime is Bun 1.4.4 only, pinned in `.bun-version`, `packageManager` and CI; there is no `node`, `npm`, `npx`, `engines.node` or `@types/node` in the active toolchain.
- [x] `Bun.serve`, `bun:sqlite`, `Bun.password`, `Bun.file` and `Bun.build` replace Node HTTP, `node:sqlite`, `node:fs` and the custom WebSocket framing.
- [x] Shared protocol constants and pure geometry helpers in `src/shared` are imported by the Bun server, the Vue client and Vitest.
- [x] A declarative route table generates OpenAPI and owns every body, query, auth and rate-limit declaration.
- [x] One SQLite schema replaces the former PostgreSQL/PostGIS/Drizzle migration stack.
- [x] Vue 3 `<script setup lang="ts">` SFCs, typed Vue Router 4 routes, Vuetify 3 via `vite-plugin-vuetify`, Tailwind CSS 4 without preflight and seven typed Pinia setup stores replace the hand-written browser modules.
- [x] Generated assets and the service-worker cache manifest are deterministic and timestamp-free, so unchanged builds do not dirty the checkout.

## Authentication and account lifecycle

- [x] Registration requires five distinct catalog-backed security questions.
- [x] Login, rotating refresh, logout, session revocation and deactivation are implemented.
- [x] Password and answer hashes use Argon2id through `Bun.password` with per-value salts; answers are normalized before comparison and stored hashes stay self-describing.
- [x] Recovery uses three selected challenges, decoy responses for unknown usernames, attempt limits, expiry, one-use reset tokens and full session revocation.
- [x] Administrator-created accounts complete onboarding before ordinary use.
- [x] Guest-only and role-protected route guards are enforced by the server and the SPA router.
- [x] Active devices, login history, username changes, saved places and profile readiness are available. Responders can toggle mission readiness from the profile screen; the dispatch board reflects it.

## Map, location and offline behavior

- [x] Deterministic offline SVG vector tiles replace Martin, Planetiler, PMTiles and MapLibre.
- [x] Tile configuration, immutable ETags, content-versioned static assets and a bounded service-worker tile cache are implemented.
- [x] Live location, bounded live/history sharing, revocation, expiry, snapshots and authorized history playback are implemented.
- [x] Tapping the map selects a destination pin; the sheet shows coordinates and distance from the fix and saves it as a place; places are listed, edited inline and deleted from the profile screen.
- [x] One authenticated WebSocket carries durable events, presence, live fixes, snapshots, sync, talk state and binary audio.
- [x] Reconnect uses one-use tickets and an event cursor; durable events are committed before publication.
- [x] Private APIs are never cached by the service worker; static assets and SVG tiles are cached explicitly.
- [x] Service-worker install/activate, versioned static caches, stale-while-revalidate, private-API bypass, bounded tile caching and offline fallback are exercised without a browser.
- [x] External-Internet VM acceptance for the former map pipeline is superseded: the new map has no external data pipeline, Java tools, PMTiles artifacts or Docker map services.

## SOS, missions and dispatch

- [x] Four-step SOS composition includes description, location, optional compressed photo and review. The location step supports a manual incident pin: tap-to-place on the map with a dashed incident marker, a manual flag carried to the review and responder surfaces, and a recovery action back to GPS. The photo is validated (JPEG/PNG/WebP, 15 MB ceiling), downscaled and re-encoded as JPEG in the browser against the server's 160,000-character data-url cap, with a retryable error state.
- [x] SOS creation, cancellation reasons, dispatch, acceptance, mission progress, completion and one-time rating are implemented. The rating carries an optional ≤200-character report note (textarea on the mission screen), persisted server-side and served back on the mission projection.
- [x] SOS and mission state machines reject impossible transitions and expose stage indices.
- [x] Nearest responders, group selection, dispatch board data and administrator exports are implemented. The dispatch board now calls `GET /_admin/sos/:id/nearest`, shows distance/rating/readiness, and requires an explicit active, staffed group plus explicit member selection before dispatch.
- [x] Durable events update user, responder, administrator and socket consumers after commit.
- [x] One-to-one press-and-hold talk enforces one speaker, ordered binary frames, hold/idle release and no recording.

## Administration and operations

- [x] Overview KPIs, live map, groups, alerts, recent requests, reports, users, groups, incident types, audit, settings and system health are implemented.
- [x] User creation, role changes, active-state changes, group membership, alert resolution and settings updates pass through the service/event boundary.
- [x] User and audit CSV exports use formula escaping and no-store headers.
- [x] The last active administrator cannot be removed and an administrator cannot suspend or demote their own active account.
- [x] Practical English manuals, runbooks, architecture, API, WebSocket, security, performance, testing, automation, design-system and status documents are present.
- [x] The `boro` CLI provides setup, development, doctor, check, verify, deployment, database and clean commands.

## Acceptance polish

- [x] Responsive authentication, mobile and desktop layouts are implemented with explicit breakpoints and safe-area padding.
- [x] Loading, empty, error and offline surfaces are implemented for routed data and forms.
- [x] Skip navigation, focus restoration, modal focus handling, labelled icon-only controls, visible focus rings, reduced-motion support and keyboard shortcuts are implemented.
- [x] Contrast ratios for primary text, muted text and semantic status colors are verified by an automated check.
- [x] Lazy view loading replaces eager imports of all view modules; every one of the 20 views is a code-split chunk.
- [x] Every routed view and layout is mounted by the suite, and the role guard is exercised for anonymous, user, administrator and onboarding-only accounts.
- [x] Animation is declarative first (`<Transition>`, `<TransitionGroup>`, `motion-v`, `@vueuse/motion`) with GSAP limited to one timeline, and every duration collapses to zero under `prefers-reduced-motion`.
- [x] A full login-to-rating journey test exercises registration/session, sharing, SOS, dispatch, acceptance, mission status and rating.
- [x] A Bun-native benchmark records validator, tile, HTTP and live-location latency figures for release review.
- [x] CI runs install, diagnostics, typechecks, documentation guards, tests, acceptance invariants and deployment configuration checks.

## Superseded legacy targets

- [x] PostgreSQL/PostGIS migration, Docker Compose database refusal and PGlite acceptance are superseded by one native SQLite schema.
- [x] OSRM, Photon, elevation and PMTiles VM verification are superseded by deterministic in-process SVG tiles.
- [x] MapLibre warm/cold cache outage and eight-zoom Cache Storage acceptance are superseded by a versioned static precache and one bounded SVG tile cache.
- [x] Android/Capacitor workflow and LAN HTTPS HMR acceptance are superseded by one responsive browser application.
- [x] A Vue/Vuetify/Pinia test stack is reinstated as the current approach: Vitest with `@vue/test-utils`, `happy-dom` and real Vuetify mounting replaces the former native-module-only suite.
- [x] Playwright login-to-rating acceptance is represented by an automated API/realtime journey test; professional browser-driven UI acceptance remains deferred.

## Legacy feature scope reconciliation

The old root README and roadmap described a multi-service product. The clean rebuild deliberately replaces that contract with one responsive browser application and one Node process, so the following old mandatory features are superseded rather than silently treated as open work. The canonical PNG images remain the visual contract, and professional visual acceptance remains deferred.

- [x] Photon/Nominatim geocoding, reverse geocoding, address bottom sheets and debounced place autocomplete are superseded by deterministic in-process map data and saved places.
- [x] OSRM/Valhalla/GraphHopper routing, car/bicycle/foot profiles, multi-destination routes, navigation camera modes and elevation charts are superseded by the simplified SOS-to-mission workflow.
- [x] The priority-device chooser and PostGIS-backed multi-device GPS arbitration are superseded by session-bound authentication, active device visibility and one authenticated realtime channel.
- [x] Ionic/Capacitor Android packaging, signed APK artifacts and mobile LAN HTTPS HMR are superseded by one responsive progressive web application.
- [x] Docker Compose deployment, GHCR images, SSH cutover, Lefthook/Husky hooks and Windows/Ubuntu VM runbooks are superseded by single-process Bun startup, CI gates and the new operations runbook.
- [x] MapLibre theme-switch latency, eight-zoom Cache Storage, 512-resource map outage fallback and virtual-scroll user lists are superseded by generated SVG tiles, a versioned static precache, lazy view loading and benchmark budgets.
- [x] Playwright/SSE browser acceptance and screenshot/diagram sign-off are superseded by API/realtime journey, accessibility, asset, architecture and performance tests; human screenshot review remains deferred.
- [x] `PROGRESS.md` is a dated legacy work log with no open checkboxes; its later UI follow-ups do not redefine the clean-rebuild acceptance contract.

## Release evidence

- [x] `bun run check` passes: Vue bundle and service-worker build, `tsc` server typecheck, `vue-tsc --noEmit` client typecheck, the 24-document/154-image English-only guard and the full Vitest suite with coverage.
- [x] `./boro doctor`, `./boro verify`, `bun run bench`, `bun run smoke`, `bun run acceptance` and production-configured deployment checks pass under Bun.
- [x] CI installs with `bun install --frozen-lockfile` on a pinned Ubuntu 24.04 runner using a SHA-pinned `oven-sh/setup-bun` action and `.bun-version`, with non-persisted checkout credentials; it is least-privilege, concurrency-safe and covers push and pull-request events.
- [x] A reproducible in-process smoke command runs the server on `0.0.0.0` with simulated preview-proxy headers and checks health, preview CSP/CORS/framing, OpenAPI, map config and tiles, every precached asset, login, ticket issuance, WebSocket hello, SOS fan-out, administrator overview and system health.
- [x] Older SQLite files gain the SOS photo column without losing rows; production refuses demo seeding, known preview/CI passwords and weak administrator passwords.
- [x] Trusted `Host`, `X-Forwarded-Host` and `X-Forwarded-Proto` headers produce matching WebSocket CSP and CORS origins; explicit `FRAME_ANCESTORS` values permit embedded previews without a conflicting legacy DENY header.
- [x] Release notes and an operations runbook are present.
- [x] The branch is committed and pushed to its Arena branch with an open pull request that is not merged; no tag and no GitHub release are created.
