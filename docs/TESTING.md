# Testing

The automated suite is Vitest with `@vue/test-utils`, `happy-dom` and V8 coverage, executed through Bun so the tests can import Bun-only modules (`bun:sqlite`, `Bun.password`, `Bun.serve`). There are no browser-driver dependencies, no separate mock server package and no old Python design tests. `bun run coverage` runs every `tests/*.test.ts` file and writes a summary report to `coverage/`.

Component, store and composable suites run in `happy-dom`. Server, realtime, script-mirroring and architecture suites declare `// @vitest-environment node` so they exercise the real Bun runtime without a DOM. The shared harness in `tests/helpers.ts` starts `createApp` with a `:memory:` database, an ephemeral port on `127.0.0.1`, deterministic admin credentials, demo seeding and disabled background jobs, and wraps same-origin fetch, session cookies, ticket issuance, WebSocket opening, JSON and binary message waiting and graceful shutdown.

## Suite structure

- `core.test.ts` checks validators, LRU and TTL behavior, token buckets, Argon2id password hashing, cookie helpers, geometry, offline SVG tiles, state machines and configuration.
- `api.test.ts` checks public health, OpenAPI, catalogs, the SPA shell, immutable SVG tiles, auth boundaries, saved places, shares, sync, tickets, SOS photo support, administrator CRUD, settings, audit and CSV exports.
- `auth.test.ts` checks registration, five security questions, onboarding, recovery challenges, one-use reset tokens, decoy challenges, logout and rotating refresh.
- `security.test.ts` checks CSP, CORS, frame ancestors, CSRF, request IDs, no-store headers, body limits, SQL-like input rejection, static path traversal, session revocation, rate limiting and preview-proxy forwarded-host CSP/CORS origins.
- `realtime.test.ts` checks one-use tickets, hello, ping, sync, room authorization, committed event publication, live-location fan-out, snapshot, one-to-one PTT floor control, ordered binary frames and malformed audio headers.
- `journeys.test.ts` checks complete requester, companion and administrator journeys plus a full login-to-rating journey.
- `smoke.test.ts` runs the in-process preview smoke against a `0.0.0.0` listener with simulated proxy headers, asserting the SPA shell, every precached asset, CSP/CORS/framing, tiles and SOS fan-out.
- `architecture.test.ts` checks the Bun-only toolchain, the absence of Node runtime imports and hand-authored JavaScript, the typed SFC/router/store surface, the shared protocol, animation policy, documentation, English-only Markdown and canonical design images.
- `assets.test.ts` checks the deterministic timestamp-free cache manifest, precache paths, Vite chunk shape, self-hosted fonts, the icon inventory, the design-token stylesheet and the compiled service-worker caching rules.
- `service-worker.test.ts` evaluates `public/sw.js` against mocked cache/network globals to verify install, activation, stale-while-revalidate, private-API bypass, bounded tile caching and offline fallback without a browser.
- `accessibility.test.ts` checks WCAG AA contrast for light-theme text and semantic colors, skip navigation, focusable landmarks, reduced motion, lazy view loading and keyboard palette behavior.
- `performance.test.ts` keeps validation, tile, concurrent-read, live-location and bundle-size budgets.
- `components.test.ts` mounts `AppToastHost`, `CommandPalette`, `LoginView` and `MapCanvas` with real Vuetify, Pinia and Vue Router plugins, and validates the 20-route table.
- `stores.test.ts` drives the auth, offline, map, SOS, realtime, admin and settings stores against mocked envelopes.
- `composables.test.ts` covers the settings tokens and theme cycling, the toast queue, `useAsyncAction`, the formatters, motion preferences, the SOS hold gesture and the command palette.
- `acceptance.test.ts` checks the closed target checklist, legacy scope reconciliation, release evidence, Bun automation scripts and CI coverage.
- `database.test.ts` verifies the idempotent migration for older SQLite databases and the production configuration guards.

## Commands

Run one suite while iterating, for example `bunx --bun vitest run tests/realtime.test.ts` or `bunx --bun vitest tests/components.test.ts` for watch mode. Run `bun run coverage` for the whole suite with coverage, `./boro check` for the full gate (build, both typechecks, documentation guard and coverage) and `./boro verify` to add runtime diagnostics. `bun run bench` records release latency figures, `bun run smoke` runs the reproducible in-process runtime smoke and `bun run acceptance` validates the checklist and evidence. None of these commands performs browser-driven professional UI acceptance.

Coverage thresholds (45% statements/lines/functions, 35% branches) exist to catch silent regressions in the untested remainder, not to certify the product. Generated output, the service-worker artifact and the process entry point are excluded.

## Interpretation

A failure in an API or journey test usually indicates a route, service or state-machine regression. A realtime failure can indicate an event publication, ticket, room or binary-frame regression. An asset failure usually means the generator must be rerun or a view stopped using a shipped icon. An architecture failure means a boundary, documentation or toolchain invariant was broken. Professional visual acceptance against the canonical PNG references remains a separate review activity and is not part of this automated suite.
