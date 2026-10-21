# Borobiya — Security

> TL;DR: All secrets hashed (argon2id), JWT short/long, rate-limit + auto-suspend, CORS allowlist, Zod-only validation, no delete endpoint, audit logs, no sensitive logs.

---

## 1. Authentication & Credentials

### 1.1 Username

- 3–30 chars, `^[a-z0-9_]+$`, lowercase only, unique (DB constraint).
- No email, no phone — username is the only identifier.

### 1.2 Passwords

- **Hash:** `argon2id` (preferred, `memoryCost 64MB, timeCost 3, parallelism 1`) or `bcrypt cost 12`.
- Never store/recover plaintext. Never log.
- **Policy:** 8–1024 characters, at least one Unicode letter + decimal digit (validated by the shared Zod schema).
- Login accepts legacy passwords without reapplying the creation policy, but caps submitted credentials at 1024 characters to bound Argon2 work.
- Compare via `argon2.verify()` — timing-safe. A malformed stored hash fails closed as `INVALID_CREDENTIALS` and triggers dummy-hash work rather than surfacing a server error or an account-dependent fast path.

```ts
import { hashPassword, verifyPassword } from "../packages/server/src/security/password";
const hash = await hashPassword(password);
const ok = await verifyPassword(hash, password);
```

The database seed hashes the local bootstrap admin credential with the same Argon2id helper. The `admin` / `admin123` fallback is accepted only when `NODE_ENV` is `development` or `test`; change it before exposing the service. Other environments require a unique `ADMIN_SEED_PASSWORD`, reject the fallback, and never overwrite an existing admin password.

### 1.3 Security Answers (5 Questions)

- **Normalize before hash:** `answer.trim().toLowerCase()` — document and apply consistently at register & verify.
- **Hash** same as passwords (argon2id) — store only `answerHash`.
- **5 unique `questionId`** — validate `new Set(ids).size===5 && ids.length===5` via `zod.superRefine` + DB unique.
- Table: `user_security_answers (id, userId, questionId, answerHash)` with `UNIQUE(userId, questionId)`.
- Seed `security_questions` with the 15 Persian public prompts in `packages/server/src/db/seed-data.ts`. IDs are stable UUIDs; answers are never seeded. `POST /_auth/register` validates selected IDs and persists only normalized Argon2id answer hashes; `POST /_auth/forgot-password/verify` uses the same normalization before comparison.

### 1.4 Forgot Password Invariants

- **Server picks 3/5** — client must NOT choose. Select three distinct answers with a cryptographically secure random shuffle and persist the selected IDs as a ten-minute challenge.
- Return only `questionIds + texts`, never answer hashes. Unknown or unconfigured accounts receive three random questions from a stable, server-keyed five-question decoy pool for that username, so repeated requests do not expose that decoys draw from a larger catalog than a real account's saved five. Responses share the same shape; verification failures use a generic `WRONG_ANSWERS` response.
- Verify: all three submitted IDs must match the active server-selected challenge and all three normalized answers must pass `argon2.verify`. Always perform three comparisons, using a dummy Argon2id hash for unknown accounts or invalid challenge IDs.
- On success issue a 32-byte opaque, base64url `resetToken` with a ten-minute expiry. Store only its SHA-256 hash in `password_reset_tokens`; claim it atomically so replay or concurrent reuse cannot reset the password twice.
- `POST /_auth/forgot-password/reset` consumes the token and updates the Argon2id password in one transaction, invalidates other reset/challenge tokens, and revokes all refresh sessions. Protected routes also require the persisted session to remain unrevoked, so outstanding access JWTs stop working immediately; the user must log in again.
- Limit request/verify to five attempts per 15 minutes per IP+username; limit reset attempts to five per 15 minutes per IP (the reset body has no username).

### 1.5 Admin-Created Users

- Implemented `POST /_admin/users` accepts only `{ username, password, isActive? }`; strict validation rejects any supplied security-question fields. It stores the password with Argon2id, creates a regular `user` role account, honors `isActive` (default `true`), and creates no `user_security_answers` rows.
- Every created account has `mustCompleteSecurityQuestions=true`. The handler returns the standard user profile and reports duplicate usernames as `409 USERNAME_TAKEN`.
- The route verifies a signed, unexpired HS256 access JWT with `tokenUse: "access"`, requires the admin role, then checks the current admin record remains admin, active, and unsuspended and that the token's persisted session has not been revoked. A verified token with an inactive, suspended, demoted, or logged-out session is denied.
- Login still returns tokens and the `mustCompleteSecurityQuestions` flag so the user can access the completion route; it must not reject login without issuing a usable token.
- `POST /_user/complete-security-questions` accepts five unique IDs from the seeded catalog, normalizes answers with `trim().toLowerCase()`, stores Argon2id hashes, and atomically clears the flag only after all five rows are stored. Repeated requests do not overwrite completed answers and return `409 SECURITY_QUESTIONS_ALREADY_COMPLETED`.
- A Fastify `/_user` authorization hook verifies the signed/unexpired access token, current user role/account state, and a matching persisted session whose refresh-token hash is still present. Logout, password reset, and admin revocation therefore invalidate access JWTs on protected routes immediately, not only at access-token expiry. If `mustCompleteSecurityQuestions` is true, it permits only the completion endpoint and returns `403 SECURITY_QUESTIONS_REQUIRED` for other registered `/_user` handlers. Unimplemented contract-only routes remain 404 until handlers are added.
- The Vue client now exposes login, registration, forgot-password, and completion forms. It keeps the access token in memory, stores only the minimal non-secret user snapshot in `sessionStorage`, and relies on the HttpOnly refresh cookie to restore sessions. The router keeps `/_auth/*` guest-only, protects `/_user/*` and admin routes, and forces every signed-in user with the onboarding flag through `/_user/complete-security-questions` before other pages. `GET /_user/me` refreshes the profile; the `SECURITY_QUESTIONS_REQUIRED` response preserves onboarding status when the profile endpoint is gated.

### 1.6 Admin User Activation/Deactivation

- `PATCH /_admin/users/:id/status` accepts only `{ isActive: boolean }` and applies the same signed access-token and current active/unsuspended admin checks as user creation.
- The status update, append-only audit insert, and refresh-session invalidation are one database transaction. The audit event uses `user_activated` or `user_deactivated`, `targetType: "user"`, the target ID, and metadata `{ previousIsActive, isActive }`. Requests that repeat the current state return the profile without writing another event.
- Deactivation sets `users.is_active=false`, clears every `user_sessions.refresh_token_hash` for that user, and marks those sessions offline. Both user and admin authorization checks require the token's matching session to remain persisted and unrevoked, so logout, password reset, or deactivation invalidates outstanding access JWTs immediately. Reactivation does not revive the old session; a fresh login is required.
- Invalid IDs/bodies receive `400 VALIDATION_ERROR`; a missing target receives `404 USER_NOT_FOUND`. The response is `Cache-Control: no-store`. No user-delete route is registered.

---

## 2. Tokens & Sessions

### 2.1 JWT

| Token | Lifetime | Storage | Usage |
|-------|----------|---------|-------|
| `accessToken` | 15 min | Memory (JS var) + `Authorization: Bearer` | Every API call |
| `refreshToken` | 7 days | HttpOnly, SameSite=Lax cookie with `Secure` on HTTPS (web) or platform Secure Storage (native) | `/_auth/refresh` |
| `resetToken` | 10 min | One-time in body | Forgot reset |

- Secrets: `JWT_SECRET` + `JWT_REFRESH_SECRET` — 32+ chars, different values, from `.env`, never commit.
- Access and refresh JWTs use HS256 with separate `JWT_SECRET` and `JWT_REFRESH_SECRET`; login issues a 15-minute access token and 7-day refresh token.
- Payload includes `{ sub: userId, role, deviceId, sessionId, jti, tokenUse, iat, exp }`; `jti` is a unique random UUID per JWT, `sessionId` remains stable across rotations, and access/refresh token uses are distinct. Verifiers require an unexpired `exp` claim and valid user/session UUIDs, and temporarily accept legacy T1.2.2 JWTs where `jti` held the session ID.
- `user_sessions.refreshTokenHash` stores a SHA-256 hash of the high-entropy signed refresh token and has a unique index. Refresh validates signature, expiry, session/user/device claims, and current account status, then uses a conditional update on the current hash to rotate it atomically; concurrent reuse cannot return two usable tokens.
- Browser login/refresh responses never expose `refreshToken` in JSON; they set an `HttpOnly; SameSite=Lax` cookie carrying `Secure` whenever the request arrived over HTTPS (`X-Forwarded-Proto` honored from trusted proxies). `Secure` is omitted on plain-HTTP development origins, where browsers would otherwise silently drop the cookie and break session restore; production deployments must serve HTTPS. Native clients omit `Origin`, receive the token in the body, and must store it with platform secure storage.
- Logout revokes the claimed user session (clears its stored hash and online flag) and expires the cookie. User/admin authorization checks reject access JWTs backed by that revoked session immediately. Missing or invalid tokens are safe/idempotent; a token with an invalid signature cannot revoke an unrelated session.

### 2.2 Sessions & Devices

- `user_sessions(id, userId, deviceId, deviceName, refreshTokenHash, ip, lastActiveAt, isOnline)` — all eight columns exist since migration `0000_wide_garia.sql`. Login inserts them, refresh rotation swaps the hash and bumps `lastActiveAt`/`isOnline`, and logout or an admin status change clears the hash and sets `isOnline=false`.
- A "device" is a **live session**. Until the login contract accepts a client-stable device ID, each successful login mints a fresh session/device UUID pair, so signing in twice on one laptop lists two devices; `sessionId` stays stable across refresh rotations, which is what makes `isCurrentDevice` unambiguous. A client-supplied device identity (T2.3.6) is what would make it survive re-login.
- `deviceName` is a bounded human label, never the raw `User-Agent`: a client-supplied `deviceName` (1–100 characters, trimmed — what a Capacitor build can report) wins, otherwise the UA is summarized (`Chrome on Windows`, `Safari on iPhone`, `Samsung Internet on Android`), and an unrecognizable UA stores `null`. Raw UA strings are not retained because the device list is user-visible text, and a label is truncated rather than rejected when it is too long.
- `GET /_user/devices` returns the account's live sessions only (`refresh_token_hash is not null`), newest activity first, capped at 50, with `Cache-Control: no-store`. It exposes `id`, `deviceId`, `deviceName`, `ip`, `isCurrentDevice`, `lastActiveAt`, and `isOnline` — never the token hash. Revoked and logged-out rows are excluded instead of accumulating as history, since sessions have no retention job of their own. Self-service revocation of *another* device is not implemented; the spec keeps this endpoint read-only and admin suspension revokes every session of the account.
- `ip` and `lastActiveAt` reflect the last credential exchange (login or refresh), so for a live client they are at most one 15-minute access-token TTL stale. `isOnline` mirrors refresh-token liveness until socket presence drives it separately.

### 2.3 Multi-Device Priority

- When `activeDevices>1` and starting live share/SOS, client must collect `priorityDeviceId` via modal. `GET /_user/devices` (T2.3.2) is the list whose length decides that condition, and its `deviceId` values are what the picker offers.
- Server stores in `location_shares.priorityDeviceId` and ignores GPS from other devices (log warning, return 409).

---

## 3. Rate Limiting

Via `@fastify/rate-limit`. The current API uses its in-memory store; Redis-backed production storage is a later scaling task.

| Scope | Limit | Key |
|-------|-------|-----|
| Global | 100 req/min | `ip` |
| `_auth/login`, `_auth/register` | 5 req/15m | `ip+username` |
| `_auth/forgot-password/request`, `/verify` | 5 req/15m | `ip+username` |
| `_auth/forgot-password/reset` | 5 req/15m | `ip` |
| `POST /_user/sos/requests` | 3 req/min | `userId` |
| `location:update` (Socket.IO) | 60 req/min | one counter per authenticated connection (its session device) |
| `POST /_user/location/update` (REST fallback) | 100 req/min global default | `ip` |
| `POST /_user/missions/:id/cancel` | 3 req/hour | `userId` (also abused flag) |

Global defaults are validated in `packages/server/src/config/env.ts` and registered in `packages/server/src/plugins/security.ts`. Registration, login, and the recovery request/verify routes apply 5/15m IP+username limits; reset applies 5/15m per IP. Limiter keys are derived before schema validation, so invalid or overlong usernames (including case variants rejected by the lowercase schema) are mapped to a bounded invalid-input bucket rather than retained as arbitrarily large keys or aliased to a valid username. Feature-specific limits remain to be added with their handlers. The Socket.IO `location:update` throttle is an in-memory counter on the connection: exceeding 60 updates/minute answers the ack with `RATE_LIMITED` and `retryAfterMs` and skips all database work; sustained `>50/s` auto-suspension still needs the `suspendedUntil`/`suspension_reason` columns and is not implemented. When the API is behind a reverse proxy, set `TRUSTED_PROXY_IPS` to the proxy's exact IP/CIDR allowlist so the limiter sees client IPs; do not trust forwarded headers from arbitrary peers.

---

## 4. Suspension & Abuse

### 4.1 Auto-Suspend Triggers

```ts
if (failedLoginsIn(15*MIN) > 10) suspend(24*H, "too_many_failed_logins");
if (locationUpdatesPerSec > 50)   suspend(24*H, "location_spam");
if (sosCancelsIn(1*HOUR) > 10)     suspend(24*H, "sos_cancel_abuse");
```

- `users.is_suspended` is persisted by the T1.1.4 migration; `suspended_until` and `suspension_reason` remain future schema work.
- Login and refresh reject an `isSuspended` account with `403 {code: "ACCOUNT_SUSPENDED"}`. Refresh also revokes the presented session and clears the browser cookie. Until expiry/reason columns are added, the response uses a generic message and the boolean remains set until an admin clears it.
- Login and refresh reject `isActive=false` with `403 {code: "ACCOUNT_INACTIVE"}`; refresh revokes the presented session.
- Message: “Account suspended. Contact an administrator.”

### 4.2 Manual

- `PATCH /_admin/users/:id/unsuspend` → clears suspension, audits.
- Rate: max 3 rescuer cancels/hour → `429`, flag if >2/day for admin review (cron job adds `admin_alerts` row).

---

## 5. Authorization (Route Prefixes)

The target policy is enforced at **both** layers (fail-closed). Phase 1 runtime status: `GET /_admin/users`, `GET /_admin/users/:id`, `POST /_admin/users`, and `PATCH /_admin/users/:id/status` verify the admin token, current admin account state, and an unrevoked matching session; the `/_user` hook checks access-token validity, current user role/account state, the persisted session, and the onboarding flag. The client implements guest-only auth pages, authenticated user routes, admin-role checks, session restoration, and mandatory onboarding redirects. These Phase 1 account handlers are implemented; domain-level admin handlers for incidents/categories and dispatch are future Phase 3 work (T3.1/T3.3), while location/device user handlers are Phase 2 (T2). They are not missing Phase 1 account-management endpoints.

**Backend policy sketch (shared hooks for future route groups):**

```ts
fastify.register(authRoutes, { prefix: '/_auth' }); // no auth, but if JWT present → 403 ALREADY_AUTHENTICATED
fastify.register(async (f) => {
  f.addHook('preHandler', f.authenticate);
  f.addHook('preHandler', f.authorize(['user','admin'])); // _user may allow admin? spec: document decision
}, { prefix: '/_user' });
fastify.register(async (f) => {
  f.addHook('preHandler', f.authenticate);
  f.addHook('preHandler', f.authorize(['admin']));
}, { prefix: '/_admin' });
```

**Frontend (implemented router guard):** `/_auth/*` pages redirect signed-in users away; protected user/admin pages redirect guests to login with a safe internal return path; non-admin users are sent back to the user dashboard; and a signed-in account with `mustCompleteSecurityQuestions=true` is redirected to onboarding from every route except the completion form. The server hook remains authoritative if client-side state is stale or tampered with.

### 5.1 `_auth` Guest-Only

The registration, login, refresh, logout, and all forgot-password handlers fail closed with `403 ALREADY_AUTHENTICATED` whenever an `Authorization` header is supplied, so a signed-in client can redirect cleanly. Refresh/logout accept the refresh credential only through the cookie or native request body, never through the bearer header.

### 5.2 No Delete Invariant

- No `DELETE /_admin/users/:id` handler may exist.
- A runtime regression test sends `DELETE /_admin/users/:id` to the Fastify app and asserts `404`; the OpenAPI contract also contains no DELETE operation for that path.
- Only `PATCH /.../status {isActive}` + `PATCH /.../unsuspend`.

---

## 6. Input Validation & Injection

- **Zod everywhere:** No raw `req.body`; every route has `schema: { body: zodToJsonSchema(...) }`.
- Use `km-api` to co-locate schema+handler (see API.md).
- DB: parameterized Drizzle queries and reviewed `sql` fragments — never interpolate untrusted strings.
- Sanitize HTML: descriptions rendered as plain text or sanitized via `dompurify` if rich.

---

## 7. HTTP Hardening

```ts
await fastify.register(helmet, {
  contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], connectSrc: ["'self'"] } }
});
fastify.register(cors, {
  origin: (process.env.CORS_ORIGINS || "").split(","), // strict allowlist, not '*'
  credentials: true
});
```

- Nginx: `X-Frame-Options: DENY`, `HSTS`, TLS 1.2+ via Let's Encrypt.

---

## 8. Logging & Secrets

- **Never log:** `password`, `answer`, `refreshToken`, `resetToken`, `JWT_SECRET`.
- Env secrets via `.env` (gitignored) + `.env.example` (documented, no real values).
- In Docker: Compose passes only the API's validated variables through `environment:` interpolation from the local `.env` (no whole-file `env_file` dump); secrets are never baked into the image (`.dockerignore` excludes `.env`).
- `admin_audit_log(id, adminId, action, targetType, targetId, meta, createdAt)` is now migrated. Status events write `user_activated`/`user_deactivated` with before/after active-state metadata; unsuspend/dispatch audit events await those handlers.

---

## 9. Photo Upload

- `POST /_user/sos/requests/:id/photo`: multipart, max 5MB, allow `image/jpeg,image/png,image/webp`.
- Validate via `file-type` magic bytes (not just extension).
- Store to `data/uploads/` (volume) → later S3; serve via `GET /uploads/:id` with auth check (only participants + admin).
- Resize/compress server-side (sharp) optional.

---

## 10. Retention & Pruning

- `LOCATION_HISTORY_RETENTION_DAYS=90` → the API's daily maintenance pass deletes `location_history` rows whose `created_at` is older than the cutoff, in batches of 5,000 rows and at most 40 batches per pass, so a first run after an outage cannot hold one long lock. `server.ts` runs one catch-up pass at startup.
- A timed live share stops at its deadline without waiting for any job: every reader of `location_shares` (the active lists and the fan-out list used by `location:update`) filters `expiresAt > now()`. The minute sweep (`expireOverdueShares`, `is_revoked = true`) only makes that state durable and auditable instead of deleting the row.
- `LOCATION_HISTORY_MAX_SHARE_DAYS=30` is validated at startup to stay within retention (otherwise a grant could promise points that were already pruned); the per-request range check lands with `POST /_user/location/history/share` in T2.2.3.
- Retention deletes history only. Share rows are retired with a flag rather than removed, and no user-initiated purge/export of `location_history` exists yet.
- `SOS_REQUEST_AUTO_EXPIRE_HOURS=24` → pending without dispatch → `expired`, notify requester (Phase 3, not implemented).
- `MISSION_STATUS_TIMEOUT_HOURS=6` → `on_the_way` too long → alert admin (Phase 3, not implemented).

---

## 11. Checklist for Code Review

- [ ] No plaintext credential column
- [ ] `trim().toLowerCase()` applied to security answers before hash + verify
- [ ] `_auth` returns 403 when already authed
- [ ] No DELETE user endpoint
- [ ] Rate-limit plugin active on all `_auth` + `location:update` + `sos/create`
- [ ] Helmet + CORS allowlist
- [ ] Zod on every body/query/params
- [ ] Suspended user gets clear message
- [ ] Photo max 5MB + mime check

