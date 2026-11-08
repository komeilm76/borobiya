# Testing

The automated suite is written for the Node test runner and executes TypeScript directly. There are no browser-driver dependencies, no separate mock server package and no old Python design tests. `npm test` runs all `tests/*.test.ts` files sequentially with one process per file and a deterministic in-memory database per server fixture.

## Suite structure

- `core.test.ts` checks validators, LRU and TTL behavior, token buckets, password and cookie helpers, geometry, offline SVG tiles, state machines and configuration.
- `api.test.ts` checks public health, OpenAPI, catalogs, static assets, immutable SVG tiles, auth boundaries, saved places, shares, sync, tickets, SOS photo support, administrator CRUD, settings, audit and CSV exports.
- `auth.test.ts` checks registration, five security questions, onboarding, recovery challenges, one-use reset tokens, decoy challenges, logout and rotating refresh.
- `security.test.ts` checks CSP, CORS, CSRF, request IDs, no-store headers, body limits, SQL-like input rejection, static path traversal, session revocation and rate limiting.
- `realtime.test.ts` checks one-use tickets, hello, ping, sync, room authorization, committed event publication, live-location fan-out, snapshot, one-to-one PTT floor control, ordered binary frames and malformed audio headers.
- `journeys.test.ts` checks complete requester, companion and administrator journeys from API calls through state transitions and exports.
- `architecture.test.ts` checks zero runtime dependencies, pure domain boundaries, route declarations, shared protocol, required documentation, English-only Markdown and canonical design images.
- `assets.test.ts` checks the deterministic, timestamp-free generated cache manifest, precache paths, self-hosted fonts, icon inventory, HTML shell, web app manifest and service-worker caching rules.
- `accessibility.test.ts` checks WCAG AA contrast for light-theme text and semantic colors, skip navigation, focusable landmarks, reduced motion, lazy view loading, modal focus handling and keyboard palette behavior.
- `performance.test.ts` records generous budgets for validation, deterministic tiles, concurrent public reads and WebSocket live-location fan-out.
- `acceptance.test.ts` checks the closed target checklist, legacy scope reconciliation, release evidence, automation scripts and CI coverage.
- `database.test.ts` verifies the idempotent migration for older SQLite databases and the production configuration guards.
- `security.test.ts` also verifies that forwarded preview-host headers produce matching CSP WebSocket and CORS origins.
- `journeys.test.ts` includes a full login-to-rating journey from registration and sharing through SOS, dispatch, acceptance, mission status and rating.

The shared harness in `tests/helpers.ts` starts `createApp` with a `:memory:` database, a loopback port, deterministic admin credentials, demo seeding and disabled background jobs. It wraps same-origin fetch, session cookies, ticket issuance, WebSocket opening, JSON/binary message waiting and graceful socket shutdown.

## Commands

Use `npm run test:core`, `npm run test:api`, `npm run test:sockets`, `npm run test:journeys`, `npm run test:architecture` or `npm run test:assets` for focused iteration. Use `npm run check` for the full gate: asset generation, server typecheck, browser typecheck, documentation guard and all tests. `./boro verify` adds runtime diagnostics. Use `npm run bench` for release latency figures and `npm run acceptance` for checklist/evidence validation. Neither command performs browser-driven professional UI acceptance.

## Interpretation

A failure in an API or journey test usually indicates a route, service or state-machine regression. A realtime failure can indicate an event publication, ticket, room or binary-frame regression. An asset failure usually means the generator must be rerun. An architecture failure means a boundary or documentation invariant was broken. Professional visual acceptance against the canonical PNG references is a separate review activity and is not part of this automated suite.
