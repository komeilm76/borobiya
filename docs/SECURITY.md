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
- Compare via `argon2.verify()` — timing-safe.

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
- Seed `security_questions` with the 15 Persian public prompts in `packages/server/src/db/seed-data.ts`. IDs are stable UUIDs; answers are never seeded. `POST /_auth/register` validates selected IDs and persists only normalized Argon2id answer hashes; future verification must apply the same normalization.

### 1.4 Forgot Password Invariants

- **Server picks 3/5** — client must NOT choose. Random or deterministic (`hash(userId+salt) % 5` pick 3).
- Return only `questionIds + texts`, never answer hashes.
- Verify: all 3 must pass `argon2.verify`.
- On success issue `resetToken` (JWT or opaque random string, 10 min expiry, single-use, stored in `password_reset_tokens` with `expiresAt`).
- `POST /_auth/forgot-password/reset` consumes token → new password + invalidate old tokens.

### 1.5 Admin-Created Users

- `POST /_admin/users` skips questions; sets `mustCompleteSecurityQuestions=true`.
- Middleware on every `/_user/*` request:
  ```ts
  if (req.user.mustCompleteSecurityQuestions && req.url !== "/_user/complete-security-questions") {
    throw { status: 403, code: "SECURITY_QUESTIONS_REQUIRED" };
  }
  ```
- Frontend forces redirect to `/complete-security-questions` if code received.

---

## 2. Tokens & Sessions

### 2.1 JWT

| Token | Lifetime | Storage | Usage |
|-------|----------|---------|-------|
| `accessToken` | 15 min | Memory (JS var) + `Authorization: Bearer` | Every API call |
| `refreshToken` | 7 days | httpOnly, Secure, SameSite=Lax cookie (web) or `Capacitor Preferences` / Secure Storage (Android) | `/ _auth/refresh` |
| `resetToken` | 10 min | One-time in body | Forgot reset |

- Secrets: `JWT_SECRET` + `JWT_REFRESH_SECRET` — 32+ chars, different values, from `.env`, never commit.
- Payload: `{ sub: userId, role: 'user'|'admin', deviceId, iat, exp }`.
- Refresh flow rotates refresh token (invalidate old hash in `user_sessions.refreshTokenHash`).
- Web login/refresh responses must not expose `refreshToken` in JSON; rotate it through an `HttpOnly` cookie. Native clients may use the body and must store the token with platform secure storage.

### 2.2 Sessions & Devices

- `user_sessions(id, userId, deviceId, deviceName, refreshTokenHash, ip, lastActiveAt, isOnline)`.
- `deviceId` derived from `userAgent+screen` or explicit client UUID (`crypto.randomUUID()` stored in localStorage).
- `GET /_user/devices` returns active table; user can revoke others (optional).

### 2.3 Multi-Device Priority

- When `activeDevices>1` and starting live share/SOS, client must collect `priorityDeviceId` via modal.
- Server stores in `location_shares.priorityDeviceId` and ignores GPS from other devices (log warning, return 409).

---

## 3. Rate Limiting

Via `@fastify/rate-limit`. The current server skeleton uses its in-memory store; Redis-backed production storage is a later scaling task.

| Scope | Limit | Key |
|-------|-------|-----|
| Global | 100 req/min | `ip` |
| `_auth/login`, `_auth/register` | 5 req/15m | `ip+username` |
| `_auth/forgot-password/*` | 5 req/15m | `ip+username` |
| `POST /_user/sos/requests` | 3 req/min | `userId` |
| `location:update` | 60 req/min | `deviceId` |
| `POST /_user/missions/:id/cancel` | 3 req/hour | `userId` (also abused flag) |

Global defaults are validated in `packages/server/src/config/env.ts` and registered in `packages/server/src/plugins/security.ts`. Registration now applies the 5/15m IP+username limit in `packages/server/src/auth/register.ts`; the login, password-recovery, and feature-specific limits remain to be added with their handlers. When the API is behind a reverse proxy, set `TRUSTED_PROXY_IPS` to the proxy's exact IP/CIDR allowlist so the limiter sees client IPs; do not trust forwarded headers from arbitrary peers.

---

## 4. Suspension & Abuse

### 4.1 Auto-Suspend Triggers

```ts
if (failedLoginsIn(15*MIN) > 10) suspend(24*H, "too_many_failed_logins");
if (locationUpdatesPerSec > 50)   suspend(24*H, "location_spam");
if (sosCancelsIn(1*HOUR) > 10)     suspend(24*H, "sos_cancel_abuse");
```

- `users.is_suspended` is persisted by the T1.1.4 migration; `suspended_until` and `suspension_reason` remain future schema work alongside enforcement.
- On login, if `isSuspended && now < suspendedUntil` → `403 {code: "ACCOUNT_SUSPENDED", suspendedUntil, reason}`.
- Message: “Account suspended due to suspicious activity. Contact admin.”

### 4.2 Manual

- `PATCH /_admin/users/:id/unsuspend` → clears suspension, audits.
- Rate: max 3 rescuer cancels/hour → `429`, flag if >2/day for admin review (cron job adds `admin_alerts` row).

---

## 5. Authorization (Route Prefixes)

Enforced at **both** layers (fail-closed):

**Backend (Fastify hooks):**

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

**Frontend (router guard):**

```ts
router.beforeEach((to) => {
  const a = useAuthStore();
  if (to.path.startsWith('/_auth') && a.isLoggedIn) return '/_user/dashboard';
  if (to.path.startsWith('/_user') && !a.isLoggedIn) return '/_auth/login';
  if (to.path.startsWith('/_admin') && a.user?.role !== 'admin') return '/403';
});
```

### 5.1 `_auth` Guest-Only

The registration handler fails closed with `403 ALREADY_AUTHENTICATED` whenever an `Authorization` header is supplied, so a signed-in client can redirect cleanly. Other `/_auth` handlers must preserve this guest-only invariant when implemented.

### 5.2 No Delete Invariant

- No `DELETE /_admin/users/:id` handler may exist.
- Add a test:
  ```ts
  const res = await app.inject({ method: 'DELETE', url: '/_admin/users/xxx', headers });
  expect(res.statusCode).not.toBe(200);
  ```
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
- In Docker: `env_file: .env`, secrets not baked into image.
- Audit table: `admin_audit_log(id, adminId, action, targetType, targetId, meta, createdAt)` — for activate/deactivate/unsuspend/dispatch.

---

## 9. Photo Upload

- `POST /_user/sos/requests/:id/photo`: multipart, max 5MB, allow `image/jpeg,image/png,image/webp`.
- Validate via `file-type` magic bytes (not just extension).
- Store to `data/uploads/` (volume) → later S3; serve via `GET /uploads/:id` with auth check (only participants + admin).
- Resize/compress server-side (sharp) optional.

---

## 10. Retention & Pruning

- `LOCATION_HISTORY_RETENTION_DAYS=90` → daily cron deletes old rows.
- `SOS_REQUEST_AUTO_EXPIRE_HOURS=24` → pending without dispatch → `expired`, notify requester.
- `MISSION_STATUS_TIMEOUT_HOURS=6` → `on_the_way` too long → alert admin.

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

