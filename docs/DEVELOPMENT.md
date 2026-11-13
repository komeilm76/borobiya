# Development

Borobiya is developed from the repository root with Bun 1.4.4. The runtime is Bun only: no `node`, `npm` or `npx` is required for any command. Bun installs the Vue/Vite/Vitest toolchain, executes every TypeScript source directly and owns the build scripts.

## Initial setup

Install Bun 1.4.4 (pinned in `.bun-version`, `packageManager` and CI), then run `bun install --frozen-lockfile` and `./boro setup`. Setup copies `.env.example` to `.env` when needed, creates the data directory, builds the client, generates self-hosted assets and seeds the SQLite database. The default development host is `0.0.0.0` and the default port is 3000. Override both in `.env` when necessary.

Set `ADMIN_PASSWORD` to a unique value before any shared or production-like environment. Outside production, demo users are seeded with a documented demo password so API, realtime and journey tests have deterministic fixtures. In production, `SEED_DEMO_USERS=0` disables those accounts.

## Daily workflow

Use `./boro dev` for watch mode: it regenerates assets and starts `bun --watch src/server/index.ts` with the development host. Use `bun run start` for a single foreground process. The SPA routes are `/_auth/*`, `/_user/*`, `/_admin/*` and `/`; the static server also serves `/app.css`, `/js/*`, `/assets/*`, `/manifest.webmanifest` and `/sw.js`, all of which come from the generated `public/` directory.

Run `bun run build` after changing client code, icon inputs, fonts, logos or asset generator logic. Run `bun run typecheck:server` and `bun run typecheck:client` after editing source; the client check is `vue-tsc` over all SFCs and TypeScript modules, so template type errors fail the gate. Run focused suites while iterating with `bunx --bun vitest run tests/core.test.ts` (or `api`, `realtime`, `journeys`, `components`, `stores`, `assets`, `security`). Run `bun run check` before committing: it builds, typechecks both projects, runs the documentation guard and the full Vitest suite with coverage.

The suite is hermetic: `tests/setup.ts` removes the repository `.env` keys from the environment so `./boro check` and `bunx --bun vitest` behave identically, and configuration falls back to explicit test overrides instead of local settings. It never touches the network either — suites that mount components under happy-dom stub `fetch` (server integration suites use the in-process ephemeral test server from `tests/helpers.ts`), so a developer running `./boro dev` on :3000 cannot answer a test's request by accident.

Vitest must run under Bun (`bunx --bun vitest run`), because the suites import Bun-only modules such as `bun:sqlite`, `Bun.password` and `Bun.serve`. The npm-style `bunx vitest` alone would execute the runner on Node and fail at those imports; the `test`, `coverage` and `check` scripts already pass `--bun`.

## Client conventions

Views are `views/{auth,map,admin}/*View.vue` and use `<script setup lang="ts">`. Route names come from `ROUTE_NAMES` in `src/client/router/index.ts`; never hard-code a path string in a component. Server state belongs in a Pinia setup store, presentational state in a composable. Browser code calls the API through `src/client/api/client.ts`, which always uses relative URLs so the same build works behind the preview proxy. Import shared constants from `@shared/protocol.ts` and pure helpers from `@shared/geo.ts`; do not duplicate status values or coordinates logic in a component.

Animation must come from `useMotionPreferences`: transitions use `<Transition>`/`<TransitionGroup>`, card entry uses `motion-v`, and GSAP is reserved for the single coordinated reveal timeline. Never bypass the reduced-motion check.

## Server conventions

Server modules use explicit `.ts` import suffixes. Keep domain modules free of infrastructure imports. Put every mutation behind `UnitOfWork`. Add a route schema for every new field and an automated test for every new state transition. `public/` and `data/` are generated; never hand-edit them or commit them.

## Debugging

Every response contains an `X-Request-Id`; use it to correlate server logs and error envelopes. `/_public/health` confirms the process is alive, `/_public/openapi.json` confirms declared routes and `/_admin/system/health` reports database, cache, map, realtime and talk-floor counters. The browser console logs route failures. WebSocket tickets are one-use; request a new ticket after every reconnect attempt.

The SQLite file lives at `DATA_DIR/borobiya.sqlite` unless `DATABASE_PATH` is overridden. Tests use `:memory:` databases through `createApp` overrides and never touch the development file. If `import.meta.dir` is rewritten by a runner, `ROOT` falls back to the nearest ancestor containing `package.json` and `src/server/app.ts`, so scripts and tests always resolve the repository root. Use `./boro db:reset` only when you intentionally want to discard local data.
