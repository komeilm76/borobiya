# Borobiya 2.0.0 — Implementation Plan (Missions, Sharing Center, Trips, History)

Status: Stage 1 complete; Stage 2 in progress. Each stage ships as focused commits on the working
branch and is reported separately. This document is the live plan; it is updated as stages land.

## Confirmed product decisions (owner-approved, not re-litigated)

1. Job-type policy may allow offers to non-ready workers; accepting such an offer sets the
   worker's readiness to ready inside the same transaction.
2. Immediate Dispatch directly assigns a worker; initial mission state is `ASSIGNED`; it does not
   start the operation.
3. Support personnel selection supports assisted recommendations and manual selection; the
   administrator always finalises the roster.
4. No companion/friend relationship exists; the feature is a Sharing Center.
5. Group-trip participants must explicitly accept invitations.
6. History sharing is user-controlled: the owner selects which available details to share.

Defaults adopted for open sub-decisions (flagged for owner review, not silently baked in):

- Trip leadership is leader-only route modification until designed otherwise.
- Treatment of `mission_ready_required` (see defect review below): superseded by per-job-type
  policies; the setting is kept read-only and marked deprecated, not deleted.
- `assigned_responder_id` on a dispatched SOS means "named for exactly one worker"; group offers
  leave it NULL and target an explicit offer set (see Stage 2).

## Stage 1 — Architecture and defect review (findings)

### Domain model that exists today

- `sos_requests` (PENDING → DISPATCHED → ACCEPTED → IN_PROGRESS → COMPLETED/CANCELLED/EXPIRED).
- `missions` (PENDING → ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED/CANCELLED). `PENDING` is
  unused at runtime; accept creates ON_THE_WAY.
- `service_groups` + `group_members` + `group_incident_types` — responders belong to groups;
  groups cover incident types. There is no per-worker job type and no offer entity.
- `location_shares` (live|history, expires_at, revoked_at) — share mechanics done; UI was
  companions-flavoured (now the Sharing Center CRUD landed with history audit).
- No `job_types`, no `mission_offers`, no `trips*`, no `mission_memberships`, no support requests.

### Verified defects (re-checked on this branch, bb89b04)

1. **`mission_ready_required` does nothing.** Only referenced by the settings catalog, the admin
   Settings screen and seed data; never read by the dispatch/accept paths. → Stage 2 supersedes it
   with per-job-type policies; admin copy marks it deprecated.
2. **Group arm in `acceptSos` lets any group member take a named offer.** `assigned =
   !assigned_responder_id || assigned_responder_id === me || member(assigned_group_id)`. A named
   dispatch for responder X could be accepted by any member of the group. → Fixed in Stage 2.
3. **`GET /_admin/sos/:id/nearest` ignores `:id`.** Nearest is computed from `latitude`/`longitude`
   query parameters; the route parameter is unused. → Fixed in Stage 2 (derive the point from the
   SOS record; query params dropped).
4. **`DispatchView.averageRating` unguarded in the read-only nearest list** (line ~163, plain
   `format.number(row.averageRating)` with a nullable fallback missing, unlike the member list).
   → Fixed in Stage 2.
5. **Mission action buttons for non-assignees.** Client-side visibility is already correct
   (`canActOnMission`, `canCancelMission`, `canRateMission` all check assignee/role); the server
   enforces the same. Verified by reading both sides; no change required beyond keeping them
   aligned in Stage 2.
6. **Sharing UI semantics.** Share create/revoke/audit now exists on the companions/history
   screens; the concept is wrong ("companions") and must be renamed to the Sharing Center. → Stage 4.

### Concurrency notes

- Bun SQLite executes synchronously inside `BEGIN IMMEDIATE` transactions; check-then-act inside
  one transaction is safe. The accept path is additionally protected by `missions.sos_id UNIQUE`;
  Stage 2 moves the existence re-check inside the transaction and maps a lost race to 409.
- `mission_offers` uses `UNIQUE (sos_id, responder_id)` so duplicate offers cannot be created by a
  double dispatch.

## Stage map

- **Stage 2 — Job-type readiness policies, offers, immediate dispatch, authorization corrections.**
  New `job_types` (offer_policy: `all` | `ready_only`) and `mission_offers` tables; `users.job_type_id`;
  offer creation at dispatch (explicit recipients, policy-checked, server-enforced); Policy-A accept
  auto-ready in the same transaction; named-offer authorization for accept; decline endpoint;
  `MISSION_STATUS.ASSIGNED` + immediate dispatch mode (single worker, no acceptance); defect fixes
  1–4; admin Job Types screen; docs.
- **Stage 3 — Mission teams, leadership, membership, support requests.** `mission_members`
  (mission, user, role: leader|member), team missions with admin-chosen leader, support requests
  (create/review/approve/reject/partial), assisted (eligible candidates) + manual personnel
  selection, team assignment into the existing mission, notifications.
- **Stage 4 — Sharing Center.** Rename companions → Sharing Center (routes, nav, labels, docs),
  incoming/outgoing grouped views, per-user detail (outgoing/incoming shares), live + history
  sharing with scope selection, unlimited-duration live shares, revocation, history audit entry.
- **Stage 5 — Trips and group navigation.** Trip domain (trips, trip_stops, group_trips,
  trip_invitations), explicit leader role, invitation/acceptance policy, saved trips, navigation
  via the configured map/routing infrastructure (inspect what is actually wired before choosing).
- **Stage 6 — History.** Mission history and trip history as separate categories, detail views,
  user-controlled share scopes from history records, Sharing Center integration.
- **Stage 7 — Documentation and final review.** DESIGN_MATRIX/ACCEPTANCE/API/ADMIN/USER manuals,
  migration notes, authorization pass, backward-compatibility review, final report.

## Migration strategy

- Additive only: new tables (`job_types`, `mission_offers`, later `mission_members`, trips),
  nullable `users.job_type_id`. No destructive migrations; existing rows keep working.
- Backfill at seed time only: demo responders receive a firefighter job type with policy `all`.
  Existing dispatched SOS rows with a named responder receive a synthetic pending offer so the
  accept endpoint stays reachable; group offers created by new dispatches always carry offer rows.
- `mission_ready_required` is deprecated, not removed.

## Stage log

- Stage 1 (this document): architecture mapped; defects verified; plan fixed.
