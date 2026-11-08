# Implementation status

The clean rebuild implements the full runtime, browser application, generated assets, documentation and automated test suite described in `README.md`. The branch contains one application rather than parallel legacy packages. Canonical design images and reference generators remain intact; old implementation files, old documentation and old Python design tests are removed from the working tree.

## Implemented subsystems

Core infrastructure includes strict validators, typed errors, deterministic LRU caches, scrypt and cookie helpers, configuration, rate limiting, HTTP security headers, a declarative router, safe static serving and a native WebSocket hub. Domain modules provide shared geometry, state transitions, catalogs and deterministic offline SVG tiles. Storage provides one SQLite schema, a typed repository and a transaction-plus-durable-event boundary.

Services provide registration, login, recovery, sessions, profiles, devices, saved places, sync, tickets, live and historical location, SOS creation, dispatch, acceptance, mission progress, cancellation, rating, one-to-one PTT floor control, administration, map configuration and realtime coordination. Declarative routes expose public, authentication, user and administrator APIs plus OpenAPI and immutable SVG tiles.

The browser application provides authentication, onboarding, the mobile map, four-step SOS composition with optional compressed photo, mission and SOS rails, companions, live sharing, history, profile, press-and-hold PTT, and the desktop administrator console. It uses one authenticated WebSocket, durable event catch-up, a versioned service worker, a bounded offline tile cache, self-hosted fonts and a generated icon subset.

## Validation gate

`npm run check` is the full gate. It regenerates assets, typechecks server and test sources, typechecks browser JavaScript, runs the English-only documentation and clean-rebuild guard, then runs every new test. `./boro doctor` verifies runtime prerequisites and repository structure. `./boro verify` combines both. `./boro deploy:check` validates production environment and generated assets. `npm ci` uses the committed lockfile so CI installs exactly TypeScript and Node type definitions.

The automated suite covers core rules, API envelopes and endpoints, authentication and recovery, security headers and limits, WebSocket tickets and rooms, durable event publication, live-location fan-out, binary PTT frames, complete user and administrator journeys, architecture boundaries, documentation, icon inventory and service-worker assets.

## Operational readiness

For production, set a unique administrator password, disable demo seeding, enable secure cookies, configure exact allowed origins, terminate HTTPS at a trusted proxy and place the SQLite data directory on persistent storage. Use `/_public/health`, `/_public/openapi.json`, `/_admin/system/health`, a protected route, a tile request and a WebSocket upgrade as smoke checks. Back up the database and WAL together. Audio remains ephemeral and is never stored.

Professional visual acceptance against the canonical PNG references is a separate review activity. The automated suite verifies structural, behavioral and asset invariants; it does not replace a deliberate human comparison of each screen with its reference image.
