# Admin API audit

**Date:** 2026-10-23 · **Scope:** all 22 operations in `packages/shared/src/api/admin.routes.ts`, compared with Fastify registrations, the generated `/docs/json` runtime flags, unauthenticated `app.inject` smoke requests, and local unit/PGlite tests. Paths are relative to the API root; `:id`/`:userId` are UUID parameters.

**Status key:** **Implemented (local)** = handler mounted, missing credentials yield 401, OpenAPI reports `implemented`, and the local test suite passes. This is **not** a claim that a particular deployed server, its database, migrations, credentials, or external services were exercised. **Contract only** = described in the shared contract and OpenAPI but **no Fastify handler** is mounted; calling it returns 404. The `reason / problem` column distinguishes a known defect from the absence of a detected defect.

| API endpoint | Status | Reason / problem |
|---|---|---|
| `GET /_admin/users` | Implemented (local) | List, pagination and filters are wired; authenticated path covered by tests. No defect found in this audit. |
| `GET /_admin/users/:id` | Implemented (local), **fixed** | Previously returned `missions: []` for every user despite stored missions. Now returns requester **and** rescuer mission records; unit and real-DB authorized API tests cover both roles. The unpaginated mission array can grow large. |
| `POST /_admin/users` | Implemented (local) | Create and username conflict are tested; no defect found. |
| `PATCH /_admin/users/:id/status` | Implemented (local) | Activation/deactivation and session revocation are tested; no defect found. |
| `PATCH /_admin/users/:id/unsuspend` | **Contract only — 404** | No handler or unsuspension persistence operation is registered; it cannot clear a suspension. |
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
| `GET /_admin/stats` | **Contract only — 404** | No stats handler/aggregation registered; counts must not be represented as live operational data. |
| `GET /_admin/cancellation-reasons` | **Contract only — 404** | No admin list handler registered. The separate user-facing cancellation-reasons read is not this endpoint. |
| `POST /_admin/cancellation-reasons` | **Contract only — 404** | No admin creation handler/persistence flow registered; this catalog cannot be managed through the advertised admin API. |

## Summary and limits

- **18/22 mounted; 4/22 contract-only.** Every mounted admin route rejects a request without an access token with 401; the four contract-only routes return 404. All 22 have matching `/docs/json` implementation flags. These checks protect against falsely labeling a descriptor as live, but do not execute every endpoint's success path.
- This pass fixed **two concrete discrepancies**: empty admin user mission history and the missing documented 400 response for invalid SOS-detail IDs. The admin user detail test exercises real PostgreSQL-compatible PGlite data for both mission participant roles and verifies that a non-admin cannot read the detail.
- The four missing endpoints need deliberately designed domain implementations, authorization, persistence/aggregation and tests. They were **not** replaced with dummy 200 responses. Treat them as unavailable until implemented.
- No authenticated production or VM request was made. Deployment, database migrations, network connectivity, session configuration, and production data remain **unverified**. For a deployment-specific answer, compare its `/docs/json` `x-borobiya-runtime-status` values and make authenticated, non-destructive requests using a legitimate admin session **without sharing any credentials or private payloads**.
- `GET /_admin/users/:id` currently includes an unpaginated mission array. If user histories become large, add a separately paginated admin history endpoint rather than silently truncating this response.
