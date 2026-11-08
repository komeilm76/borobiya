# Operations runbook

This runbook is for the operator of a deployed Borobiya instance. It assumes a single Node.js process behind an HTTPS reverse proxy and one persistent SQLite data directory. All commands run from the repository root.

## Routine startup

1. Confirm Node.js 22.12 or newer is installed.
2. Run `npm ci` from the committed lockfile.
3. Confirm `NODE_ENV=production`, `COOKIE_SECURE=1`, `TRUST_PROXY=1`, `SEED_DEMO_USERS=0`, exact `ALLOWED_ORIGINS` without wildcards, a unique `ADMIN_PASSWORD` of at least twelve characters, and `HOST`, `PORT` and `DATA_DIR`.
4. Run `./boro deploy:check` before enabling traffic.
5. Start with `npm start` or a process manager that invokes `node --experimental-transform-types --disable-warning=ExperimentalWarning src/index.ts`.
6. Verify `/_public/health`, `/_public/openapi.json`, the SPA shell, an SVG tile and a WebSocket upgrade.

## Routine verification

Run `npm run check` before deploying a new revision. Run `./boro doctor` for runtime prerequisites and `./boro verify` for the full gate. Run `npm run bench` to record validator, tile, HTTP and live-location latency figures. Run `npm run smoke` or `./boro smoke` for a reproducible in-process HTTP, asset, authentication, WebSocket and SOS fan-out check. Run `npm run acceptance` to verify that the acceptance checklist is closed and that release evidence files are present. These commands do not perform browser-driven professional UI acceptance.

## Health signals

`/_public/health` confirms that the process is alive. `/_admin/system/health` reports uptime, database row counts, realtime connections, rooms, frame counters, ticket cache statistics, talk-floor counters, map tile cache, live-location cache, static file cache and memory. A sudden rise in frame counters without a matching rise in users may indicate a noisy client. A full tile cache is bounded and evicts deterministically; it does not require operator intervention.

Every response has an `X-Request-Id`. Use that value when correlating a user report with server logs. A 401 indicates an invalid or revoked session; a 403 indicates origin, role or ownership rejection; a 409 indicates an impossible domain transition; a 429 indicates rate limiting; a 413 indicates an oversized body.

## Sessions and account incidents

Deactivating a user revokes all sessions and disconnects realtime peers. A successful password reset does the same. To investigate a compromised account, review `/_admin/users/:id`, active devices, login history and the audit log. Rotate `ADMIN_PASSWORD` and restart if administrator credentials are suspected to be exposed. The last active administrator cannot be removed, and an administrator cannot suspend or demote their own active account.

## Data and backups

The SQLite database at `DATA_DIR/borobiya.sqlite` is the source of truth. For file-backed databases, WAL mode is enabled. Use a SQLite-aware backup method or copy the database and WAL together during a quiescent period. Do not delete the data directory as a shortcut. Realtime caches, tickets, presence, talk floors and static asset caches are reconstructible. Location retention and durable event purging are bounded by maintenance jobs.

## Outages and recovery

If the process is unreachable, check the reverse proxy, the Node listener and the persistent volume. If WebSockets fail while HTTP succeeds, confirm that the proxy forwards upgrade headers, `X-Forwarded-Proto`, `X-Forwarded-Host` or the public `Host`, and that the browser origin is allowed. If static assets are stale, rerun `npm run assets` and confirm the content-versioned cache manifest changed. If the database file is missing, restore it from backup before starting; do not rely on demo seeding in production. After recovery, rerun the routine verification commands and `npm run smoke`.

## Release procedure

Close `docs/ACCEPTANCE.md`, update `docs/RELEASE_NOTES.md`, run the full gate, commit and push the release branch, create the annotated `v1.0.0` tag locally, and have the release operator push the tag after final approval. Record the commit, tag, environment, browser smoke results and backup timestamp in the release ticket.
