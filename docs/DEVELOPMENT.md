# Development

Borobiya is developed from the repository root with Node.js 22.12 or newer. The runtime has no third-party dependencies; npm installs only TypeScript and Node type definitions for static checking. Node executes `.ts` sources directly with its native transform mode, so there is no separate build step for server code.

## Initial setup

Run `npm ci` to install the two development tools from `package-lock.json`. Then run `./boro setup`. Setup copies `.env.example` to `.env` when needed, creates the data directory, generates self-hosted assets and seeds the SQLite database. The default development host is `0.0.0.0` and the default port is 3000. Override both in `.env` when necessary.

Set `ADMIN_PASSWORD` to a unique value before any shared or production-like environment. Outside production, demo users are seeded with a documented demo password so API, realtime and journey tests have deterministic fixtures. In production, `SEED_DEMO_USERS=0` disables those accounts.

## Daily workflow

Use `./boro dev` for watch mode. It regenerates assets and starts the TypeScript entry point with Node watch. Use `npm start` for a single foreground process. The SPA routes are `/_auth/*`, `/_user/*`, `/_admin/*` and `/`; the static server also serves `/app.css`, `/js/*`, `/assets/*`, `/manifest.webmanifest` and `/sw.js`.

Run `npm run assets` after changing icon inputs, fonts, logos or asset generator logic. Run `npm run typecheck` and `npm run typecheck:client` after editing source. Run focused suites while iterating: `npm run test:core`, `npm run test:api`, `npm run test:sockets`, `npm run test:journeys`, `npm run test:architecture` or `npm run test:assets`. Run `npm run check` before committing.

## Debugging

Every response contains an `X-Request-Id`; use it to correlate server logs and error envelopes. `/_public/health` confirms the process is alive, `/_public/openapi.json` confirms declared routes and `/_admin/system/health` reports database, cache, map, realtime and talk-floor counters. The browser console logs route failures. WebSocket tickets are one-use; request a new ticket after every reconnect attempt.

The SQLite file lives at `DATA_DIR/borobiya.sqlite` unless `DATABASE_PATH` is overridden. Tests use `:memory:` databases through `createApp` overrides and never touch the development file. Use `./boro db:reset` only when you intentionally want to discard local data.

## Source conventions

Server modules use explicit `.ts` import suffixes under NodeNext. Browser modules are native ES modules with `.js` suffixes. Shared constants live in `public/js/protocol.js`; pure geometry lives in `public/js/geo.js`. Keep domain modules free of infrastructure imports. Put every mutation behind `UnitOfWork`. Add a route schema for every new field and an automated test for every new state transition.
