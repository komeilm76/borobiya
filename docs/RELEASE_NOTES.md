# Release notes

## Unreleased — Stage F evidence pass (2026-11-16)

Visual-acceptance evidence and documentation reconciliation for this branch; PR [#6](https://github.com/komeilm76/borobiya/pull/6) remains open and unmerged — no release, no tag.

- The visual-acceptance evidence set grew from 88 to **125 implementation captures** under `docs/visual-acceptance/screens/` (including ten dark-theme aid shots, two reduced-motion aids and one narrow-viewport admin aid; a 2026-11-19 regeneration sweep re-verified every capture against the current build — 25 byte-identical, the rest differing only in clock/animation/timestamp regions — and fixed two stale harness click targets): `history/10` (empty), `history/11` (error with retry), `companions/09` (empty Sharing Center) and `admin-states/03-error` (users console, inline error panel with retry). They were produced against the demo bundle with new preview-only knobs in the fake-data layer (`?history=empty`, `?shares=empty`, `?fail=history`, `?fail=admin` — deterministic 500 envelopes and empty lists) and a capture-harness fix (the `persona` query parameter now lands correctly when the route already carries query parameters).
- The canonical matrix tallies were reconciled against the per-row table in `docs/DESIGN_MATRIX.md`, which is the single authority. Printed tallies in earlier stage logs had drifted; a reconciliation note now records this. A same-day sweep also applied the documented code-evidence rule — the 14 rows whose notes documented shipped implementations moved `missing` → `partial` (`auth/02`, `auth/12`, `navigation/17`, `sos/16`, `mission/13`, `mission/19`, `history/07`, `profile/06`, `admin-panel/dashboard/03-reports`, `admin-panel/states/01-loading`, `admin-panel/states/04-offline`, `admin-panel/services/02-group-edit`, `admin-panel/services/03-members`, `admin-panel/users/02-account`). Canonical tally: **done 21 · partial 92 · missing 10 · superseded 12 · reference 5 · deviation 1**. No row was flipped to `done`; visual acceptance remains the deferred human P5 review.
- Stale claims corrected: no measured hold-pill fill percentage and no unverified pixel-level capture/reference comparison are claimed anywhere; `docs/VISUAL_ACCEPTANCE.md`, `docs/DESIGN_MATRIX.md`, `docs/STATUS.md`, `docs/IMPLEMENTATION_PLAN.md` (Stage F log) and the delivery report (§19 addendum) now state what was verified on 2026-11-16.
- A follow-up hardening pass closed the least-covered client surfaces and made the suite order-independent: new behavioral tests for TripsView, ProfileView (logout confirmation, readiness and track-recording switches with their failure paths, username and saved-place editing, collapsed login history, theme cycle), MissionTeamPanel and SupportRequestsView failure paths, and the preview demo-data knobs (failure/empty/filter states and the `?slow=` response-delay knob, pinned by tests in `tests/preview-mock.test.ts`). A capture-drift checker (`scripts/visual-acceptance/diff.mjs`) now pixel-compares a fresh regeneration against the committed captures and classifies each difference as identical, volatile-only (clock/animation regions) or needing review; `scripts/check-docs.ts` additionally validates every capture-scenario route against the preview registry so a typo'd route fails the docs check instead of silently screenshotting the wrong page. The user and administrator manuals were audited against the shipped screens and corrected where they described designed-but-unshipped surfaces (the overview has no operations map or readiness panels; the dispatch board is a queue with a nearest-responder panel; replay ships on history detail). The full suite was then run shuffled under five seeds; eleven order-dependent tests in eight files (shared fixtures created by earlier tests, the 32-room hub budget, the 5-second location-persistence throttle, lazy-route imports racing `flushPromises`, one session deactivated by a neighbouring test) were made self-arranging, and all five seeds pass.
- `./boro verify` exits 0: 1392/1392 tests (106 files); coverage statements 95.23% / branches 88.14% / functions 95.87% / lines 97.08% — thresholds unchanged, nothing lowered.
- Fixed a dead lifecycle: SOS requests carry `expires_at` (creation + 2 h) and the state machine defines `expire`, but nothing ever performed the transition, so unanswered requests stayed in the dispatch queue forever. New `expireDueRequests` (maintenance job + lazy on SOS reads, dispatch, accept and offer lists) expires pending/dispatched requests past their window — retiring their pending offers and notifying requester and responders (`sos.expired`); requests with a mission and requests past acceptance are never expired.

## Unreleased — Stage G/H: design-parity continuation (2026-11-15)

Designed state compositions shipped across the console and the responder flow, recorded honestly in `REPORT-2026-11-13-STAGE-G.md`; no `docs/DESIGN_MATRIX.md` row was flipped — human visual acceptance remains the gate.

- Administrator console: first-load skeletons on every screen (users, overview, reports, alerts, groups, audit, dispatch, job types, incident types, support requests, settings and the system-health panel); a designed filter-empty state on the users screen with a clear-filters action; a shared `AdminInlineError` panel so a swallowed loader failure renders inline with a retry that re-issues the screen's own primary pull (wired on ten screens — the admin store's `guard()` never throws, so failures used to surface nothing); a dark offline banner in the admin shell with the last clean sync wall-clock and a retry that re-pulls every admin projection.
- Designed 403 surface: a signed-in non-admin reaching an administrator URL lands on a composed panel (title, the actual rule — administrator-role accounts only, no finer permission scope exists — and a back CTA) instead of a silent redirect.
- Responder flow: the SOS composer states its offline stance plainly (no SOS reaches the center while the link is down, no offline queue exists) and shows a full-screen sending card while mid-submit; the mission screen shows an offline card with the last successful catalog sync where known, and an explicit notice when an administrator reviews a support request (approved / partially approved / rejected with the server's reason codes).
- Authentication and account: the login submit stays disabled with an explicit note until both fields are filled; the forced onboarding screen shows a loading composition and a retry-on-failure instead of a silent empty form; logout goes through a confirmation dialog.
- Trips: leader-only stop reordering (up/down rank controls, wholesale `PATCH` of the stop list); drag handles and ETA recomputation were not invented (no routing engine).
- Administrator: incident types can now be created and inline-edited (label/icon/color, shipped-glyph allowlist, `#RRGGBB` colors, server-assigned rank); account detail panel on the users screen (sessions, login history, membership, two-step deactivation); the dispatch board flags hand-dropped incident pins in the queue row and in the expanded panel (`isManual`).
- The visual preview catalog gained the `/_forbidden` page (ready for human review, never auto-approved). CI's coverage step failed on frozen-install variance and was closed by adding behavioral tests, with no gate lowered. `./boro verify` exits 0: 1345 tests across 104 files; coverage roughly statement 94.5% / branch 87.6% / function 95.3% / line 96.6% (v8 figures jitter by tenths between runs; thresholds unchanged). (Superseded by the 2026-11-16 entry above: 1346/1346, coverage 94.38/87.28/95.21/96.51.)

## Unreleased — Stage D: consented track recording (2026-11-12)

Consented GPS track recording for trips and responder missions, per the approved proposal in `docs/TRIP_TRACK_PROPOSAL.md` (the Stage D change set on this branch).

- Schema v9 (additive): `track_points` (raw fixes under retention), `track_consents` (per-context decisions), `track_summaries` (persisted distance/duration/quality that survives the raw points) and `users.record_track` (account opt-in, default OFF).
- Recording is double-gated: account opt-in plus a per-trip/per-mission prompt at start; declined decisions are persisted and never re-asked. Fixes worse than 100 m accuracy are dropped; teleports (>83 m/s) invalidate the computed summary (`insufficient_data`, NULL stats — never estimated).
- History (Stage E): date-range (today / 7 / 30 days / all) and status chips on every history tab (share lifecycle chips for shares), an honest per-tab summary line, and filter-emptied empty states with one-click reset; tab badges keep the unfiltered totals.
- Replay: context participants read the whole window; history-share recipients read only the sharer's points, scope-projected (route always; heading/speed and accuracy only when granted), until the grant expires or is revoked; everyone else gets 404. Administrators read through `GET /_admin/tracks/:contextType/:contextId`, which audit-logs `admin.track.read` with counts only.
- Retention: `TRIP_TRACK_RETENTION_DAYS` (default 180) purges raw points in 500-row batches via the existing hourly maintenance job, only after summaries are persisted (fail-closed per context). Trip/mission rows and summaries are never purged by the job.
- Client: a `track` store (VueUse-persisted opt-in mirror, mission-first consent prompt, throttled publisher fed by the geolocation watch, replay cache), a consent prompt and a recording indicator in the map shell, an account-level toggle on the profile screen, and an honest availability treatment (`available` / `expired` / `none`) with a schematic path view and per-member summary on the history screen.
- `./boro verify` exits 0: 1224/1224 tests; coverage statements 94.02% / branches 87.25% / functions 94.62% / lines 96.22% (no gate lowered). `history/07-history-playback` and the recorded-statistics rows stay `missing` in the design matrix until a human accepts the recorded preview.

## Version 2.0.0 — Bun and Vue migration

Release date: 2026-11-08. Branch: `arena/250278b6-borobiya`.

### Summary

Version 2.0.0 replaces the Node.js runtime and the hand-written browser modules of the 1.0.0 clean rebuild with a Bun-only runtime and a Vue 3 TypeScript application. One Bun process still serves the SPA, the JSON API, the offline SVG tiles and the realtime endpoint, but every runtime primitive is now Bun-native and every browser surface is a typed single-file component. The canonical design images under `design/` remain the visual contract, and the database schema evolves forward-only through additive migrations (currently `SCHEMA_VERSION = 9`).

### Runtime

- `Bun.serve` handles HTTP and WebSocket upgrades; the custom RFC 6455 implementation and the `node:http`/`node:stream` imports are gone.
- `bun:sqlite` replaces `node:sqlite`; the schema is managed by additive, idempotent migrations (schema v9) and every migration runs automatically at startup — see the schema-upgrade notes in `docs/DEPLOYMENT.md`. The v5 leader backfill was hardened so installs that already carry a pre-fix designated leader never mint a second active one; the operational owner reconciles onto the real leader. A legacy v1 database migrates without losing rows (verified by the suite).
- `Bun.password` hashes with Argon2id. Stored hashes remain self-describing, so the format is verifiable and upgradable.
- `Bun.file`, `Bun.write` and `Bun.Glob` replace every filesystem helper; `scripts/*.ts` run through `bun` and the `boro` shim only executes Bun.
- `bun run build` clears the previous bundle before building, so a rebuild of unchanged sources is byte-identical instead of accumulating stale hashed chunks.
- The toolchain is pinned to Bun 1.4.4 in `.bun-version`, `packageManager` and CI; CI installs that exact version from the npm registry tarball because the GitHub release CDN intermittently returns 504. `package-lock.json` is deleted and `bun.lock` is committed; CI installs with `bun install --frozen-lockfile`.
- `engines.node` and `@types/node` are removed, and no active source imports `node:http`, `node:stream`, `node:sqlite`, `node:fs` or `node:crypto` for runtime behavior.

### Browser application

- Vue 3.5 with `<script setup lang="ts">` in every view, layout and component; 23 views cover the four authentication screens, seven mobile map screens and eleven administrator screens (the seventh, `TripsView`, is the Stage 5 trips and group-rides surface). The history screen (Stage 6) groups finished trips, your SOS requests, responder missions and audited location shares into day-grouped tabs with inline detail and scoped history-window share creation.
- Vue Router 4 with typed `ROUTE_NAMES`, lazy view imports and role-aware guards.
- Vuetify 3 registered through `vite-plugin-vuetify`, compiled with the Borobiya design tokens; Tailwind CSS 4 through `@tailwindcss/vite` with preflight disabled so Vuetify's reset stays authoritative.
- Ten Pinia setup stores (`auth`, `map`, `sos`, `realtime`, `admin`, `settings`, `offline`, `missionTeam`, `trips`, `track`) and VueUse for storage, online/network state, media queries, geolocation, debouncing and event listeners.
- Motion is declarative first: `<Transition>` and `<TransitionGroup>` for routes, sheets and live lists, `motion-v` with `@vueuse/motion` variants for cards and the command palette, and GSAP for one coordinated reveal timeline. Every duration is `0` under `prefers-reduced-motion`.
- The service worker is authored in TypeScript (`src/client/service-worker/sw.ts`) and compiled to the browser artifact at build time; `public/` is generated output and git-ignored.

### Preserved behavior

- Strict request envelopes, typed validators, typed errors, CSP, CORS, CSRF and origin checks, request IDs, no-store API responses, body limits, rate limits and static path safety.
- Preview-proxy trusted headers with sanitized `FRAME_ANCESTORS` (empty stays deny-by-default; no wildcard default), plus the omission of the conflicting `X-Frame-Options` header when frame ancestors are explicitly allowed.
- One-use IP-bound WebSocket tickets, audience-filtered durable events, cursor sync, presence, live location fan-out, SOS fan-out and binary push-to-talk.
- Sign-in accepts any provisioned secret while the 12-character/letters-and-numbers policy still applies where a password is chosen, so the documented bootstrap administrator password works on a fresh install.
- A push-to-talk hold streams for its whole duration; the per-frame payload ceiling is no longer mistaken for a session budget.
- An expired session during the profile device read clears the local session and redirects instead of raising an unhandled rejection.
- In the command palette, holding Ctrl/Cmd and pressing K registered the chord, and one arrow press moved the highlight two rows because both the window handler and the search-field handler counted the same event; the field now owns the step and stops the event.
- The palette announces its match count in a polite live region, so filtering to no results is no longer silent for a screen reader.
- Push-to-talk releases the microphone on `pointercancel`, on leaving the button and on unmount, and stops streaming when the floor refuses a turn instead of showing a live call that does not exist.
- Push-to-talk is operable from the keyboard, which it was not before: a button that only listened to pointer events could not be used without a mouse.
- Talk frames adopt the session id the server assigns to the `talk.start` acknowledgement, so audio is not dropped as belonging to an unknown session.
- Registration applies the same password policy as recovery, through one shared composable, and refuses a blank security answer or a repeated question before the account is created.
- The SOS composer refuses to send a description the server will reject, naming the ten-character minimum in place instead of letting the request fail at the last step with "Invalid request."
- The mission screen's rating form is reachable: it sat inside a block gated on the *active* mission, and an active mission by definition excludes completed ones, so the form could never render.
- Eight client view types now describe the payloads the API actually sends; the drift had emptied the administrator reports panel (`statuses` vs `statusCounts`), the overview trend (`{day,count}` vs `{label,value}`), the recent-requests panel, the open-alert KPI, the mission timeline, the share list keys, the map's initial zoom (`zoom` vs `defaultZoom`), the user activation toggle (`isActive` vs `active`) and the tracking code type.
- A contract test parses those interfaces and checks each against a live response, so a rename on either side fails the build.
- The profile device list reads the fields the API actually returns (`sessionId`, `lastActiveAt`, `isCurrentDevice`), so names and timestamps appear and the current session cannot revoke itself; revoking another device now uses `DELETE /_user/devices/:sessionId` instead of a route that did not exist.
- Password recovery checks the password policy before submitting, so a short or digit-free password is explained in place instead of being posted to earn an uninformative "Invalid request." from the server.
- The Vitest suite is hermetic: `tests/setup.ts` strips the repository `.env` from the environment, so `./boro check` and `bunx --bun vitest` agree, and component suites stub `fetch` rather than resolving relative URLs against an ambient dev server.
- Full authentication, recovery, onboarding, SOS, dispatch, mission, administration, CSV export and audit behavior, with the production safety guards (`SEED_DEMO_USERS=0`, `COOKIE_SECURE=1`, `TRUST_PROXY=1`, unique administrator password).
- Service-worker versioned precache, stale-while-revalidate, private-route bypass and a bounded 256-entry tile cache.

### Validation

`bun run check` is the gate: it builds the Vue bundle and the service worker, typechecks the Bun server (`tsc`), typechecks the Vue client (`vue-tsc --noEmit`), runs the English-only documentation and clean-rebuild guard, and executes the Vitest suite with coverage. `./boro doctor`, `./boro verify`, `bun run bench`, `bun run smoke`, `bun run acceptance` and `./boro deploy:check` complete the release gate.

The suite is Vitest with `@vue/test-utils` and `happy-dom`, and covers core rules, HTTP contracts, authentication, security headers, realtime coordination, journeys, architecture, assets, the compiled service worker, accessibility contrast, performance budgets, the database migration, production guards, trips and group rides, the Stage-6 history categories, the Stage-D track recording gates (server suite, store gates and components), Vuetify component mounting, all 23 routed views plus the route guard, the mobile shell's realtime, geolocation and hold-to-SOS behaviour, Pinia stores, composables, the browser WebSocket transport and push-to-talk codec, and an in-process preview smoke. The documentation guard recognizes 25 required documents and 154 canonical design images.

Professional visual acceptance against the canonical PNG references remains a deliberately deferred human review: this release contains no browser-driven end-to-end sign-off, no screenshot comparison and no real-device testing.

### Operational notes

Back up the database and its WAL before the first start after upgrading (migrations are additive and automatic; there is no downgrade path other than restoring that backup). Install Bun 1.4.4, set a unique `ADMIN_PASSWORD`, disable demo seeding, enable `COOKIE_SECURE=1`, configure exact allowed origins, terminate HTTPS at a trusted proxy and persist the SQLite data directory. Audio is never stored. Use graceful shutdown and back up the database and WAL together. See `docs/DEPLOYMENT.md` and `docs/OPERATIONS.md` for the full procedure.

### Tag

The acceptance checklist is closed for this branch. No tag and no GitHub release are created from it.
