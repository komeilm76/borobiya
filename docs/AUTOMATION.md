# Automation

`boro` is the repository's dependency-free command-line wrapper. It is an executable Node script and is the preferred entry point for setup, development, diagnostics and release checks. npm scripts remain available for individual operations and for CI.

## Commands

- `./boro setup` verifies the Node version, installs development tools if needed, copies `.env.example`, creates the data directory, generates assets and seeds the database.
- `./boro dev` regenerates assets and starts the server in watch mode with explicit host defaults.
- `./boro doctor` checks Node version, native TypeScript mode, canonical images, shared protocol, generated icon CSS, cache manifest, new tests, legacy-path removal and `node:sqlite` availability.
- `./boro check` regenerates assets, runs server and browser typechecks, validates documentation and runs the full test suite.
- `./boro verify` runs doctor followed by check.
- `./boro bench` measures pure validation, deterministic tiles, concurrent HTTP reads and realtime live-location fan-out.
- `./boro acceptance` verifies that the target checklist is closed and that release evidence, automation and CI are present.
- `./boro deploy:check` validates production environment and generated assets.
- `./boro db:seed` and `./boro db:reset` manage the local SQLite file.
- `./boro clean` removes generated local data after an explicit operator command.

## npm scripts

`npm ci` installs the two development tools from the committed lockfile. `npm run assets` regenerates fonts, icon CSS, logos, favicon and the content-versioned cache manifest. `npm run typecheck` validates server and test sources; `npm run typecheck:client` validates browser JavaScript with `checkJs`. `npm test` runs all tests; focused scripts exist for core, API, sockets, journeys, architecture and assets. `npm start` runs the server without watching.

## CI

The GitHub Actions workflow uses Node 22.22.3 and `npm ci`, then runs asset generation, `npm run verify`, `npm run bench`, `npm run acceptance` and a production-configured deployment check. The deployment check supplies explicit secure-cookie, proxy-trust and demo-seed settings, so it also exercises the production safety guards. Because the lockfile is committed, the CI environment installs exactly the same development tools. No runtime dependencies are installed. The pipeline fails on runtime diagnostics, typecheck errors, missing or non-English documentation, legacy paths, missing design images, unresolved icon names, stale service-worker manifests, open acceptance items, benchmark failures or any automated test failure.

## Asset generation

`scripts/build-assets.mjs` reads canonical design fonts and icon mappings, writes self-hosted assets into `public/assets`, and computes a stable cache version from the generated static file set. The manifest is deterministic and timestamp-free, so regenerating unchanged assets does not dirty the checkout. It writes `/`-rooted precache paths, never `/public/...`. The service worker reads that manifest at install time, precaches all listed files, cleans old static caches and keeps a bounded runtime tile cache. Always rerun asset generation after adding a browser module or changing icon usage.

## Release sequence

Run `npm ci`, `npm run check`, `./boro doctor`, `./boro deploy:check` and a production smoke test against `/_public/health`, `/_public/openapi.json`, a protected route, a tile and a WebSocket upgrade. Confirm backups for the SQLite data directory before restarting a long-running process. Use graceful shutdown so WebSocket peers and the database close cleanly.
