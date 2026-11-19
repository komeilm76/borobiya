# Admin API audit

**Date:** 2026-10-23 · **Scope:** all 22 operations in `packages/shared/src/api/admin.routes.ts`, compared with Fastify registrations, the generated `/docs/json` runtime flags, unauthenticated `app.inject` smoke requests, and local unit/PGlite tests. Paths are relative to the API root; `:id`/`:userId` are UUID parameters.

**Status key:** **Implemented (local)** = handler mounted, missing credentials yield 401, OpenAPI reports `implemented`, and the local test suite passes. This is **not** a claim that a particular deployed server, its database, migrations, credentials, or external services were exercised. **Contract only** = described in the shared contract and OpenAPI but **no Fastify handler** is mounted; calling it returns 404. The `reason / problem` column distinguishes a known defect from the absence of a detected defect. **Follow-up (2026-10-23):** all four originally contract-only admin routes have been implemented and exercised locally; the table below reflects the current code, not the original audit snapshot.

| API endpoint | Status | Reason / problem |
|---|---|---|
| `GET /_admin/users` | Implemented (local) | List, pagination and filters are wired; authenticated path covered by tests. No defect found in this audit. |
| `GET /_admin/users/:id` | Implemented (local), **fixed** | Previously returned `missions: []` for every user despite stored missions. Now returns requester **and** rescuer mission records; unit and real-DB authorized API tests cover both roles. The unpaginated mission array can grow large. |
| `POST /_admin/users` | Implemented (local) | Create and username conflict are tested; no defect found. |
| `PATCH /_admin/users/:id/status` | Implemented (local) | Activation/deactivation and session revocation are tested; no defect found. |
| `PATCH /_admin/users/:id/unsuspend` | Implemented (local), **fixed** | Clears suspension transactionally, revokes old sessions, disconnects sockets, audits changes; idempotent 200, invalid UUID 400, unknown user 404. Tested with real-DB API requests. |
| `POST /_admin/incidents` | Implemented (local) | Creation and slug conflict are tested; no defect found. |
| `GET /_admin/incidents` | Implemented (local) | Catalog listing tested; no defect found. |
| `PATCH /_admin/incidents/:id` | Implemented (local) | Editing and slug conflict are tested; no defect found. |
| `POST /_admin/categories` | Implemented (local) | Creation and incident-ID validation are tested; no defect found. |
| `GET /_admin/categories` | Implemented (local) | Catalog listing tested; no defect found. |
| `PATCH /_admin/categories/:id` | Implemented (local) | Editing and membership/catalog integration tested; no defect found. |
| `POST /_admin/categories/:id/users` | Implemented (local) | User assignment and unknown-ID validation are tested; no defect found. |
| `DELETE /_admin/categories/:id/users/:userId` | Implemented (local) | Member removal covered by real-DB tests; no defect found. |
| `GET /_admin/sos/requests` | Implemented (local) | Guard, list and pagination are covered; no defect found. |
| `GET /_admin/sos/requests/:id` | Implemented (local), **contract fixed** | Runtime already returned `400` for invalid UUIDs, but the shared/OpenAPI response list omitted it. Contract now documents 400; valid detail remains implemented. |
| `GET /_admin/sos/requests/:id/missions` | Implemented (local) | Active/terminal filter and request existence are handled; no defect found. |
| `GET /_admin/sos/missions/:id/timeline` | Implemented (local) | Authenticated mission timeline handler mounted; no defect found. |
| `GET /_admin/sos/requests/:id/nearest` | Implemented (local) | Eligibility, manual search and nearest-responder SQL covered by PGlite tests; no defect found. |
| `POST /_admin/sos/requests/:id/dispatch` | Implemented (local) | Valid dispatch and invalid/busy/status conflict paths covered by local tests; no defect found. |
| `GET /_admin/stats` | Implemented (local), **fixed** | Database-grouped SOS status counts (including zeroes), active mission rows, and distinct fresh online active accounts. Real-DB API test checks status, active, stale and duplicate sessions; not a real-time socket count. |
| `GET /_admin/cancellation-reasons` | Implemented (local), **fixed** | Lists seeded/custom reasons of both types, including inactive; unlike the user-facing active-only endpoint. Real-DB API test. |
| `POST /_admin/cancellation-reasons` | Implemented (local), **fixed** | Validates body, inserts a reason and audit row in one transaction; unique `(type, key)` conflicts return 409. Real-DB API test covers validation, conflict, list and audit. |

## Summary and limits

- **22/22 mounted; 0 contract-only admin operations** in the current code. Every admin route rejects a request without an access token with 401; all 22 have matching `/docs/json` implementation flags. These checks protect against falsely labeling a descriptor as live, but do not execute every success path.
- The original audit fixed **two concrete discrepancies**: empty admin user mission history and the missing documented 400 response for invalid SOS-detail IDs. The admin user detail test exercises real PostgreSQL-compatible PGlite data for both mission participant roles and verifies that a non-admin cannot read the detail.
- The follow-up implemented the four missing endpoints with the shared admin-session guard, real database operations, and PGlite API tests for authorization, persistence, invalid input, audit, conflict, and stats. Admin cancellation reason creation cannot edit an existing reason; the list includes inactive entries, but the requester/rescuer reason catalog remains active-only.
- No authenticated production or VM request was made. Deployment, database migrations, network connectivity, session configuration, and production data remain **unverified**. For a deployment-specific answer, compare its `/docs/json` `x-borobiya-runtime-status` values and make authenticated, non-destructive requests using a legitimate admin session **without sharing any credentials or private payloads**.
- `GET /_admin/users/:id` currently includes an unpaginated mission array. If user histories become large, add a separately paginated admin history endpoint rather than silently truncating this response.
