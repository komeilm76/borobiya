# Design-to-implementation match matrix

Living cross-reference between the canonical references in `design/` and the code on this branch.
Canonical images only: 141 screens and references (154 PNG files minus 13 `design/*/_generator/_preview-*.png` artifacts).

**Status legend**

- `done` — implemented and wired end to end; pixel-level fidelity against the PNG is unverified (visual acceptance is a deferred human review, see `docs/ACCEPTANCE.md`).
- `partial` — implemented but materially different from, or incomplete against, the design.
- `missing` — no implementation exists.
- `superseded` — out of contract by a documented product decision (`docs/ACCEPTANCE.md`, "Legacy feature scope reconciliation").
- `reference` — design guidance or a spec sheet, not a screen to build.

**Phases** refer to the execution plan in the phase-0 report (`P1` critical wiring, `P2` app experience, `P3` admin console, `P4` test validation, `P5` visual acceptance). Priority: `C` critical, `H` high, `M` medium, `L` low.

## Authentication (`design/auth/`, 16)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| 01-login.png | partial | P2/M | Functional (Vuetify card, typed server errors, role redirect). Missing designed top bar, back-to-home, heading/icon lockup, floating labels, social/quick sign-in variants; demo-account panel is a code-only extra. |
| 02-login-empty.png | missing | P2/L | No dedicated empty-state composition; form renders plainly. |
| 03-register.png | partial | P2/M | Five catalog-backed security questions implemented and re-validated server-side; simpler styling than the design (strength hints, show-password row, numbered question cards with dropdowns exist in code but differ visually). |
| 04-register-error.png | partial | P2/L | Inline `VAlert` covers the error; no designed inline-field error presentation. |
| 05-recovery-account.png | partial | P2/M | Three-step recovery (account, questions, password) exists client+server; simpler visual treatment. |
| 06-recovery-account-error.png | deviation | P2/M | Design shows "enter a valid username" for unknown accounts, which enables user enumeration. Implementation intentionally answers with decoy challenges; see DEV-01. No code change planned. |
| 07-recovery-questions.png | partial | P2/L | Implemented with attempt limits and expiry; simplified UI. |
| 08-recovery-questions-error.png | partial | P2/L | Limit-exceeded path exists server-side; no dedicated designed error card. |
| 09-recovery-password.png | partial | P2/L | Implemented; simplified UI. |
| 10-recovery-done.png | partial | P2/L | Completion screen is minimal vs design. |
| 11-onboarding.png | partial | P2/L | Security-question onboarding implemented (`auth/09…`, `/_auth/onboarding`); simplified UI. |
| 12-onboarding-loading.png | missing | P2/L | No dedicated loading state. |
| 13-anatomy.png | reference | — | Layout anatomy sheet for the auth family. |
| 14-states.png | reference | — | Auth states overview sheet. |
| 15-dark.png | partial | P2/L | Dark theme exists via system preference + cycle; auth surface not verified against the dark reference. |
| 16-responsive.png | partial | P2/L | ≤900px collapses to single column (brand panel hidden); not yet verified against the reference. |

## Icons (`design/icons/`, 8)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| 01-overview.png | done | P5/M | Client renders the generated glyph subset produced from `design/icons/icons.json`; `tests/assets.test.ts` fails the build on a missing glyph. Visual sizing/placement parity deferred to P5. |
| 02-actions.png | done | P5/M | Client renders the generated glyph subset produced from `design/icons/icons.json`; `tests/assets.test.ts` fails the build on a missing glyph. Visual sizing/placement parity deferred to P5. |
| 03-actions-fields.png | done | P5/M | Client renders the generated glyph subset produced from `design/icons/icons.json`; `tests/assets.test.ts` fails the build on a missing glyph. Visual sizing/placement parity deferred to P5. |
| 04-fields-navigation-status.png | done | P5/M | Client renders the generated glyph subset produced from `design/icons/icons.json`; `tests/assets.test.ts` fails the build on a missing glyph. Visual sizing/placement parity deferred to P5. |
| 05-cards.png | done | P5/M | Client renders the generated glyph subset produced from `design/icons/icons.json`; `tests/assets.test.ts` fails the build on a missing glyph. Visual sizing/placement parity deferred to P5. |
| 06-cards-map.png | done | P5/M | Client renders the generated glyph subset produced from `design/icons/icons.json`; `tests/assets.test.ts` fails the build on a missing glyph. Visual sizing/placement parity deferred to P5. |
| 07-media-account.png | done | P5/M | Client renders the generated glyph subset produced from `design/icons/icons.json`; `tests/assets.test.ts` fails the build on a missing glyph. Visual sizing/placement parity deferred to P5. |
| 08-account.png | done | P5/M | Client renders the generated glyph subset produced from `design/icons/icons.json`; `tests/assets.test.ts` fails the build on a missing glyph. Visual sizing/placement parity deferred to P5. |

## Mobile map — design system and guides (7)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| design-system/colors.png | done | P5/M | Tokens implemented in `src/client/app.css` (`#0E6666` primary family). |
| design-system/typography.png | done | P5/M | Self-hosted Vazirmatn, Persian digits helpers in shared geo utils. |
| design-system/controls.png | done | P5/M | Buttons, chips, pills, round controls in shared CSS. |
| design-system/bottom-sheet.png | partial | P2/M | Detents (`closed`/`half`/`open`) wired via `map.detent`; 28/52/76 percentages not validated against the sheet rendering. |
| design-system/sos-parts.png | reference | — | SOS component anatomy. |
| design-system/mission-state.png | reference | — | Mission state rail anatomy. |
| guides/00-sos-flow.png | reference | — | Whole-flow guide; its flow is only partially implemented (see sos/* rows). |

## Mobile map — navigation (20)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| navigation/01-map-idle.png | partial | P2/H | Implemented simplified. Missing: layers button, compass, scale bar, selected-destination sheet (save to saved-places / share my location / navigate-here actions). Long-press tooltip missing (design 01 shows it). Search works since P1 (offline: saved places + config POIs). |
| navigation/02-map-press-hold.png | partial | P2/H | Hold gesture works (0.8s, progress bar); SOS dock now bottom-left per approved decision 5 (DEV-04 resolved); quick chips are saved places, not the fixed last-destination / work / home presets; scale bar missing. |
| navigation/03-bookmark-form.png | partial | P2/M | Save-the-pin form implemented inline in the destination sheet (name, label, address, icon); the dedicated designed bookmark screen is not built. |
| navigation/04-bookmark-saved.png | partial | P2/M | Profile screen lists saved places with inline edit (full PATCH payload incl. preserved rank) and delete; reorder UI remains API-only. |
| navigation/05-search-open.png | done | P1/H | Real offline search: saved places + road POIs from the map configuration (projection-converted), Persian/Arabic-insensitive normalization, keyboard navigation (combobox semantics), loading/empty/error+retry states, result selection moves and zooms the map with a dedicated pin. |
| navigation/06-destination-selected.png | partial | P2/H | Tapping the canvas selects a destination (pin + sheet panel: coordinates, distance from own fix, save-to-places inline form, clear). Designed name/address header, ETA and traffic chips, and the send/navigate actions need routing and share-to-companion plumbing — not built. |
| navigation/07-destination-details.png | partial | P2/M | The destination panel doubles as the detail surface (coords, distance, save/clear); share-my-location-to-this-point and saved-place detail editing screens not built. |
| navigation/08-trip-transport-selection.png | superseded | — | Turn-by-turn trip planning superseded (docs/ACCEPTANCE.md). |
| navigation/09-manual-origin-selection.png | superseded | — | See above. |
| navigation/10-route-options.png | superseded | — | See above. |
| navigation/11-route-selected.png | superseded | — | See above. |
| navigation/12-navigation-active.png | superseded | — | See above. |
| navigation/13-navigation-alternatives.png | superseded | — | See above. |
| navigation/14-navigation-full-route.png | superseded | — | See above. |
| navigation/15-navigation-off-route.png | superseded | — | See above. |
| navigation/16-multi-destination.png | superseded | — | See above. |
| navigation/17-destination-reordering.png | superseded | — | See above. (Saved-place reordering API exists; wiring tracked under bookmarks.) |
| navigation/18-sos-confirmation.png | missing | P1/M | SOS review step covers confirmation generally; no designed confirmation sheet from trip context (trip context superseded). |
| navigation/19-trip-cancel.png | superseded | — | Trip superseded; the underlying SOS cancel gap is tracked under sos/13. |
| navigation/20-trip-completed.png | superseded | — | Trip superseded. |

## Mobile map — SOS (20)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| sos/01-sos-entry.png | partial | P2/H | SOS button present; bottom-left dock since P1 (decision 5); style differs from reference pending P5. |
| sos/02-sos-hold-to-open.png | partial | P2/H | 0.8s hold implemented with progress bar; not the designed ring; placement aligned to bottom-left dock (decision 5). |
| sos/03-sos-compose.png | partial | P1/H | Four-section composer implemented (severity, type, description, location, photo, review) with counters and inline validation; visual parity pending P5. |
| sos/04-sos-location-picker.png | partial | P2/H | Step 2 now supports tap-to-place manual incident pin (arm button, crosshair cursor, tap on canvas drops the pin, dashed alarm marker, review shows "manual", recovery button re-adopts GPS fix and clears the flag). `isManual` and a zero accuracy flow to the server and render on the offer/review surfaces. Not designed: drag-to-adjust, reverse-geocoded address of the pin. |
| sos/05-sos-photo.png | done | P1/C | Browser pipeline: validate (jpeg/png/webp, 15 MB ceiling), decode, downscale to ≤1280px, re-encode JPEG along a quality ladder, subject to the server's 160000-char wire cap (~119,981 B effective — the designed 128 KB target is not reachable under that cap). Retryable error state with Persian copy; submit-time size guard; picker resets for re-pick. |
| sos/06-sos-review.png | done | P2/M | Review step submits to the API; disabled state + inline error surface. |
| sos/07-sos-sending.png | missing | P2/M | No sending progress surface (only a disabled button while submitting). |
| sos/08-sos-pending.png | missing | P2/M | No dedicated pending surface; the mission rail approximates it. |
| sos/09-sos-dispatched.png | missing | P2/M | No dedicated dispatched surface. |
| sos/10-sos-rescuer-en-route.png | missing | P2/M | No en-route surface/ETA (ETA needs routing data — superseded area; a status-only surface remains possible). |
| sos/11-sos-rescuer-arrived.png | missing | P2/L | Rail covers it only. |
| sos/12-sos-completed.png | partial | P2/M | Rail + one-time rating implemented; no designed completion card. |
| sos/13-sos-cancel-reason.png | done | P1/C | Mission view offers the requester an inline cancel panel: catalog reason select, required 10+ char detail exactly when the chosen reason demands it (client- and server-enforced), confirmation step, conflict surfaced as error toast, server-authoritative reload afterwards. |
| sos/14-sos-cancelled.png | partial | P2/M | Cancellation flow wired end to end in P1; the dedicated cancelled surface does not exist (rail/status pill + empty state instead). |
| sos/15-sos-photo-retry.png | done | P1/H | Photo step shows a processing state, then either a preview with a remove-photo button or a retryable error with Persian-code-specific copy; re-picking the same file works (input resets). |
| sos/16-sos-offline.png | missing | P2/M | Only a generic offline banner; no SOS-specific offline guidance/queueing stance. |
| sos/17-sos-history.png | partial | P2/M | HistoryView lists SOS requests and responder missions (incident, date, Persian status label); not the designed SOS history screen. |
| sos/18-sos-history-detail.png | missing | P2/M | No per-request detail view. |
| sos/19-sos-validation.png | partial | P2/L | Inline validation exists (10–500 description, Persian messages); designed field-level presentation absent. |
| sos/20-sos-history-empty.png | partial | P2/L | Plain empty text exists in HistoryView. |

## Mobile map — mission (19)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| mission/01-mission-ready-on.png | missing | P2/H | No responder availability UI. `POST /_user/ready` exists and is server-tested; unwired. Design adds radius + team chips. |
| mission/02-mission-ready-off.png | missing | P2/H | Same screen, toggle off. |
| mission/03-mission-offer.png | done | P1/C | Mission screen renders an offer card for dispatched requests the responder may act on (group membership now visible to scoped responders; requester alias exposed): severity, incident icon+label, description, accuracy, manual-pin flag, distance from own fix, requester. Accept goes through the existing endpoint with per-item busy guard, lost-race conflicts surfaced, reload afterwards. **No decline control exists in the backend; deviation documented (not invented).** |
| mission/04-mission-offer-details.png | partial | P1/H | The offer card carries the designed facts inline; a separate details sheet does not exist. |
| mission/05-mission-accepted.png | partial | P1/H | Accept lands with a success toast; the offer clears and the mission card shows the live status after reload; the designed accepted-transition surface is not built. |
| mission/06-mission-dispatch.png | partial | P2/M | Admin dispatch exists; responder-side "dispatched" status only via rail. |
| mission/07-mission-navigation-active.png | superseded | — | Turn-by-turn navigation superseded. |
| mission/08-mission-route-alternatives.png | superseded | — | See above. |
| mission/09-mission-arrived.png | partial | P2/L | Arrive action implemented (arrive/start/complete state machine). |
| mission/10-mission-in-progress.png | partial | P2/L | Start/complete implemented. |
| mission/11-support-request.png | missing | P2/M | No support-request concept anywhere in the server (schema, routes, events). Greenfield; needs product decision before build. |
| mission/12-support-pending.png | missing | P2/M | Depends on the above. |
| mission/13-support-accepted-notification.png | missing | P2/M | Depends on the above. |
| mission/14-team-leader-dashboard.png | missing | P2/M | No TEAM_LEADER role/scope exists (roles: user, responder, admin). Needs product + permission decision. |
| mission/15-mission-cancel.png | done | P1/H | Assigned responder (or admin) gets an inline mission-cancel panel on the mission card: optional note for the requester, confirmation step, `progress('cancel')` through the state machine, conflict surfaced, authoritative reload afterwards. |
| mission/16-mission-report.png | partial | P2/M | Rating accepts an optional report note (≤200 chars) via a textarea on the rating block; stored in `missions.rating_note`, served on the mission projection and embedded mission, shown on the mission card after rating. Designed full report form absent. |
| mission/17-mission-completed.png | partial | P2/M | Completed missions reachable; card shows Persian status label, recorded rating and the saved rating note. No designed completion/report surface. |
| mission/18-mission-no-offer.png | partial | P2/M | Empty-offer state for responders with no offers/mission/request: explanation + refresh button (re-fetches the lists). No radius control (server has no radius concept). |
| mission/19-mission-offline.png | missing | P2/M | Generic offline banner only. |

## Mobile map — history (11)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| history/01-history-trips.png | superseded | — | Trip history presupposes routing (superseded). |
| history/02-history-missions.png | partial | P2/H | SOS requests and missions from `/_user/missions` now both render with Persian status labels; no tab structure yet. |
| history/03-history-missions-agent.png | partial | P2/M | Responder missions render alongside requests with localized status; dedicated agent view absent. |
| history/04-history-companions.png | partial | P2/M | The history screen lists every share the viewer was part of (active/expired/revoked with Persian state labels, counterpart, direction, kind, created date) via `GET /_user/location/shares?include=all`. Designed per-companion address book/playback absent. |
| history/05-history-filter.png | missing | P2/M | No filter UI. |
| history/06-history-details.png | missing | P2/M | No detail view. |
| history/07-history-playback.png | missing | P2/H | Authorized history endpoint exists (`/_user/location/history/:userId`); no playback surface. |
| history/08-history-companion.png | missing | P2/M | No per-companion history. |
| history/09-history-loading.png | missing | P2/L | No skeleton/loading state. |
| history/10-history-empty.png | partial | P2/L | Plain empty text exists. |
| history/11-history-error.png | missing | P2/M | No error state with retry. |

## Mobile map — companions (10)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| companions/01-companions-hub.png | partial | P2/H | Peers (with server-provided usernames over WS) + shares with counterpart, direction and revoke for outgoing shares render; missing online banner, path summary, add/share rows, management entry. |
| companions/02-companion-add.png | missing | P2/H | No add flow. |
| companions/03-companions-live.png | partial | P2/M | Live peer fixes render with sender username from the WS payload (was raw user id); freshness/status treatment absent. |
| companions/04-companion-talk.png | done | P2/M | PTT press-and-hold talk implemented (binary frames, floor control, no recording). |
| companions/05-companion-status.png | missing | P2/M | Freshness rings/status card absent. |
| companions/06-share-location.png | partial | P2/H | New-share panel on the companions screen: username search (`GET /_user/users/search`) with online/role/rating rows, single-select recipient, live kind with 15 min/1/4/24 h durations. Server endpoint tested. Designed dedicated share sheet absent. |
| companions/07-share-history.png | partial | P2/H | Same panel, history kind: from/to `datetime-local` inputs with client-side checks mirroring the server (chronological, not future, at most 30 days). Designed dedicated history-share sheet absent. |
| companions/08-shared-with-me.png | partial | P2/M | `listShares` returns owned + received shares with outgoing/incoming counts and usernames; UI renders one flat list and each row carries direction text (send/receive). Grouping not built. |
| companions/09-companions-empty.png | partial | P2/L | Plain empty texts exist. |
| companions/10-companions-offline.png | missing | P2/L | No offline-specific companion state. |

## Mobile map — profile (9)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| profile/01-profile-home.png | partial | P2/H | Username/role/rating, theme cycle, offline dataset version, security readiness card, devices with revoke, saved-places manage (edit/delete), inline username rename, responder readiness switch (POSTs /_user/ready; consumed by the dispatch board), login history. Missing: member-since, stats cards, account-information rows, logout action, version footer. |
| profile/02-profile-edit.png | partial | P2/H | Inline username rename on the profile screen (PATCH /_user/me, local validation, re-GET). Designed dedicated edit screen absent. |
| profile/03-login-history.png | partial | P2/M | Last-8/last-50 login events (device, IP, success/fail, time) render on the profile screen from `GET /_user/logins`; designed full-screen history page not built. |
| profile/04-active-devices.png | done | P2/L | List + revoke implemented with current-session protection. |
| profile/05-security.png | partial | P2/M | Readiness card only; designed security center (questions, change flows) absent. |
| profile/06-logout-confirm.png | missing | P2/L | Logout is one control elsewhere; no confirmation sheet. |
| profile/07-map-entry.png | partial | P2/L | Role-aware landing works; designed entry composition absent. |
| profile/08-bookmarks.png | missing | P2/H | Saved-places UI absent (server CRUD + store exist, unused). |
| profile/09-bookmark-edit.png | missing | P2/M | Part of saved-places UI. |

## Administrator console — dashboard (3)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| admin-panel/dashboard/01-overview.png | partial | P3/H | KPIs + 7-day trend sparkline + recent requests render. Missing: deltas, delta icons, live operations map with markers, readiness/group availability panel, alerts panel, export/refresh controls, designed grouped sidebar and user footer card. |
| admin-panel/dashboard/02-dispatch-board.png | partial | P1/H | Done in P1: per-request explicit panel — nearest responders with name/rating/distance/readiness (`GET /_admin/sos/:id/nearest`, now called client-side, loading/empty/error+retry states), picker restricted to active staffed groups, selection restricted to the chosen group's members, dispatch only after explicit group + member choice, panel survives server refusals. Still missing vs design: 3-column board, incident detail panel, map, cancel. |
| admin-panel/dashboard/03-reports.png | missing | P3/H | No KPI deltas, no period selector, no donut, no 30-day trend, no incidents-by-type, no group-performance table; only status distribution list + two CSV links. |

## Administrator console — design system (3)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| admin-panel/design-system/01-foundations.png | done | P5/M | Tokens + shell geometry (264px sidebar, 68px top bar, padded content) implemented. |
| admin-panel/design-system/02-controls.png | done | P5/M | Tables, pills, action buttons, selects. |
| admin-panel/design-system/03-patterns.png | partial | P3/L | Empty/error/loading patterns partially applied per view. |

## Administrator console — states (5)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| admin-panel/states/01-loading.png | missing | P3/M | No skeletons anywhere in the console. |
| admin-panel/states/02-empty.png | partial | P3/L | Plain empty texts per view. |
| admin-panel/states/03-error.png | partial | P3/M | Inline error only on overview; no retry pattern elsewhere. |
| admin-panel/states/04-offline.png | missing | P3/M | No cached-data offline banner + retry; only the tiny realtime status pill. |
| admin-panel/states/05-forbidden.png | partial | P3/L | Router guard redirects non-admins; no designed 403 surface. |

## Administrator console — services/groups (4)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| admin-panel/services/01-groups.png | partial | P3/H | List + create (client-side rule hints) works; no edit. |
| admin-panel/services/02-group-edit.png | missing | P3/H | No edit UI (name/color/capacity/status/coverage). |
| admin-panel/services/03-members.png | missing | P3/H | No member add/remove UI (`memberIds` used by dispatch but unmanageable in UI). |
| admin-panel/services/04-incident-types.png | partial | P3/M | Read-only list; no create/edit. |

## Administrator console — system (3)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| admin-panel/system/01-audit-log.png | partial | P3/M | Table + filter + CSV (formula-escaped, no-store) works; no detail drawer/severity. |
| admin-panel/system/02-alerts.png | partial | P3/M | List + resolve + severity tones; no designed detail/ack patterns. |
| admin-panel/system/03-settings.png | partial | P3/L | Boolean settings toggles; designed grouping/explanation copy absent. |

## Administrator console — users (3)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| admin-panel/users/01-list.png | partial | P3/H | Search/role filter/toggle/create implemented; missing avatars, phone, last-seen, detail links, designed empty state. |
| admin-panel/users/02-account.png | missing | P3/M | No account detail/edit panel. |
| admin-panel/users/03-roles.png | missing | P3/M | No roles/permissions view. |

## Excluded artifacts

`design/*/_generator/_preview-*.png` (13 files) are generator previews, not canonical acceptance references.

## Documented intentional deviations

- **DEV-01 — Recovery account error (auth/06).** The reference shows an explicit "unknown username" error, which is a user-enumeration oracle. Implementation answers unknown usernames with decoy challenges (enumeration-safe), consistent with `docs/SECURITY.md` and the decoy-resistant recovery design. The design image is retained as reference; implementation deliberately diverges.
- **DEV-02 — Turn-by-turn navigation family (navigation/08-20, mission/07-08, history/01, profile/01 stats, history "trips").** The 2.0.0 product is the simplified SOS-to-mission workflow; no routing engine. Documented in `docs/ACCEPTANCE.md` ("Legacy feature scope reconciliation") and `docs/LEGACY_REVIEW.md`. The pill still labeled "routing" in the UI opens the plain map — the pill now reads "Map" (its screen is the offline map with the SOS composer, nothing more) and its behavior is exactly what it says (P1 rename, decision 3).
- **DEV-03 — Photo without compression (sos/05).** RESOLVED in P1 — the composer validates, downscales and re-encodes client-side under the server's wire cap. Kept for the record.
- **DEV-04 — SOS dock placement.** RESOLVED in P1 — the dock now hugs the physical left edge (decision 5), above the search bar, clear of the home indicator.
- **DEV-05 — Profile metrics.** The reference shows trip counts/kilometers; the product has no trips. P2 must replace them with SOS/mission/sharing counts (see design-flaw register).

## Summary tally (canonical 141)

Counts over the 141 canonical rows above: `done` 16, `partial` 47, `missing` 57, `superseded` 15, `reference` 5, intentional `deviation` 1.

## Design flaws found in the reference material (to fix or consciously keep)

| ID | Reference | Flaw | Recommendation |
|---|---|---|---|
| DF-01 | auth/06-recovery-account-error.png | Explicit unknown-username error = user enumeration oracle. | Keep implementation (decoys); do not port the screen. |
| DF-02 | mission/03-mission-offer.png | A 52-second countdown and "3 offers active" imply a server-enforced offer TTL; the data model has no offer-expiry and no offers endpoint. | Drop the countdown, or add offer TTL to the backend as a product decision. Do not fake it client-side. |
| DF-03 | profile/01-profile-home.png, history/01-history-trips.png | Trip statistics (trips, kilometres) presuppose the superseded routing product. | Replace with SOS/mission/companion metrics in P2; document the swap. |
| DF-04 | history/07-history-playback.png | Playback UI does not communicate authorization scope/expiry although the API is share-gated. | Add an authorization note; never show playback without an active authorized share. |
| DF-05 | sos/04-sos-location-picker.png | Dropping an incident pin far from GPS is a fraud/abuse vector with no responder-facing "manual location" marker. | Surface `isManual` (already recorded server-side) on the offer/dispatch screens. |
| DF-06 | navigation/* (all) | The navigation family contradicts the offline/deterministic-tile architecture and the documented product scope; keeping it as silent reference invites accidental scope creep. | Keep files as visual identity reference; exclude from acceptance scope; revisit only via explicit product decision. |
| DF-07 | design/icons vs client | Client consumes generated subset; canonical set allows aliases. Verify in P5 that no ad-hoc icon appears outside the inventory. | Guard via existing asset test; extend if needed. |
| DF-08 | map-page/navigation/02 | The 350-metre scale bar appears only in the press-hold reference, not in idle. | Treat the scale bar as a permanent map affordance if confirmed with the design owner; otherwise drop. |
