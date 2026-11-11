# Implementation status

Borobiya 2.0.0 is a Bun-native runtime with a Vue 3 TypeScript client. The branch contains one application rather than parallel legacy packages. Canonical design images and reference generators remain intact; old implementation files, old documentation, old Python design tests and the Node.js toolchain are removed from the working tree.

## Implemented subsystems

Core infrastructure includes strict validators, typed errors, deterministic LRU caches, Argon2id password helpers, cookie helpers, configuration, rate limiting, HTTP security headers, a declarative router, safe static serving and a WebSocket hub built on `Bun.serve` upgrades. Domain modules provide shared geometry, state transitions, catalogs and deterministic offline SVG tiles. Storage provides one SQLite schema (`bun:sqlite`), a typed repository and a transaction-plus-durable-event boundary.

Services provide registration, login, recovery, sessions, profiles, devices, saved places, sync, tickets, live and historical location, SOS creation, dispatch, acceptance, mission progress, cancellation, rating, one-to-one PTT floor control, administration, map configuration and realtime coordination. Declarative routes expose public, authentication, user and administrator APIs plus OpenAPI and immutable SVG tiles.

Services also provide mission teams (members, one active membership per mission and user, admin-designated leadership), support requests (create, review, full/partial approval, rejection, withdrawal) with assisted-then-finalized staffing, and every mutation publishes a durable event to the `mission:<id>` audience.

The Vue client provides authentication, onboarding, the mobile map, four-step SOS composition with an optional compressed photo, mission and SOS rails, mission team roster and support-request surfaces for requesters, leaders and administrators, companions, live sharing, history, profile, press-and-hold PTT, and the desktop administrator console (including the support-requests review queue with a live pending badge). It uses eight typed Pinia stores, VueUse for browser state, one authenticated WebSocket, durable event catch-up, a versioned service worker compiled from TypeScript, a bounded offline tile cache, self-hosted fonts and a generated icon subset.

## Validation gate

`bun run check` is the full gate. It builds the Vue bundle and the service worker, runs `tsc` over the server, runs `vue-tsc --noEmit` over the client, runs the English-only documentation and clean-rebuild guard, then executes the whole Vitest suite with coverage. `./boro doctor` verifies runtime prerequisites and repository structure. `./boro verify` combines both. `bun run bench` records release latency figures, `bun run smoke` runs a reproducible in-process preview smoke with simulated proxy headers, and `bun run acceptance` verifies the closed checklist and release evidence. `./boro deploy:check` validates the production environment and generated assets. `bun install --frozen-lockfile` uses the committed `bun.lock`, and the workflow pins the Ubuntu 24.04 runner, a SHA-pinned `setup-bun` action, the Bun version file, least-privilege permissions and a per-ref concurrency group.

The Vitest suite covers every routed view and the role guard, the mobile shell's subscribe/teardown, geolocation and hold-to-SOS behaviour, the browser transport and push-to-talk codec, core rules, API envelopes and endpoints, authentication and recovery, security headers and limits, WebSocket tickets and rooms, durable event publication, live-location fan-out, binary PTT frames, complete user and administrator journeys, a full login-to-rating journey, architecture boundaries, documentation, icon inventory, generated assets, service-worker cache behavior, accessibility contrast, release-performance budgets, acceptance invariants, a legacy database migration, production configuration guards, preview-proxy CSP/CORS origins, explicit embedded-preview frame ancestors, Vuetify component mounting, Pinia stores, composables and the in-process preview smoke.

## Acceptance closure

`docs/ACCEPTANCE.md` maps the original foundation, authentication, map, location, SOS, mission, administration, polish, legacy and release targets to this implementation. A targeted review of the legacy root README, `TASKS.md`, `ROADMAP.md` and `PROGRESS.md` is recorded in `docs/LEGACY_REVIEW.md`, and the old mandatory geocoding, routing, navigation, Android, Docker/VM and virtual-scroll families are explicitly marked outside the contract. Every applicable item is checked; obsolete PostgreSQL/PostGIS, MapLibre, OSRM, Photon, Docker map pipeline and Android targets are marked superseded.

Professional visual acceptance against the canonical PNG references remains a separately deferred human review. The automated suite verifies structural, behavioral and asset invariants — including Vuetify component mounting and preview-header behavior — but it does not perform browser-driven navigation, screenshot comparison or real-device testing.

## Operational readiness

For production, install Bun 1.4.4, set a unique administrator password, disable demo seeding, enable secure cookies, configure exact allowed origins, terminate HTTPS at a trusted proxy and place the SQLite data directory on persistent storage. Use `/_public/health`, `/_public/openapi.json`, `/_admin/system/health`, a protected route, a tile request and a WebSocket upgrade as smoke checks. Back up the database and WAL together. Audio remains ephemeral and is never stored.
