# Acceptance checklist

This checklist maps the original technical specification and roadmap targets to the clean zero-dependency rebuild. Every item is either implemented and verified, or explicitly marked as superseded by the new architecture. Professional visual/UI acceptance against the canonical PNG references remains a separate, deliberately deferred human review; no browser-driven professional UI test is claimed here.

## Foundation and contracts

- [x] One repository, one package manifest, one lockfile and one strict server/test TypeScript configuration.
- [x] Zero runtime dependencies; only TypeScript and Node type definitions are installed.
- [x] Shared protocol constants and pure geometry helpers are imported by both server and browser.
- [x] A declarative route table generates OpenAPI and owns every body, query, auth and rate-limit declaration.
- [x] One SQLite schema replaces the former PostgreSQL/PostGIS/Drizzle migration stack.
- [x] Native HTTP, native WebSockets, Node SQLite and direct TypeScript execution replace Fastify, Socket.IO, an ORM and a bundler.

## Authentication and account lifecycle

- [x] Registration requires five distinct catalog-backed security questions.
- [x] Login, rotating refresh, logout, session revocation and deactivation are implemented.
- [x] Password and answer hashes use scrypt with per-value salts; answers are normalized before comparison.
- [x] Recovery uses three selected challenges, decoy responses for unknown usernames, attempt limits, expiry, one-use reset tokens and full session revocation.
- [x] Administrator-created accounts complete onboarding before ordinary use.
- [x] Guest-only and role-protected route guards are enforced by the server and the SPA router.
- [x] Active devices, login history, username changes, saved places and profile readiness are available.

## Map, location and offline behavior

- [x] Deterministic offline SVG vector tiles replace Martin, Planetiler, PMTiles and MapLibre.
- [x] Tile configuration, immutable ETags, content-versioned static assets and a bounded service-worker tile cache are implemented.
- [x] Live location, bounded live/history sharing, revocation, expiry, snapshots and authorized history playback are implemented.
- [x] One authenticated WebSocket carries durable events, presence, live fixes, snapshots, sync, talk state and binary audio.
- [x] Reconnect uses one-use tickets and an event cursor; durable events are committed before publication.
- [x] Private APIs are never cached by the service worker; static assets and SVG tiles are cached explicitly.
- [x] External-Internet VM acceptance for the former map pipeline is superseded: the new map has no external data pipeline, Java tools, PMTiles artifacts or Docker map services.

## SOS, missions and dispatch

- [x] Four-step SOS composition includes description, location, optional compressed photo and review.
- [x] SOS creation, cancellation reasons, dispatch, acceptance, mission progress, completion and one-time rating are implemented.
- [x] SOS and mission state machines reject impossible transitions and expose stage indices.
- [x] Nearest responders, group selection, dispatch board data and administrator exports are implemented.
- [x] Durable events update user, responder, administrator and socket consumers after commit.
- [x] One-to-one press-and-hold talk enforces one speaker, ordered binary frames, hold/idle release and no recording.

## Administration and operations

- [x] Overview KPIs, live map, groups, alerts, recent requests, reports, users, groups, incident types, audit, settings and system health are implemented.
- [x] User creation, role changes, active-state changes, group membership, alert resolution and settings updates pass through the service/event boundary.
- [x] User and audit CSV exports use formula escaping and no-store headers.
- [x] The last active administrator cannot be removed and an administrator cannot suspend or demote their own active account.
- [x] Practical English manuals, runbooks, architecture, API, WebSocket, security, performance, testing, automation, design-system and status documents are present.
- [x] The `boro` CLI provides setup, development, doctor, check, verify, deployment, database and clean commands.

## Acceptance polish

- [x] Responsive authentication, mobile and desktop layouts are implemented with explicit breakpoints and safe-area padding.
- [x] Loading, empty, error and offline surfaces are implemented for routed data and forms.
- [x] Skip navigation, focus restoration, modal focus handling, labelled icon-only controls, visible focus rings, reduced-motion support and keyboard shortcuts are implemented.
- [x] Contrast ratios for primary text, muted text and semantic status colors are verified by an automated check.
- [x] Lazy view loading replaces eager imports of all view modules.
- [x] A full login-to-rating journey test exercises registration/session, sharing, SOS, dispatch, acceptance, mission status and rating.
- [x] A dependency-free benchmark records validator, tile, HTTP and live-location latency figures for release review.
- [x] CI runs install, diagnostics, typechecks, documentation guards, tests, acceptance invariants and deployment configuration checks.

## Superseded legacy targets

- [x] PostgreSQL/PostGIS migration, Docker Compose database refusal and PGlite acceptance are superseded by one native SQLite schema.
- [x] OSRM, Photon, elevation and PMTiles VM verification are superseded by deterministic in-process SVG tiles.
- [x] MapLibre warm/cold cache outage and eight-zoom Cache Storage acceptance are superseded by a versioned static precache and one bounded SVG tile cache.
- [x] Android/Capacitor workflow and LAN HTTPS HMR acceptance are superseded by one responsive browser application.
- [x] Vue/Vuetify/Pinia/Vite component tests are superseded by the new native browser module suite.
- [x] Playwright login-to-rating acceptance is represented by an automated API/realtime journey test; professional browser-driven UI acceptance remains deferred.

## Release evidence

- [x] `npm run check` passes with server typecheck, browser typecheck, a 24-document/154-image guard and all 58 automated tests.
- [x] `./boro doctor`, `./boro verify`, `npm run bench`, `npm run acceptance` and production-configured deployment checks pass.
- [x] Database seed, foreground startup, health checks, login, ticket issuance, WebSocket hello, SOS creation, durable event delivery, administrator overview, lazy view modules and service-worker precache entries were smoke-tested against a running process.
- [x] Release notes and an operations runbook are present.
- [x] The branch is committed and pushed; release tagging is recorded in `docs/RELEASE_NOTES.md`.
