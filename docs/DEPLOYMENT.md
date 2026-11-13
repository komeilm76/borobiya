# Deployment

A production deployment is one Bun process behind an HTTPS reverse proxy. The process serves the SPA, JSON API, SVG tiles and WebSocket endpoint from the same origin. No separate map server, queue, cache service or application runtime is required.

## Required configuration

Install the pinned Bun release with the official installer and verify `bun --version` reports 1.4.4. In an automated environment where the GitHub release CDN is unreliable, the same version is available as the `@oven/bun-linux-x64` npm tarball, which is how CI installs it. Set `NODE_ENV=production`, `COOKIE_SECURE=1`, a unique `ADMIN_PASSWORD` of at least twelve characters, and `ALLOWED_ORIGINS` to exact HTTPS origins without wildcards. Set `SEED_DEMO_USERS=0`. If the app is embedded, set `FRAME_ANCESTORS` to exact trusted origins without wildcards; leave it empty to deny framing. Configure `HOST`, `PORT`, `DATA_DIR` and `DATABASE_PATH` according to the host layout. Keep `TRUST_PROXY=1` only when the reverse proxy correctly sets forwarded headers and is the only path to the process.

`./boro deploy:check` validates the production environment and generated assets. It rejects the default or known preview/CI administrator passwords, short passwords, enabled demo seeding, missing or wildcard allowed origins, disabled proxy trust, insecure cookies and missing cache manifests. The runtime configuration enforces the same password and demo-seed rules on startup. Run `bun install --frozen-lockfile`, `./boro setup` with the production environment, `./boro check` and `./boro verify` before enabling traffic.

## Reverse proxy

Terminate TLS at the proxy and forward HTTP and WebSocket upgrades to the Node listener on `0.0.0.0`. Preserve the original host using a public `Host`, `X-Forwarded-Host` and `X-Forwarded-Proto: https`; when `TRUST_PROXY=1`, set `X-Forwarded-For` from the proxy only. Do not expose the Node port directly. Allow `Upgrade` and `Connection` headers on `/ws`. Keep the browser, API and WebSocket on one origin so cookies and CSP remain simple.

The application sets a strict CSP, frame denial, no-referrer policy, content-type options, cross-origin isolation headers and HSTS in production. Responses with explicit allowed origins receive credentialed CORS headers. Do not add broad wildcard origins when cookies are used.

## Data and backups

The SQLite database is the source of truth. It contains users, sessions, security answers, recovery challenges, places, shares, location points, SOS requests, missions, groups, settings, alerts, audit rows, durable events and — since v9 — consented track data (`track_points`, `track_consents`, `track_summaries`). Place `DATA_DIR` on persistent storage with filesystem snapshots or a coordinated backup process. Because SQLite WAL mode is used for file-backed databases, copy the database and WAL together or use a SQLite-aware backup method.

Location retention is bounded by `LOCATION_RETENTION_HOURS`, and old durable events are purged by maintenance jobs. Consented track points are purged by the same hourly maintenance pass once they age past `TRIP_TRACK_RETENTION_DAYS` (raw fixes only, 500 rows per batch, summaries persisted first and the purge refuses to touch a context whose summary cannot be written); summaries and trip/mission rows are kept. Realtime caches, tickets, talk floors, presence and static asset caches are reconstructible and do not need backup. Never back up ephemeral audio; audio is never stored.

## Schema upgrades and migration notes

The application opens the SQLite file and migrates it automatically at startup; there is no separate migration command. Migrations are additive, idempotent and never rewrite rows destructively, and `meta.schema_version` records the applied version (currently 9). Take a backup of the database and its WAL before the first start after any upgrade, and verify `schema_version` afterwards (`sqlite3 DATA_DIR/borobiya.sqlite 'select value from meta where key=\'schema_version\''`). Downgrade is not supported: a binary that predates a migration cannot read rows the newer schema expects, so roll back by restoring the pre-upgrade backup.

The migration history, in order:

- **v1 -> v2**: `sos_requests.photo_data_url` and `users.job_type_id` are added to pre-existing files (older 2.0.0 databases). `photo_data_url` holds nothing until the first photo upload.
- **v3**: `job_types` catalog and `mission_offers` (one pending offer row per named responder). Databases that predate offers receive a synthetic pending offer for any still-dispatched SOS with a named responder, so the accept endpoint stays reachable. Declined or accepted rows are never recreated.
- **v4**: `mission_offers.expired_at` records the exact expiry moment; terminal rows created earlier keep NULL (unknown expiry).
- **v5**: mission teams — `support_requests`, `support_request_items`, `support_request_decisions`, `mission_requirements` and `mission_members` (unique active membership per mission and user, at most one active leader per mission). Existing missions are backfilled with a leader membership for their assigned responder; a genuine `offer_accept` history wins over the `legacy_backfill` marker. The backfill never mints a second active leader: a mission that already has one (a pre-fix designation whose stale owner was later removed) keeps it, and v6 reconciles the operational owner onto that leader.
- **v6**: one-off reconciliation pass — if an active leader membership exists and the mission's operational owner does not match it, `missions.responder_id` and `sos_requests.assigned_responder_id` follow the leader. Finished missions are untouched.
- **v7**: `location_shares.scope` — grants carry their explicitly selected detail set (`route` always; optional `motion` and `accuracy`) as a JSON array, or NULL for the pre-v7 full-detail behavior.
- **v8**: the trip domain — `trips`, `trip_stops`, `group_trips`, `trip_invitations` and `saved_trips`. Additive tables only; no existing row is touched.
- **v9**: consented track recording — `track_points` (raw fixes, retention-purged), `track_consents` (per-context decisions) and `track_summaries` (distance/duration/quality that survives the raw points), plus `users.record_track` (account opt-in, default OFF). Additive; existing deployments simply start with recording off.

Optional tuning: `TRIP_TRACK_RETENTION_DAYS` (default 180, 1–3650) bounds raw track-point retention; `TRIP_TRACK_ENABLED=false` disables consented recording globally for a deployment (the per-account opt-in and per-context prompt still gate everything when enabled). Both are read at startup; no other wiring is required.

A fresh install runs the same code path: the base schema already contains every table, and the `ensureColumn` guards are no-ops. Seeding demo users (`SEED_DEMO_USERS=1`) is a development convenience and is rejected in production; the database seeds the catalog, settings and the bootstrap administrator regardless.

## Startup and verification

Start with `bun run start` or a process manager that runs `bun src/server/index.ts`. Confirm `/_public/health`, `/_public/openapi.json`, a protected route with an administrator session, an SVG tile response and a WebSocket upgrade. Watch logs for request IDs on failed responses. Graceful shutdown closes WebSocket peers, clears jobs and closes the database.

Close `docs/ACCEPTANCE.md`, run `./boro verify`, `bun run bench`, `bun run smoke`, `bun run acceptance` and `./boro deploy:check`, then record the release in `docs/RELEASE_NOTES.md`. Create the annotated release tag from the final release commit only after explicit operator approval; this branch creates no tag. Follow `docs/OPERATIONS.md` for routine startup, health signals, incidents, backups and outage recovery.
