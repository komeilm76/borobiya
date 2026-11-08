# Automation

`boro` is the repository's command hub. It is a small shell shim that executes `scripts/boro.ts` with Bun, and it is the preferred entry point for setup, development, diagnostics and release checks. Bun scripts remain available for individual operations and for CI.

## Commands

- `./boro setup` checks for Bun, runs `bun install` when `node_modules` is missing, copies `.env.example`, creates the data directory, builds the client and seeds the database.
- `./boro dev` regenerates assets and starts `bun --watch src/server/index.ts` with development defaults (`NODE_ENV=development`, `HOST=0.0.0.0`).
- `./boro doctor` checks the Bun version, canonical images, the shared protocol, the Vue entry, the TypeScript service-worker source, the Vitest configuration, `bun.lock`, the absence of `package-lock.json` and legacy paths, and the generated icon CSS and cache manifest.
- `./boro check` builds the client, typechecks the Bun server and the Vue client, runs the documentation guard and executes the full Vitest suite with coverage.
- `./boro verify` runs doctor followed by check.
- `./boro bench` measures pure validation, deterministic tiles, concurrent HTTP reads and realtime live-location fan-out against fixed budgets.
- `./boro smoke` runs the in-process runtime smoke on `0.0.0.0` with simulated preview-proxy headers: CSP/CORS/framing, every precached asset, public APIs, login, WebSocket hello and SOS fan-out.
- `./boro acceptance` verifies that the target checklist is closed and that release evidence, automation and CI are present.
- `./boro deploy:check` validates the production environment and generated assets.
- `./boro db:seed` and `./boro db:reset` manage the local SQLite file; `./boro clean` removes local test and build output.

## Bun scripts

`bun install --frozen-lockfile` installs the pinned Vue/Vite/Vitest toolchain from `bun.lock`. `bun run assets` regenerates fonts, icon CSS, logos, favicon and the content-versioned cache manifest. `bun run build` runs the Vite build, compiles the TypeScript service worker and then regenerates assets. `bun run typecheck:server` runs `tsc` over `src/server` and `src/shared`; `bun run typecheck:client` runs `vue-tsc --noEmit` over every SFC and TypeScript module in `src/client`. `bun run test` and `bun run coverage` execute Vitest under Bun (`bunx --bun vitest`), which is required because the suites import Bun-only modules. `bun run start` runs the server without watching.

## CI

The GitHub Actions workflow uses the pinned `ubuntu-24.04` runner, the SHA-pinned `oven-sh/setup-bun` action and `bun-version-file: .bun-version`, so the runner uses exactly Bun 1.4.4. It then runs `bun install --frozen-lockfile`, asset generation, the server and client typechecks, the documentation guard, the Vue build, `bun run coverage`, `bun run bench`, `bun run smoke`, `bun run acceptance` and a production-configured deployment check. It is least-privilege (`contents: read`), covers both push and pull-request events, and cancels superseded in-progress runs through a per-ref concurrency group. Checkout credentials are not persisted. The deployment check supplies explicit secure-cookie, proxy-trust, demo-seed and frame-ancestor settings, so it also exercises the production safety guards.

The pipeline fails on runtime diagnostics, `tsc` or `vue-tsc` errors, missing or non-English documentation, legacy paths, missing design images, unresolved icon names, stale service-worker manifests, open acceptance items, benchmark budget violations or any test failure.

## Asset generation

`scripts/build-assets.ts` reads canonical design fonts and icon mappings, writes self-hosted assets into `public/assets`, copies the client-side web app manifest and computes a stable cache version from the generated static file set. The manifest is deterministic and timestamp-free, so regenerating unchanged assets does not dirty the checkout. It writes `/`-rooted precache paths, never `/public/...`. The service worker reads that manifest at install time, precaches all listed files, cleans old static caches and keeps a bounded runtime tile cache. Always rerun the build after adding a view or changing icon usage; unknown icon names fail the build instead of shipping a blank glyph.

## Release sequence

Run `bun install --frozen-lockfile`, `./boro check`, `./boro doctor`, `./boro deploy:check` and a production smoke test against `/_public/health`, `/_public/openapi.json`, a protected route, a tile and a WebSocket upgrade. Confirm backups for the SQLite data directory before restarting a long-running process. Use graceful shutdown so WebSocket peers and the database close cleanly.
