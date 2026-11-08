# HTTP API

All API routes are same-origin and are declared in `src/server/routes/index.ts` The generated OpenAPI document is available at `/_public/openapi.json` and reports the product version from `APP_VERSION` in `src/shared/protocol.ts`; `/_public/health` reports the same `version` alongside `status`, `serverTime` and `dataVersion`. The browser uses relative URLs only. There is no external API host and no API key in browser code.

## Envelopes

A successful JSON response has the shape `{"ok":true,"requestId":"req_...","data":...}`. An error response has the shape `{"ok":false,"requestId":"req_...","error":{"code":"...","message":"...","details":...}}`. Every response includes a strict request ID, no-store cache policy for API data, CSP, frame denial, content-type options and explicit CORS headers when an origin is allowed.

Validation is strict. Unknown object fields are rejected. Query values are coerced only where the schema explicitly allows it. Bodies are bounded by `MAX_BODY_BYTES`; oversized requests return 413. Rate-limited requests return 429 with `Retry-After`. Authentication failures return 401; role or ownership failures return 403; impossible state transitions return 409.

## Authentication

`/_auth/register` creates an account with five distinct security questions. `/_auth/login` returns a session cookie and user summary. `/_auth/refresh` rotates the cookie; `/_auth/logout` revokes the session. Recovery uses `/_auth/recovery/start`, `/_auth/recovery/answers` and `/_auth/recovery/reset`. Unknown usernames receive a decoy challenge. A successful reset revokes all sessions for that user.

A session cookie is `HttpOnly`, `SameSite=Lax`, path-scoped and optionally secure. It contains a session identifier and secret; the server stores only a hash of the secret. Sessions bind to IP and expire after `SESSION_TTL_SECONDS`.

## Public routes

`/_public/health` reports service status. `/_public/openapi.json` returns the route document. `/_public/security-questions`, `/_public/incident-types` and `/_public/cancellation-reasons` expose stable catalogs. `/_public/map/config` returns offline tile limits, center, zoom and tile template. `/_public/map/tiles/:z/:x/:y.svg` returns deterministic immutable SVG with an ETag.

## User routes

`/_user/me`, `/_user/devices`, `/_user/logins` and `/_user/security-questions` manage the account. `/_user/places` supports saved-place creation, updates, reordering and deletion. `/_user/location/shares` manages bounded live or historical sharing; `/_user/location/snapshot` and `/_user/location/history/:userId` expose authorized fixes. `/_user/sync` returns durable events after a cursor. `/_user/realtime/ticket` issues a one-use WebSocket ticket.

`/_user/sos` creates and lists SOS requests. `/_user/sos/:id` returns detail and timeline. Cancellation, acceptance, mission progress and rating use explicit subroutes. `/_user/ready` sets responder mission readiness. `/_user/users/search` finds accounts for sharing. Every field used by the browser is backed by one of these routes.

## Administrator routes

`/_admin/overview`, `/_admin/dispatch`, `/_admin/reports`, `/_admin/users`, `/_admin/groups`, `/_admin/incident-types`, `/_admin/audit`, `/_admin/alerts`, `/_admin/settings` and `/_admin/system/health` power the console. CSV export is available for users and audit. Dispatch uses `/_admin/sos/:id/nearest` and `/_admin/sos/:id/dispatch`. User creation, role changes, active-state changes, group membership, alert resolution and settings updates all pass through the same service and event boundary.

## Example

A login request is `POST /_auth/login` with `{"username":"...","password":"..."}`. A successful response contains the user summary and sets the session cookie. Subsequent requests send that cookie automatically. Mutations must include a same-origin or explicitly allowed `Origin` header; rejected origins return 403 before the service layer runs.
