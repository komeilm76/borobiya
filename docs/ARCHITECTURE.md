# Architecture

Borobiya is a single-process Bun application. `Bun.serve` handles HTTP and WebSocket upgrades, `bun:sqlite` provides storage, `Bun.password` provides Argon2id hashing and `Bun.file` serves static assets. The browser application is Vue 3 with TypeScript single-file components, Vue Router 4, Vuetify 3, Tailwind CSS 4, Pinia and VueUse. The design goal is a small number of explicit boundaries rather than many plugins and duplicated stores.

## Layers

`src/server/core` contains infrastructure primitives: strict validators, typed errors, deterministic LRU caches, password and cookie helpers, configuration, token-bucket rate limiting, HTTP response helpers, a declarative router, safe static file serving and the WebSocket hub built on `Bun.serve` upgrades. These modules depend only on Bun and the shared protocol.

`src/server/domain` contains pure rules: geometry, state transitions, catalogs and deterministic SVG vector tiles. It does not import the database, services or Bun-specific modules. Server services import the shared geometry helpers from `src/shared/geo.ts` directly, so browser and server agree on coordinate conversion, distance, staleness and visible tile ranges; `domain/geo.ts` keeps only the server-side tile primitives.

`src/server/db` contains one SQLite schema, a typed repository and `UnitOfWork`. The repository owns SQL, event appending, event filtering and transaction execution. `UnitOfWork` wraps every state-changing use case: it opens a SQLite transaction, appends durable events inside that transaction, commits, and only then publishes those events through the WebSocket hub. A failed transaction publishes nothing.

`src/server/services` contains use cases. Authentication owns sessions and recovery; users owns profiles, devices, places and sync; location owns live fixes, shares and history; SOS owns requests, missions and transitions (offers are rows in `mission_offers`, created atomically at dispatch and consulted for both visibility and acceptance authorization); talk owns the one-to-one floor; administration owns console operations; realtime owns tickets, presence, rooms and audio authorization. Services never construct HTTP responses.

`src/server/routes` declares every endpoint, HTTP method, auth requirement, body schema, query schema and rate bucket. `src/server/app.ts` builds configuration, database, repository, hub, unit of work, services, router, static files, rate limiters and jobs, then handles one request pipeline. `src/server/index.ts` is the process entry point.

`src/shared` is the only module layer imported by both the server and the browser. `protocol.ts` holds the typed status values, event names, error codes, audio header constants and cache limits; `geo.ts` holds pure geometry and Persian formatting helpers.

## Request and event flow

An HTTP request receives a request ID, strict security headers, CORS headers and origin checks. The router resolves the declarative route, parses and validates input, applies rate limits, resolves the session cookie and calls one service method. Responses use a strict `{ok,requestId,data}` envelope or `{ok,requestId,error}` error envelope. Static responses add ETags, compression and explicit cache policies; API responses keep `no-store`.

A state-changing service method uses `UnitOfWork`. The SQLite transaction writes domain rows and event rows together. After commit, the hub publishes the event to rooms derived from its audience. Clients also maintain an event cursor; after reconnection they call `sync` to receive any durable events they missed. This makes realtime delivery an acceleration path, not the source of truth.

## Browser topology

`src/client/index.html` is the Vite entry document: it loads `/js/index.js`, `/app.css`, the generated icon stylesheet and the web app manifest, and declares `dir="rtl"` with a pre-paint theme attribute. `src/client/main.ts` creates the Vue application, installs Pinia, Vue Router, Vuetify and the VueUse motion plugin, then mounts `App.vue`, which selects the auth, map or admin layout from the matched route.

Views are lazily imported SFCs. Pinia setup stores own server state and derived flags: `auth`, `map`, `sos`, `realtime`, `admin`, `settings`, `offline`, `missionTeam` and `trips`. VueUse supplies storage, online/network state, media queries, geolocation and event listeners, so no hand-written DOM plumbing is required. `utils/realtime-client.ts` owns the single authenticated WebSocket, one-use tickets, durable cursor catch-up and binary audio. `utils/audio.ts` owns ephemeral 16 kHz PCM16 capture and playback.

Motion is declarative first. Route and sheet transitions use `<Transition>`, live lists use `<TransitionGroup>`, card and palette entry uses `motion-v` with `@vueuse/motion` variants, and GSAP is restricted to one coordinated reveal timeline. Every duration comes from `useMotionPreferences`, which returns `0` under `prefers-reduced-motion`.

`src/client/service-worker/sw.ts` is the canonical worker source. `scripts/build.ts` compiles it with `Bun.build` into the browser-required `public/sw.js` artifact. The worker precaches a content-versioned manifest and keeps a bounded offline tile cache. Private APIs are never cached.

## Build pipeline

`scripts/build.ts` first removes the previous `public/js` bundle and the previous `index.html`, `app.css` and web app manifest, then runs `vite build` with the root `src/client` and output `public/`, compiles the service worker, and finally runs `scripts/build-assets.ts` to write the icon subset, fonts, logo, favicon and the deterministic cache manifest. Cleaning first is what makes the emitted chunk set — and therefore the precache manifest — identical for identical sources instead of accumulating stale hashed chunks. `public/` is generated output and is git-ignored; a clean build reproduces it byte for byte because the manifest contains no timestamps.

## Dependency direction

Dependencies point inward: routes depend on services, services depend on domain and core, core does not depend on services, and domain depends only on shared pure constants. Browser modules import the same protocol and geometry modules as the server. Tests may use the app factory directly. This direction keeps the pure rules portable and makes the runtime surface small enough to audit.
