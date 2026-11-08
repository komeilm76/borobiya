# Borobiya

Borobiya is a Bun-native offline location, emergency request and dispatch platform. It provides a right-to-left mobile map experience, live location sharing, one-to-one push-to-talk, SOS creation and dispatch, mission progress, history playback and a desktop operations console.

The whole product is one Bun process: `Bun.serve` for HTTP and WebSocket upgrades, `bun:sqlite` for storage, `Bun.password` for Argon2id hashing and `Bun.file` for static assets. The browser application is Vue 3 with typed `<script setup lang="ts">` single-file components, Vue Router 4, Vuetify 3, Tailwind CSS 4, Pinia and VueUse, built by Vite through Bun.

## First steps

1. Install Bun 1.4.4 (the version is pinned in `.bun-version`, `packageManager` and CI) and run `bun install --frozen-lockfile`.
2. Run `./boro setup` to copy `.env.example` when needed, generate browser assets, build the client and create the SQLite database.
3. Run `./boro dev` for a watched development server on `0.0.0.0`, or `bun run start` for a single foreground process.
4. Open `/_auth/login`. The administrator account uses `ADMIN_USERNAME` and `ADMIN_PASSWORD` from `.env`; demo accounts are seeded outside production.
5. Run `bun run check` before committing. It builds the client, typechecks the Bun server and the Vue client, validates documentation and executes the full Vitest suite with coverage.

## Repository layout

- `src/server/core` contains the Bun HTTP helpers, validators, errors, configuration, rate limiting, static file server and WebSocket hub.
- `src/server/domain` contains pure geometry, state machines, catalogs and the deterministic offline vector tile renderer.
- `src/server/db` contains one SQLite schema, a typed repository and the transaction/event boundary.
- `src/server/services` contains authentication, profiles, live location, SOS, missions, talk floor control, administration and realtime use cases.
- `src/server/routes` declares every endpoint and its request schema; `src/server/app.ts` wires the server and `src/server/index.ts` starts it.
- `src/shared` holds the typed protocol (`protocol.ts`) and the pure geometry and formatting helpers used by the server, the client and the tests.
- `src/client` is the Vue 3 application: router, Pinia stores, composables, views, layouts, components, Vuetify plugin, styles and the service-worker source.
- `src/client/service-worker/sw.ts` is the canonical service-worker source; the build compiles it to `public/sw.js`.
- `scripts` contains the Bun automation: build, asset generation, the `boro` command hub, benchmarks, smoke, acceptance and documentation guards.
- `tests` contains the Vitest suite. `design` is the canonical visual contract and is read-only; `docs` contains the English manuals and runbooks.
- `public` is generated output (Vite bundle, service worker, assets) and is git-ignored.

## Runtime model

One Bun process serves the SPA, the JSON API, offline SVG tiles and the WebSocket endpoint. Every state-changing use case commits a SQLite transaction with durable event rows, then publishes those events to connected clients after commit. The browser keeps one authenticated WebSocket, reconnects with one-use tickets and catches up through the durable event cursor. Audio is ephemeral 16 kHz PCM16 over binary frames and is never recorded or stored.

`scripts/build.ts` runs `vite build` into `public/`, compiles the TypeScript service worker with `Bun.build` and then generates self-hosted assets and the deterministic cache manifest. The service worker precaches a versioned manifest and keeps a separate bounded tile cache. Private API responses are never cached.

## Important commands

- `./boro setup` — install dependencies, create `.env`, build and seed the database.
- `./boro dev` — regenerate assets and start the watched Bun server.
- `./boro check` — build, server typecheck, `vue-tsc` client typecheck, documentation guard and Vitest with coverage.
- `./boro verify` — doctor plus check.
- `bun run bench`, `bun run smoke`, `bun run acceptance` — release gates.
- `./boro deploy:check` — validate the production environment and generated assets.
- `bun run db:seed`, `bun run db:reset`, `bun run clean` — local maintenance.

Read `docs/README.md` for the documentation index. The canonical visual contract is summarized in `design/README.md`. The closed target checklist is in `docs/ACCEPTANCE.md`; release evidence is in `docs/RELEASE_NOTES.md` and `docs/OPERATIONS.md`.
