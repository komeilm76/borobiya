# Borobiya 2.0.0 — Implementation Plan (Missions, Sharing Center, Trips, History)

Status: Stage 2 landed (commit range d07c944..eb1cc6b); Stage 3 landed (8c7893c backend, e721106 client). Each stage ships as focused
commits on the working branch and is reported separately. This document is the live plan; it is
updated as stages land.

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

- Stage 6 (this commit): history end to end — the history screen splits past records into three day-grouped tabs. Trips lists finished trips only (completed/cancelled) with stop count, leader/member role and Persian status; expanding one shows the ranked stop list, the members, the start/end times, repeat-as-new-trip and the save toggle. Missions splits between your requests (tracking code, manual-fix flag, severity and the server-held status timeline from `GET /_user/sos/:id`) and the missions you took as a responder (localized status, the granted star rating and the rating note). Shares audits every location share the viewer was part of — both directions, active/expired/revoked with Persian state labels — via `GET /_user/location/shares?include=all`, with a working retry on failure. Every record can spawn a scoped history-window share whose default range is the record's own lifetime (new `HistorySharePanel` component; the server re-validates chronological order, the future bound and the 30-day cap). DESIGN_MATRIX rows history/01-11 and sos/17-20 updated to match; statuses did not flip to done without evidence. No playback/replay, filter, search, month summary, kilometres or vehicle display — no track is recorded for trips or missions, so the designed statistics cannot be rendered honestly (DEV-02 holds; DF-04 applies to any future playback surface). The `repeat` icon was added to the shipped MDI subset. USER_MANUAL, RELEASE_NOTES, DESIGN_MATRIX and this plan updated. `./boro verify` exits 0: 1154/1154 tests, coverage statements 94.17% / branches 88.27% / functions 94.21% / lines 96.14% (thresholds pass; no gate lowered).
- Stage 5 (this commit): trips and group rides end to end — `trips`, `trip_stops` (UNIQUE rank per trip), `group_trips` (exactly one leader enforced by a partial unique index), `trip_invitations` (UNIQUE trip+invitee; pending/accepted/declined/cancelled) and `saved_trips`, schema v8; the leader alone may rename, rewrite the stop list, invite, start, complete or cancel; non-members get 404 rather than 403; finished trips stay readable but reject every mutation (409); invitations require explicit acceptance — the leader cannot add anyone unilaterally — and re-inviting a declined or cancelled invitee resets the single row to pending. Every trip mutation publishes a durable event (`trip.updated`, `trip.invitation`) to the members' audiences. Client: `useTripsStore`, the TripsView (invitation inbox, saved-only filter, ranked-stop creation with saved-place and map-centre stop insertion, leader/member detail split), a trips pill in the top selector (five tabs; trip entry in the command palette and the map sheet footer's trip button), trip view types registered in the API contract test, and the map shell subscribes to the two trip events. DESIGN_MATRIX rows navigation/16-multi-destination (partial) and navigation/17-destination-reordering (missing) were taken back into scope by the explicit Stage-5 product decision; no routing engine, ETA or traffic, by design (DEV-02 carries the note). USER_MANUAL, STATUS, TESTING, ACCEPTANCE, API, ARCHITECTURE, RELEASE_NOTES, DESIGN_MATRIX and this plan updated. `./boro verify` exits 0: 1140/1140 tests, coverage statements 94.24% / branches 88.58% / functions 94.48% / lines 96.19% (thresholds pass; no gate lowered).
- Stage 4 (8c0304a; audit and fresh-schema close-out in the follow-up commit): companions renamed to the Sharing Center end to end — `/_user/sharing` route, `ROUTE_NAMES.sharing`, nav pill label and share-variant icon, screen copy, and the documents (USER_MANUAL, STATUS, TESTING, ACCEPTANCE, README, DESIGN_MATRIX renamed section, design folder READMEs noting the rename). Live grants may be unlimited (`durationSeconds: 0`, no expiry, revoke any time); history grants carry an explicit scope selection (route always; optional motion/heading/speed and accuracy), stored as JSON on `location_shares.scope` (migration v7, also added to the base schema so fresh installs carry it), rejected when unknown, and projected per scope by the history endpoint (accuracy/heading/speed withheld unless granted); legacy rows and omitted selections keep the full detail set. The share list filters by direction (all/outgoing/incoming) and shows expiry or the indefinite state; granting or revoking a share writes an audit row (`location_share.created` / `location_share.revoked`) inside the same transaction alongside the durable event. Grouped incoming/outgoing sections and a per-user detail page from the design were NOT built — tracked as partial rows in docs/DESIGN_MATRIX.md. `./boro verify` exits 0: 1098/1098 tests, coverage statements 94.49% / branches 89.23% / functions 94.34% / lines 96.3% (thresholds pass; no gate lowered).
- Stage 1 (this document): architecture mapped; defects verified; plan fixed.
- Stage 3 (8c7893c backend, e721106 client): mission teams end to end — `mission_members` with one active membership per (mission, user); team missions dispatched with an explicit group-verified leader; assisted staffing (eligible-candidate search with ineligibility reasons shown but unselectable) finalized by the administrator; support requests with create/withdraw/review and full/partial/reject decisions enforced against the requested composition (a full approval must staff exactly what was asked, a partial approval needs at least one short line, double review returns 409); removal-reason visibility restricted to administrators; realtime publication of `mission.team.updated` and `support.request.*` to the `mission:<id>` audience; `/_user/job-types` catalog and a team-dispatch endpoint on the board (explicit leader); a support-requests review queue in the administrator console with a live pending badge; the shared mission team panel and support-request panel on the mission screen; roster management (two-step remove and leader designation, requirements editor, username search to add) in the administrator surface; the contract test now parses the client interfaces against live payloads including the team flow. `./boro verify` exits 0: 1061/1061 tests, coverage statements 94.28% / branches 89.30% / functions 94.05% / lines 96.05% (thresholds pass; no gate lowered).
- Stage 2 (d07c944 schema, 6787a92 server, 6651b6e client, eb1cc6b tests): job types and
  per-job-type offer policies (`all` = Policy A, `ready_only` = Policy B), per-responder
  `mission_offers` rows created atomically at dispatch, Policy-A accept auto-ready inside the
  accept transaction, Policy-B accept-time refusal (409), `decline` endpoint, offer-authoritative
  visibility/acceptance (legacy group arm retained only for rows without offers), immediate
  dispatch (exactly one named responder, no acceptance step, SOS → `accepted`, mission created in
  `assigned`), `ASSIGNED` mission state with `start` transition, nearest endpoint derived from the
  SOS record (`:id` is authoritative; unknown ids 404), DispatchView null-safe rating/readiness
  cells plus offer/immediate modes, admin Job Types screen and `/_admin/job-types` CRUD, users CSV
  and user detail carry the job type, `mission_ready_required` setting deprecated (read-only, no
  enforcement; removal deferred to Stage 7 review), tests updated (offer-based fixtures, rate-limit
  care) and new suites `mission-offers.test.ts` (server end-to-end) and `job-types-view.test.ts`
  (admin screen). `./boro verify` exits 0: 1000/1000 tests, coverage statements 96.49% / branches
  92.59% / functions 96.43% / lines 97.38% (thresholds pass; no gate lowered). Defects 1–4 from
  Stage 1 closed.
