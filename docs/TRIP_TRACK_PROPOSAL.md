# Trip-track recording — approved proposal (Stage D)

Status: **approved 2026-11-12 and implemented in the Stage D change set.** The delivery order stays
C → D → E → F → G. Playbook: `history/07-history-playback` and the recorded-statistics rows stay
`missing` in the design matrix until a human accepts the recorded preview; nothing in this change
set flips a matrix status.

## Verified current state (audit of the code on `arena/250278b6-borobiya`, Stage C)

- The `location_points` table exists (base schema) and is written in exactly one place:
  `LocationService.publishLive` (`src/server/services/location.ts`), throttled to one row per 5 s
  per user, and only when an authenticated WebSocket client sends `location.update`.
- The shipped client never sends `location.update`. Own fixes are held in memory only
  (`src/client/stores/map.ts`) to render the blue dot. Net effect: `location_points` is empty in
  every real deployment (demo seed inserts a synthetic row only), and there is no track for trips
  or missions to replay.
- The read path `GET /_user/location/history/:userId` already exists and is honest: the owner and
  administrators read full detail; anyone else needs an unexpired, unrevoked `location_shares`
  history grant covering the window, and even then only the granted detail set (route always;
  motion = speed/heading; accuracy) is projected. Foreign or unknown ids answer 404.
- Retention is bounded by an hourly maintenance job: points older than `LOCATION_RETENTION_HOURS`
  (default 168 h, server config, env-tunable 1–8760) are purged; expired shares are revoked on the
  same pass.
- `docs/SECURITY.md` carries a "residual risk" line saying location history is not retrievable at
  all. It predates the owner-read path and is inaccurate; it must be corrected in the same change
  set as this work, not before.
- Design references blocked on this proposal: `history/07-history-playback.png` (missing), the
  kilometre/duration figures in `history/01-history-trips.png` and the statistics in
  `profile/01-profile-home.png` (DEV-03), and DF-04 (any replay surface must communicate
  authorization scope and expiry). `navigation/17-destination-reordering.png` is unrelated to
  recording and stays as scoped by Stage 5.

## Goals and non-goals

Goals

- An honest, consented, revocable GPS track for trips (completed regular and group trips), so a
  replay surface can be built and trip statistics (recorded distance, recorded duration, moving
  time) can be shown truthfully.
- The same privacy posture as the rest of location data: owner/member by default, share-gated for
  anyone else, bounded retention, audit-logged control events, no silent administrator access.

Non-goals

- Turn-by-turn navigation, route computation, ETAs or traffic (DEV-02). Recorded tracks are
  observations, not guidance.
- Responder mission tracks as originally drafted — the approval brought missions **into** scope
  with the same consent model as trips (see Decisions, item 1): the responder is the recording
  party, the account opt-in plus a per-mission prompt gate every write.
- Continuous ambient recording of every signed-in user.
- Backfilling tracks that were never recorded. There is nothing to backfill.

## Options considered

**Option A — trip-scoped recording with explicit opt-in (recommended).**
New `trip_points` table fed only by active trips, read by trip members, sharing kept out of
version one. Detailed below.

**Option B — reuse `location_points` unscoped.**
Rejected. It cannot distinguish consented trip recording from any future ambient feed; the
7-day blanket purge would delete the very window a replay needs; and it widens the blast radius of
the one existing ingest path without any isolation.

**Option C — record nothing (status quo).**
Honest and zero-cost, but `history/07` and trip statistics stay permanently missing and the
History stage cannot demonstrate replay. Listed for completeness because it remains the correct
fallback if the proposal is rejected.

## Proposed design (Option A)

1. **Schema v9 (forward-only migration; fresh installs carry it in the base schema).**
   `trip_points(id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT NOT NULL REFERENCES trips(id)
   ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   latitude REAL NOT NULL, longitude REAL NOT NULL, accuracy REAL NOT NULL, heading REAL,
   speed REAL, recorded_at INTEGER NOT NULL, created_at INTEGER NOT NULL)` with index
   `(trip_id, user_id, recorded_at)`. A separate table rather than a `trip_id` column on
   `location_points`: the track dies with its trip, has different readers and a different
   retention ceiling, and must never leak into the share-gated history projection.
2. **Ingest.** The authenticated `location.update` message gains an optional `tripId`. The server
   accepts the trip association only when the trip exists, the caller is a member, and the trip
   status is `active`; otherwise the association is refused (fixed 404/409 semantics, no existence
   leakage) while the plain live-position behavior is unchanged. Points are quality-filtered
   (accuracy above a configurable ceiling is dropped; non-monotonic timestamps are dropped),
   persisted at most once per 5 s per user, and share the existing `ws-location` rate bucket.
3. **Consent.** Recording is opt-in per account (`recordTripTrack` setting, default OFF) plus an
   always-visible recording indicator on the map pill while a track is being written. Revoking the
   toggle stops future recording immediately; existing points remain until purged or the trip is
   deleted. There is no mode in which the server writes a track for a user who has not opted in.
4. **Client.** The map store, already watching geolocation for the blue dot, forwards a fix every
   5 s or 15 m of movement while a joined trip is active and the toggle is on. Suspension on
   background/tab-hidden and resume on foreground. An offline buffer of at most 120 fixes (10
   minutes) is kept in memory only and flushed on reconnect; nothing is persisted client-side
   beyond the OS geolocation cache. No backfill, ever.
5. **Read surfaces.** A new member-scoped route `GET /_user/trips/:id/track` returns the trip's
   points for members of that trip (and the owner) only; non-members answer 404. An administrator
   has no special read (see open questions). The response includes an explicit `authorized` block
   naming the viewer's basis of access and the track's retention deadline — the DF-04 lesson
   applied from day one.
6. **Replay and statistics.** The history detail for a finished trip gains a replay action that
   animates the recorded polyline by timestamp, and shows recorded distance (haversine sum with a
   20 m outlier clamp), recorded duration and moving time. All figures carry an "approximate"
   label derived from GPS, never presented as surveyed. No ETA, no routing, no deviation metrics.
7. **Sharing.** Out of scope for version one: track replay is trip-member-only. Extending a
   `location_shares` history grant to cover trip points is possible later and reuses the same
   scope machinery; doing it now would ship two new grant semantics in one change.
8. **Retention.** Track points are deleted when their trip is deleted (CASCADE) and additionally
   capped by `TRIP_TRACK_RETENTION_DAYS` (proposed default 180, env-tunable), enforced by the
   same hourly maintenance job that purges `location_points` and expires shares. Purged points are
   gone; the UI must state the deadline on the replay screen rather than imply indestructibility.
9. **Audit and events.** Trip start/complete while the toggle is on writes a `trip.track` audit
   row (metadata only: actor, trip, counts window, no coordinates). Points themselves are never
   audit-logged. A durable `trip.updated` event already exists and is reused; no new event type
   is required.
10. **Preview and demo.** The preview world seeds one finished trip with a synthetic but
    plausible recorded track (labeled demo data) so the replay surface can be reviewed visually;
    matrix rows flip to `done` only after human acceptance, never automatically.

## Storage and performance estimate

A fix every 5 s is at most 720 rows per user-hour; a 45-minute trip is roughly 540 rows
(~35 KB). Ten thousand such trips stay well under one gigabyte in SQLite. Replay queries are
served by the `(trip_id, user_id, recorded_at)` index with a hard limit; the maintenance purge is
an indexed range delete. No new background infrastructure is introduced.

## Test plan (landed with the Stage D change set)

- Migration: v8→v9 exercised in `tests/track.test.ts` (the track module runs against the current
  schema; fresh DDL and the `ensureColumn` path are both asserted by `tests/database.test.ts`).
- Ingest guards: out-of-range/missing accuracy dropped; the recording gate refuses writes without
  opt-in or per-context consent; WebSocket `location.update` carries the recording context; the
  5 s live-share throttle lives in `location_points` and is unaffected by the track gate.
- Read authorization: member replay for trips and mission participants; non-member/non-participant
  404; history-share recipients get the sharer's points only, scope-projected, and 404 outside
  their grant's window; opt-out user has zero points written; administrator read writes
  `admin.track.read` with counts only.
- Retention job: points older than the ceiling are purged in batches after their summaries are
  persisted; a context whose summary cannot be persisted keeps every point (fail-closed);
  `insufficient_data` is stored with NULL distance/duration, never estimated; trip and mission
  rows are never touched.
- Statistics: haversine against known fixtures; teleports (>83 m/s) rejected; single-point and
  empty tracks report `insufficient_data` honestly instead of fabricating a number.
- Client: `tests/track-store.test.ts` and `tests/track-components.test.ts` cover the opt-in
  mirror, the consent prompt order (mission first), the throttled publisher, the replay cache and
  the honest availability states. `./boro verify` is green with no gate lowered.
- Docs in the same change: `SECURITY.md` (new data class and the residual-risk correction),
  `DEPLOYMENT.md` (new env vars), `API.md`, `WEBSOCKET.md`, `USER_MANUAL.md`, `STATUS.md`,
  `RELEASE_NOTES.md`, `DESIGN_MATRIX.md` (notes only; statuses flip after human acceptance).

## Rollout (as shipped)

Stage D ships as one focused change set. The schema migration runs on startup like the existing
path (v8 → v9, additive only). The feature is dark by default at two independent layers: the
account toggle (`users.record_track`, default OFF) and the per-context prompt (a context records
nothing until the user accepts it). `TRIP_TRACK_ENABLED` is a global server kill switch (default
ON, set to `false` to disable recording entirely for a deployment); `TRIP_TRACK_RETENTION_DAYS`
bounds raw-point retention (default 180). No UI ships ahead of its server contract, matching the
project's ingest-before-paint discipline.

## Decisions (recorded 2026-11-12, product owner)

The product owner answered the seven questions on 2026-11-12; the Stage D change set implements them:

1. **Scope: trips AND responder missions.** Missions follow the same model with the responder as
   the recording party (assignment-side), consent on top of the account toggle, per-mission prompt
   at mission start. The requester is never tracked by this feature.
2. **Consent UX: account-level opt-in AND a per-trip/per-mission prompt at start.** A global
   account toggle (default OFF) is the master switch; starting a trip/mission while opted in asks
   once per context (record / don't record). Declining is persisted and never re-asked.
3. **Readers: trip members + history-share recipients.** Members replay the whole trip track. A
   history-share recipient (active, unrevoked, covering window) replays only the sharer's points,
   with the grant's scope projection (route always; motion and accuracy only when granted).
   Mission participants (requester + assigned responder) replay the responder's mission track;
   share recipients see only the sharer's points with the same projection.
4. **Administrator access: yes, audit-logged.** Admins may read a track; every read writes an
   `admin.track.read` audit row (actor, context type/id, ip, counts only - never coordinates).
5. **Retention: 180 days for TRIP_TRACK_RETENTION_DAYS, applied to raw tracking points only.**
   Trip and mission records, their metadata (start/end timestamps, status) and their calculated
   distance/duration summaries are preserved after raw points expire. Summary calculation is
   completed and persisted BEFORE raw points are purged; a context whose summary cannot be
   persisted is skipped by the purge. Summaries that cannot be calculated reliably (fewer than
   two usable points) are stored as `insufficient_data` with distance/duration NULL - never
   replaced by an estimate. Deletion of raw points must not cascade into trips, missions or any
   other table. Trips with replay available and trips whose tracking data has expired are
   clearly distinguished everywhere the data is shown (`available` / `expired` / `none`), and
   expired replay is never presented as if it still exists. The retention is configurable via
   TRIP_TRACK_RETENTION_DAYS and enforced by the existing hourly maintenance job using batched
   deletes.
6. **Metric wording (confirmed by implication of the requirements):** distance/duration are the
   recorded-GPS figures computed at terminal transition and re-verified at purge; UI must label
   them approximate.
7. **Deletion semantics:** record-keeping stays with the trip/mission rows; raw points are
   removed by retention or when their parent trip is deleted (explicit, application-level delete
   in the same transaction as the trip delete - never a SQL cascade, and never the reverse).

## Decisions requested (answered 2026-11-12 — see Decisions above)

1. Scope: trips only (recommended), or also missions with a separate consent model?
2. Consent UX: single account-level opt-in plus indicator (recommended), or additionally a
   per-trip prompt at start?
3. Replay readers: trip members only (recommended), or also history-share recipients via an
   extended grant (adds scope projection to `trip_points`)?
4. Administrator access: no silent admin read (recommended; consistent with the share-gated
   posture), or an explicit admin audit-logged read for safeguarding?
5. Retention ceiling: `TRIP_TRACK_RETENTION_DAYS = 180` as the proposed default?
6. Metric wording: "approximate distance/duration (recorded GPS)" acceptable for the UI?
7. Deletion semantics: deleting a trip deletes its track points (recommended) — confirm?

## If not approved

Option C stands: nothing is built, `history/07` and the recorded-statistics rows stay `missing` in
the design matrix, and the replay portion of Stage F is reported as unavailable rather than faked.
Either outcome is a valid, documented product decision; what is not acceptable is recording
without an explicit yes to the questions above.
