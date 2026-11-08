# Deployment

A production deployment is one Bun process behind an HTTPS reverse proxy. The process serves the SPA, JSON API, SVG tiles and WebSocket endpoint from the same origin. No separate map server, queue, cache service or application runtime is required.

## Required configuration

Install the pinned Bun release with the official installer and verify `bun --version` reports 1.4.4. In an automated environment where the GitHub release CDN is unreliable, the same version is available as the `@oven/bun-linux-x64` npm tarball, which is how CI installs it. Set `NODE_ENV=production`, `COOKIE_SECURE=1`, a unique `ADMIN_PASSWORD` of at least twelve characters, and `ALLOWED_ORIGINS` to exact HTTPS origins without wildcards. Set `SEED_DEMO_USERS=0`. If the app is embedded, set `FRAME_ANCESTORS` to exact trusted origins without wildcards; leave it empty to deny framing. Configure `HOST`, `PORT`, `DATA_DIR` and `DATABASE_PATH` according to the host layout. Keep `TRUST_PROXY=1` only when the reverse proxy correctly sets forwarded headers and is the only path to the process.

`./boro deploy:check` validates the production environment and generated assets. It rejects the default or known preview/CI administrator passwords, short passwords, enabled demo seeding, missing or wildcard allowed origins, disabled proxy trust, insecure cookies and missing cache manifests. The runtime configuration enforces the same password and demo-seed rules on startup. Run `bun install --frozen-lockfile`, `./boro setup` with the production environment, `./boro check` and `./boro verify` before enabling traffic.

## Reverse proxy

Terminate TLS at the proxy and forward HTTP and WebSocket upgrades to the Node listener on `0.0.0.0`. Preserve the original host using a public `Host`, `X-Forwarded-Host` and `X-Forwarded-Proto: https`; when `TRUST_PROXY=1`, set `X-Forwarded-For` from the proxy only. Do not expose the Node port directly. Allow `Upgrade` and `Connection` headers on `/ws`. Keep the browser, API and WebSocket on one origin so cookies and CSP remain simple.

The application sets a strict CSP, frame denial, no-referrer policy, content-type options, cross-origin isolation headers and HSTS in production. Responses with explicit allowed origins receive credentialed CORS headers. Do not add broad wildcard origins when cookies are used.

## Data and backups

The SQLite database is the source of truth. It contains users, sessions, security answers, recovery challenges, places, shares, location points, SOS requests, missions, groups, settings, alerts, audit rows and durable events. Place `DATA_DIR` on persistent storage with filesystem snapshots or a coordinated backup process. Because SQLite WAL mode is used for file-backed databases, copy the database and WAL together or use a SQLite-aware backup method.

Location retention is bounded by `LOCATION_RETENTION_HOURS`, and old durable events are purged by maintenance jobs. Realtime caches, tickets, talk floors, presence and static asset caches are reconstructible and do not need backup. Never back up ephemeral audio; audio is never stored.

## Startup and verification

Start with `bun run start` or a process manager that runs `bun src/server/index.ts`. Confirm `/_public/health`, `/_public/openapi.json`, a protected route with an administrator session, an SVG tile response and a WebSocket upgrade. Watch logs for request IDs on failed responses. Graceful shutdown closes WebSocket peers, clears jobs and closes the database.

Close `docs/ACCEPTANCE.md`, run `./boro verify`, `bun run bench`, `bun run smoke`, `bun run acceptance` and `./boro deploy:check`, then record the release in `docs/RELEASE_NOTES.md`. Create the annotated release tag from the final release commit only after explicit operator approval; this branch creates no tag. Follow `docs/OPERATIONS.md` for routine startup, health signals, incidents, backups and outage recovery.
