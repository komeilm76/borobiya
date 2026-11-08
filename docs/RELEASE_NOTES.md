# Release notes

## Version 1.0.0 — clean rebuild

Release date: 2026-11-07. Branch: `arena/2212b849-borobiya`.

### Summary

This release replaces the former multi-package framework stack with one dependency-free Node.js application. Native HTTP, native WebSockets, Node SQLite and direct TypeScript execution now serve the SPA, JSON API, offline SVG tiles and realtime events from a single process. The browser application is built from native ES modules, generated self-hosted assets and a service worker. The canonical design images remain the visual contract.

### Highlights

- Zero runtime dependencies; only TypeScript and Node type definitions are development tools.
- One SQLite schema with a typed repository, transaction boundary and durable event log.
- Strict request envelopes, validators, CSP, CORS, CSRF checks, rate limits, session cookies and scrypt hashes.
- One-use WebSocket tickets, audience-filtered events, cursor-based sync, presence, live location and one-to-one binary PTT.
- Deterministic offline SVG vector tiles with immutable ETags and a bounded service-worker cache.
- Full authentication, registration, recovery, onboarding, profiles, devices, places and sync.
- SOS creation with optional photo, cancellation, dispatch, acceptance, mission progress and rating.
- Responsive RTL mobile map and desktop administrator console generated from the design tokens.
- Public, authentication, user and administrator APIs with generated OpenAPI and CSV exports.
- Practical English architecture, API, WebSocket, development, deployment, user, administrator, testing, security, performance, automation, design-system, operations and acceptance documentation.
- Automated suites for core rules, API contracts, authentication, security, realtime coordination, journeys, architecture, assets, accessibility and performance.

### Validation

`npm run check`, `./boro doctor`, `./boro verify`, `npm run bench`, `npm run smoke`, `npm run acceptance` and deployment checks are the release gates. The final full suite passes 67 of 67 tests, the documentation guard recognizes 24 required documents and 154 canonical design images, and the release benchmark reports validation, tile, concurrent HTTP and live-location figures inside their budgets. The suite also verifies the idempotent legacy SQLite migration, production password/demo-seed guards, trusted forwarded-host CSP/CORS origins and service-worker install, activation, stale-while-revalidate, private-API bypass, bounded tile caching and offline behavior. The reproducible in-process smoke checks health, OpenAPI, SPA assets, lazy view modules and their precache entries, map tiles, login, tickets, WebSocket hello, SOS fan-out, administrator overview and system health. Professional visual acceptance against the canonical PNG references remains a separate human review and is not claimed by automated checks.

### Operational notes

Set a unique `ADMIN_PASSWORD`, disable demo seeding, enable `COOKIE_SECURE=1`, configure exact allowed origins, terminate HTTPS at a trusted proxy and persist the SQLite data directory. Audio is never stored. Use graceful shutdown and back up the database and WAL together. See `docs/DEPLOYMENT.md` and `docs/OPERATIONS.md` for the full procedure.

### Tag

The acceptance checklist is closed on the release branch. The annotated `v1.0.0` tag is created locally from the final release commit; pushing tags remains an explicit release-operator action.
