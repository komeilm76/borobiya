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
| 01-login.png | partial | P2/M | Functional (Vuetify card, typed server errors, role redirect). Missing designed top bar, back-to-home, heading/icon lockup, floating labels, social/quick sign-in variants; demo-account panel is a code-only extra. Capture: `screens/auth-01-login-impl.png`. |
| 02-login-empty.png | partial | P2/L | The empty-state contract ships on the login screen (submit disabled with an explicit note until both fields carry a value); the designed empty-state composition is not built. See Stage H review log. Moved `missing` → `partial` on code evidence 2026-11-16 — the implementation ships; the designed empty-state composition is not built. `done` requires human visual acceptance (P5). Capture: `screens/auth-02-login-empty-impl.png`. |
| 03-register.png | partial | P2/M | Five catalog-backed security questions implemented and re-validated server-side; simpler styling than the design (strength hints, show-password row, numbered question cards with dropdowns exist in code but differ visually). Capture: `screens/auth-03-register-impl.png`. |
| 04-register-error.png | partial | P2/L | Inline `VAlert` covers the error; no designed inline-field error presentation. Capture: `screens/auth-04-register-error-impl.png`. |
| 05-recovery-account.png | partial | P2/M | Three-step recovery (account, questions, password) exists client+server; simpler visual treatment. Capture: `screens/auth-05-recovery-account-impl.png`. |
| 06-recovery-account-error.png | deviation | P2/M | Design shows "enter a valid username" for unknown accounts, which enables user enumeration. Implementation intentionally answers with decoy challenges; see DEV-01. No code change planned. Capture (shows the intentional deviation): `screens/auth-06-recovery-account-error-impl.png`. |
| 07-recovery-questions.png | partial | P2/L | Implemented with attempt limits and expiry; simplified UI. Capture: `screens/auth-07-recovery-questions-impl.png`. |
| 08-recovery-questions-error.png | partial | P2/L | Limit-exceeded path exists server-side; no dedicated designed error card. |
| 09-recovery-password.png | partial | P2/L | Implemented; simplified UI. Capture: `screens/auth-09-recovery-password-impl.png`. |
| 10-recovery-done.png | partial | P2/L | Completion screen is minimal vs design. Capture: `screens/auth-10-recovery-done-impl.png`. |
| 11-onboarding.png | partial | P2/L | Security-question onboarding implemented (`auth/09…`, `/_auth/onboarding`); simplified UI. Capture: `screens/auth-11-onboarding-impl.png`. |
| 12-onboarding-loading.png | partial | P2/L | The forced onboarding screen now shows its loading composition (informational banner, five skeleton rows, disabled CTA) and an inline error with retry on catalog failure. See Stage H review log. Moved `missing` → `partial` on code evidence 2026-11-16 — the implementation ships; pixel fidelity is unverified. `done` requires human visual acceptance (P5). |
| 13-anatomy.png | reference | — | Layout anatomy sheet for the auth family. |
| 14-states.png | reference | — | Auth states overview sheet. |
| 15-dark.png | partial | P2/L | Dark theme exists via system preference + cycle; auth surface not verified against the dark reference. Capture: `screens/auth-15-dark-impl.png`. |
| 16-responsive.png | partial | P2/L | ≤900px collapses to single column (brand panel hidden); not yet verified against the reference. Capture: `screens/auth-16-responsive-impl.png`. |

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
| navigation/01-map-idle.png | partial | P2/H | Implemented simplified. Missing: layers button, compass, scale bar, selected-destination sheet (save to saved-places / share my location / navigate-here actions). Long-press tooltip missing (design 01 shows it). Search works since P1 (offline: saved places + config POIs).  Capture: `screens/navigation-01-map-idle-impl.png`. Dark-theme aid (not acceptance evidence): `screens/dark-map-idle-impl.png`. |
| navigation/02-map-press-hold.png | partial | P2/H | The reference shows a press-and-hold point picker; the product implements tap-to-select (no long-press gesture, no callout). Captured 2026-11-16 via `docs/VISUAL_ACCEPTANCE.md` (`screens/navigation-02-map-press-hold-impl.png`, tap on the canvas; destination panel renders with coordinates). SOS dock now bottom-left per approved decision 5 (DEV-04 resolved); quick chips moved above the sheet as a detent-aware sibling; quick chips are saved places, not the fixed last-destination / work / home presets; scale bar missing. |
| navigation/03-bookmark-form.png | partial | P2/M | Save-the-pin form implemented inline in the destination sheet (name, label, address, icon); the dedicated designed bookmark screen is not built.  Capture: `screens/navigation-03-bookmark-form-impl.png`. |
| navigation/04-bookmark-saved.png | partial | P2/M | Profile screen lists saved places with inline edit (full PATCH payload incl. preserved rank) and delete; reorder UI remains API-only. |
| navigation/05-search-open.png | done | P1/H | Real offline search: saved places + road POIs from the map configuration (projection-converted), Persian/Arabic-insensitive normalization, keyboard navigation (combobox semantics), loading/empty/error+retry states, result selection moves and zooms the map with a dedicated pin.  Capture: `screens/navigation-05-search-open-impl.png`. |
| navigation/06-destination-selected.png | partial | P2/H | Tapping the canvas selects a destination (pin + sheet panel: coordinates, distance from own fix, save-to-places inline form, clear). Designed name/address header, ETA and traffic chips, and the send/navigate actions need routing and share plumbing — not built.  Capture: `screens/navigation-06-destination-selected-impl.png`. |
| navigation/07-destination-details.png | partial | P2/M | The destination panel doubles as the detail surface (coords, distance, save/clear); share-my-location-to-this-point and saved-place detail editing screens not built. Capture for the panel: `screens/navigation-02-map-press-hold-impl.png` and `screens/navigation-06-destination-selected-impl.png` (2026-11-16). |
| navigation/08-trip-transport-selection.png | superseded | — | Turn-by-turn trip planning superseded (docs/ACCEPTANCE.md). |
| navigation/09-manual-origin-selection.png | superseded | — | See above. |
| navigation/10-route-options.png | superseded | — | See above. |
| navigation/11-route-selected.png | superseded | — | See above. |
| navigation/12-navigation-active.png | superseded | — | See above. |
| navigation/13-navigation-alternatives.png | superseded | — | See above. |
| navigation/14-navigation-full-route.png | superseded | — | See above. |
| navigation/15-navigation-off-route.png | superseded | — | See above. |
| navigation/16-multi-destination.png | partial | P2/M | Stage 5 implements the ordered multi-destination trip as the Trips screen (top-pill trips tab, `/_user/trips`): create with ranked stops (label + coordinates, saved-place and map-center insertion), save/unsave, start/complete/cancel, explicit-leader group rides with invitation acceptance. Not built: route computation, per-stop ETAs/distances, traffic chips, quick-add-from-map, fastest-order suggestion, trip polyline.  Capture: `screens/navigation-16-multi-destination-impl.png`. |
| navigation/17-destination-reordering.png | partial | P2/M | Leader-only up/down rank reordering with wholesale stop-list `PATCH` now ships on the Trips screen (Stage 5). The design's drag handles, auto-optimize and distance/ETA recomputation were not ported (no routing engine). See Stage H review log. Moved `missing` → `partial` on code evidence 2026-11-16 — the implementation ships; the designed drag handles / auto-optimize / ETA are not built. `done` requires human visual acceptance (P5).  Capture: `screens/navigation-17-destination-reordering-impl.png`. |
| navigation/18-sos-confirmation.png | missing | P1/M | SOS review step covers confirmation generally; no designed confirmation sheet from trip context (trip context superseded). |
| navigation/19-trip-cancel.png | superseded | — | Trip superseded; the underlying SOS cancel gap is tracked under sos/13. |

| navigation/20-trip-completed.png | superseded | — | Trip superseded. |


## Mobile map — SOS (20)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| sos/01-sos-entry.png | partial | P2/H | SOS button present; bottom-left dock since P1 (decision 5); style differs from reference pending P5.  Capture: `screens/sos-01-sos-entry-impl.png`. |
| sos/02-sos-hold-to-open.png | partial | P2/H | 0.8s hold implemented with progress pill (a bottom-inset pill bound to inline size; a competing full-width rule was removed in Stage F). Captured mid-hold 2026-11-16 (`screens/sos-02-sos-hold-to-open-impl.png`); not the designed ring; placement aligned to bottom-left dock (decision 5). |
| sos/03-sos-compose.png | partial | P1/H | Four-section composer implemented (severity, type, description, location, photo, review) with counters and inline validation; visual parity pending P5.  Capture: `screens/sos-03-sos-compose-impl.png`. Dark-theme aid (not acceptance evidence): `screens/dark-sos-compose-impl.png`. |
| sos/04-sos-location-picker.png | partial | P2/H | Step 2 now supports tap-to-place manual incident pin (arm button, crosshair cursor, tap on canvas drops the pin, dashed alarm marker, review shows "manual", recovery button re-adopts GPS fix and clears the flag). `isManual` and a zero accuracy flow to the server and render on the offer/review surfaces. Not designed: drag-to-adjust, reverse-geocoded address of the pin.  Capture: `screens/sos-04-sos-location-picker-impl.png`. |
| sos/05-sos-photo.png | done | P1/C | Browser pipeline: validate (jpeg/png/webp, 15 MB ceiling), decode, downscale to ≤1280px, re-encode JPEG along a quality ladder, subject to the server's 160000-char wire cap (~119,981 B effective — the designed 128 KB target is not reachable under that cap). Retryable error state with Persian copy; submit-time size guard; picker resets for re-pick.  Capture: `screens/sos-05-sos-photo-impl.png`. |
| sos/06-sos-review.png | done | P2/M | Review step submits to the API; disabled state + inline error surface.  Capture: `screens/sos-06-sos-review-impl.png`. |
| sos/07-sos-sending.png | partial | P2/M | A full-screen sending dialog renders while the SOS is mid-submit (ring, staged request steps, photo/note lines only when staged, informational note, no fake progress); rows are centered and carry no per-row done timestamps and the dim covers the sheet, not the whole map. Captured 2026-11-16 via `docs/VISUAL_ACCEPTANCE.md` (`screens/sos-07-sos-sending-impl.png`); the demo answers `POST /_user/sos` after an artificial delay so the transient state is screenshottable. |
| sos/08-sos-pending.png | missing | P2/M | No dedicated pending surface; the mission rail approximates it.  Closest shipped surface captured (the designed screen does not exist): `screens/sos-08-sos-pending-impl.png`. |
| sos/09-sos-dispatched.png | missing | P2/M | No dedicated dispatched surface. |
| sos/10-sos-rescuer-en-route.png | missing | P2/M | No en-route surface/ETA (ETA needs routing data — superseded area; a status-only surface remains possible). |
| sos/11-sos-rescuer-arrived.png | missing | P2/L | Rail covers it only. |
| sos/12-sos-completed.png | partial | P2/M | Rail + one-time rating implemented; no designed completion card. Adjacent evidence: `screens/mission-17-mission-completed-impl.png` (2026-11-16). |
| sos/13-sos-cancel-reason.png | partial | P1/C | Mission view offers the requester an inline cancel panel below the rail: catalog reason select, required 10+ char detail exactly when the chosen reason demands it (client- and server-enforced), confirmation step, conflict surfaced as error toast, server-authoritative reload afterwards. Materially different from the reference (inline panel, four server-catalog reasons, no 200-character counter). Captured 2026-11-16 via `docs/VISUAL_ACCEPTANCE.md` (`screens/sos-13-sos-cancel-reason-impl.png`, requester-only rail via `?missions=empty&offers=empty`). |
| sos/14-sos-cancelled.png | partial | P2/M | Cancellation flow wired end to end in P1; the dedicated cancelled surface does not exist (rail/status pill + empty state instead).  Capture: `screens/history-14-sos-cancelled-impl.png`. |
| sos/15-sos-photo-retry.png | partial | P1/H | The photo rides `POST /_user/sos`; there is no post-submit photo-upload step and therefore no designed retry surface. The retryable error exists inline in composer step 3 (size, type), the preview resets for re-pick and a submit-time size guard rejects oversized sources; the designed full-screen surface does not exist. Captured 2026-11-16 via `docs/VISUAL_ACCEPTANCE.md` (`screens/sos-15-sos-photo-retry-impl.png`). |
| sos/16-sos-offline.png | partial | P2/M | The SOS composer now carries its offline stance: an explicit no-SOS-reaches-the-center card (no offline queue exists, last catalog sync shown where known) and a disabled, relabelled send button on review while the link is down. See Stage H review log. Moved `missing` → `partial` on code evidence 2026-11-16 — the implementation ships; pixel fidelity is unverified. `done` requires human visual acceptance (P5).  Capture: `screens/sos-16-sos-offline-impl.png`. |
| sos/17-sos-history.png | partial | P2/M | HistoryView lists SOS requests and responder missions (incident, day-grouped date, tracked-code, Persian status label); not the designed SOS history screen.  Capture: `screens/history-17-sos-history-impl.png`. |
| sos/18-sos-history-detail.png | partial | P2/M | Expandable per-request detail in HistoryView: description, tracking code, manual-fix flag, severity, and the server-held status timeline from `GET /_user/sos/:id`; not the designed full-screen detail.  Capture: `screens/history-18-sos-history-detail-impl.png`. |
| sos/19-sos-validation.png | partial | P2/L | Inline validation exists (10–500 description, Persian messages); designed field-level presentation absent.  Capture: `screens/sos-19-sos-validation-impl.png`. |
| sos/20-sos-history-empty.png | partial | P2/L | Plain empty text in HistoryView (missions and trips tabs). Capture: `screens/history-10-history-empty-impl.png` (2026-11-16, requests sub-tab). |

## Mobile map — mission (19)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| mission/01-mission-ready-on.png | partial | P2/H | Stage C review found the toggle wired: the profile screen carries the responder readiness switch (POSTs /_user/ready; consumed by dispatch/offer eligibility). The designed dedicated screen — ready hero, radius control, team chips — is absent; the server has no radius concept.  Capture: `screens/mission-01-mission-ready-on-impl.png`. |
| mission/02-mission-ready-off.png | partial | P2/H | Same readiness switch on the profile screen in its off state (POSTs /_user/ready { ready: false }); the designed off-state treatment is absent.  Capture: `screens/mission-02-mission-ready-off-impl.png`. |
| mission/03-mission-offer.png | done | P1/C | Mission screen renders an offer card for dispatched requests the responder may act on (offers are addressed per named responder; responder alias exposed): severity, incident icon+label, description, accuracy, manual-pin flag, distance from own fix, requester. Accept goes through the endpoint with per-item busy guard, lost-race conflicts surfaced, reload afterwards; a decline control calls `POST /_user/sos/:id/decline` and the offer disappears from the list.  Capture: `screens/mission-03-mission-offer-impl.png`. |
| mission/04-mission-offer-details.png | partial | P1/H | The offer card carries the designed facts inline; a separate details sheet does not exist. |
| mission/05-mission-accepted.png | partial | P1/H | Accept lands with a success toast; the offer clears and the mission card shows the live status after reload; the designed accepted-transition surface is not built.  Capture: `screens/mission-05-mission-accepted-impl.png`. |
| mission/06-mission-dispatch.png | partial | P2/M | Admin dispatch exists; responder-side "dispatched" status only via rail.  Capture: `screens/mission-06-mission-dispatch-impl.png`. |
| mission/07-mission-navigation-active.png | superseded | — | Turn-by-turn navigation superseded. |
| mission/08-mission-route-alternatives.png | superseded | — | See above. |
| mission/09-mission-arrived.png | partial | P2/L | Arrive action implemented (arrive/start/complete state machine).  Capture: `screens/mission-09-mission-arrived-impl.png`. |
| mission/10-mission-in-progress.png | partial | P2/L | Start/complete implemented.  Capture: `screens/mission-10-mission-in-progress-impl.png`. |
| mission/11-support-request.png | partial | P2/M | Support requests exist end to end (leader composer, pending list, administrator review with full/partial/reject decisions and a staffing picker); the designed sheet presentation is absent.  Capture: `screens/mission-11-support-request-impl.png`. |
| mission/12-support-pending.png | partial | P2/M | Pending requests render in the leader's support panel with a two-step withdrawal; the designed pending surface is absent.  Capture: `screens/mission-12-support-pending-impl.png`. |
| mission/13-support-accepted-notification.png | partial | P2/M | The mission page's support panel renders the review outcome as an explicit notice (approved / partially approved / rejected with the server's reason codes). See Stage H review log. Moved `missing` → `partial` on code evidence 2026-11-16 — the implementation ships; pixel fidelity is unverified. `done` requires human visual acceptance (P5). |
| mission/14-team-leader-dashboard.png | partial | P2/M | Team leadership is a mission-scoped designation (roles unchanged: user, responder, admin); the leader sees the team panel with roster, composition progress and the support-request composer. The designed dashboard is absent.  Capture: `screens/mission-14-team-leader-dashboard-impl.png`. |
| mission/15-mission-cancel.png | done | P1/H | Assigned responder (or admin) gets an inline mission-cancel panel on the mission card: optional note for the requester, confirmation step, `progress('cancel')` through the state machine, conflict surfaced, authoritative reload afterwards.  Capture: `screens/mission-15-mission-cancel-impl.png`. |
| mission/16-mission-report.png | partial | P2/M | Rating accepts an optional report note (≤200 chars) via a textarea on the rating block; stored in `missions.rating_note`, served on the mission projection and embedded mission, shown on the mission card after rating. Designed full report form absent. |
| mission/17-mission-completed.png | partial | P2/M | Completed missions reachable; card shows Persian status label, recorded rating and the saved rating note. No designed completion/report surface.  Capture: `screens/mission-17-mission-completed-impl.png`. |
| mission/18-mission-no-offer.png | done | P2/M | Empty-offer state for responders with no offers/mission/request: explanation + refresh button (re-fetches catalogs, lists and offers). No radius control (server has no radius concept).  Capture: `screens/mission-18-mission-no-offer-impl.png`. |
| mission/19-mission-offline.png | partial | P2/M | The mission page now shows an offline card in place of the offers list (wifi-off glyph, wall-clock of the last successful catalog/list sync where known, retry that re-pulls). See Stage H review log. Moved `missing` → `partial` on code evidence 2026-11-16 — the implementation ships; the design's responder-side treatment was not ported. `done` requires human visual acceptance (P5).  Capture: `screens/mission-19-mission-offline-impl.png`. |

## Mobile map — history (11)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| history/01-history-trips.png | partial | P2/M | Stage 6: finished trips (completed/cancelled) render day-grouped on the trips tab with stop count, role, Persian status and date; expandable stop list and a scope-selected share-window action. Stage D (2026-11-12): recorded GPS distance/duration for consented trips render from the persisted summary (never estimated), and recorded trips show an availability chip; no routing engine, so no vehicle/month summary as designed; the designed playback surface is still absent (see history/07).  Capture: `screens/history-01-history-trips-impl.png`. |
| history/02-history-missions.png | partial | P2/H | Stage 6: dedicated missions tab with 'mine as requester' and 'mine as responder' sub-tabs, day grouping and expandable details; no designed summary chips, search or filter yet.  Capture: `screens/history-02-history-missions-impl.png`. Dark-theme aid (not acceptance evidence): `screens/dark-history-impl.png`. |
| history/03-history-missions-agent.png | partial | P2/M | Stage 6: responder missions live in the 'mine as responder' sub-tab with localized status and the granted rating (star row and numeric rating) and its note; no dedicated agent dashboard view.  Capture: `screens/history-03-history-missions-agent-impl.png`. |
| history/04-history-companions.png | partial | P2/M | The history screen (shares tab) and the Sharing Center list every share the viewer was part of (active/expired/revoked with Persian state labels, counterpart, direction, kind, created date) via `GET /_user/location/shares?include=all`. Designed per-companion address book/playback absent.  Capture: `screens/history-04-history-companions-impl.png`. |
| history/05-history-filter.png | partial | P2/M | Stage E (2026-11-12): date-range (today / 7 days / 30 days / all) and status chips ship on every history tab (share lifecycle chips for shares), with per-tab filtered empty states and reset, plus an honest per-tab summary line (filtered count; recorded-trip count where trackStatus is `available`; rated-mission average). The designed bottom-sheet grouping (vehicle type, companions, "recorded only" / "emergency only" toggles) is deliberately absent: the vehicle/companion dimensions have no backing data in history records today and the two toggles duplicate filters no record distinguishes. The status stays `partial` (designed sheet not pixel-matched) and flips to `done` only after a human accepts the recorded preview — visual acceptance is never automated.  Capture: `screens/history-05-history-filter-impl.png`. |
| history/06-history-details.png | partial | P2/M | Stage 6: inline detail for every history record — trips show the ranked stop list, members and start/end times, plus repeat-as-new-trip and save; requests show the server timeline; missions show rating/note; every record can spawn a scoped history-window share. Stage D (2026-11-12): recorded tracks render an explicit availability state, a schematic path and a per-member distance/duration summary (missions and trips); deviation statistics remain absent and this is not the designed modal.  Capture: `screens/history-06-history-details-impl.png`. |
| history/07-history-playback.png | partial | P2/H | Stage D records consented tracks and ships an authorization-aware replay panel (participants by default; window-covering history-share recipients scope-projected with the grant expiry shown; `available`/`expired`/`none` stated explicitly). The designed map-animated playback surface does not exist moved `missing` → `partial` on code evidence 2026-11-16 — the designed map-animated playback surface does not exist. The row flips to `done` only when a human accepts the recorded preview — visual acceptance is never automated. DF-04 was addressed in the replay panel and is retained in the register for the designed surface.  Capture: `screens/history-07-history-playback-impl.png`. |
| history/08-history-companion.png | missing | P2/M | No per-companion history; would additionally need companion-level aggregation the APIs do not expose today.  Closest shipped surface captured (the designed screen does not exist): `screens/history-08-history-companion-impl.png`. |
| history/09-history-loading.png | partial | P2/L | An inline loading line on detail expansion; no designed skeleton list, no designed pagination indicator. Not capturable as designed (no skeleton exists in the implementation to screenshot). |
| history/10-history-empty.png | partial | P2/L | Plain empty text on every history tab. The designed route illustration, headline CTA and empty-state map card are absent. Capture: `screens/history-10-history-empty-impl.png` (2026-11-16, `?history=empty`, requests sub-tab). |
| history/11-history-error.png | partial | P2/M | Stage 6: per-tab error messages with a working retry button (trips, missions, shares). The designed offline framing (cached-snapshot section, last-saved timestamp) is absent. Capture: `screens/history-11-history-error-impl.png` (2026-11-16, `?fail=history`; the mock's error copy stands in for the server's). |

## Mobile map — sharing (`design/map-page/companions/`, 10)

Product surface renamed in Stage 4: the former companions screen is the **Sharing Center** (`/_user/sharing`, the nav pill and route name follow). The design folder keeps its original name; rows cite `companions/…` paths. A share is an owner-issued grant of the live position or a window of the history trail to a named account; history grants carry an explicit scope selection, live grants may run without expiry, and granting or revoking a share is audit-logged.

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| companions/01-companions-hub.png | partial | P2/H | Sharing Center screen: shares in both directions with a direction filter (all/outgoing/incoming), counterpart usernames, kind (live/history), expiry or indefinite grants, scope echoed on creation, revoke for outgoing shares; live peers render with usernames. Missing: online banner, add/manage entry points, designed grouping.  Capture: `screens/companions-01-companions-hub-impl.png`. Dark-theme aid (not acceptance evidence): `screens/dark-sharing-impl.png`. |
| companions/02-companion-add.png | missing | P2/H | No add flow (username-search invite).  Closest shipped surface captured (the designed screen does not exist): `screens/companions-02-companion-add-impl.png`. |
| companions/03-companions-live.png | partial | P2/M | Live peer fixes render with sender username from the WS payload (was raw user id); freshness/status treatment absent. |
| companions/04-companion-talk.png | done | P2/M | PTT press-and-hold talk implemented (binary frames, floor control, no recording).  Capture: `screens/companions-04-companion-talk-impl.png`. |
| companions/05-companion-status.png | missing | P2/M | Freshness rings/status card absent. |
| companions/06-share-location.png | partial | P2/H | New-share panel on the Sharing Center screen: username search (`GET /_user/users/search`) with online/role/rating rows, single-select recipient, live kind with 15 min/1/4/24 h durations plus an indefinite option (`durationSeconds: 0`, no expiry, revoke any time). Server endpoint tested. Designed dedicated share sheet / multi-recipient / accuracy toggle absent.  Capture: `screens/companions-06-share-location-impl.png`. |
| companions/07-share-history.png | partial | P2/H | Same panel, history kind: from/to `datetime-local` inputs with client-side checks mirroring the server (chronological, not future, at most 30 days); explicit scope selection — route points always included, optional motion (heading/speed) and accuracy details. The server stores the selection (migration v7 `location_shares.scope`), rejects unknown details and projects history points per the granted scope; both parties see the granted scope. Designed dedicated history-share sheet / intensity preview absent.  Capture: `screens/companions-07-share-history-impl.png`. |
| companions/08-shared-with-me.png | partial | P2/M | `listShares` returns owned + received shares with outgoing/incoming counts and usernames; the screen filters by direction (all/outgoing/incoming) and each row carries direction text. Revoked grants drop off the active list but remain visible via `include=all` (state: active/expired/revoked). Grouped live/history tabs not built.  Capture: `screens/companions-08-shared-with-me-impl.png`. |
| companions/09-companions-empty.png | partial | P2/L | Plain empty texts exist. Capture: `screens/companions-09-companions-empty-impl.png` (2026-11-16, `?shares=empty`). |
| companions/10-companions-offline.png | missing | P2/L | No offline-specific sharing state.  Closest shipped surface captured (the designed screen does not exist): `screens/companions-10-companions-offline-impl.png`. |

## Mobile map — profile (9)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| profile/01-profile-home.png | partial | P2/H | Username/role/rating, theme cycle, offline dataset version, security readiness card, devices with revoke, saved-places manage (edit/delete), inline username rename, responder readiness switch (POSTs /_user/ready; consumed by the dispatch board), login history. Missing: member-since, stats cards, account-information rows, logout action, version footer.  Capture: `screens/profile-01-profile-home-impl.png`. |
| profile/02-profile-edit.png | partial | P2/H | Inline username rename on the profile screen (PATCH /_user/me, local validation, re-GET). Designed dedicated edit screen absent.  Capture: `screens/profile-02-profile-edit-impl.png`. |
| profile/03-login-history.png | partial | P2/M | Last-8/last-50 login events (device, IP, success/fail, time) render on the profile screen from `GET /_user/logins`; designed full-screen history page not built.  Capture: `screens/profile-03-login-history-impl.png`. |
| profile/04-active-devices.png | done | P2/L | List + revoke implemented with current-session protection.  Capture: `screens/profile-04-active-devices-impl.png`. |
| profile/05-security.png | partial | P2/M | Readiness card only; designed security center (questions, change flows) absent.  Capture: `screens/profile-05-security-impl.png`. |
| profile/06-logout-confirm.png | partial | P2/L | A confirmation dialog replaced the one-tap logout on the profile flow (title, account-safety body, current-device rows where known, danger accept, scrim/Escape). Moved `missing` → `partial` on code evidence 2026-11-16 — the implementation ships; pixel fidelity is unverified. `done` requires human visual acceptance (P5).  Capture: `screens/profile-06-logout-confirm-impl.png`. |
| profile/07-map-entry.png | partial | P2/L | Role-aware landing works; designed entry composition absent. The map-entry surface is the profile sheet (`screens/profile-01-profile-home-impl.png`). |
| profile/08-bookmarks.png | partial | P2/H | Stage C review found the saved-places UI shipped: the profile screen lists saved places with per-place inline edit (name, label, address, icon) and delete; server CRUD + store are used. The designed dedicated bookmarks screen (search, reorder, groups) is absent; reorder remains API-only.  Capture: `screens/profile-08-bookmarks-impl.png`. |
| profile/09-bookmark-edit.png | partial | P2/M | Inline edit panel per saved place on the profile screen (name, label, address, icon; full PATCH with preserved rank). The designed dedicated edit screen is absent.  Capture: `screens/profile-09-bookmark-edit-impl.png`. |

## Administrator console — dashboard (3)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| admin-panel/dashboard/01-overview.png | partial | P3/H | KPIs + 7-day trend sparkline + recent requests render. Missing: deltas, delta icons, live operations map with markers, readiness/group availability panel, alerts panel, export/refresh controls, designed grouped sidebar and user footer card.  Capture: `screens/admin-01-overview-impl.png`. Dark-theme aid (not acceptance evidence): `screens/dark-admin-overview-impl.png`. |
| admin-panel/dashboard/02-dispatch-board.png | partial | P1/H | Done in P1: per-request explicit panel — nearest responders with name/rating/distance/readiness (`GET /_admin/sos/:id/nearest`, now called client-side, loading/empty/error+retry states), picker restricted to active staffed groups, selection restricted to the chosen group's members, dispatch only after explicit group + member choice, panel survives server refusals. Still missing vs design: 3-column board, incident detail panel, map, cancel.  Capture: `screens/admin-02-dispatch-board-impl.png`. |
| admin-panel/dashboard/03-reports.png | partial | P3/H | KPI cards with deltas, period chips, an SVG trend, a group-share donut, incidents-by-type bars and a group-performance table now ship backed by `GET /_admin/reports?days=7|30|90` computed from the database; deltas are `null` on empty previous windows. See Stage H review log. Moved `missing` → `partial` on code evidence 2026-11-16 — the implementation ships; the reference's per-KPI deltas and layout are only partially matched. `done` requires human visual acceptance (P5). Capture: `screens/admin-03-reports-impl.png`. |

## Administrator console — design system (3)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| admin-panel/design-system/01-foundations.png | done | P5/M | Tokens + shell geometry (264px sidebar, 68px top bar, padded content) implemented. |
| admin-panel/design-system/02-controls.png | done | P5/M | Tables, pills, action buttons, selects. |
| admin-panel/design-system/03-patterns.png | partial | P3/L | Empty/error/loading patterns partially applied per view. |

## Administrator console — states (5)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| admin-panel/states/01-loading.png | partial | P3/M | Console-wide first-load skeletons now ship (users, overview, reports, alerts, groups, audit, dispatch, job types, incident types, support requests, settings and the system-health panel); the skeleton geometry is a generic row batch, not screen-specific layouts. See Stage H review log. Moved `missing` → `partial` on code evidence 2026-11-16 — the implementation ships; the skeleton geometry is a generic row batch, not the designed compositions. `done` requires human visual acceptance (P5). |
| admin-panel/states/02-empty.png | partial | P3/L | The users console renders the designed filter-empty composition (mark, hint, clear-filters action) when a search/role filter matches nothing, and a distinct honest generic case when the roster is empty; reports panels keep honest per-section copy (with skeletons); other screens still render plain empty texts. Capture: `screens/states-02-empty-impl.png`. `done` requires human visual acceptance (P5). |
| admin-panel/states/03-error.png | partial | P3/M | A shared inline error panel with retry ships on the overview, users, groups, alerts, audit, incident types, job types, dispatch, settings and reports (Stage H); the designed offline framing (stale snapshot with last-saved timestamp) is absent. Capture: `screens/admin-states-03-error-impl.png` (2026-11-16, `?fail=admin`, users screen; mock copy stands in for the server's). |
| admin-panel/states/04-offline.png | partial | P3/M | The admin shell now shows a dark offline banner (wifi-off glyph, last clean `loadAll` wall-clock where known, retry that re-pulls every admin projection). Per-panel staleness was not invented (no per-panel freshness model). See Stage H review log. Moved `missing` → `partial` on code evidence 2026-11-16 — the implementation ships; per-panel staleness is not modelled. `done` requires human visual acceptance (P5).  Capture: `screens/states-04-offline-impl.png`. |
| admin-panel/states/05-forbidden.png | partial | P3/L | A designed 403 surface ships and replaces the silent redirect (Stage G/H): lock-shield mark, the honest rule (administrator-role accounts only), a back CTA and a code/role footer; the reference's manager-scope framing was not ported (no such permission exists). Capture: `screens/states-05-forbidden-impl.png`. `done` requires human visual acceptance (P5). |

## Administrator console — services/groups (4)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| admin-panel/services/01-groups.png | partial | P3/H | List + create (client-side rule hints) works; an inline per-group edit panel now ships (name/color/capacity/status/coverage chips) backed by `PATCH /_admin/groups/:id`. See Stage H review log. Status stays `partial`.  Capture: `screens/services-01-groups-impl.png`. |
| admin-panel/services/02-group-edit.png | partial | P3/H | Inline per-group edit panel ships (name/color/capacity/status/coverage chips) backed by `PATCH /_admin/groups/:id` with client-side pre-validation. See Stage H review log. Moved `missing` → `partial` on code evidence 2026-11-16 — the implementation ships; pixel fidelity is unverified. `done` requires human visual acceptance (P5).  Capture: `screens/services-02-group-edit-impl.png`. |
| admin-panel/services/03-members.png | partial | P3/H | A per-group roster panel now ships (leader pinned first, presence dot, job type, rating, two-step remove + add) backed by `GET|POST|DELETE /_admin/groups/:id/members[/:userId]`. See Stage H review log. Moved `missing` → `partial` on code evidence 2026-11-16 — the implementation ships; pixel fidelity is unverified. `done` requires human visual acceptance (P5). Capture: `screens/services-03-members-impl.png`. |
| admin-panel/services/04-incident-types.png | partial | P3/M | Create + inline edit (label/icon/color) now ship: `POST/PATCH /_admin/incident-types`, service-layer validation (icon limited to the shipped glyph subset, `#RRGGBB` color, rank assigned server-side), audit rows, card-grid presentation with per-type group coverage derived client-side. Not pixel-matched to the reference (no per-type request counter — needs the reports aggregate, not the catalog payload); stays `partial` pending human visual acceptance.  Capture: `screens/services-04-incident-types-impl.png`. |

## Administrator console — system (3)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| admin-panel/system/01-audit-log.png | partial | P3/M | Table + filter + CSV (formula-escaped, no-store) works; no detail drawer/severity.  Capture: `screens/system-01-audit-log-impl.png`. |
| admin-panel/system/02-alerts.png | partial | P3/M | List + resolve + severity tones; no designed detail/ack patterns.  Capture: `screens/system-02-alerts-impl.png`. |
| admin-panel/system/03-settings.png | partial | P3/L | Boolean settings toggles; designed grouping/explanation copy absent.  Capture: `screens/system-03-settings-impl.png`. |

## Administrator console — users (3)

| Reference | Status | Phase/Pri | Notes |
|---|---|---|---|
| admin-panel/users/01-list.png | partial | P3/H | Search/role filter/toggle/create implemented, avatars present and an account detail entry point exists (see Stage H review log); the designed filter-empty state with a clear-filters action ships (Stage G). Not implemented: phone/last-seen columns, bulk select, pagination, KPI cards. Status stays `partial`.  Capture: `screens/users-01-list-impl.png`. |
| admin-panel/users/02-account.png | partial | P3/M | A per-account detail panel now ships on the users screen (identity, role/activation pills, group memberships, job type, membership date, last login, SOS count, live sessions, login history, inline role/job-type editor, two-step deactivate via session revocation) backed by `GET /_admin/users/:id`. See Stage H review log. Moved `missing` → `partial` on code evidence 2026-11-16 — the implementation ships; pixel fidelity is unverified. `done` requires human visual acceptance (P5).  Capture: `screens/users-02-account-impl.png`. |
| admin-panel/users/03-roles.png | missing | P3/M | No roles/permissions view. |

## Excluded artifacts

`design/*/_generator/_preview-*.png` (13 files) are generator previews, not canonical acceptance references.

## Documented intentional deviations

- **DEV-01 — Recovery account error (auth/06).** The reference shows an explicit "unknown username" error, which is a user-enumeration oracle. Implementation answers unknown usernames with decoy challenges (enumeration-safe), consistent with `docs/SECURITY.md` and the decoy-resistant recovery design. The design image is retained as reference; implementation deliberately diverges.
- **DEV-02 — Turn-by-turn navigation family (navigation/08-15, navigation/18-20, mission/07-08, history/01, profile/01 stats, history "trips").** The 2.0.0 product is the simplified SOS-to-mission workflow; no routing engine. Documented in `docs/ACCEPTANCE.md` ("Legacy feature scope reconciliation") and `docs/LEGACY_REVIEW.md`. The pill still labeled "routing" in the UI opens the plain map — the pill now reads "Map" (its screen is the offline map with the SOS composer, nothing more) and its behavior is exactly what it says (P1 rename, decision 3). navigation/16-multi-destination.png and navigation/17-destination-reordering.png were taken back into scope by the explicit Stage 5 product decision (`docs/IMPLEMENTATION_PLAN.md`): the multi-destination ordered trip is implemented as the Trips screen, still without any routing engine.
- **DEV-03 — Photo without compression (sos/05).** RESOLVED in P1 — the composer validates, downscales and re-encodes client-side under the server's wire cap. Kept for the record.
- **DEV-04 — SOS dock placement.** RESOLVED in P1 — the dock now hugs the physical left edge (decision 5), above the search bar, clear of the home indicator.
- **DEV-05 — Profile metrics.** The reference shows trip counts/kilometers; P2 replaced them with SOS/mission/sharing counts (see design-flaw register). Stage 5 adds a trips domain, so trip counts are now possible; kilometers still presuppose a routing engine and remain unavailable.

## Summary tally (canonical 141)

Counts over the 141 canonical rows above: `done` 21, `partial` 92, `missing` 10, `superseded` 12, `reference` 5, intentional `deviation` 1. Reconciled twice on 2026-11-16: first against the table itself (the printed tallies in earlier stage logs had drifted from the rows; the table is authoritative), then after the code-evidence sweep that moved every row whose note documented a shipped implementation from `missing` to `partial` (see the Stage F fifth-pass log). The table is authoritative.

## Stage C review log (2026-11-08)

Code-vs-matrix audit of all 141 canonical rows; the matrix was confirmed as the single authority, the six state families (loading / empty / error / offline / forbidden / success) were kept as separate rows, and no row was flipped to `done` — visual acceptance stays a deferred human review (P5), never an automated one.

- Integrity check: the 141 canonical PNGs on disk (154 files minus the 13 `_generator/_preview-*.png` artifacts) map 1:1 onto the 141 matrix rows; no missing, extra or duplicated references.
- Stale rows corrected: `mission/01-mission-ready-on`, `mission/02-mission-ready-off`, `profile/08-bookmarks`, `profile/09-bookmark-edit` — all four described shipped functionality as absent (readiness switch and saved-places UI are wired); now `partial` with accurate notes.
- Spot checks confirmed accurate as written (Stage C, 2026-11-08): `navigation/17` (no reorder UI at the time), `sos/07`–`sos/11` and `sos/16` (no sending/pending/dispatched/en-route/arrived/offline surfaces at the time), `admin-panel/services/*` (no edit/member-management UI at the time), `admin-panel/dashboard/03-reports` (no deltas/period/donut at the time), `admin-panel/states/01|04` (at the time), `history/07|08` (playback/per-companion absent; `history/05` changed by Stage E — see the Stage E review log), `mission/13|19`, `companions/02|05|10`, `profile/06`, `auth/02|12`. The listed feature gaps have since shipped on this branch — rows and notes re-read accordingly; every status above stands unchanged pending human visual acceptance.
- The 23 `done` rows were not re-verified visually; they remain "implemented and wired, pixel fidelity unverified".
- Remaining `missing` work is enumerated by the matrix; several rows are product/architecture decisions rather than buildable screens (e.g. `history/07` playback: the trip-track recording decision is approved and implemented — see `docs/TRIP_TRACK_PROPOSAL.md` (2026-11-12) — and the row stays `missing` until a human accepts the recorded preview in the visual preview).

## Stage E review log (2026-11-12)

History discovery landed as a deliberately minimal filter layer (see `docs/IMPLEMENTATION_PLAN.md` Stage E entry): date range and status chips on all three history tabs (share lifecycle chips on shares), honest filter-emptied empty states with one-click reset, and a per-tab summary line. `history/05` moves `missing` → `partial` on code evidence (a filter UI now exists and is wired to real, loaded records); the designed bottom sheet's vehicle/companion groups and toggles stay unimplemented for lack of backing data, and the row flips to `done` only after human visual acceptance. No other rows change; the tally is `done` 23, `partial` 71, `missing` 30. `history/07` and `history/08` stay `missing`.

## Stage D review log (2026-11-12)

Consented trip/mission track recording landed (see `docs/IMPLEMENTATION_PLAN.md` and `docs/TRIP_TRACK_PROPOSAL.md`). Matrix impact, audited against the code:

- `history/01` and `history/06` stay `partial`: recorded distance/duration now render for recorded trips; the designed statistics/modal are still absent.
- `history/07` stays `missing`: the designed map-animated playback surface does not exist; a schematic, authorization-aware replay panel shipped instead. Status flips only after a human accepts the recorded preview (`docs/VISUAL_PREVIEW.md`), never from this log.
- No other rows change; DF-04 is annotated as addressed in the register above. The tally at that point was `done` 23, `partial` 70, `missing` 31, `superseded` 11, `reference` 5, `deviation` 1; Stage E then moved `history/05` `missing` → `partial`, giving the canonical tally in the summary section (`done` 23, `partial` 71, `missing` 30).

## Stage H review log (2026-11-13)

Code-evidence audit for this stage (no status changes; every row stays as written until a human
accepts the recorded preview):

- `admin-panel/dashboard/03-reports.png` — UI + server payload now exist on this branch. New
  `GET /_admin/reports?days=7|30|90` computes every figure from the database for the requested
  window (total requests, average response seconds from the recorded accept event, acceptance
  rate from decided offers, cancellation count) and deltas against the equal previous window;
  deltas are `null` when the previous window is empty. The page ships four KPI cards with delta
  lines, an SVG 7/30/90-day requests-vs-missions trend, a group-share donut (each group's own
  color), an incidents-by-type bar chart, a group-performance table with a documented
  grade (excellent/good/average/weak labels shown in the UI) (rating >= 4.7 & acceptance >= 95 / >= 4.4 & >= 90 / >= 4.0 & >= 80),
  and period chips. Status stays `missing` until human visual acceptance.
- `admin-panel/services/02-group-edit.png` — the groups screen now has an inline edit panel per
  group (name, color, capacity, status, incident coverage chips) backed by `PATCH /_admin/groups/:id`
  with client-side pre-validation mirroring the server rules. Status stays `missing`.
- `admin-panel/services/03-members.png` — the groups screen now has a per-group roster panel
  (leader pinned first, presence dot, job type, rating, two-step remove) backed by new
  `GET /_admin/groups/:id/members` (roster rows expose `membership`, presence, rating and job type —
  no join timestamp exists in the schema, so none is shown), `POST /_admin/groups/:id/members`
  (responder/admin only) and `DELETE /_admin/groups/:id/members/:userId`. Candidate search excludes
  current members. Status stays `missing`.
- `admin-panel/services/01-groups.png` — unchanged status `partial`; its note (list + create, no
  edit) is now stale — edit exists; the row should be re-read when the owner adjudicates.
- `admin-panel/services/04-incident-types.png` — create + inline edit now ship (service guards,
  audit rows, shipped-glyph allowlist); the reference's per-type request counter is not in the
  catalog payload and was not invented; status stays `partial` pending human visual acceptance.
- `admin-panel/users/02-account.png` — a per-account detail panel now ships in the users screen:
  identity, role/activation pills, group memberships (computed client-side from each group's
  `memberIds`), job type, membership date, last login, SOS request count, live sessions, login
  history, an inline role/job-type editor and a two-step deactivate (which the server backs by
  revoking every session). Every figure comes from `GET /_admin/users/:id`; nothing is invented.
  Status stays `missing` until human visual acceptance. The `01-list` row's stale note (no avatars,
  no detail links) — avatars and now a detail entry point exist; row stays `partial`.
  `03-roles` remains absent on purpose: the schema has exactly three roles (user, responder, admin)
  with no permissions model behind them; drawing the designed dispatch-manager matrix would invent a
  capability that does not exist. Owner decision needed: either formalize roles/permissions in the
  data model, or record the matrix as in-scope-never.
- `navigation/17-destination-reordering.png` — the Trips screen (Stage 5 scope) now carries leader-only
  stop reordering: up/down rank controls on a reordered list, a save action that PATCHes the wholesale
  stop list via `PATCH /_user/trips/:tripId`, a first-row up-disable, and no reorder affordance for plain
  members. The design's drag handles, auto-optimize-route button and distance/ETA recomputation note
  were not ported (no routing engine; “nearest” ordering would invent distances). Status stays `missing`
  pending human visual acceptance.
- `admin-panel/states/01-loading.png` — the console now counts in-flight loaders (`guard` in the admin
  store increments/decrements a pending counter instead of a boolean racing), and the built screens swap
  in shimmer skeletons instead of misleading zeroes or reassuring empty copy while their first payload is
  in flight: the users table (row batch plus an informational status strip), the overview screen (KPI
  cards, trend panel and recent-requests list), the reports screen (KPI cards, trend chart, group-share
  donut, incident-type bars and the group-performance table), and the alerts, groups and audit panels
  (skeleton row batches). Dispatch (`dispatch-loading`), job types (`job-types-loading`), incident types
  (`incidents-loading`), support requests (`support-loading`) and the settings screen (`settings-loading`
  plus `health-loading` for the system-health snapshot) now skeletonize the same way. Remaining gaps in
  this family: the skeleton geometry is a generic row batch rather than screen-specific layouts, and no
  route under the console shows a full-screen skeleton scrim. Status stays `missing`.
- `admin-panel/states/04-offline.png` — the admin shell now shows a dark offline banner whenever the
  browser reports the link down: wifi-off glyph, server connection lost, the wall-clock of the last
  clean `loadAll` (where the last sync is known), and a retry retry that re-pulls every admin
  projection and is labelled "retrying" while in flight. The banner deliberately does not claim
  staleness per widget (the console has no per-panel freshness model) and the KPI-pill stored data
  marker and the offline map empty state were not ported. Status stays `missing`.
- `mission/13-support-accepted-notification.png` — the mission page's support panel now renders the
  review outcome as an explicit notice with the title family (approved / partially-approved / rejected)
  and the server's actual reason codes, driven entirely by `supportRequestNotice` state. No push/permission
  flow was invented. Status stays `missing` pending human visual acceptance.
- `mission/19-mission-offline.png` — the mission page now shows an offline card in place of the offers
  list when the browser reports the link down: wifi-off glyph, the connection-lost title, the wall-clock
  of the last successful catalog/list sync where known, and a retry that re-pulls through the SOS store
  (disabled and labelled retrying while in flight). The design's full-screen responder-side treatment was
  not ported. Status stays `missing`.
- `admin-panel/states/03-error.png` — the console's inline load-error surface now exists everywhere
  instead of only on the overview: a shared `AdminInlineError` panel renders the admin store's shared
  load-error message with a retry that re-issues the screen's own primary pull (disabled and labelled
  retrying while in flight), and it ships on the overview, users, groups, alerts, audit, incident types,
  job types, dispatch, settings and reports screens. The retry re-pulls lists, not any mutation that
  failed; the message is the store's shared error ref (the same one the overview shows), so one panel
  per screen may display a failure that originated elsewhere in the console. Statuses are unchanged;
  the design's full-screen error composition and per-panel isolation of load failures are not built.
  Status stays `partial`.
- `sos/07-sos-sending.png` — while the SOS composer is mid-submit the screen shows a full-screen sending
  card as a dialog: the sending-to-center heading, the staged request steps (photo line only when a photo
  is staged, note row only when a note was typed). No fake progress fill and no counters the server cannot
  truthfully drive; the overlay releases exactly when the server answers. Status stays `missing`.
- `profile/06-logout-confirm.png` — the map sheet's one-tap logout was replaced by a confirmation
  dialog (title, account-safety body, current-device rows when sessions are known, solid-danger accept
  and cancel, scrim and Escape to dismiss). Status stays `missing` pending human visual acceptance.
- `auth/02-login-empty.png` — the login screen now renders its empty-state contract: the submit CTA is
  disabled until both the username and the password carry a value, with an explicit note under the button
  saying so. Status stays `missing` pending human visual acceptance.
- `auth/12-onboarding-loading.png` — the forced onboarding screen now shows its loading composition while
  the question catalog is in flight: an informational banner, five skeleton rows and a disabled submit; a
  load failure surfaces an inline error with a retry that re-fetches the catalog, instead of the silent
  empty form the screen used to show. Status stays `missing` pending human visual acceptance.
- `admin-panel/states/05-forbidden.png` — a designed 403 surface now exists and the router guard
  points at it: a signed-in non-admin who reaches an administrator URL lands on the composed panel
  (lock-shield mark, the "access not permitted for this role" title, an honest body naming the actual
  rule - console open to administrator-role accounts only, no finer permission scope exists in the model,
  no audit claim is invented - plus a back CTA and a footer printing the numeric code and the caller's
  current role). The reference's manager-scope framing was not ported (no such permission exists).
  Status stays `partial` pending human visual acceptance.
- `sos/16-sos-offline.png` — the SOS composer now carries its offline stance: whenever the browser reports
  the link down, the composer body shows an explicit no-reach card (no SOS reaches the rescue center, no
  offline queueing happens, last catalog sync shown where known) and the send button on the review step is
  disabled and relabelled until connectivity returns. Status stays `missing`.
- `admin-panel/states/02-empty.png` — the users console panel now renders its designed empty
  composition when a search/role filter matches nothing (centered mark, "no user matches these
  filters" title, the shorten-or-reset hint and a clear-filters action that re-issues the unfiltered
  query), and a distinct honest generic case when the roster is simply empty. Reports panels keep
  their honest per-section empty copy (with skeletons while loading); other screens still render
  their plain empty texts. Status stays `partial`.
- `sos/08`–`sos/11` — precise inventory of what already exists, to support the adjudication of these
  four rows: the mission screen renders the five-step lifecycle rail (registered / dispatched / accepted /
  in-progress / completed, labels in Persian as designed) with per-step wall-clock times taken from the
  server's mission timeline (a step with nothing recorded stays undated), a "step n of 5" stage counter,
  the incident card, the requester/responder action buttons, the cancel flow with its reason catalog and
  the rating form. The dispatch board and the mission screen are the only two status surfaces that exist;
  each of the four design compositions (the pending bottom sheet with its "what to do until the
  responder arrives" guidance list, the dispatched sheet, the arrived sheet, and any ETA-bearing
  en-route treatment — ETA requires a routing engine that does not exist) was NOT ported. Building a
  second full-screen surface duplicating the rail was judged out of scope without a product decision;
  these notes record the facts only. Status of all four stays `missing`.
- `admin-panel/states/03-error.png` — the console's inline load-error surface now exists everywhere: a
  shared `AdminInlineError` panel renders the admin store's shared load error with a retry that
  re-issues the screen's own primary pull (disabled and labelled retrying while in flight) on ten
  screens: overview, users, groups, alerts, audit, incident types, job types, dispatch, settings and
  reports. The retry re-pulls lists, not any mutation; the message is the store's shared ref, so a
  panel may display a failure that originated elsewhere in the console. The reference's full-screen
  error composition was not ported. Status stays `partial`.
- `admin-panel/states/01-loading.png` and the DF register — the loading family is now console-complete
  (users, overview, reports, alerts, groups, audit, dispatch, job types, incident types, support
  requests, settings + system health), and DF-03, DF-05 and DF-07 were marked ADDRESSED in the
  register (honest per-tab summary lines; manual-location markers on both the offer screen and the
  dispatch board, the latter added now with tests; the shipped-icon guard already scans every client
  source). No matrix row was flipped.
- Counts remain: `done` 23, `partial` 71, `missing` 30, `superseded` 11, `reference` 5, `deviation` 1.

## Design flaws found in the reference material (to fix or consciously keep)

| ID | Reference | Flaw | Recommendation |
|---|---|---|---|
| DF-01 | auth/06-recovery-account-error.png | Explicit unknown-username error = user enumeration oracle. | Keep implementation (decoys); do not port the screen. |
| DF-02 | mission/03-mission-offer.png | A 52-second countdown and "3 offers active" imply a server-enforced offer TTL; offers now have a status lifecycle and an endpoint, but there is no offer-expiry/TTL job. | Drop the countdown, or add offer TTL to the backend as a product decision. Do not fake it client-side. |
| DF-03 | profile/01-profile-home.png, history/01-history-trips.png | Trip statistics (trips, kilometres) presuppose the superseded routing product. | Replace with SOS/mission/sharing metrics. ADDRESSED: the history screen renders honest per-tab summary lines (finished trips plus a recorded-track count, mission count with the rated-average and its own count, live-share count) computed only from loaded records — no kilometres, no vehicle/month aggregates, no invented figures; the profile home carries no trip counters. Kept until the designed surfaces are accepted. |
| DF-04 | history/07-history-playback.png | Playback UI does not communicate authorization scope/expiry although the API is share-gated. | Add an authorization note; never show playback without an active authorized share. ADDRESSED in Stage D (2026-11-12): the replay panel states share-scoped authorization and the grant expiry (`authorizedUntil`) whenever access is via a share; participants are authorized by membership. Kept until the designed surface is accepted. |
| DF-05 | sos/04-sos-location-picker.png | Dropping an incident pin far from GPS is a fraud/abuse vector with no responder-facing "manual location" marker. | Surface `isManual` (already recorded server-side) on the offer/dispatch screens. ADDRESSED: the mission offer screen already carried the manual-placement note; the dispatch board now flags hand-dropped pins in the queue row (inline marker) and in the expanded dispatch panel (full note), both asserted by tests. Kept until the designed surfaces are accepted. |
| DF-06 | navigation/* (except 16-17) | The navigation family contradicts the offline/deterministic-tile architecture and the documented product scope; keeping it as silent reference invites accidental scope creep. | Keep files as visual identity reference; exclude from acceptance scope. Explicit product decision (Stage 5) brought 16-multi-destination (partial) and 17-destination-reordering (missing) back into scope as the Trips screen; the rest stays excluded. |
| DF-07 | design/icons vs client | Client consumes generated subset; canonical set allows aliases. Verify in P5 that no ad-hoc icon appears outside the inventory. | ADDRESSED: `tests/assets.test.ts` ("every icon used by the Vue client exists in the shipped MDI subset and canonical inventory") already scans all client `.vue`/`.ts` sources plus the server catalog for `mdi-*` references and fails on any ad-hoc icon or missing shipped glyph. Kept until the icon subset is regenerated. |
| DF-08 | map-page/navigation/02 | The 350-metre scale bar appears only in the press-hold reference, not in idle. | Treat the scale bar as a permanent map affordance if confirmed with the design owner; otherwise drop. |

## Stage F second pass (2026-11-13) — agent comparison sweep, no approvals

All 46 captures (23 pages, desktop and mobile) were compared against the canonical references,
family by family (auth, map shell, sos/mission/talk/sharing/trips/history, admin console), plus a
dark-theme smoke check and an interactive bug hunt. No row flips status; visual approval remains a
human call. Defects found and fixed (commit `6c319dc`): toast close buttons unclickable
(`.toast-root` opted out of pointer events and no child re-enabled them); hard-coded light
translucent chrome turned light-on-light in dark theme (`.quick-chip`, `.round-control`,
`.connection-badge`, `.live-chip`, `.admin-topbar` — dark twins added, mirroring the existing
top-pill/search-bar pattern); the admin sidebar active item used `--primary-deep` on
`--primary-soft` (near-invisible in dark) now uses `--primary`; the `.mt-2` utility used by the SOS
step screen was never generated (Vuetify spacing helpers are not bundled) — now defined; obsolete
`#sos-description` rule removed. The profile parent-tab experiment was reverted to the documented,
tested history-pill contract (`faa2cf5`).

Still divergent by recorded decision, none accepted visually: login vs `01-login.png` (no designed
top bar, back-to-home, welcome/heading lockup, field icons, divider/social row); bottom-sheet
`28/52/76` detents unvalidated against `bottom-sheet.png`; mission offer red banner and the
3-column dispatch board (`mission/03`, `admin-panel/dashboard/02`) absent; admin overview lacks the
operations map, group-availability column, alerts panel and refresh/report actions
(`admin-panel/dashboard/01`); admin reports lack KPI deltas/period selector/donut
(`03-reports`); users table lacks avatars/phone/last-login (`admin-panel/users/01-list`); no admin
skeleton loading states (`admin-panel/states/01`) and no dedicated offline surface (`04-offline`);
`history/05` stays `partial` until a human accepts the recorded preview. Auth family keeps its
`partial` rows; the desktop auth composition and mobile brand-strip collapse were deliberately not
rebuilt in this pass — changes of that scope belong to the human visual-acceptance decision.

Preview limitation: the fake-data demo fetch authenticates any credential (persona follows the
username), so the auth error path is not previewable; wrong-password rejection is covered by the
server tests. Console/page/request sweeps of all 23 routes and the interactive flows (register
validation, SOS wizard steps, history chips + reset, share search, job-type validation, device
revoke toggle, toast dismissal, admin dispatch open, profile rename, talk press-hold) are clean.

## Stage F third pass (2026-11-13) — defects found by inspection, no approvals

A further bug hunt re-checked the completed pages (register/onboarding against the references,
the admin users list against `users/01-list.png`, the SOS composer against the `sos/19` validation
sheet, dark-mode rendering) and wired down what it found. No row flips status; visual approval
remains a human call.

Defects fixed:

- **Register/onboarding security-question selects rendered dirty-but-blank** (`a752276`): the
  model was seeded with empty strings, which Vuetify treats as a present-but-unknown selection,
  so the placeholder and combobox affordance vanished. Slots are now `null`, mapped to `''` only
  at the payload boundary so the server still sees five positions.
- **Dark-mode map tiles rendered light** (`da43856`): `MapCanvas` rendered bare `<img>` tiles
  while `app.css` scoped the dark filter (and sizing/`user-select`) to `.map-tile`, so the rule
  never matched. The class is now applied; dark tiles verified by screenshot.
- **Dead legacy design system in `app.css`** (`45d1d05`): ~400 lines of unreachable rules from a
  superseded iteration removed (admin KPI/card/modal/stepper set, auth chrome, POI/overlay marker
  classes, skeleton/shimmer, unused toast variants and keyframes). Verified: rebuild + all 46
  captures re-taken and pixel-diffed against the pre-purge set — identical except the live
  status-bar clock on map-shell pages. `v-*` runtime classes and the dynamically constructed
  `toast--${tone}` variants are kept.

Evaluated and deliberately not changed:

- **SOS short description gates only at submit** (`sos/19` shows a disabled send button and a
  blocker list). The disabled-submit direction is contradicted by `tests/sos-view.test.ts`, which
  pins click-then-explain behavior (inline `VAlert` naming the 10-character minimum). Any change
  here is a product decision, not a bug fix.
- **`users/01-list.png` parity** (avatars, phone, last-login, bulk select, pagination, KPI
  cards): remains recorded at `partial` rows 230–232; no code change implied.

The demo-auth limitation stands: any credential logs in (persona follows the username), so the
auth error path stays server-side-tested only.

## Stage F fourth pass (2026-11-16) — capture harness and hold-bar fix, no approvals

Two code defects closed on code evidence, three rows moved on captured evidence;
nothing was accepted visually — P5 stays a human call.

Defects fixed:

- **The SOS hold progress bar painted nowhere** (`.sos-button__progress` in `src/client/app.css`):
  it sat flush against the bottom/inline-end edges where the button's `overflow: hidden` and
  999px radius clipped it entirely, and a competing `.is-holding` rule forced `width: 100%`
  regardless of the inline-size binding. The bar is now a bottom-inset (8px) pill inset 14px
  from the inline start, 5px tall, painted in the on-accent color; hold captures show the fill (`navigation/02`, `sos/02`, viewport clips — full-page screenshots do not paint the hold
  indicator in headless Chromium); the exact fill fraction at capture time is not measured and no mid-hold percentage is claimed.
- **The SOS dock painted under the route sheet** (`z-index` 16) and was effectively unreachable
  at every detent: now `z-index: 18`, and the quick-jump saved-place chips moved out of the
  sheet (they were clipped by its rounded top edge) into a detent-aware sibling that paints
  above the sheet only on the map route; the map-route search bar joins them there.
- **The submitting state was unreachable in captures**: the demo answered `POST /_user/sos`
  inside one microtask, so the full-screen sending card could never be screenshotted. A
  preview-only 1500 ms delay now makes the transient state capturable (`sos/07`). Two new
  preview-only knobs (`?missions=empty&offers=empty`) serve the requester-only mission rail for
  `sos/13`; `clickAt` joined the harness step set for canvas point taps.

Rows moved on code/capture evidence: `sos/07` missing → `partial`, `sos/13` done → `partial`,
`sos/15` done → `partial`. Tally after those moves, as counted from the table: `done` 21,
`partial` 78, `missing` 24, `superseded` 12, `reference` 5, intentional `deviation` 1.

Tally reconciliation (2026-11-16, two steps): the printed tallies in the Stage C/D/E/H logs and
in the summary section (e.g. `done` 23, `partial` 71/74, `missing` 29/30/31, `superseded` 11)
drifted from the rows they describe and never matched the table as committed. Step one: counting
the 141 data rows on 2026-11-16 gave `done` 21, `partial` 78, `missing` 24, `superseded` 12,
`reference` 5, `deviation` 1. Step two (same day, see the Stage F fifth-pass log): a sweep moved
the 14 rows whose notes documented shipped implementations from `missing` to `partial`, giving
`done` 21, `partial` 92, `missing` 10, `superseded` 12, `reference` 5, `deviation` 1. No row
moved to `done`; visual acceptance remains the deferred human P5 gate. Earlier logs are kept as
the historical record of what was claimed at the time; this note is the correction.

Evidence: 97 implementation captures under `docs/visual-acceptance/screens/` (mobile 393 × 852,
DPR 2; admin captures at desktop widths — the pre-existing set at 1440 × 900, the new `admin-states/03-error` at 1280 × 900) including five dark-theme aid shots (`dark-map-idle`, `dark-sos-compose`, `dark-history`, `dark-sharing`, `dark-admin-overview`) taken with `prefers-color-scheme: dark` — they document that the dark surfaces render, nothing more; they are not acceptance evidence and flip nothing, generated with the harness committed at
`scripts/visual-acceptance/` and documented in `docs/VISUAL_ACCEPTANCE.md`. They are byte-stable
and reproducible from the demo bundle; the tool's `node_modules/` stays gitignored. The five
references newly exercised in the pass are the empty/error states (`history/10`, `history/11`,
`companions/09`, `admin-states/03-error`, `sos/20` via the history capture); `navigation/07`,
`sos/12` and `profile/07` reuse existing captures as named in their rows. The 2026-11-16
empty/error captures were produced with four preview-only failure/empty knobs added to the demo
bundle (`?history=empty`, `?shares=empty`, `?fail=history`, `?fail=admin` — deterministic 500
envelopes and empty lists served by the fake-data layer), the same way the earlier
`?missions=empty&offers=empty` knobs work. Pixel-level fidelity
against the references remains unverified for every row; the human P5 review is the approval gate.

## Stage F fifth pass (2026-11-16) — code-evidence status sweep, no approvals

The status legend defines `missing` as "no implementation exists". Fourteen rows marked `missing`
carried notes documenting a shipped, wired implementation; that contradicted the legend and the
documented rule that code evidence may move `missing` → `partial` (only a human moves `partial` →
`done`). Each was re-read against the code (views, stores, routes, tests) and moved `missing` →
`partial` on 2026-11-16, with the note rewritten to say so and to keep the P5 gate explicit:

`auth/02-login-empty`, `auth/12-onboarding-loading`, `navigation/17-destination-reordering`,
`sos/16-sos-offline`, `mission/13-support-accepted-notification`, `mission/19-mission-offline`,
`history/07-history-playback` (ships an authorization-aware replay panel; the designed
map-animated surface is absent — the flip does not pre-empt human acceptance of the recorded
preview), `profile/06-logout-confirm`, `admin-panel/dashboard/03-reports`,
`admin-panel/states/01-loading`, `admin-panel/states/04-offline`,
`admin-panel/services/02-group-edit`, `admin-panel/services/03-members`,
`admin-panel/users/02-account`.

Capture alignment (two passes): every committed capture under `docs/visual-acceptance/screens/`
is now named by at least one row — all 90 light captures that map to non-superseded rows are wired
in, the two exceptions are `navigation-19-trip-cancel` and `navigation-20-trip-completed`, which
map to `superseded` rows and are deliberately not wired in as acceptance evidence, and the five
`dark-*` aid shots are named as dark-theme aids on their rows (not acceptance evidence). Two stale row notes fixed in the same sweep: `admin-panel/states/02-empty`
(the users screen gained the designed filter-empty composition in Stage G) and
`admin-panel/states/05-forbidden` (a designed 403 surface replaced the silent redirect in Stage
G/H; the note still claimed neither existed).

Rows verified to ship nothing and therefore left `missing`: `navigation/18-sos-confirmation` (the
SOS composer review step is a general confirmation; the designed over-turn-by-turn-guidance hold-to-send
context is superseded — no trip guidance exists), `sos/08-sos-pending`, `sos/09-sos-dispatched`,
`sos/10-sos-rescuer-en-route`, `sos/11-sos-rescuer-arrived`, `history/08-history-companion`,
`companions/02-companion-add`, `companions/05-companion-status`, `companions/10-companions-offline`,
`admin-panel/users/03-roles`. Canonical tally now: `done` 21 · `partial` 92 · `missing` 10 ·
`superseded` 12 · `reference` 5 · `deviation` 1. No row was flipped to `done`; the human P5 review
remains the approval gate for every row.
