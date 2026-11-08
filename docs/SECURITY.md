# Security

Security is enforced at the HTTP boundary, the session layer, the service layer and the browser. The runtime is Bun itself plus a generated browser bundle, so the trusted server surface is small and auditable. Private APIs are never cached by the service worker, and browser code contains no API keys or external script sources.

## HTTP defenses

Every response receives a strict Content Security Policy: scripts and workers are same-origin, styles are same-origin plus the small inline style allowance required by generated components, images are same-origin or data URLs, and WebSocket connections are limited to the calculated same-origin `ws` or `wss` endpoint. When `TRUST_PROXY=1`, the endpoint is derived from `X-Forwarded-Proto` and either `X-Forwarded-Host` or the request `Host` header, so a preview or reverse-proxy origin receives its own `wss://` value. Frame ancestors are denied by default. Set `FRAME_ANCESTORS` to an explicit comma-separated list of CSP source expressions when the app is embedded by a trusted preview or dashboard; in that case the legacy `X-Frame-Options: DENY` header is omitted so it cannot conflict with the CSP allowlist. Production checks reject wildcard frame ancestors. Other headers disable content-type sniffing, set referrer policy, apply cross-origin isolation and add HSTS in production.

CORS is explicit. Same-origin requests are allowed without an `Origin` header. Requests with an origin receive credentialed CORS headers only when the origin equals the calculated same origin or matches `ALLOWED_ORIGINS`. Mutating requests additionally pass an origin check before parsing. `Sec-Fetch-Site: cross-site` is rejected unless the origin is explicitly allowed. Do not configure wildcard origins with credentialed cookies.

## Input and rate limits

Bodies are bounded by `MAX_BODY_BYTES`; declared and streamed sizes are checked before parsing. All JSON bodies and query strings use strict schemas that reject unknown fields. Numeric ranges, identifier patterns, enum values, coordinates and data URL formats are validated before services run. Rate buckets protect authentication, recovery, tickets, ordinary mutations, emergency actions, realtime location, talk starts and audio frames. A 429 response includes `Retry-After`.

WebSockets have a maximum frame size, heartbeat timeout, room limit and typed close codes. One-use tickets are random, hashed at rest, short-lived and IP-bound. Audio frames are checked for version, type, active talk floor, speaker identity, sequence order and payload size before forwarding. Only the intended peer receives a frame.

## Accounts and sessions

Passwords and security answers are hashed with Argon2id through `Bun.password`, which uses a per-value random salt. Answer normalization is consistent before hashing, and stored hashes are self-describing so the algorithm can be upgraded later. Unknown users follow a dummy-hash path during login, and unknown recovery usernames receive a decoy challenge with the same visible shape. Failed logins increment a counter and can temporarily lock the account. Recovery challenges have attempt limits, expiry and one-use reset tokens. A successful reset revokes every session and disconnects realtime peers.

Sessions use `HttpOnly`, `SameSite=Lax`, path-scoped cookies, optional secure cookies, IP binding, expiry, refresh rotation and revocation. The server stores a hash of the session secret. Deactivating a user revokes all sessions. The last active administrator cannot be removed, and an administrator cannot suspend or demote their own active account.

## Data protection

SQLite uses foreign keys, prepared statements and an idempotent schema migration that adds the SOS photo column to older databases without losing rows. Audiences on durable events restrict catch-up and socket publication. Location history requires an active authorized share. Audit CSV escapes spreadsheet formulas. Production startup rejects known bootstrap, demo, preview and CI passwords, passwords shorter than twelve characters and enabled demo seeding. `./boro deploy:check` also requires `COOKIE_SECURE=1`, `TRUST_PROXY=1` and exact non-wildcard allowed origins behind HTTPS. Audio is ephemeral and is never stored.
