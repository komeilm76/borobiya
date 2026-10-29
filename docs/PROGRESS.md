# Borobiya — Progress

> Track % done per feature, blockers, changelog. Update in every PR alongside `TASKS.md`.

---

### 2026-10-29 — Mark the selected place on the map (T4.1.4 follow-up)

- Choosing a search result previously only flew the camera to its coordinates; there was no map symbol showing which POI was chosen. The map view now displays one purple, named MapLibre pin, moves it when a different result is selected, and removes it on query/scope invalidation or unmount. The marker constructor is supplied by the lazily loaded map canvas; it is not imported by the route. A failing-before-fix source-pinned lifecycle regression and composable selection tests cover the wiring without mounting a Vue SFC. A real map/browser visual and keyboard/screen-reader check remains open.

### 2026-10-29 — Keep place-search results and offer a visible-map scope (T4.1.4 follow-up)

- Selecting one place no longer clears the query/results: the selected row is highlighted and other hits remain usable. PlaceSearchPanel adopts LiveBroadcastBar's compact indicator, status copy, action layout and light/dark card treatment; its button toggles all installed map coverage versus the current visible rectangle, not a Vuetify switch. Scope changes abort pending searches and rerun the same term. Bbox and result filtering share one camera snapshot, clipped to installed coverage; unavailable bounds cannot accidentally issue a global request. Failing-before-fix composable tests, pure bbox tests and source/compiled-style pins cover the code without mounting Vue. Real Photon/browser, small-screen visual and keyboard acceptance remain open.

### 2026-10-29 — Preserve map history through a JWT renewal (T2.2.6 follow-up)

- The map view independently watched the raw access token and reselected default own-history on every JWT refresh, undoing the playback composable's same-session continuity and discarding a selected grant/cursor. It now watches the account/JWT-session boundary instead: a new login triggers default history, sign-out or a subject mismatch clears the overlay synchronously, and an already-signed-in first visit still loads history. A failing-before-fix source-pinned regression and existing composable session tests cover the logic without mounting Vue; live browser renewal and two-session acceptance remain open.

### 2026-10-29 — Make private map position a broadcast-style component (T4.4.1 partial)

- Moved the `موقعیت من` map card to `OwnPositionBar.vue`. It now follows `LiveBroadcastBar`'s indicator, headline/status, action hierarchy, themed surface and compact-width button layout while retaining its separate private-GPS semantics: only the map view starts the watch/recenters the camera, and no position is broadcast. The bar handles active, waiting and error states and explains why Start is unavailable before the map loads. Fixed a stale feedback bug where pressing Stop after a transient GPS outage left the error visible rather than returning to the off state. Pure reactive/source and compiled-CSS contrast tests cover the changes; browser/phone visual and keyboard acceptance remain open.

### 2026-10-29 — Expose the companion map's navigation controls (T4.4.1 partial)

- On the RTL companion map, MapLibre's physical top-right zoom-in, zoom-out and compass rail sat beneath the right-side history playback card on desktop. Only this map now docks its native controls in the clear gap between the top cards as a horizontal, 44px-target rail within the existing camera top padding; on narrow screens, where the panels move outside the map, it returns to the familiar vertical top-right edge. Zoom/compass handlers, map camera, history panel and other MapCanvas users remain unchanged. Source and compiled-CSS checks cover the positioning and breakpoint; a real browser/phone/zoom visual and keyboard pass remains open.

### 2026-10-29 — Avoid false-empty recipient search feedback (T4.4.2 partial)

- A review of the share dialog found that it displayed “no account found” before its debounced lookup even started, and still displayed that message alongside the search-failed/retry hint after an outage. Only a successful response for the current term and filters can now verify an empty result; edits, filters, retries, close and failures clear that verification immediately. Short-query guidance and error retry remain available. Pure reactive and source-pinned tests failed before the fix and pass after it; no component mount or browser verification is claimed.

### 2026-10-29 — History playback bug review (T4.4.1 follow-up)

- Found two panel bugs: a pending history read retained its old track with `canPlay=true`, so Play/step/speed/scrub remained usable despite the “reading history” status and could start playback of a different range mid-request; and speed choices showed ASCII digits among Persian labels. The panel now hides quick play and disables transport/scrub during reads (including a single-fix track whose slider cannot move), while the numeric speed values are unchanged and their labels use Persian digits. Pure formatter and source-pinned regressions failed before the fix; no Vue component was mounted or browser/device interaction claimed.

### 2026-10-29 — Give map history playback a clearer broadcast-bar-style surface (T4.4.1 partial)

- Refreshed the `/_user/map` history panel with a state indicator, readable title/status, labeled play/stop and details actions, and inset source/range/transport sections. The compact status now wraps instead of hiding long errors, while the already-present point count remains in that line. Card-width layout rules make actions and date fields reachable at narrow widths/zoom, with a dark sticky-header color matched to the dark card. All existing playback API wiring, deep-link opening and phone scroll cap remain; source and compiled-style regressions cover those contracts without mounting Vue. Browser/device visual and keyboard acceptance are still open.

### 2026-10-29 — Localize Persian duration and companion-age numerals (T4.4.5 bug review)

- Found that history playback mixed Persian point counts with ASCII day/hour/minute counts, and live-companion labels switched from ASCII seconds to ASCII duration text even though their surrounding copy is Persian. The shared formatter now uses `fa-IR` digits with its default Persian units, while custom English units retain ASCII (or can explicitly request a numeral locale). The sub-minute peer-age path uses Persian digits too. Pure tests first reproduced both mixed-script outputs and cover zero, remainders, whole weeks, duration presets and custom English units; the history panel still uses the shared formatter. No browser screenshot or site-wide localization audit is claimed.

### 2026-10-29 — Align admin dispatch cards and typography with the UI tokens (T4.4.5 follow-up)

- The SOS dispatch console's four main panels were outline-only while adjacent admin screens used themed surface depth. The queue, selected request, map frame and responder picker now use the shared light/dark surface shadow, 24px corners and a semantic border. The map alert remains a floating overlay (surface depth when stacked), and the mission timeline is inset rather than doubly raised. Scoped typography brings the page's Vuetify utility headings, body labels and captions into the existing Persian-first font stack, with slightly larger metadata and readable heading/body leading; the native mission selector now inherits the same type and has a focus outline. Source/compiled-style checks, typecheck, tests and production build cover code behavior; no authenticated desktop/phone visual approval is claimed.

### 2026-10-29 — Make scoped dark-mode contrast rules actually apply (T4.4.3 partial)

- Investigated the reported low-contrast dashboard headings, broadcast status and map history/companion labels. Their intended light-on-dark overrides existed but Vue's scoped CSS compiler reduced `:global(:root.dark) .label` to `:root.dark`, silently dropping the label selector. Rewrote all 64 affected selectors across 14 Vue components so the full dark descendant remains in `:global(...)`; map-control borders stay limited to the map canvas. A new compiler-level regression verifies the generated selectors and checks the listed text colors at 4.5:1 or better against dark surfaces and the lightest translucent map-card backdrop. Earlier source-only dark contrast assertions did not verify this compiled behavior. Full browser/phone visual and site-wide WCAG AA acceptance remain open.

### 2026-10-29 — Diff mission live markers instead of rebuilding every clock tick (T4.4.4 partial)

- The three-role mission map previously reacted to every one-second age-clock tick by removing/recreating all MapLibre DOM markers, even with no new fix. A pure, lazy-import-safe planner now distinguishes no-op, coordinate move, freshness/scale replacement and removal per role. The panel watches stable location/freshness sources and clears private markers synchronously when the composable discards a mission/account. Map replacement and unmount also clear snapshots; moving fixes reuse marker nodes while stale transitions retain their scale and accessible label changes. Pure reactive and source-pinned tests failed before the fix, then passed without mounting Vue. No browser/device FPS, <2s paint or <500ms GPS target is claimed.

### 2026-10-29 — Keep live-broadcast actions reachable in narrow hosts (T4.4.1 partial)

- The outgoing location bar’s fixed 12rem status minimum and non-wrapping Devices/Start/Stop/Retry actions could overflow a compact map panel, dashboard inset or highly zoomed viewport. It now uses a host-width container query to place the status beside its indicator and stack two full-width, wrapping, 44px-minimum actions when the card is narrow. No broadcast, device-priority, disabled or consent logic changed. Source-pinned regression failed before implementation; rendered 200% zoom, phone/desktop-nested width and keyboard acceptance remain open.

### 2026-10-29 — Keep visually unbulleted lists navigable as lists (T4.4.3 partial)

- Restored explicit list roles for the ordered mission timeline, place results, admin mobile user/catalog cards and owned/received/history location shares. Some screen-reader/browser combinations can flatten lists when CSS removes markers. Mobile catalog failure/empty messages now sit outside the actual record list, leaving retained rows available after a failed refresh; the existing loading skeleton stays hidden from assistive technology. Source-pinned regressions failed before implementation and focused client checks cover structure without mounting Vue. No Safari/VoiceOver, keyboard-device or site-wide WCAG AA sign-off is claimed.

### 2026-10-29 — Verify mission status before re-enabling GPS after reconnect (T4.4.2 partial)

- A room-subscription acknowledgement alone did not confirm whether the mission ended while offline. The mission live panel now marks the recovered room unverified and disables the voluntary share action until the participant-scoped HTTP sync (admin: scoped detail) succeeds. A failed read retains the warning and verification requirement through manual Retry and even a failed socket opener; an already-connected replacement socket performs the same read without double-subscribing if `connect` fires synchronously. A terminal result stops the room, and logout clears private state and pending recovery before late results. Deferred reactive regressions failed before implementation, and the panel wiring is source-pinned without mounting Vue. Rendered/device reconnect acceptance and the wider feedback audit remain open.

### 2026-10-29 — Stop live companion map data churn on age-only ticks (T4.4.4 partial)

- The receiver’s five-second clock updated on-screen ages but also generated new GeoJSON (including unused `ageSeconds`) and re-issued MapLibre source/paint writes even when no dot changed. The map snapshot now retains its identity across age-only ticks, while moving/renamed/stale/revoked dots still change and the status panel continues aging. Removed a second peer-count watcher that duplicated a genuine peer arrival/removal write. Pure reactive and source-pinned regressions failed before the fix and pass afterward. This is a bounded work-reduction claim, not measured FPS, map paint under 2s or GPS under 500ms; target-device acceptance remains open.

### 2026-10-29 — Let proposal-card footers wrap at zoomed widths (T4.4.1 partial)

- Proposal inbox cards previously forced localized time and detail-prompt text into one flex row inside a clipped card. The footer now wraps and allows long text to break at narrow/zoomed widths; a source-pinned regression failed before the change. Device/200%-zoom visual acceptance remains open.

### 2026-10-29 — Preserve contrast of future mission stages (T4.4.3 partial)

- The rescuer’s future-stage labels were dimmed to 60% opacity, producing under-4.5:1 small text on light tinted cards. They now retain full theme foreground ink; reached stages still have their own background/primary ink and the current stage is marked semantically. Contrast/source tests failed before the fix; rendered/screen-reader/site-wide WCAG AA acceptance remains open.

### 2026-10-29 — Expose mission timeline live-transport outages (T4.4.2 partial)

- When both Socket.IO and the authenticated timeline event stream failed, a successful earlier HTTP read made the timeline look live even though future status changes would no longer arrive automatically. A scoped warning now offers manual refresh, clears on validated live delivery/socket recovery, and cannot survive a mission/session teardown. Tests cover the failure and recovery path without a browser; VM/proxy and rendered feedback remain unverified.

### 2026-10-29 — Reuse mission route geometry (T4.4.4 partial)

- Map camera fitting and route GeoJSON setup decoded the selected polyline separately, repeating work on style restoration. A computed snapshot now supplies both camera bounds and GeoJSON from a single decode/bounds pass per selected route. Pure tests cover reuse and invalidation; this does not establish device FPS, map-load or GPS timing.

### 2026-10-29 — Bound rescuer status action on narrow screens (T4.4.1 partial)

- The new mission status button’s Vuetify content could remain non-wrapping even though its outer action allowed wraps, risking overflow on narrow/zoomed screens. Both button and content now wrap within the panel with a 44px minimum target. A source-pinned regression failed before the edit; actual phone/zoom pixel acceptance is still open.

### 2026-10-29 — Correct small mission-timeline label contrast (T4.4.3 partial)

- The timeline eyebrow’s fixed `#167f69` failed 4.5:1 on dark surfaces. Theme-primary ink now passes measured contrast against both card surfaces in a failing-before-fix regression; the label’s typography/semantics are unchanged. Browser/screen-reader and site-wide WCAG AA acceptance remain open.

### 2026-10-29 — Clarify stale mission timeline after refresh failure (T4.4.2 partial)

- The timeline intentionally retained last-known steps on a failed re-read, but its warning did not say the displayed steps might be stale. The panel now labels them as the last successful read and offers an in-place retry. A source-pinned regression failed before implementation; no rendered browser acceptance or site-wide feedback sign-off is claimed.

### 2026-10-29 — Cache mission elevation charts by route/profile (T4.4.4 partial)

- Route card rendering rebuilt each 96-point chart up to five times per option for its SVG/text fields, including on unrelated reactive repaints. A computed snapshot now builds at most once per route/profile change; tests exercise cache invalidation and unchanged reads. This is a bounded render-work fix, not proof of the open map-load/GPS targets or virtual-scroll/browser acceptance.

### 2026-10-29 — Respect embedded mission-panel width (T4.4.1 partial)

- The live mission panel used viewport media queries even when embedded in a narrow history or admin column of a wide desktop viewport; its two-column map/member grid could overflow that column. Its stacking and compact actions now respond to the panel container width instead. A source-pinned regression failed before the edit; tests/typecheck/build do not replace browser/phone visual acceptance.

### 2026-10-29 — Announce rescuer mission progress semantically (T4.4.3 partial)

- The active stage was indicated only by CSS. Added `aria-current="step"` to the active list item and a polite atomic live status for the server-confirmed status chip, without announcing uncommitted steps. A source-pinned test failed before the fix; screen-reader/browser and site-wide WCAG sign-off remain open.

### 2026-10-29 — Preserve requester rating draft during status refresh (T4.4.2 partial)

- Explicitly refreshing the saved-rating check wiped an unsent score/comment, even if the read failed. The draft now survives same-mission refresh and retry while submit stays disabled until the server verifies eligibility; account/session/mission changes still clear it synchronously. A failing-before-fix composable regression covers the path. T4.4.2 remains open for other screen feedback and rendered acceptance.

### 2026-10-29 — Make rescuer cancellation conflicts recoverable (T3.6.3 follow-up)

- Reviewing the new progress/cancellation interaction exposed a stuck 409 path: the cancellation dialog told the rescuer to refresh the mission, but its modal hid the list refresh button, and a successful read did not clear the disabled Confirm latch. Reopening the dialog instead bypassed the latch without reading the server. Added an in-dialog refresh and guarded conflict recovery against failed, pre-write and overlapping reads. Only a successful post-write read permits retry for the original active mission; a replacement still needs a new confirmation. Deferred unit regressions failed before the fix, and the Vue wiring is source-pinned without mounting an SFC. Browser/VM multi-user behavior is unverified.

### 2026-10-29 — Restore rescuer mission status progression (T3.5.2 follow-up)

- Investigated the reported accepted-mission blocker: the ordered rescuer-only PATCH route and transactionally persisted status history existed, but the mission desk had no advance control. Added a manual next-step button from accepted → on the way → arrived → in progress → completed; the persisted response drives the label and completion confirmation. While saving, duplicate progression/cancellation is disabled. A stale list/old login acknowledgement cannot overwrite a committed step; a failed or ambiguous write (including 409) requires a successful server refresh before advancing again. Admin-role accounts cannot use the rescuer route even if their ID matches an assignment. Regression tests cover the API, desk lifecycle, view wiring and Fastify route; rendered two-user/browser and VM acceptance remain open.

### 2026-10-29 — Improve mission panels' light/dark contrast (T4.4.3 partial)

- The live-member and rating eyebrows used a green that fell to 3.18:1 on dark cards; rating stars and star-input borders were also weak in one or both themes. Small labels now use theme-primary ink, stars use light/dark amber, and radio boundaries use theme-muted ink. Contrast measurements and source-pinned regressions failed before the fix and now pass without mounting Vue components. The native keyboard focus/radio behavior is unchanged; no browser/screen-reader or site-wide WCAG AA sign-off is claimed.

### 2026-10-29 — Audit all pages and components for elevation (T4.4.5 follow-up)

- Inventoried all 37 Vue files, both style sheets, Tailwind classes and Vuetify elevations in [UI_ELEVATION_AUDIT.md](UI_ELEVATION_AUDIT.md). Map cards now have a light/dark floating tier above tiles that softens when panels stack in flow; the selected admin SOS card follows its earlier 1279px breakpoint. Gradient heroes and featured auth/welcome cards use theme-aware depth tokens. The flat sign-in button has an action shadow, while tonal sign-out and disabled auth submit stay flat. Intentional SOS/dispatch pulses, peer-dot/focus rings, outlined admin cards and dialogs keep their own treatment. Regressions failed before the edits. No rendered browser/device visual sign-off is claimed.

### 2026-10-29 — Tune remaining interactive elevation and nested cards (T4.4.5 follow-up)

- A broader scan found no Tailwind `shadow-*` classes in templates; the remaining work was CSS and Vuetify elevation. History/proposal list rows used light-only shadows (or none), selected rings could be overridden by a higher-specificity hover shadow, and narrow scroll regions clipped the blur. Item/hover shadows now have light/dark tiers, selected rows keep their rings, and disabled/reduced-motion states and scroll gutters are respected. The broadcast bar is flat only when nested in the dashboard card; map controls use a themed shadow and retain a forced-colors outline. Pure/source-pinned regressions failed before the changes. Rendered visual and high-contrast/device acceptance remains open.

### 2026-10-29 — Make top-level UI surface shadows consistent (T4.4.5 follow-up)

- Audited light/dark surface styles across dashboard, devices, sharing, admin catalogs and mission/history panels. Dashboard/device cards had ineffective custom shadows because Vuetify's `elevation-0` wins with `!important`; admin catalogs and share lists were flat. Added a theme-aware top-level shadow token and explicit surface opt-in, aligning those areas and other main content panels without applying a global shadow to dialogs, nested rows or selection states. Source-level regressions failed before the change; rendered device/browser visual acceptance is still open.

### 2026-10-29 — Scope history playback to its JWT login (T2.2.6 follow-up)

- A direct JWT replacement, including a new session for the same account, previously retained private track coordinates, grants and the playback timer; late reads could refill them. The playback composable now invalidates both reads and clears state synchronously when its account/JWT-session key changes, and will not send a private read while the bearer subject and displayed profile disagree. Same-session bearer renewal and cold recovery keep their read and playback continuity. Failing-before-fix composable regressions and source-pinned view wiring cover the change; browser and two-session acceptance remain open.

### 2026-10-29 — Clear companion-map state on a new JWT login (T2.1.8 follow-up)

- The live companion receiver already cleared coordinates on logout or an account switch, but a new JWT session for the *same account* kept its prior peer positions and old Socket.IO room. It now invalidates pending reads, clears coordinates/count synchronously and closes that room when the JWT session ID changes, then re-reads grants and opens a new room. Same-session bearer renewal keeps the existing view. Focused regressions reproduced the stale coordinates before the fix and cover delayed reads and A→B→A in one tick; real Socket.IO/two-browser acceptance remains P2-A1.

### 2026-10-29 — Bind share forms and lists to the JWT login (T2.1.7 follow-up)

- Replacing a JWT with a different login to the same account previously left the share dialog's recipients/search and ShareLists' rows in place. An old in-flight share submission or revocation could also report success in the new login, while the old share-list read could refill rows. The shared submission fence now checks account + JWT session, and the dialog/list watchers synchronously invalidate and clear their session-bound state. ShareLists only opens its event socket and reads private grants when bearer and profile agree; a matching new login re-reads. Same-session bearer renewal and cold same-owner recovery are preserved. Deferred fence tests reproduced old-session acceptance before the fix; source-pinned tests cover component wiring without mounting `.vue` files. Real browser/two-session behavior is not established (P2-A1).

### 2026-10-29 — Make pending broadcast Start cancellable (T2.1.5 follow-up)

- The broadcast bar stayed in Start state while a priority-device read was pending; tapping again began a second read instead of cancelling, and direct Stop left the first Start free to wake GPS later. A same-tick logout/login with the same bearer could also preserve the pending intent. The app-scoped store now exposes a connecting/Stop state before the read, invalidates the attempt on Stop or synchronous account/session loss, and keeps a same-session token renewal from superseding the awaited read. Focused Pinia regressions reproduced these failures before the fix; no mounted `.vue` or real GPS/browser acceptance is claimed (P2-A1).

### 2026-10-29 — Revoke live GPS consent on a new JWT login (T2.1.5 follow-up)

- The outgoing live broadcaster compared a replacement bearer to the account, not its JWT session. A new login to the same account could therefore keep the previous session's GPS watcher and socket room broadcasting without a new Start tap; even after Stop, the old session's reusable socket could remain connected. The broadcaster now binds active consent to the login session, pauses GPS and closes the socket synchronously on replacement, fences late socket opens, and preserves consent for a same-session token renewal. Tests reproduced active streaming and the retained stopped socket before the fix; A→B→A, in-flight opening, and same-session renewal are also covered. Real GPS/socket and two-browser acceptance remain unverified (P2-A1).

### 2026-10-29 — Bind Active Devices to its JWT login (T2.3.5 follow-up)

- A direct JWT replacement under the same account could retain the previous login's `isCurrentDevice` row and target a stale device for “apply this device to all”; pending reads and bulk posts also survived the change. The screen now fences work by account + JWT session, clears the prior snapshot synchronously and reads again when the new session matches the account. It refuses private reads while the token subject and displayed profile disagree, but preserves rows on same-session bearer renewal and supports cold session recovery. Focused regressions reproduced stale rows and continuing bulk posts before the fix; tests also cover late reads and writes, JWT renewal, subject mismatch and cold recovery. Source-level tests do not establish browser or multi-device acceptance (P2-A1).

### 2026-10-29 — Stop disposed Active Devices work (T2.3.5 follow-up)

- Leaving the settings screen used to stop only its age clock. A late device read could still refill private rows, and an in-progress bulk priority edit could send additional share changes after navigation away. Scope disposal now clears the rows and invalidates pending reads and writes; the first already-started POST may commit, so the next visit reads the server state anew. Two deferred-response regressions failed before the fix, and the existing age-clock test now checks cleared state. Live browser/multi-device acceptance remains open (P2-A1).

### 2026-10-29 — Bind requester cancellation to its original SOS (T3.6.2 follow-up)

- A cancellation dialog could remain open while its `requestId` changed; its Confirm handler then read the *new* ID and could cancel an SOS the requester had not confirmed. Dismissed dialogs also retained a callable confirmation path, and disposal did not invalidate a pending cancellation. The dialog now binds its choice to the opening request and account/JWT session, revokes the prompt synchronously on request/session changes (even an A→B→A same-tick transition), disables confirmation after dismissal, and clears pending state on scope disposal. Same-session bearer renewal stays valid. Focused regressions reproduced changed-ID, dismissed-confirm and unmount failures before the fix; no real-browser or server-concurrency acceptance is claimed.

### 2026-10-29 — Reset abandoned SOS forms on close (T3.2.4 follow-up)

- A user-reported Cancel/close bug came from two paths: the sheet only reset on close after a completed/cancelled request, and the reset routine never restored the default incident type. Unsubmitted drafts now clear on Cancel, X and sheet dismissal; reset returns severity, incident type, description, location/coordinates and photo to initial values and invalidates a late GPS fix. Closing after a confirmed request with a failed photo upload still preserves its request ID and photo-retry path, avoiding a duplicate emergency on reopen. Regression tests failed before the change and now cover the pure close decision, reset state and source-pinned sheet wiring; rendered browser/device acceptance remains unverified.

### 2026-10-29 — Bind rescuer cancellation to the confirmed mission (T3.6.3 follow-up)

- The rescuer dialog reused its previous reason list after a failed reopen, hiding Retry. More seriously, a mission refresh could replace the active mission while the dialog remained open; Confirm then used the *new* mission ID instead of the one for which the rescuer opened the dialog. Reason choices now clear before reloading; the dialog binds to its opening mission, warns on a change, hides stale controls and cannot confirm a replacement until closed and reopened. Late acknowledgement of an old cancellation cannot claim success on the new mission; a verified replacement also clears the old success banner. New regressions failed on all four prior behaviors and pass afterward. This is composable/source-level coverage, not a live browser or concurrent-dispatch acceptance result.

### 2026-10-29 — Remove stale SOS cancellation reasons before reload (T3.6.2 follow-up)

- A reopened requester cancellation dialog kept its previous reason list while reading the current one. If the read failed, the old reasons remained selectable and the Retry button stayed hidden because it only appears with an empty list. The dialog now clears reasons before each fetch; a failed fetch leaves a visible error and Retry without enabling confirmation of an unverified reason. A pure composable test reproduced the stale list before the change and passes after it. The server remains authoritative for reason validity, and no live browser/device acceptance is claimed.

### 2026-10-29 — Refresh the SOS incident picker on reopen (T3.2.4 follow-up)

- The SOS sheet reused a cached incident catalog indefinitely on reopen. Even after a successful manual reload removed the chosen incident type, the hidden old ID stayed in the draft and the enabled submit action could send it. Each open now rechecks the public catalog; a successful refresh keeps an available selection or clears a removed one so the requester explicitly chooses another type. An empty catalog leaves submission disabled, and first load still defaults to the first available type. Two pure composable regressions reproduced the stale selection and missing reopen refresh before the fix. Server-side type validation remains authoritative if a submit races the refresh; real browser/device acceptance remains unverified.

### 2026-10-29 — Navigation GPS cleanup on disposer failure and scope exit (T3.5.6 follow-up)

- A native/test GPS disposer could throw during navigation `stop()`, leaving the last private fix visible and preventing the north-up camera reset and route teardown. The composable also relied on its current view to stop the watch before unmount, rather than cleaning up its own scope. Stop now fences callbacks and clears the fix before best-effort watch disposal, and scoped use automatically stops the watch; a throwing disposer no longer interrupts camera reset. Pure tests reproduced both failures before the edit and pass after it. A faulty bridge may still keep the underlying hardware watch alive if its disposer fails; live device GPS behavior remains unverified.

### 2026-10-29 — Compact global header and reachable logout confirmation (T4.4.1 partial)

- On narrow phones the global brand label competed with theme, inbox, section-menu and logout controls for a single toolbar row. At 420px and below, only the brand mark is shown (its home-link accessible name stays intact), the toolbar gutters and logout padding shrink, and the functional controls remain in place. The logout confirmation now scrolls on short viewports, while its phone actions stack as full-width wrapping targets of at least 44px without changing submission locks. Source-pinned regressions failed on the original layout and now pass; they do not establish rendered widths, high zoom, physical keyboard use or site-wide responsive acceptance. T4.4.1 remains open.

### 2026-10-29 — Retry map cache registration after a transient failure (T1.5.4 follow-up)

- Service-worker registration failures were swallowed into a permanently memoized fulfilled promise: a later map mount would not retry after connectivity or permission recovered. Registration now clears the failed attempt while still swallowing its rejection so map startup and the app's fire-and-forget call remain non-blocking; concurrent callers share one attempt, and success stays memoized. A synchronous `register()` throw is also handled, and the 1.5-second readiness timer is cleared if readiness settles early. Regression tests reproduced the retry and timer issues before the fix and pass afterward. Browser/offline recovery and P1-A1 outage acceptance remain unverified.

### 2026-10-29 — Map companion label contrast and keyboard scroll (T4.4.3 partial)

- The map toolbar's small location heading and the live-companion panel's heading/peer-age labels used `#718584` on translucent light cards, falling near 3.4–3.5:1 against a black underlying tile. The light foreground is now `#536d6c` (at least 4.8:1 on those composited cards); the existing dark-mode foregrounds remain. The companion list is capped at 11rem but had no focus target for keyboard-only scrolling. It now has a named, focusable `<ul>` with an explicit list role (to retain semantics despite `list-style: none`) and an inset 2px theme-primary focus outline. A no-SFC-mount regression reproduces both failures and checks light/dark text and focus contrast; no browser-rendered map, physical keyboard or screen-reader acceptance is claimed, and T4.4.3 remains open.

### 2026-10-29 — Map warning Retry now retries failed startup and config (T4.4.2 partial)

- MapCanvas showed a Retry action after a lazy MapLibre import or constructor failure, but the handler immediately returned when the map instance did not exist. After `/map-config` failure, Retry only reloaded the style, leaving the runtime bounds/zoom request untried. Retry now starts a new, coalesced initialization attempt if needed, re-fetches failed config on an existing map, and resets notice throttling so a quick second failure remains visible. Failed control setup removes the partial instance; late startup or config responses cannot restore an unmounted map. Pure deferred retry tests and source-pinned wiring tests failed on the prior startup behavior and now pass; they do not substitute for real browser/offline map verification or site-wide T4.4.2 sign-off.

### 2026-10-29 — Scrollable admin catalog dialogs (T4.4.1 partial)

- The incident-type form, rescuer-category form, and category-membership dialog were persistent but not scrollable. On short viewports, a long form or many incident types/members could push Save/Add/Close out of reach. All three now let the card body scroll independently of the title and action footer using Vuetify's scrollable dialog behavior. Existing phone action stacking, handlers and save locks stay intact. A no-SFC-mount source-pinned regression failed before the change and passes after it; real phone/keyboard/browser acceptance and the remaining site-wide responsive audit are still open.

### 2026-10-29 — Short-viewport reverse-address sheet (T4.4.1 partial)

- Took the first locally actionable open UI task while VM/browser-dependent acceptance remains blocked. The map's reverse-address bottom sheet had an unbounded card and vertically resizable address field; on a short phone viewport, long addresses or large text could push the copy/retry content and close control out of reach. The sheet now caps its height to the dynamic viewport (with a legacy `vh` fallback and safe-area allowance), keeps the 44px close target outside a scrolling body, bounds the address field, and gives copy/retry controls 44px touch height. A source-pinned test failed before the layout change and now passes; typecheck/build and client unit checks cover structure, **not** rendered pixels, mobile keyboard behavior, or full responsive sign-off. T4.4.1 remains open for other screens and actual phone/tablet/browser acceptance.

### 2026-10-29 — Expired-share notification failure isolation and receiver recovery (T2.1.6/T2.1.8 follow-up)

- After the minute sweep committed timed-share expiries, a throwing Socket.IO room emit aborted notices to every later recipient *and* skipped priority-device pin repair. Retrying the sweep could not replay the missed events because the rows were already revoked; a connected map with no reconnect could keep an expired peer marker until its 30-minute silence cutoff. The sweep now attempts each notification independently, aggregates delivery failures into a warning and still runs pin repair in the same pass. While a map has active grants, the receiver also rechecks `sharedWithMe` at most once per minute (after any pending read), removing grants missed by a socket event; immediate `share-ended` handling remains unchanged. Focused regressions reproduced both the blocked repair and the stuck map before the fix. These are best-effort notifications and bounded read-side reconciliation, **not** a durable event outbox; live two-browser/VM P2-A1 acceptance remains open.

### 2026-10-29 — Photon geocoding transport log privacy (T4.1.2/T4.1.3 follow-up)

- The local Map Server logged the full Photon GET URL and fetch exception message on `/geocode` or `/reverse` transport failure, exposing place-search text or exact reverse-geocode coordinates to operator logs. Even an upstream HTTP error body could echo those private inputs back into diagnostics. Failure logs now contain only the query-free Photon service/path, HTTP status or safe timeout/socket code, and unreadable-body status; the caller's existing 503/502 responses are unchanged. Node regressions reproduced both the URL/exception leak and the upstream-body echo before the fix, then passed. This covers gateway-generated failure diagnostics, not external proxy/Photon access logs or VM/browser acceptance.

### 2026-10-29 — Recheck location recipients after persistence (T2.1.5 follow-up)

- Live location used the share list fetched *before* `recordFix` to choose Socket.IO and REST recipients. A revocation, suspension, expiry, or priority-device change committed while the database write was in flight could still receive the newly committed fix. The service now intersects the original recipient set with a fresh active-share/device check immediately after persistence, without including grants created mid-update. If that post-write read fails, it logs the failure, sends to no peers, and acknowledges the committed fix rather than inviting a duplicate write; actual persistence failures still reject. Deferred-write service regressions reproduced the stale recipient before the fix; a Fastify route regression covers the shared REST fan-out path. This narrows the write-window race, but is not an atomic guarantee against a revocation *after* the recheck; live socket/VM acceptance (P2-A1/P2-A2) remains open.

### 2026-10-28 — Live mission marker and GPS session boundary (T3.5.7 follow-up)

- The mission live panel's deferred watchers retained another mission/account's private coordinates and an active consented GPS watch until the next Vue tick after logout, mission switch or session replacement. A null token followed by a new login in that tick could coalesce the logout boundary; a new JWT subject could also open a room while the cached profile still belonged to the old account. Mission/owner/token transitions now clear the marker/watch and close the socket synchronously, and a bearer with a different subject waits for its matching profile before connecting. Same-session bearer rotation keeps consent. Pure composable regressions reproduced the immediate stale-marker cases before the fix and cover direct same-account session replacement and delayed profile change. No Vue SFC mount or browser/VM acceptance performed.

### 2026-10-28 — Socket location post-commit acknowledgement (T2.1.5 follow-up)

- Socket `location:update` persisted an accepted fix before refreshing optional session presence and emitting to rooms. If either step threw, its outer handler reported `SERVICE_UNAVAILABLE` for a committed write, encouraging duplicate retries; a failed presence touch or one room's emit also blocked the remaining notifications. Post-persistence failures now log warnings, continue independent room deliveries, and acknowledge the committed fix. Regressions reproduced both failures before the change; a real `applyUpdate` failure still produces the existing unavailable ack with no emission. Focused and full server tests/typechecks passed; live socket/VM acceptance (P2-A1/P2-A2) remains open.

### 2026-10-28 — REST location fallback post-commit fan-out (T2.1.5 follow-up)

- The deprecated `POST /_user/location/update` persisted a fix, then allowed a throwing Socket.IO fan-out adapter to turn the response into a 500. A client retry could append the same history point despite the first write succeeding. The route now logs fan-out failure after persistence and acknowledges the committed fix; persistence failure still returns 500 and emits nothing. A Fastify route regression reproduced the 500-after-write before the fix and tests both boundaries. Live socket/VM acceptance (P2-A1/P2-A2) remains open.

### 2026-10-28 — Cached profile isolation on cookie restore (T1.2.7 follow-up)

- On a cold tab restore, `sessionStorage` could supply account A's cached profile before the HttpOnly refresh cookie returned a bearer for account B. With no previous bearer to compare, the existing session-change fence left A visible next to B's token; a temporary `/_user/me` failure kept that mismatch indefinitely. Cookie restoration now checks a JWT's subject/session claims against the cached profile and clears mismatched/unverifiable cached identity before installing the bearer. A matching cached owner remains available during a transient same-account profile outage. Pure auth-store regressions reproduced the mismatch before the fix; no live two-tab/browser acceptance performed.

### 2026-10-28 — Cross-tab refresh-cookie session boundary (T1.2.7 follow-up)

- A different tab could replace the shared refresh cookie while this tab still held an old JWT. On its next refresh, the auth store added the new session's bearer to its token set without removing the old one: a pending 401 POST could then be retried under the new account (or a new session of the same account). The refresher now permits a retry only when both JWTs identify the same account **and** session; an actual session change invalidates old pending auth operations and clears the old profile/categories *before* exposing the new bearer. A failed new-profile read cannot leave the old account shown beside the new bearer. Deferred tests reproduced the write replay and stale-profile paths before their respective fixes; same-session renewal still retries. Opaque test/legacy tokens retain their prior in-store fence; live cross-tab/browser acceptance remains unverified.

### 2026-10-28 — Mission timeline direct-session replacement boundary (T3.5.8 follow-up)

- Timeline rows and the live mission socket were cleared on token loss or owner/mission change, but replacing a bearer directly with a *different session for the same account* kept both attached and displayed the old session's rows. The timeline now keys its lifecycle to the mission and account/session claims: a new session closes the old room and clears the rows synchronously; a same-session renewal retains them. A bearer with a different subject is suppressed until the matching profile arrives, including while an old read is in flight. Pure composable regressions reproduced the direct replacement failure before the fix and cover account-profile lag. No Vue SFC was mounted or browser/VM acceptance performed.

### 2026-10-28 — Recipient-picker same-tick search invalidation (T2.1.7 follow-up)

- The recipient search invalidated old candidates with Vue's deferred watchers: directly after changing the term/filter, the old list was still selectable until the next tick. Pressing Enter in that gap started a read which the term watcher then cancelled and repeated after 300 ms, wasting a request and delaying the requested result. Term and filter watchers now invalidate synchronously, while ordinary typing still debounces. Pure composable regressions reproduced both defects before the fix; no Vue SFC was mounted or browser/VM interaction acceptance performed.

### 2026-10-28 — Live companion share-list retry failure (T2.1.8 follow-up)

- After a share-list 401 refreshed the bearer, a second failed read was silently discarded: the retry had superseded the original read's generation, so the map never showed its retry/error state even though no share list was verified. The receiver now reports that failure only if the retried bearer and read still belong to the current account; a newer successful read cannot be overwritten by an older failed retry. Focused pure composable tests reproduced the missing error before the fix and cover the superseding-read race. No Vue SFC was mounted or live two-browser/VM acceptance performed; P2-A1 remains open.

### 2026-10-28 — SOS GPS setup exception fallback (T3.2.4 follow-up)

- A synchronous exception while obtaining the geolocation provider or starting `getCurrentPosition()` escaped the SOS sheet's GPS request; the latter also left its locating indicator stuck instead of offering manual incident placement. Both paths now settle locating and show a manual map/coordinate fallback without discarding the draft. Pure composable regressions reproduced the thrown-provider and thrown-watch cases before the fix and confirm manual selection still works. No Vue SFC was mounted or browser/device permission-policy acceptance performed.

### 2026-10-28 — Active-device priority write serialization (T2.3.5 follow-up)

- Single-share and bulk priority changes only marked themselves busy **after** awaiting session recovery. Rapid taps could send contradictory `POST /_user/location/share` writes for the same share, with response order overriding the user's intended device; a bulk change could overlap a row change as well. A shared panel-wide write guard now locks before the first await, stays active through the post-write refresh, refuses competing row/bulk/current-device edits, and releases only the same session's lock. Controls reflect the lock. Deferred-session regressions failed before the fix and now verify one write sequence at a time. No Vue SFC was mounted or live multi-device/browser acceptance performed; P2-A1 and the broader T4.4.2 feedback audit remain open.

### 2026-10-28 — Admin dispatch mission-list feedback (T4.4.2 partial)

- The selected SOS's mission-history area silently disappeared while its read was pending or failed, making an unverified empty list look like no missions. The panel now shows a labeled loading skeleton, an explicit retryable failure, and a “no missions yet” message only after a successful empty read. A small composable owns the scoped read, clears the previous selection on request/token/status changes, and ignores late replies and unmount; pure deferred tests and a source-pinned view test cover these states without mounting a Vue SFC. Other T4.4.2 screens, toasts, eligible optimistic writes/rollback, and real browser/device acceptance remain open.

### 2026-10-28 — Navigation GPS consent on same-tick account change (T3.5.6 follow-up)

- Route-follow navigation deferred its owner/mission/route watcher until Vue's next tick. If an account changed away and back within that tick, the watcher could miss both transitions and keep the earlier GPS watch and map-follow consent running. It now stops the watch synchronously when any of those inputs changes; a new login needs an explicit Start, and old callbacks cannot move the map. A pure composable regression failed before the fix and verifies immediate cleanup and same-tick logout/login isolation. No Vue SFC was mounted or browser/device GPS timing verified.

### 2026-10-28 — Requester history cancellation state across pages (T3.7.1 follow-up)

- A successful cancellation or rejected confirmation could leave its `cancelled`/`blocked` dialog state on the next SOS request when a page load or deep link auto-selected a different request without calling `choose()`. In particular, the new active request appeared cancelled and lost its Cancel action. Successful reads now reset cancellation state only when the selected request ID changes; refreshing the same request or failing a page read keeps the last-known confirmation. A pure composable regression failed before the fix and covers all three cases. No Vue SFC was mounted or browser/device acceptance performed.

### 2026-10-28 — Mission timeline synchronous session boundary (T3.5.8 follow-up)

- A mounted mission timeline retained the previous session's private steps and socket until Vue's deferred watcher ran after logout or mission selection. If a second login replaced a null token within the same tick, the watcher coalesced both changes and reused the old socket/rows indefinitely rather than loading the new session. The token, owner and mission watchers now invalidate rows, in-flight reads, fallback and socket synchronously at the boundary; same-session bearer renewal still updates the existing socket. Pure composable regressions reproduced the immediate stale rows before the change. No Vue SFC was mounted or browser/VM privacy timing verified.

### 2026-10-28 — Live broadcast transport-start failure (T2.1.5 follow-up)

- If opening the realtime module/socket rejected after Start woke GPS, the async start rejected without clearing the location watcher or 4-second ticker, leaving the bar stuck at “connecting.” A synchronous `connect()` throw did the same, even if it had already emitted `connect`. The broadcaster now stops GPS/ticker, closes an attached failed client, and shows a retryable connection error; an old failed open after Stop/restart cannot interrupt the newer broadcast. Focused regressions failed before the fix and verify cleanup, retry, and attempt isolation. No Vue SFC was mounted or two-browser/target-VM acceptance performed; P2-A1 remains open.

### 2026-10-28 — Requester SOS history synchronous account boundary (T3.7.1 follow-up)

- A mounted requester history could keep the previous account's private requests, selected case, count and cancellation confirmation until the view's deferred auth watcher ran. The history composable now resets synchronously on token loss or owner change, invalidating pending list replies and cancellation state; the view's owner watcher also clears its mission/photo state in the same turn. Same-account bearer renewal preserves the current snapshot. Pure deferred/composable and source-pinned regressions failed before the fix. No Vue SFC was mounted or live browser/VM privacy timing verified.

### 2026-10-28 — Short-viewport share revoke confirmation (T4.4.1 partial)

- The live/history revoke confirmation did not scroll its content and kept a one-line footer; on a short or narrow phone, a long recipient label and privacy warning could push Back/Confirm beyond reach. The confirmation body now scrolls, long text wraps, and phone actions stack as full-width wrapping 44px-minimum targets. Existing disabled/loading and server-acknowledged revoke wiring are unchanged. A source-pinned regression failed before the change; this does not establish rendered phone/keyboard, screen-reader, or site-wide responsive acceptance. T4.4.1 remains open.

### 2026-10-28 — Rescuer history synchronous account privacy boundary (T3.7.1 follow-up)

- The mission-history view's default-scheduled account watcher left the previous rescuer's private list, detail and verified count visible until Vue's next tick after token loss/account switch. The history composable now synchronously resets on token loss or owner change, invalidating late list/detail replies without requiring a new read, while a same-account bearer renewal preserves the current snapshot. Pure composable regressions failed before the fix and now cover immediate clearing, pending responses, owner switches and renewal. No Vue SFC mount or real-browser timing/VM acceptance is claimed.

### 2026-10-28 — Rescuer mission history unverified counts and retained rows (T4.4.2 bug review)

- The rescuer history page claimed “0 missions” before its first list read succeeded and kept a cached count and pagination looking current after a failed refresh. It now verifies the count and empty state only after a successful list read, labels retained rows as potentially stale while refreshing or failed, hides unverified pagination, and keeps retry plus selected details available. Pure composable and source-pinned regressions failed before the fix and now cover first failure, pending refresh, refresh failure, recovery, and reset. No Vue SFC was mounted; real browser/device feedback acceptance and the broader T4.4.2 audit remain open.

### 2026-10-28 — Active-device priority writes on session-check failure (T4.4.2 bug review)

- A failed `ensureSession()` before a single-share or bulk priority edit rejected out of the composable; the panel invokes both as `void`, so no write happened and no error was shown. Both paths now resolve without posting and show a localized error for the current account. A delayed failure from an old account leaves the new session's sign-in warning untouched. Focused unit regressions reproduced all three paths before the fix and pass afterward. No Vue SFC was mounted or browser/device acceptance claimed; the wider feedback/toast audit remains open.

### 2026-10-28 — History playback 401 retry after account switch (T2.2.6 follow-up)

- A history-window or received-grant-list read that returned 401 could wait on session recovery, then replay its old request with a different account's bearer even after logout and a new read had replaced it. The eventual stale response was already ignored, but the extra cross-session request should not be sent. Both recovery paths now recheck their read generation immediately after `refreshSession()` and before any retry. Deferred composable tests reproduced both unwanted requests before the fix and now verify they are absent; a current same-session bearer renewal still retries both reads successfully. Server-side ownership checks remain authoritative. No Vue SFC was mounted or browser/VM acceptance claimed.

### 2026-10-28 — History-playback overlay label and input contrast (T4.4.3 partial)

- The small heading and manual date-field labels in the translucent map playback card used `#718584`, only about 3.9:1 even over solid white; the typed date text inherited that color. The field boundary also blended into both themes. The light labels now use `#536d6c`, preserving existing readable dark overrides; the date input border uses theme-aware muted ink and gets a distinct visible keyboard focus outline. Source-pinned checks failed before the change and verify small-text 4.5:1 and input-boundary/focus 3:1 against a conservative black/white tile beneath the overlay. No Vue SFC was mounted, no live map/browser was tested, and the wider WCAG/site audit remains open.

### 2026-10-28 — Share privacy flow dark-theme contrast (T4.4.3 partial)

- The location-share dialog and list cards used light-only dark ink for headings, row states, preset labels, input text and the submission status; on the dark surface, representative colors measured only 1.24:1–3.1:1, below the 4.5:1 small-text target. These foregrounds now use existing theme-aware text/muted/success tokens, with a dark warning override and a visible keyboard focus outline; the confirmed preset retains its white-on-green state. Source-pinned CSS/contrast regressions failed before the fix and cover both palette surfaces, not rendered pixel blending, keyboard or screen-reader behavior, or a site-wide WCAG audit. T4.4.3 stays open.

### 2026-10-28 — Location-share revocation session boundary (T4.4.2 bug review)

- A delayed live/history revoke could remove a new account's row, report an old error, or emit a stale change after logout, account switch, or unmount. Revocation now captures an owner/generation fence and checks it after session refresh, the server write, and the follow-up read; reset synchronously invalidates pending work and clears its spinner, while unmount invalidates it too. Other revoke buttons stay disabled during a pending write. Removal still happens **only after** server acknowledgment, and same-session bearer renewal remains valid. A source-pinned regression failed before the fix; pure deferred lifecycle tests, client checks and build cover the bounded wiring without mounting Vue. Real browser/device acceptance and the broader feedback audit remain open.

### 2026-10-28 — Location-share submission session boundary (T4.4.2 bug review)

- A delayed share write or priority-device lookup could still update a closed dialog, emit success after navigation/logout, or reopen the device chooser for a different account. A generation/owner fence now checks every awaited stage of live and history submissions and the 409 device lookup; close, unmount, token loss, and account change invalidate it synchronously, with old recipient selection cleared on account switch. Closing/search cancellation also immediately invalidates and clears pending recipient search results, even if a response ignores abort; a late 401 recovery no longer replays the old query with a new session. Same-session bearer renewal remains allowed. A source-pinned wiring regression and a deferred recipient-search test failed before the fix; pure fence tests cover the new guard (including delayed close/reopen). No Vue SFC was mounted or browser/device acceptance claimed. Broader feedback and VM checks remain open.

### 2026-10-28 — Location-share device chooser on short phones (T4.4.1 partial)

- The secondary persistent device chooser can contain up to 50 active-device radio options but did not scroll its body separately from the confirmation buttons. Short phone viewports could push later choices and Continue/Cancel out of reach. It now uses a scrollable dialog/body, wraps long device labels, and stacks the phone actions as full-width, wrapping 44px-minimum targets. Device-selection, cancel and submit guards are unchanged. A source-pinned regression failed before the change; focused tests, typecheck and build check structure only, not rendered short-viewport, keyboard-open or screen-reader acceptance. The broader responsive/bottom-sheet audit remains open.

### 2026-10-28 — Requester SOS history unverified counts and retained rows (T4.4.2 bug review)

- A failed first history read still rendered a "0 requests" count, and a failed refresh left cached rows, pagination and cancellable status looking current. The history now verifies the count/empty state only after a successful read, labels retained rows as potentially stale, hides pagination and disables cancellation while the snapshot is loading or failed, and keeps retry plus previously selected data. Pure composable and source-pinned regressions reproduced the unverified state before the fix and now cover first failure, pending read, refresh failure, recovery and reset. No Vue SFC was mounted; broader feedback/toasts and real browser/device acceptance remain open.

### 2026-10-28 — Admin SOS responder search verification feedback (T4.4.2 partial)

- The nearest-responder card could claim zero eligible rescuers before a first successful read or after a failed search, even while showing a read-error banner. A current result is now marked verified only after a successful request; the panel distinguishes loading, failed-with-retry, verified empty, populated and unverified states, hiding old candidates during refresh while keeping separately selected rescuer chips for server-validated dispatch. Deferred Pinia and source-pinned tests failed before the fix and now cover failure, retry, query change and success without mounting Vue. The broader site-wide feedback/toasts/optimistic-write task and real browser/device accessibility review remain open.

### 2026-10-28 — Admin SOS queue spinner after confirmed dispatch (T4.4.2 bug review)

- A successful manual dispatch or quick redispatch invalidated any older queue read, but that read's generation-guarded `finally` could no longer turn off its spinner. The console could remain in a perpetual loading/unverified state even after the ignored response settled. Confirmed dispatches now end the invalidated loading state and withhold queue verification until a fresh successful read. Both paths failed new deferred-response Pinia regressions before the fix; the tests also confirm a late old response cannot undo the dispatched status and retry can verify the queue. Browser/device acceptance and broader T4.4.2 feedback coverage remain open.

### 2026-10-28 — Admin SOS queue verification and retry feedback (T4.4.2 partial)

- The dispatch queue used to claim there were no active SOS requests before its first successful read or after a failed one; cached/socket rows and counts could appear authoritative even if a read was incomplete. The queue now distinguishes loading, unverified/failed, verified-empty and retained-row states, offers retry, and shows counts only when the latest full response covers the visible rows (including the shell's pending count only for pending/all filters). Filter labels no longer publish stale counts. Pinia tests cover the initial/failed/retried reads, 100-row truncation, and retained rows omitted from a later successful snapshot; source-pinned tests check the view/shell without mounting Vue. This does not replace real browser/device verification or sign off site-wide feedback/toasts/optimistic updates.

### 2026-10-28 — Rescuer offer confirmation on short/narrow phones (T4.4.1 partial)

- The persistent proposal confirmation did not scroll its content, and its optional 500-character decline reason auto-grew above an unwrapped actions row. On a short or narrow viewport this could make the accept/decline confirmation hard to reach. Its body is now scrollable with a three-row textarea, and phone actions stack as full-width, wrapping 44px-minimum targets. Disabled/loading and decision callbacks remain unchanged. A source-pinned regression failed before the edit; no actual phone, keyboard-open viewport, rendered browser, or site-wide responsive acceptance is claimed. T4.4.1 remains open.

### 2026-10-28 — Requester rating account/mission boundary fix (T3.7.4 follow-up)

- Switching selected missions while the rating panel stayed mounted left the previous mission's score or drafted comment visible until Vue's deferred watcher ran. A JWT belonging to another requester could also leave the form enabled under the stale displayed account. The rating model now synchronously invalidates form state and in-flight replies on mission, owner, token-loss or JWT session changes and refuses mismatched subjects; same-session bearer renewal keeps the draft and in-flight submit. Focused regressions reproduced three failures before the fix and now cover immediate cleanup, late replies, session mismatch and token renewal. Server ownership remains authoritative; this is not a mounted/browser/VM acceptance run.

### 2026-10-28 — Completed-mission rating keyboard semantics (T4.4.3 partial)

- The star picker represented one score as five independently pressed buttons, adding five keyboard Tab stops without native radio arrow-key selection. Its stars are now labels for an instance-unique native radio group with a fieldset/legend, accessible score names and a visible focus ring. The 48px targets, disabled-on-submit behavior and existing score validation are preserved. Source-pinned regressions failed before the edit and typechecks/build validate the template; this is not a mounted Vue, browser, screen-reader, or site-wide WCAG AA sign-off. T4.4.3 remains open.

### 2026-10-28 — Mission presence account/session boundary fix (T4.3.3 follow-up)

- A mounted mission panel could show the previous mission/account's private online badge until Vue's deferred watcher ran; it also polled under a JWT subject that did not match the displayed owner and restarted its poll on a same-session bearer renewal. The presence model now synchronously clears/aborts on mission, account, token-loss or JWT session changes, refuses a mismatched bearer and retains its snapshot/poll timer on ordinary renewal. Injected-read regressions failed before the fix and now cover immediate cleanup, late replies, subject gating, session switches and same-session rotation. Server authorization is unchanged, and these are not rendered browser/VM acceptance tests.

### 2026-10-28 — Admin user search stale-results feedback (T4.4.2 partial)

- Editing the admin user search left the previous query's rows and status switches actionable until a debounced read began, and a pending old response could arrive during that interval. Search now synchronously clears/invalidates old rows and counts, shows loading through the 300 ms debounce, and skips an immediate read when resetting pagination. Inputs remain editable, while status changes are guarded during loading. Source-pinned regressions failed before the fix and pass afterward; no Vue components were mounted and no rendered browser/device acceptance is claimed. T4.4.2 remains open.

### 2026-10-28 — Rescuer mission desk account-boundary fix (T3.6.3 follow-up)

- The mounted mission desk kept private mission rows and cancellation state when its token disappeared while the profile remained loaded; a changed owner could see old rows until Vue's next tick. The desk now synchronously clears its state and invalidates in-flight reads/cancellations when the owner, token availability, or JWT session changes. The view stops routes and only reloads after the bearer subject/session matches the displayed account; same-session bearer renewal preserves the panel. Deferred client regressions failed before the fix and now cover late replies, token loss, owner switch, session renewal and mismatch. These unit and source-pinned view tests do not establish browser/device behavior or server authorization (which remains authoritative).

### 2026-10-28 — T4.4.4 SOS picker marker import (partial)

- The SOS picker requested MapLibre a second time to construct its draggable pin, despite `MapCanvas` already loading the module and emitting its `Marker` constructor on ready. The picker now uses that ready constructor, preserving GPS/manual pin updates, drag-to-select and close/unmount cleanup without the extra async import. A source-pinned regression failed before the change; typechecks and a production build validate the wiring. This is not a measured load-time, bundle-size, or real-browser/device acceptance claim, and T4.4.4 remains open.

### 2026-10-28 — Admin category member removal feedback (T4.4.2 partial)

- A confirmed member removal followed by a failed list refresh still showed the removed person in the category and members dialog while announcing success, allowing a second DELETE. After server acknowledgement, the page now removes only that member from both known snapshots before its best-effort re-read; a failed DELETE leaves them unchanged, and a failed re-read still gets its own error. A source-pinned ordering regression failed before the fix and a pure transform test covers preserved members/other categories; no Vue component was mounted and no browser/device or site-wide T4.4.2 acceptance is claimed.

### 2026-10-28 — SOS incident catalog retry race (T3.2.4 follow-up)

- When the incident-type catalog loader was called again before an earlier read settled, an older reply could replace the latest picker list or show an error after a newer successful read. The loader now applies success, failure and loading completion only for its latest request. Deferred-response tests reproduced both composable races before the fix and verify that an older reply cannot mark a newer pending read as finished. The current sheet normally hides Retry while loading; these tests do not establish a reproduced browser double-click. The public catalog API and live/browser SOS acceptance are unchanged.

### 2026-10-28 — T4.4.3 SOS severity keyboard semantics (partial)

- The severity cards in the SOS form advertised ARIA radios but were plain buttons, so their keyboard interaction did not follow radio-group conventions. The form now uses a named native radio group in a fieldset with a legend, preserving the same card labels and selected state, disabling choices during submission and outlining the focused card. A source-pinned regression failed before the change; client typecheck/build and unit checks cover the markup but not rendered keyboard or screen-reader behavior. Site-wide WCAG AA and device/browser acceptance remain open.

### 2026-10-28 — T4.4.2 admin category member-search feedback (partial)

- Editing the admin category member search used to leave the previous query's candidates selectable through a 300 ms debounce; a late earlier response could also repopulate the wrong list. A small testable search composable now invalidates candidates and errors on each edit, signals loading during debounce, excludes inactive/already-assigned users, and ignores older replies after edits, dialog close, category change or unmount. The view still uses the authenticated admin search endpoint and preserves its assignment controls. Deferred-response tests and source wiring checks cover this picker without mounting Vue; other screens, toasts, eligible optimistic writes and browser/device feedback acceptance remain open.

### 2026-10-28 — Broadcast priority snapshot account-boundary bug (T2.3.6 follow-up)

- A pending device/share read could refill the broadcast bar's read-only priority snapshot after logout; on an account switch, old rows remained visible until refresh and could overwrite the new owner's result. The composable now clears synchronously when the authenticated owner, token subject or session changes, and invalidates in-flight reads on clear or a newer refresh. The store waits for a matching owner and bearer before reading, and refreshes when the new profile arrives; normal same-session bearer renewal and retaining a last-good answer on a same-session read failure remain intact. Deferred-response tests reproduced the logout/account bugs before the fix and cover concurrent reads and session renewal. This does not constitute VM/two-browser P2-A1 acceptance; server-side priority enforcement is unchanged.

### 2026-10-28 — T4.4.1 mobile cancellation dialogs (partial)

- The rescuer's mission-cancellation dialog and the requester's SOS-cancellation dialog each had long Persian action labels beside a spacer and a Back button; on narrow screens the confirmation could crowd or clip, and a short viewport had no explicit scrollable reason body. Both dialogs now use Vuetify's scrollable dialog/card-text layout, and below 600px stack full-width, wrapping, minimum-44px actions without the spacer. Existing reason validation, loading locks and confirmation handlers are unchanged. Source-pinned regressions failed before the change, and client typechecks/build pass; this is not a rendered phone/tablet test or a site-wide responsive/bottom-sheet sign-off.

### 2026-10-28 — Live-broadcast consent and account-boundary bug (T2.1.5 follow-up)

- Starting a location broadcast did not lock until after session recovery: a second tap duplicated the attempt, while Stop during the wait could still wake GPS and connect later. The app-scoped store had an earlier priority-device read, so an old account's Start tap could also cross into a new account/session before reaching the composable. The broadcaster now locks before awaiting, discards pending starts and socket opens after Stop/disposal, and synchronously stops GPS/closes the socket if the authenticated owner or JWT subject changes. The store checks owner and session ID again after the priority read; a normal token renewal within the same session preserves explicit consent. Deferred composable regressions reproduced cancelled/duplicate starts and owner transitions before the fix; Pinia regressions cover the priority-read handoff and a source-pinned check guards production owner wiring. This is not live P2-A1 two-browser/VM acceptance; the server remains authoritative for JWT, device and share authorization.

### 2026-10-28 — Live-companion account-boundary privacy bug (T2.1.8 follow-up)

- The live-companion receiver only watched the access token. A mounted map could keep showing account A's private peer locations and remain subscribed to A's socket when account B replaced the authenticated profile, including during a cross-tab refresh-cookie switch; sign-out clearing was deferred to Vue's watcher tick. It now requires the current owner, clears coordinates/count and closes the socket synchronously on owner change or token loss, ignores old reads/opens/reconnects, and defers new owner reads until the production JWT subject matches the loaded profile. The decoded subject only prevents an inconsistent UI; the server still verifies the token and share authorization. Deferred tests reproduced old-coordinate exposure and stale socket timing before the fix and now cover late responses, token-before-profile order, same-owner token rotation and unmount. These are injected client tests, not P2-A1's target-VM/two-browser acceptance.

### 2026-10-28 — T4.4.4 proposal-inbox MapLibre startup (partial)

- The proposal inbox route previously had a runtime `Marker` import, causing its production chunk to statically import MapLibre (~1.09 MB) even before an offer or accepted-mission map was ready. Both map ready paths now use the `Marker` constructor emitted after `MapCanvas` loads; the accepted view retains that constructor for subsequent GPS updates and clears it at the account/unmount boundary. A source-pinned test reproduced the eager import before the fix, while before/after Vite chunks show the static MapLibre dependency removed from `UserProposalsView` and its route preload set. This is a dependency-graph improvement, not a measured <2s map paint, <500ms GPS, virtual-scroll or browser/device sign-off. T4.4.4 remains open.

### 2026-10-28 — SOS submission account-boundary bug (T3.2.4 follow-up)

- The SOS sheet previously awaited session recovery and then sent an old draft with whichever bearer was current. If the account changed during that wait, the new account could file the previous user's emergency; an in-flight create or photo upload could also update the abandoned sheet and continue uploading after logout. The composable now requires the authenticated owner, invalidates queued work synchronously on account/token loss or sheet disposal, checks ownership after each async step, and keeps older `finally` blocks from unlocking a new submission. Same-owner token renewal continues to work. Deferred-response regressions reproduced the cross-account create, retry and unmount paths before the fix, plus coverage for late create/upload responses and concurrent session changes. A create sent before logout can still commit server-side and must be checked in that account's history; no browser/device acceptance is claimed.

### 2026-10-28 — Proposal inbox stale-refresh feedback (T4.4.2 partial)

- On a failed inbox refresh, previously loaded offer rows remained visible but the page gave no failure warning; the hero, bell and navigation displayed the cached count as if it were current. The page now marks retained rows as potentially stale with Retry and suppresses unverified counts on those surfaces, including after a failed first read. A server-confirmed acceptance clears the old failure flag even though no further list read runs in the accepted state. Store-state and source-pinned tests reproduced the missing warning and lingering accepted-state failure before the fixes; no Vue mounting or browser/device acceptance is claimed. Broader T4.4.2 feedback/toast work remains open.

### 2026-10-28 — Proposal inbox empty last-page bug (T4.4.2 partial)

- When the only offer on page 2 was declined, the next API read could return `items: []`, `total: 20`, `totalPages: 1`. The inbox stayed on page 2 and announced there were no pending offers even though page 1 held 20. Refresh now rewinds to the last valid page with bounded requests; a genuinely empty inbox resets to page 1, while a failed rewind shows a retryable error instead of a false empty state. The store test reproduced the original 21→20 failure before the fix and covers external expiry and rewind failure after it. No browser/device acceptance or site-wide T4.4.2 completion is claimed.

### 2026-10-28 — Rescuer history linked-detail failure and retry (T4.4.2 partial)

- A deep link to a mission outside the rescuer history page could fail at its separate detail request after the list had loaded. The UI then claimed that the entire history failed and offered a generic list retry that lost the linked ID. It now keeps the list and a fallback selection, shows a distinct retryable linked-detail warning, and retries that exact ID. A 404 or foreign detail remains a non-retryable access warning; switching selection or account clears the retry and late failures cannot overwrite a newer choice. Focused deferred-response tests reproduced the bug before the fix and pass after it; no Vue mounting or live browser acceptance is claimed. The wider T4.4.2 audit stays open.

### 2026-10-28 — T4.4.4 rescuer route MapLibre startup (partial)

- The rescuer mission route still had a runtime `Marker` import, pulling the ~1.09 MB MapLibre chunk into its route graph even with no active mission and no route map. Its incident/rescuer/waypoint markers now use the constructor supplied by `MapCanvas` on ready; existing marker labels, cleanup, GPS camera behavior and style-layer restoration remain wired. A source-pinned regression failed before the fix, and before/after builds show the `UserMissionView` chunk no longer statically references MapLibre. The proposal inbox still has another eager import. This is bundle-graph evidence, not <2s map paint, <500ms GPS, virtual scroll or browser/device acceptance. T4.4.4 remains open.

### 2026-10-28 — T4.4.4 mission live-panel MapLibre startup (partial)

- The live mission panel's runtime `Marker` import pulled MapLibre (~1.09 MB) into the requester SOS history and admin dispatch route graphs even before their canvases mounted; the requester route could load it without an active live mission. `MapCanvas` already emits the marker constructor after its lazy import, so the panel now takes that constructor at ready time and keeps three-role marker creation/removal. A source-pinned regression failed on the original value import; before/after production builds show requester history and admin dispatch no longer statically reference the MapLibre chunk. The rescuer mission route has its own eager import and is not fixed here. This is bundle dependency evidence, **not** measured <2s map paint, <500ms GPS, virtual-scroll or browser/VM acceptance. T4.4.4 remains open.

### 2026-10-28 — T4.4.3 proposal-card timestamp contrast (partial)

- Audited the rescuer proposal inbox's small timestamp/clock label against its actual light and dark card surfaces. The light primary at 80% opacity blended to 4.31:1 on white, below the 4.5:1 normal-text threshold; 90% yields 5.39:1 light and 6.44:1 dark. A source-pinned compositing test failed before the one-rule change and passes now. This is a CSS-level result, not browser-rendered WCAG AA, keyboard or screen-reader acceptance; T4.4.3 remains open.

### 2026-10-28 — T4.4.2 requester-history linked-detail feedback (partial)

- A first-load requester SOS history deep link outside the current page fetched its list successfully, but a transient linked-detail failure discarded the whole list and reported a history-read error. The list now remains available with an explicit linked-request warning; Retry re-reads that same ID instead of dropping it or guessing another. A not-found/inaccessible 404 remains non-retryable, and a missing-session refresh clears private list metadata and retry state. A focused composable regression reproduced the first-load failure before the fix; source-pinned view checks do not replace a browser test. Other loading/toast/optimistic feedback surfaces remain open.

### 2026-10-28 — VM browser-build preflight and staged deploy review

- `--serve-only` and `doctor` previously treated any nonempty `dist/index.html` plus a MapLibre worker as a usable browser build, even if the HTML's JS/CSS entry had been deleted. The production deploy script used the same two-file test for an uploaded archive, potentially cutting over to a blank UI. Both now check nonempty HTML, a built module entry and the HTML's directly referenced local script/link files, reject symlinked build paths and occupied deploy staging slots (which could mask absent archive files), and fail before offline startup or deployment image pulls. Offline fixtures reproduced the missing-file defect before the fix and cover staged releases, zero-byte assets, source-index and symlink cases. These checks cannot prove lazy chunks, Nginx bind-mount state or real browser behavior; no live VM/deploy acceptance is claimed.

### 2026-10-28 — T4.4.2 rescuer-history detail retry (partial)

- A failed detail fetch cleared `selected`, so retrying through `load()` fetched the list and opened its first mission rather than the one the rescuer had chosen. The composable now tracks the requested ID independently of a successful detail record, keeps its card selected through a failure, and retries that ID without a list read. A later list refresh also preserves the requested ID while it remains on the page. Focused regressions failed before the change and pass afterward; Vue remains unmounted per test convention. This is one feedback-path fix, not site-wide T4.4.2 sign-off or live browser verification.

### 2026-10-28 — Open-work inventory and documentation guard

- Reconciled the current unchecked IDs in `TASKS.md` into a status index: **14 open tasks**, eight partial and six whose named work or target-environment acceptance run has not started. `scripts/list_open_tasks.py` prints the list and its `--check` mode runs in repository lint, rejecting missing, duplicate, completed or invalid-status index rows when task boxes change. This records what remains; it does not close any acceptance item or imply that this workspace ran Ubuntu Docker, PostGIS, a browser, Playwright or Android. The older whole-project estimate and phase snapshot below were not recalculated; use the current `TASKS.md` inventory for actionable status.

### 2026-10-27 — T4.4.1 narrow admin catalog lists (partial)

- Audited the admin incident-type and rescuer-category lists after the user-management card fix. Their wide tables kept edit/member actions behind horizontal scrolling on phones. At widths up to 850px, labeled one-column cards now expose the same rows, fields, membership chips and action handlers as the desktop tables, with first-load skeletons, stale-row refresh, failed-read retry and empty states. Phone dialogs stack their actions into full-width 44px-minimum targets. Source-pinned regressions failed before the change and pass afterward; client typecheck/build and repository gates check the code, not the rendered pixels. T4.4.1 remains **open** for broader breakpoints, bottom-sheet and real browser/device visual/accessibility acceptance.

### 2026-10-27 — Ubuntu VM guides and setup safety review

- Reconciled the quickstart, diagnostics and long manual runbook with the actual `vm-env.py`, `vm-map.py`, `vm.py`, `vm-install.sh` and cache-cleaner interfaces. Removed a manual `.env` loop that silently **rotated database passwords on rerun**, secret-bearing `/tmp` rewrites, guessed volume deletion, bare unset-path graph removal, CLI admin-password examples and an unguarded Docker reinstall as the recommended path. Destructive recovery now points to preview/typed-confirmation commands and distinguishes retained Planetiler reference archives from caches that are removed. Setup's `.env` writer now refuses symlinks/non-files, creates private files before exposing secrets, and never echoes values on dry-run or a generated admin password at completion. Offline Python regressions failed before the fixes; script suite, markdown checker and static lint pass. **No Ubuntu VM, Docker daemon, real map import, public TLS or browser acceptance was available here.**

### 2026-10-27 — T4.4.4 companion map route defers MapLibre (partial)

- The companion-map route's direct runtime `Marker` import pulled MapLibre's ~1 MB chunk into the route before `MapCanvas` mounted, making the previous concurrent import ineffective on that screen. `MapCanvas` now hands its already-loaded marker constructor to ready listeners; the companion view imports only types, creates the own-location marker from that constructor and still removes it on teardown. Before/after Vite builds confirm the companion route chunk no longer statically imports the MapLibre chunk; source-pinned tests and client typecheck pass. This is a bundle-graph fix for one route, not a measured <2s rendered map, <500ms GPS fix or live browser/device acceptance. Other map routes remain to be reviewed; T4.4.4 stays **open**.

### 2026-10-27 — Proposal inbox late-decision feedback bug review

- A delayed accept or decline could resolve after logout/account switch. The inbox already prevented old responses from mutating the new session, but `decide()` unconditionally returned `true`; its view treated that as success and closed/cleared the confirmation state. The operation now returns false whenever the originating session has gone, and only triggers the follow-up refresh on a current-session result. Deferred tests reproduce both old successes before the fix, cover the new account's untouched inbox, and preserve normal same-session success. This is a bounded feedback fix, not proof of live network/browser behavior or site-wide T4.4.2 completion.

### 2026-10-27 — T4.4.4 concurrent map startup (partial)

- MapCanvas used the bounded 200ms cache-worker head start *before* importing the roughly 1 MB MapLibre chunk. Starting the lazy MapLibre import concurrently with worker registration removes that serialized network-start delay without skipping the bounded cache opportunity; both operations settle before map construction, and unmount/error guards remain. Deferred tests prove an import starts while registration is blocked, a slow import is awaited, and import failures propagate. This is a code-level critical-path improvement, not a measured <2s rendered map, <500ms location acquisition or VM/browser acceptance. T4.4.4 remains open.

### 2026-10-27 — T4.4.3 active-device small-text contrast (partial)

- Audited five small light-theme labels on the active-device page and its white cards. The former `#718584` measured only 3.61:1 on the light page and 3.90:1 on the cards. Reusing `#536d6c` gives 5.17:1 and 5.57:1 respectively; existing dark-mode overrides remain untouched and test above 4.5:1 against the dark surfaces. A new source-pinned contrast regression checks these labels, without mounting Vue components. Other screens, keyboard and screen-reader behavior, and actual browser/device WCAG AA acceptance remain open; T4.4.3 is not signed off.

### 2026-10-27 — Active-device session-transition bug review

- Found a privacy race after the earlier read-feedback work: a logout with no subsequent refresh left cached private devices/shares visible until route teardown, and a pending request could restore those rows after logout or an in-place account switch. The device-settings composable now invalidates reads synchronously on token loss or account-ID change, clears cached rows/status and reloads the new account; ordinary token rotation for the same account does not discard data. Old write completions cannot update the new account's UI, and a bulk pin change stops before sending additional posts after session loss. Deferred-response regressions cover logout/account switches, delayed single writes and partial bulk writes, with a source-pinned test for the actual view wiring. Physical/browser behavior and site-wide T4.4.2 acceptance remain open.

### 2026-10-26 — T4.4.2 active-device read feedback (partial)

- The active-devices panel rendered empty-account/share copy on its first frame and after an initial failed read, although neither device sessions nor owned live shares had been confirmed. It now starts unresolved with two labeled skeletons, keeps known rows visible during re-reads with explicit freshness copy, and shows a failed-read/retry state rather than false empty or single-device claims. A missing session clears rows, older pending reads cannot restore them, a recovered read clears its read error, and device-priority edits are disabled until the snapshot is current. Runtime read/failure/race regressions and source-pinned markup checks pass; no browser/device acceptance or site-wide T4.4.2 completion is claimed.

### 2026-10-26 — T4.4.1 narrow admin user management (partial)

- The six-column admin user table requires at least 760px inside its padded container, so narrow screens hid the status switch behind horizontal scrolling. At widths up to 850px, a single-column card view of the same paged rows surfaces username, role, setup, category, join date, status and the same guarded confirmation switch; desktop retains the semantic table. Phone-width confirmation actions stack as full-width 44px-minimum targets. Source-pinned tests verify handler parity and breakpoint rules. This is a structural fix without real browser/device visual or screen-reader verification; remaining T4.4.1 screens and bottom-sheet acceptance are still open.

### 2026-10-26 — Location-share session lifecycle bug review

- Found two related privacy/feedback races: the share-ended Socket.IO listener survived access-token rotation with its original handshake, and an old HTTP read could repopulate private share rows after logout or an in-place account switch. The revocation subscription now closes the prior client and reconnects with the new bearer; generation guards close late dynamic imports after rotation/logout/unmount. Session transitions invalidate reads, clear all four share lists and confirmation state, and reload only the newly signed-in user's grants. Runtime socket-lifecycle tests cover token reuse, rotation, pending import, failure and disposal; source-pinned tests guard list invalidation and cleanup. This is a bounded bug fix, not device/browser verification or completion of T4.4.2.

### 2026-10-26 — T4.4.4 bounded map-cache startup (partial)

- MapCanvas previously waited for cache-worker registration/ready before importing MapLibre; on a fresh install this could consume the worker's 1.5s readiness timeout even while the map service was online. The map now waits at most 200ms for worker startup, then initializes while registration continues in the background; worker errors cannot block rendering, and an already controlling worker retains its cache behavior. Focused tests cover immediate readiness, a never-settling registration, failures and the component wiring. Routes were already lazy and the admin user list already paged at 20 rows. This removes a startup gate; it **does not** prove <2s rendered map, <500ms location or site-wide performance targets without browser/VM measurements. T4.4.4 stays **open**.

### 2026-10-26 — T4.4.3 dashboard text contrast (partial)

- A measured light-theme audit found small dashboard text below the WCAG AA 4.5:1 text threshold: the page eyebrow narrowly missed, the welcome line missed on the off-white page, card subtitles/kickers missed on white, and note-card copy missed on its translucent tinted background. These light foregrounds now use darker muted values or the readable palette muted token. A source-pinned test checks relative luminance on the actual page/card backgrounds and both possible note-card tint backdrops, and guards dark-theme readability. This is a bounded contrast correction, **not** a site-wide WCAG AA audit, keyboard/screen-reader sign-off or real-browser verification; T4.4.3 stays **open**.

### 2026-10-26 — T4.4.2 location-share list truthfulness (partial)

- A failed first live-share read used to fall through to “nobody sees your live location,” and history-read failures were ignored, so a partial result could also claim there were no received shares. The share panel now distinguishes first-load, successful-empty, stale-rows and unavailable states for the live and history sources, reports failures separately, and withholds exact count chips when a source is unverified. A newer refresh wins over an older overlapping read, including on unmount, and a missing session clears private rows. After server-confirmed revocation, the removed row disappears even if the follow-up read fails; it is **not** hidden optimistically before acknowledgment. Pure presentation and source-pinned regressions cover the states, with full client/repository checks; no real-browser verification. Other T4.4.2 loading/toast/optimistic surfaces remain **open**.

### 2026-10-26 — T4.4.2 admin catalog loading/feedback (partial)

- Admin incident types and rescuer categories previously showed a blank table during the first request and could report “no items” after a failed read. Both tables now begin with screen-reader-labeled skeletons, keep existing rows visible with a progress indicator on refresh, show empty copy only after a successful empty read, and provide a retry when the read fails. Existing confirmed-write success snackbars and abort/version guards remain; catalog writes are not optimistically shown without server confirmation. Pure presentation-state cases and source-pinned markup tests cover this increment. Other screens, toast consistency, suitable optimistic updates/rollback, and browser accessibility/visual checks remain open. T4.4.2 stays **open**.

### 2026-10-26 — T4.4.1 location-share phone footer (partial)

- The location-sharing dialog becomes fullscreen on phones, but its footer previously kept the live status, spacer, Close and Share on one non-wrapping row. A submitting or success status can grow independently of the non-shrinking Vuetify buttons, squeezing or clipping the Share action at narrow widths. Under 600px the status now wraps on its own row, the spacer is hidden and both actions stack at full width with at least 44px touch height. The form body remains the separately scrollable part of the fullscreen dialog. Source-pinned regression failed before the CSS change and passes afterward; no actual phone visual acceptance or site-wide mobile-dialog audit is claimed. T4.4.1 remains **open**.

### 2026-10-26 — T4.4.1 SOS bottom-sheet submit clipping (partial)

- Vuetify's SOS `v-card-actions` uses a non-wrapping flex row, while its `v-btn` children do not shrink. On a narrow phone the Cancel button, spacer and long emergency Send button could exceed the sheet width and the card's hidden overflow could clip the Send action; at 600px the inset sheet itself also becomes only 70% of the viewport. Through 700px the footer now stacks both buttons at full width, removes the empty spacer, allows long labels to wrap and keeps at least 44px touch height. The form body still scrolls separately and the severity cards still switch to one column only on phones. A source-pinned regression failed before the fix and passes afterward; physical-phone/tablet and short-viewport visual acceptance is not claimed. T4.4.1 stays **open** for the rest of the bottom-sheet/site-wide responsive audit.

### 2026-10-26 — T4.4.1 companion map tablet collision (partial)

- The companion map switched absolute side panels to in-flow controls only at 750px. At 751–815px its 25rem toolbar/search and 24rem history playback card plus 1rem inset on each side need 816px even before leaving a lane for map gestures, so the panels can physically overlap. The in-flow, definite-height map layout now extends through 1023px; the history panel's compact/scrollable treatment and the map's camera-padding media query use the same cutoff, preserving deep-link expansion. Focused regressions failed before the change and pass afterward. This is a structural fix, not a real browser/tablet verification; T4.4.1 remains **open** for broader breakpoints, bottom-sheet audit and device acceptance.

### 2026-10-26 — T4.4.1 tablet dispatch map occlusion (partial)

- Vuetify stacks the `lg` dispatch queue/map columns below 1280px, but the selected-SOS card and legend only left the map at widths below 600px. Across the 600–1279px stacked range, those overlays covered incident markers and map gestures despite ample room for normal-flow content. The in-flow, definite-height MapLibre layout now follows the actual column breakpoint; compact filter and responder-search rules remain phone-only. Source-pinned regression failed before the breakpoint change and passes afterward. This does not claim browser/device visual acceptance or a site-wide no-occlusion audit; T4.4.1 stays **open**.

### 2026-10-26 — T4.4.1 rescuer stacked-detail bug review (partial)

- Rescuer mission history and pending-offer inbox each page up to 20 cards. When their layouts stacked, the selected timeline or incident map and accept/decline controls followed all 20 cards, even after tapping a card. Both now bound only the card list to a viewport-relative height at the stacking breakpoint, preserving keyboard scrolling and leaving pagination and detail panels outside the scroller. In the proposal inbox the first displayed fallback selection previously had no selected styling or `aria-pressed` card; both now track the computed displayed offer. Phone-width accepted-map and distance-consent buttons can wrap long labels while retaining 44px minimum height. Regressions failed on the old structure/selection and pass after the change; source/typechecks cannot prove pixel-level behavior. T4.4.1 stays **open** for other screens, mobile bottom-sheet audit and real browser/device acceptance.

### 2026-10-26 — T4.4.1 requester history phone flow (partial)

- A long SOS request page previously placed the selected case, cancellation action and live mission map after every card on narrow screens; two card columns stayed active to 530px. The cards now stack by 780px and only their keyboard-focusable, named list scrolls within a viewport-relative cap; pagination stays visible after the list and the selected case/map remain in normal flow below. Nested rating choices wrap without shrinking 48px targets, while live member badges and share-button text can wrap at phone widths. Source-pinned regressions, focused client tests and typechecks cover the change; no browser or device visual acceptance has been performed. Other screens, bottom-sheet review and site-wide breakpoints remain open; T4.4.1 is **not** checked complete.

### 2026-10-26 — T3.5.5 route-geometry boundary review (partial; VM acceptance blocked)

- Reproduced a malformed OSRM alternative receiving HTTP 200 when no DEM was configured: the browser then rejected the entire route selection. The gateway now validates every returned polyline before serving any alternative; out-of-range, truncated, single-point and oversized geometry produce a scoped 502. A valid long route still reaches the client even when its optional DEM summary exceeds the separate 12,000-sample altitude budget. Gateway tests use synthetic responses and a local server; no Docker, real OSRM graphs, downloaded Skadi tiles or offline browser are available in this workspace. T3.5.5 remains **open** until the VM corridor, per-profile alternatives/elevation and offline browser checks in `docs/MAP_SERVER.md` are recorded.

### 2026-10-26 — Fix requester SOS cancellation lifecycle races

- A history read started before confirmed SOS cancellation could finish later and restore the request’s former cancellable status; marking the committed cancellation now invalidates that older read and clears its loading state. Resetting a cancellation panel during an in-flight confirmation previously left it open/locked and let the old result update a reopened panel for the same account; reset now invalidates that confirmation and its late `finally` cannot unlock a newer one. Two deferred-response regressions failed before the fix and pass afterward. Browser/device and production-network acceptance remain open.

### 2026-10-26 — Fix rescuer mission-desk asynchronous cancellation races

- A mission list refresh and the cancellation-reason dialog previously shared one generation counter: opening the dialog discarded a pending list reply but stranded its loading spinner. A list started while the dialog was open could also finish after a confirmed cancellation and restore the old active status; a cancelled request resolving after the panel reset for the same account could mutate the new panel. List, reason and panel-session lifetimes are now isolated; successful cancellation invalidates older list reads, and reset drops in-flight mutation results. Three deferred-response tests reproduced these interleavings before the fix; focused client typechecks pass. This does not claim live database or device acceptance.

### 2026-10-26 — T4.4.1 rescuer route phone controls (partial)

- The mission route editor uses one transport-profile state for a compact phone select and the desktop button group; both remain locked during active navigation. Under 600px the route actions, waypoint coordinate fields and mission refresh toolbar can stack within the available width, with the route map below the controls in document flow at a definite height. Source-pinned regressions and client build cover the structure. The broader responsive/bottom-sheet audit and browser/device visual acceptance remain open; T4.4.1 is **not** checked complete.

### 2026-10-26 — Fix SOS create/photo-upload race

- A successful SOS create previously set the sheet's completed state before its optional photo upload finished, exposing “new request” and close actions while an attachment was still in flight. The sheet now shows an explicit non-dismissable attachment progress state, reports completion only after the upload settles, and retains the existing photo-retry flow on failure. The submission snapshots the incident and file at tap time; GPS callbacks, map/coordinate edits and file-picker events cannot silently change them during session refresh. Deferred-upload and delayed-session regressions reproduce the previous behavior and cover the fix; no device-network test was run.

### 2026-10-26 — T4.4.1 responsive dispatch triage (partial)

- Reordered the admin SOS console so its request queue precedes the map/dispatch form in both DOM and visual order (including stacked widths); on phones, the selected incident summary and severity legend follow a definite-height map in document flow instead of obscuring markers and gestures. A compact status select replaces the three wide filter buttons at phone width without introducing a second filter state, and responder search wraps. Source-pinned tests and client typechecks cover structural decisions; other screens/breakpoints, mobile bottom-sheet behavior and **real browser/device visual verification** remain open, so T4.4.1 is **not** checked complete.

### 2026-10-26 — Fix HTTPS/WSS smoke teardown after Android generation

- Generating `packages/client/android/` made the existing one-shot Vite HTTPS/WSS handshake test intermittently hang **after** reporting success: Vite watched the large native tree and left file watchers alive during teardown. The smoke harness now loads the real Vite config and uses it with watching disabled only for this one-shot transport test, then waits for the WebSocket close handshake before stopping Vite. The six LAN tests, including a trusted TLS/WSS handshake with the generated Android tree present, now finish normally. This does not claim a physical device, real Android build or production WSS check.

### 2026-10-26 — T4.6.3 signed Android tag workflow (code only)

- Added pinned Capacitor CLI/Android dependencies and a release-tag Action that checks main ancestry, generates/syncs the ignored native project, inserts location permissions, versions and signs the APK with ephemeral environment-only secrets, verifies the signature and uploads an artifact. The release shell requires a configured public HTTPS production origin for same-origin API/map/cookie requests; it does not claim standalone offline operation or trust the LAN debug CA. Python template/security checks and local `cap add`/`cap sync` succeed. **No GitHub Action, Android SDK/Gradle assemble, signed APK, production TLS, device GPS or share acceptance has been run.** See `WORKFLOWS.md` §6 for required operator settings and sign-off.

### 2026-10-26 — Bug fix: optimized trips use OSRM's supported HTTP method

- The trip gateway was sending a JSON POST that OSRM v26.10 only supports for route/table/match; a real trip service would reject every optimized multi-stop request. Switched the bounded local trip call to GET with coordinates and options in its URL, and kept private GET paths and upstream echoes out of gateway errors/logs. Added a strict GET-only HTTP stub and a regression for unsupported POST, network failures, untrusted error bodies and disconnected stops. Local tests pass; real OSRM/VM/browser acceptance remains pending.

### 2026-10-26 — T4.6.2 guarded main-branch deploy workflow (code only)

- Added a main-only GHCR build-and-push Action for API/routing/Photon, client static transfer over pinned-host-key SSH, immutable registry Compose overlay, and a VM cutover script with environment/map/schema preflight, no automatic migrations, bounded health wait and a best-effort static/image rollback. `docs/WORKFLOWS.md` now specifies one-time production/secret/registry preparation instead of the stale inline secret-echo workflow. ShellCheck, Ruff, YAML parse and static safety tests pass. **No CI run, Docker daemon, real GHCR push, SSH VM or production acceptance occurred here.**

### 2026-10-26 — T4.3.5 scoped mission-timeline SSE fallback

- Added a bearer-header, owner-scoped mission-timeline invalidation stream for when the mission timeline’s Socket.IO connection fails; the client re-reads persisted timeline rows, never trusts the stream for GPS or mission changes. Periodic JWT/session/ownership rechecks, a two-stream/session cap, a 14-minute expiry, abort-on-recovery/identity-change and unbuffered local/VM nginx proxy paths are implemented. HTTP streaming and pure client lifecycle tests pass. This does **not** guarantee live VM/browser streaming or cover other Socket.IO consumers.

### 2026-10-26 — T4.2.1 ordered/optimized waypoint routing

- Added bounded ordered waypoints to the same-origin local OSRM route gateway; the optional trip optimizer fixes A and the incident, checks the full returned order, and refuses malformed upstream plans. The active mission route editor supports map/coordinate entry, drag plus keyboard reorder, optimization, and a stop slider. Gateway HTTP integration, boundary and lifecycle regressions passed; **real OSRM/DEM, VM and browser acceptance remain T3.5.5**.

### 2026-10-26 — T4.7.2 security/API/roadmap documentation audit

- Audited the documented credential/session, proxy, signed-photo and GPS/presence boundaries against implementation. Removed claims of nonexistent automatic suspension/unsuspend, bcrypt, rich-HTML sanitization, TLS/HSTS verification and timeout env keys. Linked the running Swagger UI/JSON and distinguished contract-only descriptors from handlers; the roadmap now separates future privacy/suspension proposals from current tasks. This is a source-and-test review, **not** an external penetration test or target-VM sign-off. See SECURITY §11 for remaining validation.

### 2026-10-25 — T4.6.1 local Git gates

- Pinned Lefthook 2.2.2 and added `pre-commit` lint/typecheck plus `pre-push` Vitest/build dry-run for the full checkout. The contributing guide documents explicit installation and the difference between local gates and still-unconfigured GitHub CI. Removed two genuinely unused Bash declarations reported by the available ShellCheck version; hook execution requires installed ShellCheck and Ruff. No deploy action or Android workflow was added.

### 2026-10-25 — T4.2.2 conditional offline elevation charts (code complete)

- Existing mission cards now add a bike/foot-only accessible SVG profile when a route has complete local DEM coverage; missing/void tiles still produce no chart. The gateway compacts full-geometry samples to at most 96 points while retaining distance-bucket extrema, and the client validates order/size and avoids exaggerating flat profiles. Source-pinned view, pure chart, gateway and HTTP tests cover the code. OSRM can return only one route, and no browser or real VM DEM acceptance is claimed; T3.5.5 stays open.

### 2026-10-25 — T4.6.4 environment reference and platform guide

- Documented all active `.env.example` entries by consumer/meaning in `docs/ENVIRONMENT.md`, linked from the docs index and development guide. Added a static lint guard against undocumented/duplicate env keys, unused SOS/mission timeout promises, and remote browser-facing Vite URLs; removed the unused placeholders and added the actual Nominatim import default. Replaced the stale duplicate env snippet and corrected the no-Docker Windows PowerShell/PostGIS/migration sequence alongside the Ubuntu VM helper path. **Windows instructions are source-reviewed, not live-tested on Windows.**

### 2026-10-25 — T4.4.5 design-token foundation

- Centralized the client’s 8px spacing grid, light/dark semantic UI colors and Persian-first typography in `styles/tokens.ts`. Vuetify, the theme store/meta color and generated CSS custom properties share one palette; app-shell selectors consume it. A source-pinned test prevents the static pre-paint initializer from drifting and checks base text contrast. Component-wide style migration, responsive/browser acceptance and the WCAG audit remain separate tasks.

### 2026-10-25 — T3.5.5 offline elevation integration (not yet accepted)

- Added operator-only Mapzen/Tilezen Skadi HGT staging for an explicit WGS84 bbox, with source URL, SHA-256 and raster-size manifest; the gateway mounts that external directory read-only and never downloads tiles at request time. Optional sampled ascent/descent for each returned OSRM alternative requires complete checksum-valid DEM coverage; absent, void, corrupt and out-of-bounds samples return `null`, not invented altitude. Mission UI shows estimates with source credits only when present.
- Synthetic 1201-grid and offline `.hgt.gz` fixture tests verify staging, interpolation, void/no-data, route gain/loss and adapter behavior. **No live dataset, VM route run or browser test has occurred for this change**; OSRM alternative count remains network-dependent. T3.5.5 stays open. See `docs/MAP_SERVER.md` §6 for VM staging and `MAP_REQUIRE_ELEVATION=1` acceptance steps.

## Overall project estimate: 24% (unchanged planning figure; this release re-ships work, it does not re-estimate it) — Phase 1 v0.1.0 released; **v0.2.0 released 2026-10-23 (Phase 2, Phase 3 M3.1 + M3.2, the map pipeline and the Ubuntu VM setup fixes)**; Phase 2 history share/read path (T2.2.3–T2.2.6), the priority-device rule and its settings screen (T2.3.1–T2.3.5), and the share client (T2.1.7) complete (2026-10-22); Phase 3 is underway — the admin catalogs (T3.1.2–T3.1.3) with their screens (T3.1.5), `sos_requests` (T3.2.1), SOS creation (T3.2.2) and its photo upload and storage (T3.2.3) are live

All numbered Phase 1 implementation tasks, T1.0–T1.5, are checked complete. On 2026-10-21, the user reported a successful Ubuntu 24.04 setup and passed interactive checks for admin/user login, registration, themes, admin user listing/deactivation, and the map view; the exact scope is listed in [Phase 1 human acceptance](#phase-1-human-acceptance). T1.4.7 remains complete and limited to map-data cache/reuse, safe cache removal, and whole-country/city-crop selection. PR #2 was merged to `main` as `95a88a3`, and the Phase 1 Foundation `v0.1.0` release was published on 2026-10-21. Phase 2 is underway: live-share storage and API (T2.1.1–T2.1.4), history storage tables (T2.2.1–T2.2.2), realtime `location:update` with the priority-device rule (T2.1.5/T2.3.4), and the share-expiry + history-retention maintenance jobs with their ENV wiring (T2.1.6/T2.2.5) are complete. The Active Devices foundation is next: `user_sessions` already carried every spec §7.3 field, T2.3.1 closed the label semantics, T2.3.2 exposed `GET /_user/devices`, and T2.3.3 made the server the authority on which device may broadcast a share. History sharing is now complete on the server (T2.2.3 creates a grant, T2.2.4 reads, lists, and deletes one), and T2.1.7 put the first `/_user/location` calls in the browser: the share dialog with a debounced username picker, the duration slider, both share lists with confirm-to-revoke, and the priority-device chooser that answers the server's `409`. T2.2.6 then put history playback on the map: `history/playback.ts` decides the frames, interpolation and GeoJSON, `history/playback-map-sync.ts` decides what maplibre is told, and `composables/use-history-playback.ts` owns the window, the cursor and the transport loop — with the range picker opening on the last 7 days, as the milestone's exit criterion asks. History sharing is therefore complete end to end in code. T2.3.5 then gave the priority device its screen (`/_user/devices`): the account's live sessions joined to the shares that pin them, a per-share chooser, and a bulk apply — all writing through the sharing endpoint with a body that cannot move an expiry, so the only Phase 2 implementation task left is the Capacitor identity work (T2.3.6), plus live companion markers on the map (a roadmap line, not a numbered task); no location data path has run against a real PostgreSQL instance yet, and the new client screens — the share dialog and now the playback panel — have not been opened in a browser either. The 24% whole-project estimate is unchanged; it is a planning figure rather than a per-task measurement.

The separate external-Internet-offline map-library run, live browser outage simulation, extended database-flow evidence, and style-switch timing remain follow-ups. The user explicitly confirmed on 2026-10-21 that these remaining checks do not block the Phase 1 release or starting Phase 2. Record them as known follow-ups, not release/Phase 2 gates; do not claim the untested behavior passed. The agent workspace cannot reproduce the user's VM/browser/database checks. The 24% figure is a whole-project planning estimate, not a Phase 1 completion percentage, and has not been recalculated for the initial Phase 2 schema task.

Phase 1 runtime scope includes the shared contracts/scaffold, authentication and account-management flows, map-server pipeline, and client map/theme views. The Phase 1 auth/account endpoints are implemented; other contract-only user/admin domain operations map to later-phase work (T2–T4), not unnamed Phase 1 leftovers. See the handler-scope note below.

| Area | Implementation | Status / open evidence |
|------|----------------|------------------------|
| Documentation (`docs/`) | Authored; release lock open | Manual screenshots and rendered-diagram review remain T4.7.1; do not interpret authored files as 100% acceptance. |
| Monorepo scaffold | 100% | ✅ T1.0.1–T1.0.7 complete; root dev orchestration and local Compose service scaffold are in place |
| Phase 1 Auth & account foundation | 100% (code scope) | ✅ T1.1–T1.3 scope is implemented; user reports setup, registration/login, admin list/deactivation, and denied login after deactivation passed on Ubuntu 24.04. Extended DB evidence remains P1-A2, non-blocking. Later user/admin domain endpoints map to T2–T4. |
| Map Server | 100% (code scope) | ✅ T1.4.1–T1.4.7 implementation complete; original-stack tile/routing/geocoding VM checks passed 2026-10-20 and user reports current Ubuntu setup passed. Dedicated external-Internet-offline library verification remains P1-G1, non-blocking. |
| Client Map canvas | 100% (code scope) | ✅ T1.5.1–T1.5.5 implementation complete; user reports map render/zoom/fullscreen and light/dark/system modes passed. Live outage fallback P1-A1 and latency measurement P1-M1 remain non-blocking follow-ups. |
| Location Sharing | 100% (20/20 tasks) | ✅ T2.1.1 schema, T2.1.2–T2.1.4 share create/revoke/list API, T2.2.1/T2.2.2 history tables, T2.1.5 + T2.3.4 realtime broadcast with the priority-device rule, T2.1.6/T2.2.5 expiry + retention jobs with validated ENV wiring, the T2.3.3 server-side device-selection rule, T2.2.3 bounded history-share grant creation, the T2.2.4 history reads/lists/delete are complete, and T2.2.6 draws them: sampled polyline, played prefix, interpolated head, scrub slider and 1×/4×/16×/60× transport on `/_user/map`; the share dialog, target picker, duration slider, both share lists, and the priority-device chooser are live in the client, and `/_user/devices` now lists the live sessions and changes which one broadcasts, per share or for all of them; and T2.1.8 put live companion markers on that map, so every numbered Phase 2 implementation task and every M2.1 roadmap line is complete (20/20), T2.3.6 having added the native device label and `usePriorityDevice`. Open follow-ups recorded in the 2026-10-22 entries: no browser run for the new screens (share dialog, lists, playback panel, live markers). The other recorded follow-up — `GET /_user/location/shares` carrying `targetUsername` so owned rows stop showing truncated ids — is done (P2-Q1, same day): both owned lists now name their target, with a left join so a share whose target cannot be read is still listed and revocable. Every case so far runs on injected stores; the search projection has now been executed against a real PostgreSQL (PGlite, no PostGIS), which is how the 500 below was found and confirmed fixed, while everything geography-specific still waits on the VM (P2-A1, P2-A2) |
| SOS Rescue | Numbered Phase 3 tasks checked except T3.5.5 | Core SOS, dispatch, mission and history flows exist in code. T3.5.5 offline elevation/routing VM acceptance remains open; other live/browser acceptance is not established by the checkboxes. |
| Search & Routing | T4.1.1–T4.1.4 and T4.2.1–T4.2.3 checked | Code/test scope is checked; target browser, Photon and offline DEM verification are not implied. T3.5.5 remains open. |
| UI/UX & a11y | T4.4.5 checked; T4.4.1–T4.4.4 partial | Remaining responsive, feedback, WCAG and performance audit/measurement require broader browser/device coverage. |
| CI/CD & Android | T4.6.1–T4.6.4 checked in code | Main deploy Action, tag-triggered signed APK and real Android/browser acceptance have not run in this checkout. |

---

## Phase Scoreboard

### Phase 1 — Foundation (Auth & Map)

**Implementation status:** every named T1.0–T1.5 task in `TASKS.md` is checked complete. **Core human acceptance:** the user reports the Ubuntu 24.04 smoke tests below passed. **Release/Phase 2 decision:** remaining P1 follow-ups are explicitly non-blocking per the user's 2026-10-21 direction.

| Milestone | Implementation status | Human acceptance / follow-up |
|-----------|-----------------------|-------------------------------|
| Monorepo + Contracts | Complete (T1.0.1–T1.0.7) | No additional manual acceptance listed |
| Auth & account foundation | Complete (T1.1–T1.3) | Core user/admin flows passed per report; extended DB flow coverage remains P1-A2 |
| Map Server | Complete (T1.4.1–T1.4.7) | Setup reported successful; strict external-Internet-offline library run remains P1-G1 |
| Client Map canvas | Complete (T1.5.1–T1.5.5) | Theme/map interactions passed per report; outage fallback P1-A1 and timing P1-M1 remain |

### Phase 1 human acceptance

**Source:** user-reported manual tests on Ubuntu 24.04, 2026-10-21. The agent did not independently access the VM. These results are recorded as passed without inventing logs, browser versions, regions, or timing data.

| Manual check | Result reported |
|--------------|-----------------|
| Set up the project on Ubuntu 24.04 | Pass |
| Log in with the admin account | Pass |
| Register a user and log in with that user | Pass |
| Switch between light, dark, and system theme | Pass |
| View the user list in the admin panel | Pass |
| Open the map in the panel, zoom in/out, and use fullscreen | Pass |
| Deactivate an account as admin; verify that account can no longer log in | Pass |

This smoke test supports the Phase 1 release decision. It does not claim a cold-cache/offline service-worker test, an HTTP 5xx outage test, an external-Internet-disconnected map-library run, every recovery/session endpoint, or a measured style-switch latency.

### Phase 1 acceptance follow-ups

These follow-ups track additional evidence, not missing feature implementation. Their checkboxes are mirrored in [`TASKS.md`](./TASKS.md#phase-1-acceptance-follow-ups-separate-from-implementation-tasks); all remain non-blocking for release/Phase 2 per the user decision.

#### P1-G1 — External map-library migration and offline acceptance — **OPEN / non-blocking follow-up**

The earlier live check validated the original Tehran layout. This follow-up checks that the newer project-independent library layout works on the actual Ubuntu VM: the active pointer and manifest agree, existing project-local data migrates only when its provenance is verified (otherwise the old files are preserved and setup safely rebuilds), and the prepared dataset can be used without downloading map sources from Geofabrik. Before disconnecting external Internet, stage the required Docker images, Java, Osmium, Planetiler/Photon JARs, verified sources/crops, PMTiles, OSRM graphs, and Photon index. Then run setup with `--offline` and the tile, car/bicycle/foot routing, and forward/reverse geocoding checks for each selected area while LAN access remains available. Record the selection/snapshot, migration result or “not applicable,” and sanitized command results. Local code-side checks are green: 50 map-server tests passed, including simulated manifest migration/offline-cache cases. A safe `./scripts/setup-ubuntu-vm.sh --dry-run --offline --yes --regions ir-tehran` also showed this sandbox lacks Docker, Java, Osmium, and cached source/PBF/PMTiles/OSRM/Photon artifacts; it made no changes. This confirms the agent cannot perform the real VM migration/offline run. The tests do not prove the real VM library pointer, mounted artifacts, or services work offline. The user reports the Ubuntu 24.04 setup succeeded, but did not explicitly report disconnecting external Internet or testing the library migration path. Per the user's 2026-10-21 decision, P1-G1 remains an operational follow-up and does not block the Phase 1 release or Phase 2; it is not part of T1.4.7.

#### P1-A1 — Live browser map-outage fallback — **OPEN / non-blocking follow-up**

The worker's unit tests cover cache writes, cached responses on network errors and 5xx, cold-cache failure, and request scoping. A real browser run is still needed to prove worker registration/control, Cache Storage, MapLibre rendering, and the user-visible retry/toast work together. On HTTPS (or localhost), first load the map while online to warm the cache, then test an actual network failure and a map-server 5xx. Confirm cached map style/tile/sprite/glyph resources continue to render; with an empty cache, confirm a clean recoverable error rather than a crash. Confirm API/configuration/routing/geocoding requests are not served from this map cache. Plain-HTTP LAN cannot use Service Workers and only has the in-memory MapLibre fallback; record the origin and do not claim persistent offline support for that case. Local validation is green: all 49 client tests passed, including the 5 service-worker cache/fallback tests; those tests do not exercise an actual browser registration or MapLibre rendering. The user-reported human test did not include a map-server outage/5xx or browser-offline scenario; P1-A1 remains non-blocking by the user's decision.

#### P1-A2 — Extended PostgreSQL/account-flow evidence — **PARTIAL / non-blocking follow-up**

Most server tests use injected stores, so they validate handler logic but do not prove that Drizzle migrations, SQL queries, constraints, transactions, and session revocation work against a real PostgreSQL instance. On a disposable or safely backed-up application database, confirm Postgres health, apply migrations, run the seed twice to confirm idempotence, then exercise registration/login/refresh/logout/recovery, `GET /_user/me` and onboarding, and admin create/list/detail/status. Verify expected rows persist and revoked sessions stop authorizing access. Capture sanitized pass/fail results only; never share `.env`/`DATABASE_URL` and never remove the existing `postgres-data` volume as a shortcut. Local validation is green: 165 server tests (150 before T2.1.2) and the server typecheck passed, but the route tests use injected stores and are not live PostgreSQL integration tests. A prior VM migration attempt returned `28P01`. The user later reported a successful Ubuntu 24.04 setup and passed registration/login, admin listing/deactivation, and deactivated-account login rejection; see the human-acceptance table. Explicit migration/seed output and refresh/logout/recovery/onboarding/admin-create/detail results were not reported, so P1-A2 is partial rather than fully evidenced. These remaining checks are non-blocking for release/Phase 2 per the user's decision.

#### P1-M1 — Live light/dark switch latency — **UNMEASURED / non-blocking**

The implementation and 150 ms paint-transition configuration are tested, Tehran rendered in the target VM browser, and the user reports light/dark/system mode switching works. No timing results were supplied. The 150 ms value describes the paint transition, not the total time from a theme action until the new map style is visible. With local map data loaded and caches warm, time at least 10 light↔dark switches in the target browser and report the median/p95 plus browser/device/cache state. No total-latency SLA is documented, so this is a useful baseline, not a pass/fail gate.

**Handler-scope reconciliation:** The Phase 1 runtime handlers are already implemented: public health/security-question catalog; auth register/login/refresh/logout/recovery; `GET /_user/me` and security-question completion; admin user list/detail/create/status. The vague phrase “remaining user/admin handlers” has been removed as a Phase 1 blocker. Contract-only location sharing/devices/history belong to T2; incidents/categories, SOS, dispatch, proposals, and missions belong to T3; search and client routing polish belong to T4. They remain future work, but they are not missing T1 Phase 1 handlers. If another handler is intended for Phase 1, first add its exact route and acceptance criteria as a named task.

### Phase 2 — Location Sharing — 100% (20/20 tasks)

| Milestone | % | Notes |
|-----------|---|-------|
| Live share + expiry | 100% (8/8 tasks) | T2.1.1–T2.1.4 share storage/API, T2.1.5 live `location:update` (handshake auth, throttle, PostGIS upsert, history insert, peer fan-out, REST fallback), T2.1.6 the in-process expiry sweep (60s cadence, catch-up pass at startup, marks rows `is_revoked`), and T2.1.7 the client surface (share dialog with a debounced picker, duration slider, My Shares / Shared With Me with confirm-to-revoke) are complete. The client half has not been opened in a browser yet. and T2.1.8 (2026-10-22) closed the last open roadmap line: `/_user/map` paints one dot per peer, bootstrapped from `GET /_user/location/shares` and then driven by `location:peer-update`, greyed with its age when a phone goes quiet, dropped only after 30 minutes of silence, with a panel that explains an empty map instead of asserting one; the placeholder notice is gone. Audit fix: late share-list responses can no longer redraw peers after logout or after a `location:share-ended` revocation event |
| History share + retention | 100% (6/6 tasks) | T2.2.1 `location_history` and T2.2.2 `location_history_shares` exist in migration `0007_brief_hedge_knight.sql`, the writer runs inside `location:update` (T2.1.5), T2.2.5 wired `LOCATION_HISTORY_RETENTION_DAYS`/`LOCATION_HISTORY_MAX_SHARE_DAYS` plus the batched daily prune, and T2.2.3 creates grants — window bounded by the share-days ceiling, 1–50 recipients checked with the live-share rules, `max_points` stored on the row (`0009`) — and T2.2.4 reads them: both directions listed, a window sampled inside the query with its unsampled `totalPoints` reported, and a grant deleted outright; and T2.2.6 put the read on the map: presets (1/7/30 days, default 7) or a hand-typed local window, a sampled polyline with the played prefix and an interpolated head, scrub slider, step and 1×/4×/16×/60× transport, camera fit that refuses to zoom into a single fix, and a caption naming the sampling (67 new client cases). Every task in this milestone is now complete in code; receiver history reads now hold a caller-scoped grant lock through the sampled read to close the revoke/read race (migrated PGlite regression); what is left is the browser run and target-VM PostGIS verification |
| Multi-device priority | 100% (6/6 tasks) | T2.3.4 server-side rejection of non-priority devices is live inside the realtime path; T2.3.1 confirms `user_sessions` carries every spec field (and now stores a human device label instead of a raw UA); T2.3.2 serves `GET /_user/devices` with `deviceId` exposed for the picker; T2.3.3 enforces the selection on the server — auto-pin for one live device, `409 PRIORITY_DEVICE_REQUIRED` with the device list for more, and a sweep that re-points a share whose device signed out. T2.3.5 (2026-10-22) is the settings side: `/_user/devices` shows the live sessions (label, status, age, IP, how many shares each one broadcasts) and re-points any share's pin — with the “only this device sends, the others stop” rule stated on the screen, and with the write built so it cannot extend a timed share, change a row that already expired, or create one that vanished; and T2.3.6 (2026-10-22) closes the milestone: a native build reports brand+model as its session label (never the user-assigned device name, which is personal data and generic on recent iOS) and `usePriorityDevice` answers “am I the device that broadcasts?” by deriving it from the same two lists rather than enforcing anything; the client half of T2.3.3 landed inside the share dialog (T2.1.7), where a `409` opens a radio list of the device ids the server itself reported |

### Phase 3 — SOS Rescue — 98% (39 of 40 numbered T3 tasks checked in `docs/TASKS.md` §3.1–3.7)

| Milestone | % | Notes |
|-----------|---|-------|
| 3.1 Incidents/categories | 100% (5/5) | ✅ `T3.1.1`–`T3.1.5` complete: `0010` + `0011` schema, `/_admin/incidents` & `/_admin/categories` CRUD + membership endpoints, multi-category/no-category projections across `/_user/me`, `/_admin/users`, and `/_user/users/search` (`T3.1.4`), plus `/_admin/incidents` and `/_admin/categories` UI views with duplicate/inactive candidate filtering |
| 3.2 SOS request | 100% (6/6) | ✅ `T3.2.1`–`T3.2.6` complete: `0012` `sos_requests` table, `POST /_user/sos/requests` + `sos:new-request` admin broadcast, `POST /_user/sos/requests/:id/photo` magic-byte-verified evidence storage + admin photo-update broadcast, floating SOS button & interactive map pin sheet (`SosRequestSheet.vue`), and live `/_admin/dispatch` alert markers & Web Audio siren chimes. ✅ `T3.2.6` secures photo read-back with short-lived signed URLs for participants and admins. Audit fix: the SOS form rejects duplicate submits during session refresh and after successful creation; photo retry is single-flight |
| 3.3 Dispatch + nearest | 100% (4/4) | ✅ `T3.3.1`–`T3.3.4` complete: geodetic `ST_Distance` nearest qualified responder query (`0013`), `GET /_admin/sos/requests/:id/nearest`, row-locked `POST /_admin/sos/requests/:id/dispatch` emitting `sos:proposal-received` to `user:<id>`, and full `/_admin/dispatch` multi-select dispatch console |
| 3.4 Proposals | 100% (6/6) | ✅ `T3.4.1`–`T3.4.6` (DDL, inbox, accept/decline, both busy guards, detailed rescuer UI); incident details are rescuer-scoped and photo access uses signed URLs. Next: mission status and cancellation. |
| 3.5 Live mission + navigation | 88% (7/8) | ✅ `T3.5.1`–`T3.5.3` mission persistence, ordered progress and private updates; `T3.5.4` consent-based two-point post-accept map framing. Partial `T3.5.5` supplies an active-rescuer-scoped destination and car/bicycle/foot route preview; offline elevation is unavailable and OSRM cannot guarantee multiple alternatives, so T3.5.5 remains open. T3.5.6 supplies a selected-route GPS-follow camera with stop/cleanup; T3.5.7 adds consented requester/rescuer/admin location markers and last-seen badges in active mission rooms. T3.5.8 adds requester/admin committed-status timelines (including terminal missions) with server timestamps and live-notice re-reads; T3.5.5 remains partial |
| 3.6 Cancellation + re-dispatch | 100% (7/7) | ✅ `T3.6.1` reasons; `T3.6.2` requester pre-accept cancel; `T3.6.3` guarded rescuer cancellation and mission UI; `T3.6.4` requester accepted-mission teardown; `T3.6.5` urgent admin replacement alerts, red-flash badge, private location and deep link. Cancellation detail reads expose actor/time/resolved reason; T3.6.6 adds explicit one-click replacement re-dispatch to previously unassigned nearest responders |
| 3.7 History + rating | 100% (4/4) | ✅ `T3.7.1` requester SOS history, `T3.7.2` requester-only completed-mission rating API, `T3.7.3` storage/average triggers and `T3.7.4` requester star-rating form plus rescuer paginated history with ratings and timelines. VM/browser acceptance remains a separate gate |

### Phase 4 — Polish — 70% (19 of 27 numbered T4 tasks checked in `docs/TASKS.md` §4.1–4.7)

| Milestone | % | Notes |
|-----------|---|-------|
| Routing polish | 33% (1/3) | ✅ `T4.2.3` resets the GPS-follow camera to north-up and level on exit; elevation and multi-stop routing remain open |
| Search + geocode | 100% (4/4) | ✅ T4.1.1 bounded user browse, indexed substring search, specialty/rating/online and radius filters; T4.1.2–4 local Photon search, reverse address and map fly-to. Browser/target-VM acceptance is still outstanding |
| Realtime + disconnection | 80% (4/5) | ✅ T4.3.1 typed rooms, T4.3.2 heartbeat, T4.3.3 five-minute grace and T4.3.4 authenticated bounded mission sync after rejoin (GPS never replayed). Optional SSE and browser/VM acceptance remain open |
| Testing | 67% (2/3) | ✅ T4.5.1 shared Zod schema suites + Phase 4 route-contract boundary matrix; T4.5.2 mounted-Fastify guest/admin/user prefix guard and absent DELETE coverage. E2E remains open |
| UI/UX + perf | 0% | — |
| Deploy + Android | 0% | — |

---

## Checklist Against Spec §23 (Summary)

See [TASKS.md § Checklist](./TASKS.md#checklist-against-spec-23-39-mandatory) for the 39 requirement-level acceptance checks. That table is broader than the T1 implementation checklist: a T1 checkbox can be complete while a combined product requirement remains unchecked pending live acceptance or later-phase work. Keep the two trackers distinct; do not use the 39-item summary as a count of unfinished T1 tasks.

---

## Environment follow-ups & risks

| # | Issue | Impact | Owner | Status |
|---|-------|--------|-------|--------|
| 1 | Target VM, Docker/Compose, Java 21+, and a real browser are unavailable in the agent workspace | The user reports Ubuntu 24.04 setup and core app/map flows passed. The agent cannot independently reproduce that run or test the separate external-Internet-offline library path and service-worker outage path. | User VM / environment | 🟡 P1-G1 and P1-A1 remain non-blocking follow-ups |
| 2 | Map data size — Iran PBF is large | Start with a Tehran subset; full pipeline later | TBD | 🟡 Mitigated via configurable `MAP_REGION` |
| 3 | No live PostgreSQL is available in the agent environment | User reports successful account registration/login and admin deactivation behavior on Ubuntu 24.04. Automated server tests use injected stores; explicit migration/seed output and extended refresh/logout/recovery/onboarding/admin-create/detail checks remain unrecorded. | User VM / database | 🟡 P1-A2 partial, non-blocking; never reset the existing volume for testing |
| 4 | No Ubuntu VPS provisioned yet | Deployment pipeline cannot be tested against production infrastructure | TBD | 🔵 Pending procurement |

---

## Changelog

### 2026-10-24 — GPS refresh no longer reuses a stale route origin

- A rescuer who tapped **به‌روزرسانی موقعیت** after viewing routes could lose GPS permission, yet the route picker retained the previous starting coordinates. A later ordinary retry then routed from that old fix, and the failure was mislabelled as a routing-gateway error. An explicit position refresh now clears the old origin before requesting GPS; denial leaves no route and the next retry must obtain a new fix. A regression reproduces denial after a successful route and verifies the next route uses the new position. The routing server and offline elevation gap are unchanged.

### 2026-10-24 — Recipient search never shows results for superseded input

- Fixed a recipient-picker race: when a valid username fragment changed, an older request could still resolve in the 300 ms debounce window and show selectable results for the previous fragment. Changing a term now aborts/invalidate the old request immediately, and starting a new search clears results from earlier filters before awaiting the new response. Tests reproduce both the in-flight keystroke race and stale results under a newly applied rating filter. The server search contract is unchanged.

### 2026-10-24 — Cancellation acknowledgment survives bearer refresh

- Fixed a confirmed SOS cancellation being shown as unconfirmed when `requestJson` refreshed an expired bearer on 401 and retried successfully. The composable now recognizes success by stable requester/request identity and request generation, rather than requiring the original token string to remain unchanged. It still discards a result after logout or an account switch. Regressions cover both token rotation and a different owner arriving before the request settles; no server cancellation behavior changed.

### 2026-10-24 — Rating submission survives same-account token rotation

- Fixed a requester rating form race: `ensureSession()` can rotate the bearer token during a submit, but the composable watched the raw token value and treated the rotation as a new account/mission. That reset the form and discarded the intended POST. Rating state now reloads only when token *presence*, mission, or account changes; the submit uses the refreshed token while logout still invalidates the old response. A regression reproduces the lost write before the fix and verifies the refreshed-token submission afterward.

### 2026-10-24 — Navigation exit restores the map camera (T4.2.3)

- Manual Stop, closing the route panel, permission denial, and mission/account changes dispose the foreground watch and return the route map to `pitch: 0, bearing: 0`; redundant stops and initial starts do not animate a camera that was never following. The reset is wired to the actual MapLibre instance in the mission view, with pure navigation tests and a source-pinned binding check. A VM/browser run remains outstanding. T3.5.5 remains blocked on real offline elevation data and OSRM cannot guarantee multiple route alternatives.
- Follow-up safety fix: a disposed map can reject `easeTo` while an account or route changes. The camera reset now fails closed without interrupting watch disposal or hiding the original navigation error; a regression injects a throwing reset callback.

### 2026-10-24 — Rating and rescuer history UI (T3.7.4)

- `/_user/sos-history` now offers an account/mission-scoped rating panel for each completed mission, with an existing-score read before enabling a one-time submission, accessible 1–5 star buttons, optional bounded comment, persisted rating display, and an honest conflict reload when another tab rated first. `/_user/mission-history` lists the rescuer's paginated missions, participant-scoped detail, cancellation reason, recorded requester stars and the committed-status timeline; foreign/unknown deep links fall back to their own list. The navigation menu links to both histories. `GET /_user/sos/missions/:id` now exposes `rating: 1..5 | null` to its authorized participants/admins; mission lists remain unchanged. Pure-TS composable tests and full-route migrated PGlite contract checks cover the read/write flow. A browser and real Ubuntu PostgreSQL VM were not run.

### 2026-10-24 — Live requester rating endpoint (T3.7.2)

- Registered `POST /_user/missions/:id/rate` and marked its OpenAPI runtime flag implemented: only the mission's requester can write one 1–5 rating after completion; comments are trimmed and limited to 500 characters. Unknown/foreign IDs return 404, incomplete or repeated ratings 409, malformed input 400, and the first rating 200 empty. The database unique index arbitrates duplicate writes (including concurrent retries); the `0018` triggers guard eligibility and refresh `users.avg_rating`. Unit tests and the migrated full API contract suite exercise validation, access, persistence and cache. The UI is still T3.7.4; a PostgreSQL VM/browser run was not performed.

### 2026-10-24 — Mission-rating storage and cache (T3.7.3)

- `0018_mission-ratings` creates `mission_ratings` with requester/responder/mission FKs, unique mission+rater, 1–5 value and ≤500-character comment constraints, plus a ratee lookup index. DB triggers verify that only a completed mission's requester rates its assigned rescuer, keep participant IDs immutable, serialize writes through a responder-row lock, and recompute `users.avg_rating` to one decimal on insert/update/delete (NULL after the final rating is removed). This establishes the storage invariant before the T3.7.2 HTTP writer is exposed; rating UI remains T3.7.4. The Drizzle journal/snapshot and migration-shape test now account for PL/pgSQL dollar-quoted bodies. Migrated PGlite regression tests exercise the actual SQL; a real PostGIS/Ubuntu VM and browser were not exercised.
- The Phase 3 headline above was corrected from a stale 33/40 figure by counting all 40 numbered T3 tasks in `docs/TASKS.md`: 37 are now checked, with T3.5.5, T3.7.2, and T3.7.4 still open. This is task-count progress, not a VM acceptance claim.

### 2026-10-24 — Deterministic mission timeline ties

- Rapid committed status transitions can share a timestamp (writes use JavaScript `Date` millisecond precision). The timeline previously broke ties by random history UUID, so it could display completion before acceptance. The scoped history read now orders by stored timestamp, then by the mission's legal progress order, and only then by ID. A migrated PGlite test deliberately inserts the five steps with identical timestamps and UUIDs in reverse order to pin the corrected behavior; no schema change or fabricated timestamp is needed.

### 2026-10-24 — Replacement nearest-ten regression fix

- A one-click replacement previously filtered previous rescuers **after** fetching the nearest ten, hiding eligible responders ranked 11th and later (or incorrectly reporting no candidates). The admin nearest read now accepts `?excludeAssigned=true` and excludes all prior SOS assignees in SQL before its ordered `LIMIT 10`; the normal picker remains unchanged. The client explicitly asks for this mode. A migrated PGlite regression with ten cancelled assignees and a valid eleventh rescuer proves the difference; malformed filters return 400. No browser/VM acceptance is claimed.

### 2026-10-24 — Immediate admin replacement dispatch (T3.6.6)

- The urgent replacement alert and a persisted cancelled-rescuer SOS now offer a deliberate one-click dispatch. The admin store rechecks the exact SOS (`cancelled_by_rescuer` required), reads all of its prior mission assignments, refreshes the nearest qualified responders, excludes all previously assigned rescuers, then immediately calls the existing row-locked dispatch endpoint with up to 10 new IDs. No socket event dispatches by itself. A newer alert/session invalidates stale replies, simultaneous submissions are suppressed, and a status conflict, zero new candidates or HTTP failure displays an actionable error while leaving the manual picker available. Success updates proposals and the queue and clears the replacement state. Pure store tests cover reload, previous rescuer exclusion, changed SOS status, no candidates and logout; no browser/VM acceptance run is claimed.

### 2026-10-24 — Cancellation detail reads (T3.6.7)

- Requester/admin SOS detail and participant/admin mission detail now include `cancelledBy`, `cancelledAt`, and `cancellationReason` (`{id,key,label,labelFa,customText}` or null). The reason is resolved by foreign key after the same existing scoped read; inactive reasons remain legible as history. Requester cancellation belongs to both its SOS and cancelled missions. A rescuer cancellation belongs to its mission: the parent SOS's `cancelled_by_rescuer` state signals replacement, but the SOS has no cancellation reason or timestamp of its own (those fields stay null). The listing schemas do not grow. PGlite tests cover both cancellation paths and the shared API contract harness validates detail responses. Browser/VM behavior was not exercised.

### 2026-10-24 — Mission status timelines (T3.5.8)

- Requester SOS history and admin dispatch now show the ordered, durable `mission_status_history` steps and their timestamps for each mission, including completed, requester-cancelled and rescuer-cancelled assignments. The read routes are `GET /_user/sos/missions/:id/timeline` (participant-only) and `GET /_admin/sos/missions/:id/timeline` (active admin session); foreign/unknown missions share 404. Neither route includes location history or cancellation reason text. An admin opts into terminal request missions with `?includeTerminal=true` on the existing request-missions read; the default still returns only active missions. Requester mission listing accepts optional `sosRequestId` while enforcing the participant/role filter in SQL.
- The shared RTL timeline panel uses persisted status rows, not socket event timestamps; a validated status/cancellation notice or reconnection triggers a new scoped read, and a manual refresh handles unavailable sockets. A mission/account switch closes the socket and drops stale reads; the live-location map remains active-only. Migrated PGlite, end-to-end shared-contract and pure client lifecycle tests cover ownership, terminal steps and cleanup; this screen has not been exercised in a real browser/Ubuntu VM.

### 2026-10-24 — GPS lifecycle race fixes (T3.5.6 / T3.5.7 audit)

- A stopped mission GPS watch could deliver a queued fix or delayed Socket.IO acknowledgement into a newly started share, unexpectedly stopping it or publishing an old coordinate under the new consent. Sharing epochs now isolate callbacks, restart immediately resets throttling, and queued disconnect/terminal events from a replaced socket cannot tear down a newer connection. A new login on the same account/device replaces the private socket and **does not inherit** GPS consent; ordinary access-token refresh within the same session still works. Synchronous geolocation denial now clears a returned watch disposer.
- Route-follow navigation likewise no longer lets a queued callback from an earlier watch stop the active camera, and a synchronous denial disposes the GPS watcher rather than reporting a successful start. Regression tests cover quick stop/restart, stale acknowledgements and events, same-device login replacement and synchronous errors. T3.5.5's elevation/alternative-count gap is unchanged.

### 2026-10-24 — Consented three-role live mission positions (T3.5.7)

- Requester, rescuer and admin now join only active private mission rooms, can explicitly share their own fresh GPS (separately from route-follow and general location shares), and see all three role markers with Online/Offline + last-seen badges. Requester history selects the matching active mission; admin dispatch gets active missions through a separately authorized, no-store SOS-scoped read; rescuer desk uses its active mission. Maps work after reload and show no fabricated coordinate before consent.
- The publish path checks mission role/status in SQL before and after the normal live-location pipeline (session/account, priority device, 60/min limit and persistence). Foreign/terminal/unauthorized publishes never reach a mission room. The frontend ignores malformed, wrong-mission and out-of-order events; it clears watches on stop, unmount, mission/account changes, denied permission, disconnect and terminal events. The 30-second badge is based on last server-received fix, **not connectivity proof**. Migrated PGlite + live sockets verify private three-role delivery and terminal guards; composable tests cover validation and teardown. T3.5.5 elevation/alternative-count and T3.5.8 timeline remain open.

### 2026-10-24 — Foreground rescuer route-follow camera (T3.5.6)

- A rescuer can start navigation on a chosen validated route, then stop it explicitly. GPS fixes move the MapLibre camera at most once per second using the closest upcoming route segment for bearing, the current device center, and the specified car/bicycle/foot pitch/zoom presets (60°/17, 45°/16, 0°/17). Route/profile changes are disabled while following; denied permission, a failed map, mission/account change or leaving the screen stops and clears the browser GPS watch. A text status/error remains available if the map or location is unavailable. This is a foreground route-follow camera, not turn-by-turn instructions or a guaranteed ETA; the separately consented live mission positions are covered by T3.5.7.

### 2026-10-24 — Mission route preview and owner-scoped destination (T3.5.5 partial)

- Added active-rescuer-only `GET /_user/sos/missions/:id/navigation` returning `{missionId,incident:{lat,lon}}` under a SQL status/owner predicate. Foreign/requester/admin/terminal IDs share the same 404; no-store and strict client response parsing apply. PGlite and route tests cover the owner/terminal boundary. This enables incident routing after page reload without making an SOS publicly readable.
- `/_user/mission` offers an explicit location-permission step, transport selection (car/bicycle/foot), same-origin offline `POST /route`, validated/limited OSRM polyline decoding, selectable routes on MapLibre, approximate distance/time and robust errors for denial, no route or unavailable local service. Requests and private coordinates are aborted/cleared on account, mission or profile change. **Still open:** no elevation source exists in the current offline OSRM adapter, and it may return fewer than two alternatives. Elevation is explicitly labeled unavailable; no ETA guarantee or turn-by-turn claim is made. T3.5.5 remains unchecked pending offline elevation integration.

### 2026-10-24 — Post-accept incident and rescuer map framing (T3.5.4)

- A successful rescuer accept now retains the accepted incident details in session-only state and opens a dedicated map card with an incident marker. If the rescuer previously opted into location, MapLibre fits both markers with 64px padding and a safe maximum zoom; otherwise the incident stays centered with visible coordinates and a clear opt-in button. Permission failure never blocks acceptance. This is a straight-line overview, not route guidance or an ETA; after reload, persistent mission navigation still requires T3.5.5–T3.5.7.
- Pure camera math tests guard `[lon,lat]` ordering, bounds and the no-GPS/same-point fallback; store tests verify accepted incident retention and cleanup across logout, and source-pinned markup checks cover consent and map wiring.

### 2026-10-24 — Urgent admin replacement notice (T3.6.5)

- The admin console now consumes strictly validated, admin-scoped `mission:cancelled-by-rescuer` notices once per mission. It chimes unless muted, and prioritizes a persistent assertive red-flash snackbar with direct dispatch deep link; the queue and detail show a NEEDS REPLACEMENT badge/banner after the SOS is confirmed dispatchable. Review flags and last-known rescuer location never enter the participant UI. The exact request is read even when it is beyond the 100-row list, while reconnect/reload still exposes persisted `cancelled_by_rescuer` rows without replaying sound.
- In-flight pre-cancellation list reads cannot overwrite the new state; authoritative SOS reads prevent offering re-dispatch while another mission remains active. Dismissal hides the transient alert but not the replacement badge; a committed re-dispatch or resolved server snapshot clears live notice state. Socket listeners/private notice state are torn down on logout/account switch. Store/parser tests cover duplicate, malformed, out-of-queue, resolution and session safety; target-browser sound remains subject to autoplay permissions. The dedicated re-dispatch UX work remains T3.6.6.

### 2026-10-24 — Owner-scoped SOS and mission history reads (T3.7.1)

- `GET /_user/sos/requests?role=requester` and `/:id` now read only the requester’s own rows, indexed by owner and newest-first timestamp (`0017`). `role=rescuer` on SOS history is rejected rather than ignored; responders have the already-live participant-scoped `GET /_user/sos/missions?role=rescuer` and `/:id`. Unknown and foreign SOS IDs are equally 404. Shared response schemas are exercised end-to-end against migrated PGlite, including foreign denial, pagination, and index presence.
- `/_user/sos-history` replaces the placeholder with a responsive RTL history/detail, safe deep-link fallback, authenticated signed-photo viewing, clear empty/error/loading states, and the same reason/confirm cancellation dialog used immediately after SOS submission. Reopen after refresh and cancel an accepted SOS without orphaning its rescuer. Client composable/source-pinned tests cover stale session/page responses and read failures. The rescuer’s full historical timeline and star-rating UI remain T3.7.4, not claimed here.

### 2026-10-24 — Safe requester cancellation of accepted missions (T3.6.4)

- The requester’s reason-gated cancel now also terminates every active mission on that SOS under SOS→sorted rescuer→mission locks, writes one history step for each, expires pending offers, and frees each responder only when they have no other active mission. An accepted SOS with no active mission answers 409 rather than claim a cancellation that did not occur. Successful cancellation broadcasts once to the union of mission, participant and admin rooms; failed socket delivery never reverses the committed result. Rescuer cancellation was already committed in T3.6.3.
- Migrated PGlite/live Socket.IO integration covers multiple missions, an unrelated active mission keeping its rescuer busy, idempotent retry and room delivery. Requester SOS history UI/read work shipped separately under T3.7.1 so the action remains accessible after the initial SOS sheet closes; the admin urgent replacement UI remains T3.6.5.

### 2026-10-24 — Rescuer cancellation, review flags, and mission desk (T3.6.3)

- Active rescuer mission cancellation now locks SOS→rescuer→mission, checks scoped reason/custom text, writes a terminal mission history step, frees a responder only if no other active mission exists, and marks the SOS for replacement only if no active mission remains. A 3/hour per-user pre-handler budget is separate from creating SOS. `admin_alerts` migration `0016` persists a review on the third cancellation in a UTC day and marks Other for admin approval without keeping an unable rescuer assigned. Participants get a redacted cancellation notice; admins get last location and review flag. Socket errors never turn a committed cancellation into a 500.
- Authenticated mission list/get read endpoints are participant-scoped (admin may read a single mission); active missions sort first so the RTL `/_user/mission` desk works after refresh, not just immediately after accepting an offer. The More menu conceals a reason+confirmation workflow with guarded asynchronous states, duplicate-submission prevention, actionable conflict handling and session-safe reads. This is a functional cancellation UI, **not yet** the admin replacement alert (T3.6.5), the requester active-mission teardown (T3.6.4), or navigation (T3.5.4–T3.5.7).
- Migrated PGlite + live Socket.IO tests validate history, release, review flags, admin-only coordinates and 3/hour throttle; route and composable tests validate authorization, retries, confirmation, and session changes. No browser/VM rating is claimed.

### 2026-10-24 — Requester pre-acceptance cancellation (T3.6.2)

- A row-locked requester-only `POST /_user/sos/requests/:id/cancel` checks an active scoped reason and custom text, stores the cancellation reason/time, and expires pending offers atomically. Accepted/active missions return `409` rather than strand a busy rescuer; mission teardown and post-accept cancellation remain T3.6.4. The authenticated reason catalog is shared by both requester and rescuer types. Post-submit SOS sheet UI adds an explicit warning, reason picker, required custom explanation, confirm button, loading/failed/retry states, and a cancelled success state (no one-click destructive action).
- Migrated PGlite tests cover 404 foreign requests, invalid/wrong-scope reasons, atomic offer withdrawal and accepted-mission rejection. The API-contract test exercises both routes; composable tests cover selection, duplicate-submit safety, and late catalog responses. This is not a claim of browser/VM acceptance.

### 2026-10-24 — Private mission status delivery (T3.5.3)

- `mission:subscribe` rechecks active account, persisted session, and mission participant/admin rights before joining `mission:{id}`; unknown and foreign IDs return the same unavailable ack, and reconnecting requires a fresh subscription. A newly committed status sends one Socket.IO union broadcast to the mission, requester, rescuer, and admin rooms (no duplicates for a socket in two rooms). Retries and failed writes send nothing, while socket errors are logged without undoing a committed PATCH.
- Migrated PGlite + live websocket integration verifies that the requester, rescuer, and admin each receive one strict-schema event and a nonparticipant receives none. The mission UI will subscribe and render timelines under T3.5.8; no browser run is claimed here.

### 2026-10-24 — Ordered mission progress endpoint (T3.5.2)

- Added `PATCH /_user/missions/:id/status`, rescuer-owned row locking in the same SOS→rescuer→mission order as acceptance, and atomic status/history updates. A duplicate step is a no-op; skipped, reversed and terminal transitions are `409`; foreign/unknown missions are the same `404`. Completion releases the rescuer and marks the SOS complete only when it has no other active missions.
- Migrated PGlite tests cover all four transitions, replay, ownership, rollback on history insert failure, and persisted busy/SOS state; the all-API contract harness validates the runtime response. Realtime notification remains T3.5.3 and the visual mission timeline remains T3.5.8.

### 2026-10-24 — Rescuer offer desk (T3.4.6)

- Built a responsive RTL master/detail proposal inbox with clear urgency, requester and incident names, a locally served incident map, consent-based straight-line distance, signed evidence-photo access, pagination, explicit accept/decline confirmations and optional decline reason. The bell links directly to a selected offer.
- Added rescuer-scoped joined incident details to the pending-offer read, with migrated PGlite coverage of names, coordinates, photo path, pagination and caller isolation. The store locks one decision at a time, ignores stale post-logout replies and treats the accepted mission ID as committed even if a later list refresh fails. Client API, presentation and source-pinned view tests cover this path. Navigation and mission status controls remain T3.5 tasks.

### 2026-10-23 — Full Phase 2 & Phase 3 cross-cutting bug audit & regression suite

- **Server realtime admin auth parity, multi-tab session presence, search liveness, and deadlock-free dispatch locking (`packages/server`).**
  - Fixed `authenticateSocket` and `locationUpdateAck` in `src/realtime/socket.ts` so `role === "admin"` accounts with `mustCompleteSecurityQuestions = true` (as created by `create-admin` / default schema) are permitted on Socket.IO just as `authorizeAdmin` permits them on REST `/_admin/*`, while keeping `role === "user"` strictly blocked with `SECURITY_QUESTIONS_REQUIRED`.
  - Wired multi-tab-safe real-time socket session presence (`touchSessionPresence` in `src/db/security-questions-store.ts`, `attachRealtime` / `handleLocationUpdate` in `src/realtime/socket.ts`, and `is_online = true` in `src/db/user-search-store.ts`) so `user_sessions.is_online` and `last_active_at` stay accurate across live connections, GPS updates, `GET /_user/devices`, `GET /_user/users/search?online=true`, and `GET /_admin/sos/requests/:id/nearest`.
  - Added deterministic `ORDER BY "users"."id" ASC FOR UPDATE` row locking on candidate responders inside `DrizzleSosDispatchStore.dispatchResponders` (`src/db/sos-dispatch-store.ts`) to serialize concurrent dispatch/acceptance transactions without deadlock.
- **Client realtime auth recovery, history playback retry, share deep-linking, live revocation sync, and admin console hydration (`packages/client`).**
  - Added `RealtimeClient.reconnect()` and server-disconnect (`"io server disconnect"`) / `401` recovery across `useLiveCompanions`, `useLiveLocationBroadcast`, `useAdminSosStore`, and `useHistoryPlayback`.
  - Fixed `useAdminSosStore.refreshRequests()` to hydrate the full recent SOS snapshot on initial `/_admin/dispatch` load so `cancelled_by_rescuer` emergencies are visible immediately and all filter tab counts (`pendingCount`, `dispatchedCount`, `all`) match reality from first paint.
  - Deep-linked «پخش در نقشه» in `ShareLists.vue` (`?historyShare=<id>`) directly into `HistoryPlaybackPanel.vue` (`selectSource("grant")` + `selectGrant(id)`), added live `location:share-ended` synchronization to `ShareLists.vue`, added specialty/rating/online filter guidance in `ShareDialog.vue`, excluded already-assigned/inactive candidates in `AdminCategoriesView.vue`, and rendered `"همین الان"` instead of `"0 دقیقه پیش"` for active sessions in `DevicePriorityPanel.vue`.
- **Verification:** Added `packages/server/src/sos/phase2-3-audit.pglite.test.ts` (real WASM PostgreSQL + live Socket.IO) and `packages/client/src/audit/phase2-3-audit.test.ts`; all repo lint checks, typechecks, Vite build, Python/Node map tests, and **985 Vitest tests** pass.

### 2026-10-23 — End-to-end Phase 2 audit, missing client wiring completion, and server/client bug fixes (`P2-Q2`)

- **Server socket eviction, inactive-recipient filtering, and self-room parity.** Closed three server-side gaps
  across `packages/server/src/{realtime/socket,auth/session,auth/forgot-password,admin/users,db/location-share-store,db/recovery-store,app}.ts`:
  (1) open Socket.IO connections now disconnect immediately when a session logs out (`disconnectSessionSockets`),
  when a password reset revokes all sessions (`disconnectUserSockets`), or when an admin deactivates/suspends an
  account (`disconnectUserSockets`), and `location:update` re-verifies active session + unsuspended active user
  before processing any GPS sample; (2) `DrizzleLocationShareStore.listActiveOutgoingShares` now excludes
  deactivated/suspended recipients (`INNER JOIN users` on `is_active = true AND is_suspended = false`), verified
  against embedded PostgreSQL in `src/location/p2-a2.pglite.test.ts`; (3) HTTP `POST /_user/location/update` now
  also broadcasts `location:peer-update` to `user:<ownerId>` matching WebSocket self-room parity. Phase 2 scope
  boundaries on `shares.ts` (Privacy-v2 allowlists) and `socket.ts` (`suspendedUntil`) remain untouched.
- **Live broadcast + priority status bar (`LiveBroadcastBar.vue`) & client socket lifecycle fixes.** Wired
  `useLiveLocationBroadcast` and `usePriorityDevice` into `stores/broadcast.ts` + `LiveBroadcastBar.vue` on both
  `/_user` (replacing the stale `UserDashboardView.vue` placeholder caption) and `/_user/map` (`compact` overlay).
  Fixed eager GPS startup before `start()`, unstopped `watchPosition` leaks across `stop()`/logout, 60s stationary
  heartbeat timestamp staleness against `MAX_ACCEPTED_SAMPLE_AGE_MS`, unhandled geolocation permission/unavailable
  errors, and missing `ensureSession()` JWT refresh on socket auth expiry across both `useLiveLocationBroadcast`
  and `useLiveCompanions`.
- **History-grant creation UI (`T2.2.3`), `ShareLists.vue`, `/_user/devices`, and `HistoryPlaybackPanel.vue`.**
  Added `"history"` (`تاریخچه مسیر`) mode to `ShareDialog.vue` (`createLocationHistoryShare`, presets, custom
  `datetime-local` range, optional `maxPoints`, `SHARE_RANGE_TOO_LARGE` error mapping, and human-readable device
  names in the `409 PRIORITY_DEVICE_REQUIRED` chooser); rendered incoming `receivedHistory` grants with `/_user/map`
  playback links and distinct history-grant confirmation copy in `ShareLists.vue`; preserved `targetUsername` on
  `/_user/devices` share rows and fixed «اعمال این دستگاه برای همه» to target `currentDeviceId`; and re-read
  companion history grants on switching into grant mode plus manual `تازه‌سازی` in `HistoryPlaybackPanel.vue`.
- **Verification.** `925` Vitest tests (`55` `@borobiya/shared`, `484` `@borobiya/server`, `386` `@borobiya/client`),
  `bun run lint`, `bun run typecheck`, `bun run build`, Python suites (`scripts/` + `map-server/scripts/`), and
  `map-server/routing-gateway` Node tests all green. `P2-A1`, `P2-A2` (PostGIS/container half), and Spec rows
  `14`–`16` remain unchecked pending live execution on the Ubuntu VM (`docs/UBUNTU_VM_RUNBOOK.md` section `6.8`).

### 2026-10-23 — Post-v0.2.0 audit follow-ups: realtime share-end event, runtime-status guards, lint gate, PGlite `P2-A2` execution, and `§ 6.8` VM sign-off sheets

- **Realtime share termination (`T2.1.5` follow-up).** `DELETE /_user/location/share/:id` and the 60s
  `runLocationJobs` expiry sweep previously retired rows in PostgreSQL without notifying connected receivers,
  leaving stale companion markers visible for up to 30 minutes (`COMPANION_DROP_AFTER_MS`) despite
  `docs/USER_MANUAL.md` §11 promising instant stop. Both paths now emit `location:share-ended`
  (`{ shareId, userId, reason: "revoked" | "expired" }`) to `userRoom(targetUserId)` only when a live share
  actually transitions (`revokeShare` discriminates `revoked` vs `already-revoked` vs `not-found`;
  `expireOverdueShares` uses `RETURNING id, owner_id, target_user_id`). On the client,
  `useLiveCompanions` stays pure transport and delegates removal to `endCompanionShare` in
  `packages/client/src/live/companion-locations.ts` — the single module deciding who appears on the map,
  removing a peer immediately when its active share ends or when silence exceeds 30 minutes.
  `shares.ts:142` (`TODO` Privacy-v2 allowlists, spec §7.4) and `socket.ts:208` (`TODO` `suspendedUntil`,
  SECURITY §10.1) remain untouched out of Phase 2 scope as directed.
- **Stale `v0.2.0` claims eliminated + automated drift guards.** Replaced hardcoded prose in
  `packages/server/src/plugins/swagger.ts` with `describeOpenApiRuntimeStatus()`, derived directly from
  `API_ROUTE_DESCRIPTORS` + `implementedKeys` (currently 30 implemented routes — including Phase 2 location
  sharing/history/devices, Phase 3 admin catalogs, and `POST /_user/sos/requests` +
  `POST /_user/sos/requests/:id/photo` — and 29 `contract-only` routes returning `404`). Updated
  `docs/API.md`, `docs/ROADMAP.md`, `docs/TASKS.md`, and `docs/USER_MANUAL.md` (fixed the dangling `(§10.5)`
  citation, fixed two broken ToC anchors, marked unimplemented client flows in `§§14–19` `— Planned` so
  readers are not told to press an SOS button that is still open under `T3.2.4`, and reconciled `§23` against
  `router/index.ts`), backed by new automated guards in `packages/server/src/app.test.ts` (asserting all 59
  Fastify route definitions, OpenAPI `x-borobiya-runtime-status`, `swagger.ts` description, and `docs/API.md`
  summary lines match) and `packages/client/src/router/index.test.ts` (asserting `docs/USER_MANUAL.md` §23
  matches every route in `router/index.ts`).
- **Script lint & offline test hygiene (`bun run lint`).** Resolved all Ruff (`EXE001`, `I001`, `PLW1510`)
  and `shellcheck` (`SC2034` unused variables across `map-server/scripts/fetch-planetiler-sources.sh` and
  `map-server/scripts/verify-map-pbf.sh`) findings, added `--skip-checks` to
  `TestNoProxyCoversTheComposeNetwork` in `scripts/test_proxy_scripts.py` so the suite passes deterministically
  offline, and wired `./scripts/check-repo.sh` into root `package.json` (`bun run lint`, `typecheck`, `test`,
  `build`).
- **Real PostgreSQL execution for `P2-A2` + runbook sign-off sheets (`§ 6.8`).** Added
  `packages/server/src/location/p2-a2.pglite.test.ts` running all 13 journaled Drizzle migrations
  (`0000`–`0012`) plus production `DrizzleLocationHistoryStore`, `DrizzleLocationShareStore`, `runLocationJobs`,
  `repairStaleSharePins`, `historyWindowQuery` window functions, `CHECK` constraints, and `parseServerEnv`
  window validation against embedded PostgreSQL (`@electric-sql/pglite`, 6/6 green). Added step-by-step two-browser
  (`P2-A1`) and PostGIS/container (`P2-A2`) measurement and sanitized sign-off sheets in
  `docs/UBUNTU_VM_RUNBOOK.md` § 6.8; both `P2-A1` and `P2-A2` remain unchecked in `docs/TASKS.md` pending
  execution on the Ubuntu VM.

### 2026-10-23 — v0.2.0 released

- **What went out.** Everything between `v0.1.0` (`95a88a3`, 2026-10-21) and this branch: 55 commits, 208
  files, +42,269/−826, and **seven migrations (`0006`–`0012`)**. Feature content: Phase 2 end to end —
  live-share create/revoke/list, realtime `location:update` over Socket.IO with the priority-device rule, the
  share-expiry and history-retention jobs, history-share grants with windowed reads, playback on the map, the
  share dialog and target picker, the Active Devices screen, native device identity, and live companion
  markers — plus Phase 3's first two milestones: the category and incident-type catalogs with their admin
  screens, and `sos_requests` with SOS creation and photo upload. Operational content: the Ubuntu VM
  runbook rewritten and audited three times against the scripts, `enable-proxy.sh`/`disable-proxy.sh`
  replacing the runbook's hand-written proxy steps, setup asking for and *proving* both database passwords
  the way the application authenticates, the `0012` PostGIS quoting fix, the routing gateway's upstream
  diagnostics, and the `noProxy` fix for the proxy leak that made a healthy stack unable to route.
- **The gates ran, and one of them caught a real problem** — see the entry below this one:
  `packages/server/src/db/schema.test.ts` was *asserting the broken quoted DDL*, so the migration fix and the
  test could not both be right. The test now asserts the corrected spelling and says why, and it no longer
  restates a reviewed line as its own authority.
- **Version surface.** `0.1.0` → `0.2.0` in `@borobiya/shared`, `@borobiya/server`, `@borobiya/client`, and in
  the two `process.env.npm_package_version ?? "0.1.0"` fallbacks (`packages/server/src/app.ts`, so `GET
  /health` reports the release, and `src/plugins/swagger.ts`, so the OpenAPI `info.version` does). The root
  `package.json` stays versionless and `private`, as it was for v0.1.0.
- **How it was gated here, and the limit of that claim**: `docs/WORKFLOWS.md` § 7 lists the gates as
  `bun install` + vitest per package + `tsc`/`vue-tsc` + `vite build`. This sandbox has no bun and no
  `node_modules`, so they were run in a scratch copy of the tree with `npm install` (npm 12, Node 22, the
  three `workspace:*` specifiers rewritten to `*`, dependencies resolved fresh rather than from
  `bun.lock`): **shared 55 passed, server 472 passed, client 370 passed, tsc clean for shared and server,
  vue-tsc clean, `vite build` succeeded** (its only warning is the pre-existing maplibre chunk size).
  That is indicative, not identical: a `bun install` on the release machine is still the authoritative run,
  and no CI exists — `.github/workflows` is empty, so tagging publishes nothing by itself.
- **Offline suites, which run unmodified here**: `pytest -q scripts/ map-server/scripts/` → 185 passed,
  1 skipped, 12 subtests (the shell-pipeline tests, the migration-folder guard, the credential tests);
  `node --test map-server/routing-gateway/*.test.mjs` → 36 passed; `bash -n` on every tracked `.sh`;
  shellcheck clean on `scripts/*.sh`; `scripts/check_runbook_markdown.py` clean on every doc except the one
  finding this repository accepts and tracks in USER_MANUAL.md itself: a cross-reference to section 10.5 of
  that manual that no heading in it provides (writing the section sign here would make *this* changelog the
  broken reference, which is the checker working as intended, not a rule to route around).
- **Known, and stated in the release notes rather than hidden**: the browser screens in this release
  (share dialog, playback panel, device settings, admin catalogs) have not been exercised end to end in a
  browser by anyone; the VM applied all migrations and seeded successfully on 2026-10-23 but
  `verify-routing.sh`/`verify-geocoding.sh` are waiting on the `noProxy` fix being recreated into the
  running containers; and `docs/API.md` + `packages/server/src/plugins/swagger.ts` still said SOS is
  "contract-only" (misremembered at cut time as `docs/MAP_SERVER.md`; fixed and guarded in the post-v0.2.0
  audit pass).
- **Cut:** PR #4 merged into `main` as `a7fa830`, tagged with annotated tag `v0.2.0`, and published on GitHub
  with curated release notes covering the scope since `v0.1.0` rather than dumping the full `docs/PROGRESS.md`
  running log verbatim (`docs/WORKFLOWS.md` §7 updated accordingly).
### 2026-10-23 — the routing 502 was our own proxy leak, and a `noProxy` of loopback plus a CIDR exempts nothing

- **The measurement killed the leading hypothesis.** The VM ran the two commands from the previous entry.
  `cat /data/${MAP_REGION}.metadata.json` inside `osrm-car` reported
  `region: borobiya`, `areas: [ir-tehran]`, `bbox: [51.0, 35.5, 51.7, 35.9]`, `algorithm: mld`, and the full
  set of MLD artifacts with matching mtimes — the graph *is* Tehran's. The direct `bun -e` replay of the
  gateway's own request printed `osrm HTTP 502` **with an empty body**, and `docker compose logs osrm-car`
  showed a server that started, bound :5000, and printed nothing about the request. An empty 502 is not
  something `osrm-routed` produces: it answers its own failures with a JSON object carrying `code`, which is
  why the gateway's old `osrmResponse?.message ?? "…"` fell back to a canned sentence.
- **What was in the way instead.** The gateway container's own environment. `~/.docker/config.json`'s
  `proxies.default` is merged into every container the client creates — not only build containers — and
  `scripts/enable-proxy.sh` writes that key with `noProxy` = `localhost,127.0.0.1,::1,172.30.0.0/24`.
  Compose services address each other by name (`http://osrm-car:5000`, `http://photon:2322`), and a CIDR
  entry matches a *numeric* host only, so that list exempts nothing a running stack actually calls, while
  `localhost` exempts exactly the one hop (the healthcheck) that makes the service look healthy. bun's
  `fetch` honours `HTTP_PROXY`/`ALL_PROXY`, so the request went to the proxy, the proxy could not resolve
  `osrm-car`, and the reply was the proxy's 502 with no body — while psql and postgres.js, which ignore proxy
  variables, kept working, which is why the database half of the same stack was healthy throughout.
- **Fixed at the source, in the direction the user asked for.** `PROXY_NO_PROXY_DEFAULT` now keeps loopback,
  the two Docker Desktop host aliases and the pinned subnet, and **appends every service name read out of
  `docker-compose.yml`** (`proxy_compose_service_names`, overridable with `BOROBIYA_PROXY_COMPOSE_FILE`),
  so a renamed or added service follows automatically and no list is remembered in two places. A missing or
  unparseable Compose file degrades to the old loopback-only value instead of failing a proxy enable, the
  scan skips a comment at column zero (a fixture caught that on the first run), and an explicit
  `BOROBIYA_PROXY_NO_PROXY` is still used verbatim — appending derived names to an operator's exclusion list
  would route something they excluded on purpose. `enable-proxy.sh`'s section 4 and `proxy-common.sh`'s
  header no longer call this "the builder's" setting, which is the misunderstanding that caused the fault.
- **Tests** (`TestNoProxyCoversTheComposeNetwork`, 5): the fixture-derived names appear in both
  `~/.docker/config.json` and the shell block (one list, or a terminal's curl and a container's fetch would
  disagree about what bypasses the proxy); every name in the *shipped* Compose file is present, with the
  test's own parser scoped to `services:` so it is a check and not a restatement; the override wins
  verbatim; a missing file degrades rather than failing; and the library text still states the runtime scope.
  Proved non-vacuous by deleting the derivation: the two coverage tests fail, restore, all 5 pass.
- **Docs.** § 5.3 now explains the key's real reach and why names-not-ranges is the requirement, and its
  manual snippet derives `noProxy` from the Compose file instead of shipping a literal; § 5.2's `no_proxy`
  sentence names the service list; § 9.3's 502 entry was rewritten — yesterday it asserted "a 502 from the
  gateway means an OSRM container answered", which this measurement disproves, so it now branches on
  `upstream_code`/`upstream_body` being absent (proxy: measure the container env, replay with the vars
  cleared, recreate the containers because environment is fixed at creation) versus present (data: read the
  mounted graph's `metadata.json`), and says restarting a container is a step in neither branch.
- **Still open on the VM**: the diagnosis is inferred from an empty-body 502 plus the shipped script's
  behaviour, not read from the user's container env. The confirming commands are `docker compose exec -T
  routing-gateway env | grep -i proxy` and the same probe with the proxy variables cleared; if the first is
  empty, this theory is dead and the gateway's new `upstream_*` fields are the next measurement.
- **Measured**: `pytest -q scripts/test_proxy_scripts.py` → 46 passed, 1 skipped, 4 subtests; the gateway's
  `node --test` suite still 36/36; `bash -n` on every tracked `.sh`; shellcheck clean on `scripts/*.sh`;
  the runbook clean under `check_runbook_markdown.py` at 2003 lines.

### 2026-10-23 — the routing 502 was unreadable, so the gateway now reports what the upstream said

- **What the VM reported**: after the migration fix, `verify-routing.sh` failed with
  `car route returned HTTP 502: {"error":"routing_failed","message":"OSRM returned an error."}` while
  `routing-gateway` and `api` were healthy and tiles for the same area returned 200. That message is the
  gateway's *own* fallback string, which is the finding: `handleRoutingRequest` did `await response.json()`
  and then `osrmResponse?.message ?? "OSRM returned an error."`, so an OSRM 4xx, an OSRM 200 with an
  unexpected shape, and a body that is not a routing answer at all all collapsed into one sentence. Nothing
  was logged either, so `docker compose logs routing-gateway` had no record of the failure at all.
- **The contract change, deliberately narrow** (`map-server/routing-gateway/upstream.mjs`, shared with the
  Photon proxy that had the same blindness): the body is read once as text and then parsed, and every 502
  carries `upstream` (host + path, never the query string — a Photon search is user data and must not be
  echoed to a browser or into a log), `upstream_status`, `upstream_code`, `message` (OSRM's own when present,
  otherwise a sentence saying it was absent), and a 400-character `upstream_body` excerpt only when the body
  was not an OSRM object — `upstream_body: null` when it could not be read at all. `no_route` (422) and the
  two 503s keep their fixed two-key shape, because a client cannot act on more than that; the reason for a
  refused or timed-out connection goes to the log instead. The routing 502 and geocoding 502 bodies are the
  only shapes that changed.
- **A new module in that image is a Dockerfile trap, guarded instead of trusted**: the gateway image
  `COPY`s four named files, so a fifth imported module builds fine and dies at container start with
  `Cannot find module` — an unhealthy service and no test failure. `packaging.test.mjs` now walks the
  `CMD` entrypoint's relative imports transitively and fails if any is not in the `COPY` list, that every
  copied file exists and is non-empty, and that compose still builds with the gateway directory as its
  context (the bare `COPY` names depend on it). Proved by deleting `upstream.mjs` from the `COPY` line: the
  guard reports `upstream.mjs is imported by the entrypoint but is not in the Dockerfile COPY list`; put back,
  it passes.
- **`verify-routing.sh` prints the request body and the two commands that separate a gateway fault from a
  data fault**, and was run against a stand-in gateway returning this exact 502 to confirm the output and the
  exit code. § 6.7's spot checks gained a direct replay of the gateway's own request against
  `osrm-car:5000` (so a gateway bug cannot hide a data bug) and the `osrm-routed` provenance read —
  `cat /data/${MAP_REGION}.metadata.json` is the `region`/`areas`/`bbox` that `build-routing.sh` recorded
  for the graph actually mounted, which is the only way to see "a healthy OSRM is serving a different area".
  Those spot-check `curl`s also stopped using plain `-f`, which throws the body away — on this endpoint the
  body is the whole message.
- **Not claimed**: no root cause for *this* 502 was established here. The repository cannot start OSRM, and
  the same script and profile URLs passed on this VM on 2026-10-20 for all three profiles, so the
  difference is in the machine — most likely the graph `MAP_OSRM_DATA_DIR` now points at. The commands above
  are the measurement; § 9.3 names the three readings that decide it, and says restarting the container is
  not one of them because it reloads the same graph.
- **Measured**: `node --test map-server/routing-gateway/*.test.mjs` — the command `docs/MAP_SERVER.md`
  documents — goes from 19 to 36 passing tests (Node v22, no network, no Docker); `bash -n` and shellcheck
  clean on the changed script; the migration/credential/proxy suites and `pytest -q scripts/
  map-server/scripts/` unchanged and green; both touched docs clean under `check_runbook_markdown.py`.

### 2026-10-23 — a fresh database rejected `0012`: the column type was one quoted identifier

- **The symptom, from the VM that got past the password.** `ALTER ROLE` + a re-probe of `1` settled the
  credential, then the migration stopped at `CREATE TABLE "sos_requests"` with
  `42704: type "geography(Point,4326)" does not exist` — in a database where `CREATE EXTENSION postgis` had
  already run. Postgres reads `"geography(Point,4326)"` as a single quoted *name*, so it looked for a type
  literally containing the parentheses instead of `geography` with a type modifier, and the whole column
  definition was unresolvable. `0002_lazy_shiver_man.sql` writes the same type bare in
  `ALTER TABLE ... ADD COLUMN` and worked, which is the tell that the type is fine and the spelling is not:
  PostGIS documents `geography(Point,4326)`, and so does drizzle for `varchar(30)` / `numeric(2, 1)` in this
  very folder. It had never run anywhere fresh — a migration that errors is not recorded as applied, so
  `0012` was simply broken since it was checked in.
- **Fixed where it hurts:** the file (`0012_modern_sentry.sql`, one line), and `packages/server/src/db/schema.ts`'s
  comment on the `customType`, which told the reader to "keep generated DDL unquoted" as an aspiration with
  no owner. Now `scripts/test_migration_sql.py` is that owner — 8 tests over the checked-in SQL: no quoted
  identifier carrying a type modifier anywhere in the folder, every geography column spelled exactly the
  string `schema.ts` returns, the journal and the folder describing the same migrations in `idx` order (an
  orphan `.sql` never runs; a journal entry with no file fails the migrator), statements separated by the
  breakpoint marker the runtime splits on whenever there is more than one, and `CREATE EXTENSION postgis`
  ordered before the first file that uses the type. The guard was proved non-vacuous by hand: reintroducing
  the quoted form fails it with `0012_modern_sentry.sql:7: "geography(Point,4326)"`, restoring passes.
- **Why a single-statement file with `breakpoints: true` is not a defect** — drizzle-kit writes the flag for
  everything, so that assertion is one-directional (more than one statement ⇒ the markers must be there),
  and the check says so in the test rather than failing the next generated file.
- **Docs.** § 9.3 gained the `42704` entry with the reason the API image must be rebuilt for a migration fix
  to land (`run --rm --build`, because the SQL ships inside the image) and why no cleanup is needed after a
  failed migration; § 10 now states plainly that these checks are textual — nothing in this repository runs
  the folder against a real PostGIS server, so "the migrations applied cleanly" is evidence about a database,
  not about the files, and a fresh VM is the test that counts.
- **Measured**: 8 new tests, plus the 48 credential tests (twice), 42 proxy tests, env-writer tests, and
  `pytest -q scripts/ map-server/scripts/` → 180 passed, 1 skipped, 12 subtests; `bash -n` on every tracked
  `.sh`; shellcheck clean; all markdown clean under the structural checker. What remains unmeasured is the
  one thing that would have caught this earlier — an actual `CREATE TABLE` against PostGIS — and it is
  recorded as such in § 10 rather than papered over.

### 2026-10-23 — the credential probe lied: `127.0.0.1` is `trust`, and so was my new check

- **What the VM said back.** After the previous commit, the manual triage printed `1` for the `.env`
  password while the API kept failing with 28P01, and `psql -U postgres` was not even asked for a
  password — it answered `FATAL: role "postgres" does not exist`. Both are properties of the image, not
  of the machine: the default `pg_hba.conf` trusts the local socket and loopback TCP and requires a
  password only from other addresses, and with `POSTGRES_USER=borobiya` initdb names the superuser that,
  leaving no `postgres` role. So a `psql` probe from inside the container says `1` to any password, and
  the API — connecting from another container — is the only one of the two that is really checked.
- **Three things were living on that lie, and all three changed.** The `postgres` healthcheck used
  `-h 127.0.0.1` while its comment claimed it authenticated so a rotated password would report unhealthy;
  it now connects to the service's own Compose alias (`-h postgres`), leaves the container, hits the scram
  line, and does what the comment said — for containers created after this change, which § 9.3 now states
  instead of implying. `check_database_credentials`'s psql probe does the same, and additionally prefers a
  better question when an API container exists: run `bun -e` with the `postgres` driver *inside that
  container*, against the `DATABASE_URL` Compose interpolated into it. That one probe covers the password,
  the URL as parsed, and the pg_hba line that will be matched — and if the container cannot answer (still
  starting, exec refused), the script refuses to conclude and falls back to the database instead of
  reading a non-answer as a pass. `check_nominatim_database_auth` had the identical flaw (`-h 127.0.0.1`
  inside the nominatim container), which is why a wrong `NOMINATIM_PASSWORD` was caught only when Photon
  connected from outside; it now probes `-h nominatim`.
- **The reconcile runs as the role that exists**: `apply_alter_sql` connects as `POSTGRES_USER` first and
  only then as `postgres`, because the order matters on this image and a script that says "run `ALTER USER`
  as the postgres superuser" fails with a message about a nonexistent role on the one machine that needs it.
- **The fake `docker` now models the trust rule**, which is what makes this a verified fix rather than an
  argued one: `127.0.0.1`/`localhost`/`::1` answer `1` to anything, `postgres`/`nominatim` compare the
  password to the role, and any other host is refused outright. A test asserts the loopback case explicitly
  (`test_a_loopback_answer_is_not_accepted_as_verification`) — a wrong password must reach the refusal, never
  a "verified" line — and another asserts that the state file recording a trusted answer was never written,
  i.e. the script never asked a question that could not be answered honestly. Two source-level guards keep
  the config and the script from sliding back: no `127.0.0.1` in the code of either probe function, and no
  loopback address in the healthcheck. 48 tests in this file, all run twice.
- **Two of my own tools made the noise, and both are worth remembering.** The § 9.3 commands I had printed
  in chat (`docker compose inspect`, `-U postgres`) were wrong in ways no checker could see — the subcommand
  does not exist, and the role does not either — because I wrote them as the plausible shape rather than a
  measured one; the runbook now carries the forms that ran. And patching that block by exact 40-line
  text-splice, with backslashes written through python strings, turned `| ` at a line end into `|| ` — and
  a repr that doubles backslashes then made a second, nonexistent defect look real until `od -c` showed one
  backslash where the repr had shown two. `bash -n` accepted the mangled fence, because a `|| ` at a line end
  is valid bash that simply does not do what it looks like. Splicing by unambiguous line range, and reading
  bytes instead of reprs, found it in one pass; a repo-wide grep for a line ending in two backslashes
  (0 hits, now the standing audit for that class) confirmed the file itself was never the problem.
- **Docs.** § 9.3's `28P01` bullet was rewritten around the trust rule: the four commands to compare (file,
  container, the URL digest the app will get, and the off-loopback probe), the deliberately-wrong-password
  line that lets anyone *see* the trap before being told about it, and each branch's fix — recreate the
  service when only the container is stale, `ALTER USER` when the role is the odd one, and a hex password
  when the URL is what cannot carry it. The older § 9.3 bullet about `postgres: unhealthy` now says which
  containers have a real healthcheck, and the 2026 changelog line that claimed the healthcheck
  "authenticates" carries its correction in place rather than being quietly rewritten.
- **Not measured here**: a real `ALTER USER` over a real container socket, and the new healthcheck against
  a genuinely wrong password — this workspace has no Docker daemon. The fake models both, which is why the
  trust rule is encoded in it rather than asserted in prose. Anyone running the manual form on a machine
  where the image was configured with `POSTGRES_HOST_AUTH_METHOD=trust` will get further than the script
  does; the script's fallback is to say so and hand over the statement.

### 2026-10-23 — setup now asks for the database passwords, and proves them before the long stages

- **What changed.** `scripts/setup-ubuntu-vm.sh` asks for `NOMINATIM_PASSWORD` and `POSTGRES_PASSWORD`
  the way it asks for the admin password: Enter generates 48 hex characters, a typed value is stored
  verbatim, an unusable one is refused and re-asked, and `--yes` skips the questions instead of asking a
  non-interactive run to answer. Nothing is printed — the answers go only into `.env`, mode 600. Both
  spellings are written from one variable (`POSTGRES_PASSWORD` *and* the password inside `DATABASE_URL`),
  through the same atomic `set_env` rewrite that protects paths containing `&` and `|`, so the file can no
  longer hold a URL that disagrees with the key it was built from. An existing `.env` is still never
  rotated, but it is now *read*: a placeholder or a URL-hostile value in it is named, and only replaced
  when no database exists to disagree with it.
- **Why the alphabet rule.** Compose interpolates `POSTGRES_PASSWORD` straight into the API's
  `DATABASE_URL`, and the Nominatim image builds its own connection string the same way. A `#` starts a
  fragment, `/` and `?` end the authority, `%` promises an escape, brackets stop the parser — measured
  with `urlsplit` here: `pa#ss`, `pa/ss`, `pa%41ss` and `pa[ss]` all come back as something other than
  what was written, while `pa@ss` and `pa:ss` survive. So a password can be correct and still fail, which
  is the shape of the bug this closes: `28P01: password authentication failed for user "borobiya"` with
  `postgres: healthy` in the same log. The accepted set is `A-Z a-z 0-9 . _ ~ -`, 12-128 characters.
- **The three-way check.** `check_database_credentials` runs at the end of stage 1, before any download:
  it reads the password from `.env` rather than from the shell (the runbook's loader block exports the
  same names, and an export beating the file is half of this failure), builds the URL the same way the
  container will, and asks the running server through it. A healthy postgres and a refused login are a
  real combination because three values exist — `.env`, the container's create-time environment, and the
  role in `postgres-data`, which the image only ever sets at first init. `.env` vs the container decides
  whether `--force-recreate postgres` is the fix; if they agree and the role refuses, the script offers
  `ALTER USER` (one credential changes, no data does), verifies the login again afterwards, and reminds
  you that the API holds a pool of old connections. It refuses to change a password it was not asked to
  change, and it only ever looks for `postgres-data` under this project's Compose labels — a global
  `docker volume ls | grep` could otherwise talk this run into re-passwording another checkout's database.
- **A new test file, and a fake `docker` that keeps the claims honest.** `scripts/test_setup_db_passwords.py`
  (41 tests) lifts the shipped functions out of the script by name, as `test_env_writer.py` does, and runs
  them against `scripts/fake_docker_for_tests.py`, which behaves like the postgis container: it authenticates
  a probe URL against the role password in a state file, applies an `ALTER USER` it reads from stdin, records
  every argv it was called with, and refuses a host other than its own loopback. So the reconcile path is
  exercised end to end — refused before consent, applied after it, re-probed afterwards — and
  "the password never travels as an argument" is an assertion over the recorded argv rather than a comment
  in a review. Also covered: both prompts answered independently, an invalid answer re-asked without being
  written, the placeholder-with-an-existing-volume refusal (the case where rotating is exactly wrong), a
  stale container environment reported instead of reconciled, `db_password_problem`'s four reasons, `ALTER
  USER`'s quoting of a password or a role name containing a quote, and `--dry-run` writing nothing.
- **Two things the harness got wrong before the script did.** The fake `docker` started life as a python
  string inside the test file, which added a round of escaping the test could not see — its `calls` log
  ended up holding a literal backslash-`n`, and that sent me hunting through its regexes when the two real
  faults were an absent exec bit on the stub and a `compose ps -q <service>` argument read from the wrong
  index. The stub is its own file now, backslash-free by construction (`chr(34)`, `chr(39)`, string
  partitions instead of patterns), which is the same lesson this file records about `\t` in a generated
  bash string. The second: the test's own helper was named `run()`, which silently shadowed
  `TestCase.run`, so unittest called *my* helper as the framework method and every test failed with
  `AttributeError: no attribute 'root'` — a fixture that looks broken when the name is.
- **Docs.** A6 says the script asks, states the alphabet and the reason; § 9.3's single-line
  "unset exports and retry" bullet became the three-way triage with the commands for each branch,
  including the `ALTER USER` form that pipes the statement over stdin; § 7.2 points at it for a retry
  that fails twice; DEVELOPMENT.md § 2.3 carries the same invariant for a developer who never reads the
  runbook; `.env.example`'s URL-safe comment now says who enforces it. `--yes` in § 1.2's table says what
  it does to the prompts.
- **Verified by running**: 41 + 42 proxy + env-writer tests OK; `pytest -q scripts/ map-server/scripts/`
  → 165 passed, 1 skipped, 12 subtests; `shellcheck -S warning` clean across `scripts/`; `bash -n` on every
  tracked `.sh`; the runbook and every other markdown file pass the structural checker (67 fences, 62
  shell), except the known dangling reference in `docs/USER_MANUAL.md`. A `--dry-run` against a `.env` of
  placeholders names both unusable passwords, says it would ask, and still prints the plan. Not measured
  here: a real `ALTER USER` against a real volume — this workspace has no Docker daemon, so the fake
  answers for it, which is why the stub parses the SQL rather than trusting the shape of the command.

### 2026-10-23 — a reader ran § 5.2 on the VM and pasted the output; three claims in it were wrong

- **`%{proxy_addrs}` does not exist.** Not in the reader's curl, not in this workspace's: I had written
  it into § 5.2's proof line and into `enable-proxy.sh`'s closing note as the credential-free way to show
  which proxy curl used. The variable that answers that question is `%{proxy_used}`, added in curl
  8.7.0, and it returns 1 or 0 rather than an address — Ubuntu 24.04 ships 8.5.0, so no version of curl
  this project targets has it. What works everywhere, measured here against a canary listener:
  `curl -v` prints `Uses proxy env variable http_proxy == '…'` before it connects, and its
  `Connected to` line names the **proxy's** host and port. Both are in the doc and in the script now,
  with the caveat that the first line carries the whole URL — so for an authenticated proxy, trim it
  with `grep -m1 -oE 'Uses proxy env variable [a-z_]+'` instead of pasting the line anywhere.
- **§ 5.2 asked for a 93 MB release asset under `--max-time 15`**, so the reader got `curl: (28) …
  62978027 out of 93278824 bytes` *and* `planetiler jar: 200` on the same line: a passing check that
  looks like a failure. Item 4 now asks the release page and then 1 KiB of the asset (`-r 0-1023`),
  and says what each answer means — including that the asset lives on
  `release-assets.githubusercontent.com`, a different host from `github.com`, which is the one a
  filtering proxy is likely to allow less generously. The full download stays where it belongs, in
  `fetch-planetiler-sources.sh`, with its `--retry` and its resume.
- **The reader's machine had a second proxy in both root-owned directories**, under the names this
  section used before the scripts existed (`/etc/apt/apt.conf.d/95proxy`,
  `docker.service.d/proxy.conf`), with `direct: 200` in the shell and no `proxies` key in
  `~/.docker/config.json`. Three separate things follow, and all three are now implemented: the report
  prints `how much is set : n of 4 places` counting *the machine* rather than our own files; it lists
  any neighbouring file that sets a proxy, quoting its own lines back, and names one it cannot read
  without pretending to know; and `enable-proxy.sh` refuses before writing anything, because apt reads
  `apt.conf.d` in sorted filename order (so `95proxy` wins over `95borobiya-proxy`) and systemd
  concatenates `Environment=` across drop-ins — two files coexist, they do not override.
  `disable-proxy.sh` still removes only what it wrote, and now says so under a heading. § 5.4 begins
  with the two greps that find such a file whatever it is called, and § 5.3 states the refusal.
- **Two bugs in the fix, both found by running it, both worth writing down.** The scan first emitted
  `kind<TAB>path`, and the patcher's python string produced a literal backslash-and-`t`: the separator
  was two characters, so `grep -q $'^proxy\t'` matched nothing and the refusal silently never fired —
  the same `\t` trap this file has recorded before. Then a helper took an optional `$1` and read it as
  `"$1"` under `set -u`: inside `[[ -n "$(…)" ]]` the unbound-variable error is swallowed by the command
  substitution, and the check quietly reported "no conflict". Both are now `${1:-}`, a space separator,
  and a comment on each. `grep -q` was also dropped from those pipelines: `-q` stops reading at its
  first match, the producer dies of SIGPIPE, and `pipefail` hands the `if` a 141 — which matched on my
  fixture and not in the test suite, the signature of a race rather than a bug. `sed -n '/^proxy /p'`
  cannot lose that race because it reads to the end.
- **Aligned while measuring**: the manual drop-in and the `config.json` `noProxy` in § 5.3 carried
  `localhost,127.0.0.1,172.30.0.0/24` while § 5.1's exports and the script's default carried `::1` too.
  The doc's manual paths now match the scripted one; a daemon that resolves `localhost` to `::1` was
  being sent through the proxy on the manual path only, which is the kind of difference that survives
  because nobody runs both paths.
- **Also accepted now**: `enable-proxy.sh 192.168.100.225 2080` (a bare second positional is the port
  once a host is known from anywhere), `--status` ending with `Nothing to remove` instead of asking
  `disable-proxy.sh` with no flags answering `Nothing to remove` instead of asking "remove the
  configuration listed above?" about an empty list, and one header before the questions so a prompt does
  not sit flush against a report.
- **Verification**: 42 tests in `scripts/test_proxy_scripts.py` (a new `TestForeignProxyFiles` with a
  legacy pair plus two decoy files that must *not* be reported, and a `TestWhereAPortComesFrom`), run
  three times in a row to be sure the refusal is not timing-dependent; 124 python tests under pytest;
  the 11-scenario drive exits 0; shellcheck clean at `-S warning`; every markdown file passes the
  structural checker except the pre-existing dangling reference in `docs/USER_MANUAL.md`. Skipped on
  purpose: one status test asserts only where `systemctl` is genuinely absent. What remains unmeasured
  is stated in § 5.2 — the 1 KiB asset request was never fetched from this workspace, because its host
  is outside the allowed network, and both `206` and `200` are treated as a pass for that reason.

### 2026-10-23 — the proxy scripts met a real VM, and it was the *report* that broke them

- **What the reader got**: `./scripts/enable-proxy.sh` printed six lines of state and stopped — no
  prompt, no error, exit 1 — and `./scripts/disable-proxy.sh` did the same thing. Both were green here.
- **The cause was a line this sandbox cannot produce.** `proxy_status` ends by asking the Docker daemon
  what it holds: `systemctl show docker --property=Environment | tr … | grep -i proxy | paste`. On a
  correctly configured machine with no proxy, `grep` matches nothing and exits 1; inside
  `var="$(…)"`, under `set -e`, that is fatal, so the report killed the script mid-sentence. Every test
  took the other branch because `docker info` fails where there is no daemon — and an `if` whose
  condition is false returns 0, so nothing propagated. A function that reports must not decide: the
  probe is now guarded (docker present, systemctl present, daemon answering), the substitution ends in
  `|| true`, the function ends in `return 0`, and the line reads `no proxy in the unit environment`
  instead of carrying systemctl's field name along with it.
- **The same class, five more times.** A `mkdir -p`, a `chmod 600`, an `rm -f` and the two `systemctl`
  calls in the apt/dockerd stages were bare commands whose failure would also have meant silence after
  a partial write. Each now says what failed and what to type. The `chmod` one fails hard on purpose:
  a file holding a password that did not get tightened is a leak, not a cosmetic problem.
- **A second finding in the same transcript**: `disable-proxy.sh` with no flags, on a machine that was
  never enabled, asked "remove the configuration listed above?" about an empty list. It now answers
  (`Nothing to remove`, plus the host-side reminder nothing here can act on) and exits 0. The test is
  *presence*, not ownership — a proxy file somebody else wrote still gets the full run and its
  "left alone" report. The suite missed the question because its helper always passed `--yes`, the flag
  that skips exactly the path a reader walks into first.
- **Tests for the states the sandbox does not have**: four drive a stub `docker`/`systemctl` through
  `PATH_EXTRA` in `base_env` (daemon answering with no proxy, with a proxy, not answering, and no
  `systemctl` at all — that last one skips itself when the host has a real one rather than pretending),
  and one runs disable with no flags. The stub-path plumbing was itself a bug in the test helper: the
  first version of `base_env` ignored `PATH_EXTRA`, and the two "fixed" tests failed for that reason
  alone, which is the same lesson as the scripts — a green test that never reached the branch is not a
  test. 34 tests, 1 skip; the 11-scenario end-to-end drive still exits 0, and `shellcheck`/`bash -n`
  cover every script in `scripts/`.
- **Recorded where it would be needed**: runbook § 5 now says both scripts open with that report and
  what the daemon line means, and § 5.4 says removal does not ask permission to remove nothing.

### 2026-10-23 — the runbook's proxy section became two scripts, because its numbers were not portable

- **Why scripts rather than prose.** § 5 had become a section holding one machine's address and port — a
  Windows host running a Throne-style client, with a bridged VM — as if they were the project's. They
  cannot be right for both modes (a bridged VM needs the host's own LAN address, a NAT VM the default
  gateway), and four config files pasted by hand is where a proxy setup ends up half-applied.
  `scripts/enable-proxy.sh` asks for the address and the port at run time and writes all four settings;
  `scripts/disable-proxy.sh` removes exactly what it wrote. Neither file contains an address, a port, or
  a default port: the port prompt has no fallback, because a guessed one looks like a broken mirror later.
- **The order is the feature.** Everything that can fail runs before anything is written: the TCP probe
  (a refused port and a dropped port get different advice), a real HTTP request through the port (a
  SOCKS-only listener is refused with an explanation, because `apt` and dockerd cannot use one), and an
  ownership test on the two root-owned files. The first draft wrote `~/.bashrc` first and only then
  noticed an administrator's `/etc/apt/apt.conf.d` file, leaving a half-configured proxy behind; the
  suite caught it (`test_a_refusal_leaves_nothing_half_configured`), which is the entire argument for
  testing shell scripts.
- **Removal is exact, not hopeful.** The `~/.bashrc` block is deleted between its own begin/end markers,
  and the script refuses outright when it finds a begin without an end, because a range delete would
  have eaten the rest of the file. The apt file and the dockerd drop-in are removed only if they carry
  this project's marker line, so a file an admin wrote is reported "left alone". `~/.docker/config.json`
  is rewritten through JSON with unrelated keys intact, and a `proxies` value that predates the first
  enable is backed up and handed back rather than deleted — restoring our own last output would have
  been the bug that resurrects a dead proxy. The two file names changed to `95borobiya-proxy` and
  `borobiya-proxy.conf` so the scripted and manual paths cannot write to different places and disagree
  about what removal deletes.
- **Credentials, because an authenticating client is not exotic.** `--username`/`--password` are
  percent-encoded by the script instead of asking the reader to hand-write `%40`, land in a 0600
  `~/.config/borobiya/proxy.env` that the bashrc block sources, force the root-owned files to 0600 as
  well, and are masked in every line the scripts print. A password of `a$b` + backtick + `c"d` survives
  `source ~/.bashrc` unchanged — asserted in a test, not assumed in a comment.
- **A checker that outlives the session.** `scripts/check_runbook_markdown.py` runs the sweeps this
  project has been doing by hand (table column counts, `§` cross-references resolving to a real heading,
  placeholders outside code, `bash -n` on every shell fence, `compile()` on the python embedded in them,
  duplicate headings, unbalanced inline backticks). Two of its first findings were bugs in itself: it only
  recognised fences at column 0, which had made four indented blocks invisible to every earlier sweep, and
  it matched a 3-backtick line as the closer of README's 4-backtick wrapper, turning 1,100 lines into
  apparent prose. Both fixed — fences now carry their length, like CommonMark — and table cells are
  counted after inline code is stripped, so a `||` inside a version range is no longer two columns.
- **What it found elsewhere in the docs.** `git checkout <prev-sha>` in `docs/WORKFLOWS.md` was a shell
  redirection rather than a placeholder (quoted, and the block parses now); `docs/PROGRESS.md` cited
  a section 3.4.1 that the runbook never created (retargeted to its real home, § 3.4, where the
  last-resort fixtures text lives); README.md closed its wrapper with three backticks against an opener of four (matched).
  One finding is left alone on purpose: `docs/USER_MANUAL.md:272` points at a section 10.5 that no
  document defines, and fixing it means deciding where the navigation walkthrough belongs — guessing is
  how this project keeps generating stale references.
- **Verification.** 29 new tests (`python3 scripts/test_proxy_scripts.py`) drive both scripts
  end-to-end against a throwaway `$HOME`/`/etc` and a canary proxy that records whether it was asked,
  including the refusal paths; every markdown file in the repository (14 in docs/ plus README.md) is now
  clean under the checker except that one dangling USER_MANUAL reference, which is reported rather than
  guessed at. Not verifiable from here, and labelled as such in the runbook: what a
  real `docker build` does with the config key, anything on the Windows side, and whether a given proxy is
  reachable at all.

### 2026-10-23 — the audit turned on the scripts themselves: 4 real bugs fixed, 2 suspected ones disproved, 16 new tests

- **Scope changed at the user's request:** from "is the runbook right" to "are the scripts right". Every `.sh`/`.py`/`.mjs` in the pipeline was syntax-checked, linted (shellcheck at `-S style`, ruff with bug-oriented rules), and the suites were run green: python **83** (16 of them new, below), gateway **19**, shared **55**, server **472**, client **370**. shellcheck's finding count did not move (the 4 remaining are known-benign: `REPO_ROOT` fed to a sibling, `eval`-assigned vars, an awk string).
- **`setup-ubuntu-vm.sh` could not write `.env` safely.** `set_env()` interpolated the *value* into a `sed` replacement expression, so a map-library path containing `|` aborted the whole setup run with `sed: unknown option to \`s\`` and `.env` left untouched, and one containing `&` silently expanded to the entire matched line. It now rewrites the file through `awk` with both key and value passed literally, via a temp file in the same directory. Reproduced before fixing and after: the adversarial values are the first two cases in the new `scripts/test_env_writer.py`.
- **…and it created `.env` with the wrong mode.** `cp .env.example .env` inherits the umask — 0644 on a stock Ubuntu login — and the file then holds generated `POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NOMINATIM_PASSWORD` and the base64 admin seed. On a VM with another account (or a shared backup) that is a leak, not a style point: creation is now `install -m 600`, the rewrite lands at 600 too, and the runbook's manual A6 recipe gained the matching `chmod 600 .env`.
- **`fetch-planetiler-sources.sh` lied about a recovery it did not perform.** The legacy-copy migration used `mv -n`, which **exits 0 without moving anything** when the destination exists — so with a corrupt file already in the cache the script printed `moved the copy that was inside the dataset directory`, left the good archive where it was, kept the broken one, and fell through to re-downloading 900 MB. (Confirmed by running `mv -n` against an existing target, not by reading the man page.) It now replaces only a target proven unreadable, moves only a source proven readable, announces only after the file has arrived — and writes the `.sha256` sidecar its own comment had been promising ("keep the digest so provenance survives the move") for migrated copies.
- **`generate-tiles.sh` and `build-routing.sh` defaulted every selection to Tehran's bbox.** `MAP_BBOX="${MAP_BBOX:-51.0,35.5,51.7,35.9}"` predates selectable areas, and `verify-map-pbf.sh` *explicitly* only enforces the bbox "when the caller actually configured one — its historical Tehran default must not make a Frankfurt dataset invalid", but a defaulted value is indistinguishable from a configured one once it is in the environment, so that safeguard never applied to these two callers. Both scripts now take `UNION_BBOX` from the resolver they were already calling, keep the literal default **only** for the default selection, and otherwise stop with a message naming the missing input and the loader block. The failure mode before was a manifest error accusing a correctly prepared dataset.
- **`regions.py verify-crop` exited 1 twelve ways and said nothing about which.** Its one internal caller pipes stderr away, but it is also a public subcommand; every silent `SystemExit(1)` now carries a reason (path not in the standardized layout, metadata unreadable/invalid JSON, snapshot mismatch, source PBF changed, crop bytes no longer match their recorded checksum), and the multi-reason branch builds the list instead of OR-ing nine conditions — while still skipping the expensive crop hash when a cheaper check already failed.
- **Two suspects were innocent, and one nearly became a "fix".** `curl --retry 5 --retry-connrefused` in the verify scripts **does** retry the gateway's 502/503 while OSRM loads its graph (measured: an endpoint answering 503 twice then 200 got exactly 3 requests) — my first measurement said otherwise because it wrote to `/dev/null` and curl's un-retryable error 23 cut the loop short. And Photon's `bbox` really is `minLon,minLat,maxLon,maxLat` — the order this repo uses — which I checked at the **pinned tag** (`BoundingBoxParamConverter.java` at `1.3.0`, byte-identical to main: `new Envelope(c[0], c[2], c[1], c[3])`), after half an hour of suspicion earned from Nominatim's `left,top,right,bottom` convention. Anyone tempted to "correct" `verify-geocoding.sh` should read that first.
- **The two tests written for the fixes found two more bugs — in the fix.** `awk` on Ubuntu is **mawk**, which rejects a pattern continued onto the next line that gawk accepts; and POSIX `awk -v` *processes backslash escapes* in the assigned value, so `/srv/a\b` arrived as a backspace. Both were caught before commit by the same cases that found the original problem (`ENVIRON` assignments are literal), which is the argument for testing shell glue at all.

### 2026-10-23 — third audit pass: every number, port and flag in the runbook was put next to its source

- **Three invented numbers removed, and the false attribution with them.** "…run to well over 10 GB", "each OSRM profile is ~30–60% of the dataset size", and the pair of build durations (30–50 min for tiles, 25–45 for routing) exist nowhere in the repo — and § 10 was *crediting* them to "the reference VM", which made an invention look like a measurement. They are gone. What replaced them is what the code actually encodes: the only time budgets in this project are Nominatim's (`start_period: 60m` in Compose, `SETUP_NOMINATIM_TIMEOUT_MIN` default 90 / range 1–720 in the setup script), the only disk figure the scripts enforce is on Docker's storage, and step 9 now explains why silence is not a stall (`generate-tiles.sh:167` builds in a temp directory **beside** `$MAP_DATA_DIR` and moves the archive at the end, so `ls` showing no `.pmtiles` mid-run is the expected state).
- **The capacity story was wrong in its direction, not its size.** The runbook claimed the 15 GiB / 50 000-inode floors are enforced "on both the library filesystem and Docker's storage root". Only the **Docker** side refuses (`Docker storage at <path> has only X GiB free before <phase>`); on the repository filesystem the script *warns* — and its warning string quotes this runbook back (`imports may fail (runbook wants 15-20 GiB free)`), which is now quoted instead of paraphrased. Added the two gates nobody mentioned: **5 GiB** re-checks before `building the Photon runtime image` and before `building/recreating the full Compose stack after the Nominatim import`, which is how a run can pass preflight and still stop at step 11. Also noted the check's dedup-by-device behaviour and that `/var/lib/containerd` is inspected only when it exists.
- **§ 7.0, new: the eight published ports.** The file had 8000/8001/8080/3000/5432 scattered through it and never said where Photon (2322), Nominatim's HTTP (8081) or Nominatim's database (5433) live — a reader debugging geocoding had no way to reach either. Each row is the host port, the `.env` key that moves it, and what answers there; plus the two confusions it exists to end (`verify-tiles.sh` asks Martin on 8000, not Nginx on 8080; 5433 is Nominatim's private Postgres, not a second copy of the app database — and A3 installs no host `psql`, so the probe is the throwaway-container one).
- **Counted the things I had rounded.** "the four `NOMINATIM_POSTGRES_*` memory values" is five (now named, with the note that Compose carries the same defaults so they are tuning, not wiring). `--update-map` was described as "rebuild the map data for an existing `.env`"; the script's own help says it resolves the **latest common snapshot online** — a different thing, and the kind of mistake that makes someone skip `--snapshot`.
- **Checked the flag surface and reported the result honestly:** the eleven options in § 1.2 match `setup-ubuntu-vm.sh --help` exactly, so instead of adding to them I wrote down what is *not* there (no `--no-start`, `--skip-docker`, `--dev`) and added the six `SETUP_*` environment forms, including `SETUP_FORCE_FORM=1`, which is the only way to answer the selection prompts without a TTY. The prerequisite list is `docker git curl wget python3 openssl java osmium` — **no bun**, so a missing Bun is not a setup-script failure, and A5b exists for that reason.
- **The `unhealthy`-during-import gap filled:** past 60 minutes the health label flips while the import keeps running; past 90 the automated path gives up but **re-running waits on the same container**, whereas a container killed mid-import re-imports from scratch because the `import finished` marker is all the entrypoint has.
- **Two suspected bugs that were not in the file.** `download-photon.sh --force` and a `geocoding/scripts/photon-menu.sh` reference were both on my list of things to fix — a grep showed the runbook already says the opposite (the downloaders are skip-if-present, so `--force` buys nothing) and contains no such script path at all. That was my own notes drifting, not the document, and it is worth recording: an audit claim has to be checked against the file, not against the audit list.
- **Sweeps after the edits:** 55 bash blocks pass `bash -n`, no table has inconsistent columns, no bare `<placeholder>` outside a code span or fence, every `§` reference resolves (this pass caught a dangling `§ 0` I had just written myself), no paragraph has unbalanced backticks, and every repo path in the file exists or is labelled generated/legacy.

### 2026-10-23 — second audit pass: the doc had also *deleted* two facts and *added* one it could not support

- **Found by re-reading the pre-rewrite version of the file, not only the code.** My first audit checked the runbook against the scripts; this one checked it against its own earlier self, and that caught a different class of bug — verified knowledge the rewrite dropped or flattened. Three items: the rule **never to hand-substitute a moving `*-latest.osm.pbf` URL** (the pipeline addresses everything by date + checksum, so a `-latest` URL silently redefines "the same dataset" for the next person to run step 8); the concrete **runtime parameters of step 12** (`osrm-routed --algorithm mld --threads $OSRM_RUNTIME_THREADS --max-table-size 100`, and Photon's `-Xms256m -Xmx1536m`) including the fact that `--max-table-size` bounds the `/table` plugin and is **not** a memory dial, which reads exactly like one; and the **last-resort fixture route**, which the rewrite had turned into a flat prohibition.
- **The fixture correction matters because the old doc allowed it deliberately.** Planetiler's Monaco test resources are what its own README points `--water-polygons-url`/`--natural-earth-url` at, and the fetch script honors those variables — so for a Tehran *smoke test* (no sea in the bbox) the run still proves the pipeline. My rewrite said "not the answer", which lost both halves: the permission *and* its cost. § 3.4 now carries it as a labelled last resort with the blast radius spelled out (lakes, rivers and every low-zoom Natural Earth boundary layer really are wrong; the build succeeds; `verify-tiles.sh` passes) and the three rules that come with it: record the substitution in the acceptance notes, know that it is invisible to the manifest, and rebuild before treating any dataset as deliverable.
- **One number I had invented, removed:** "images: ~2.3 GB before step 12" appeared nowhere in the repo — it is now `docker system df`, in real numbers. Likewise the "≥ 2 Gi available" RAM line is now labelled as this runbook's guidance rather than a gate, with the two floors the setup script really enforces named beside it (15 GiB free, 50 000 inodes, checked on the library filesystem and on Docker's storage root).
- **A broken cross-reference and a broken table.** Item 3 of § 3.4 pointed at "the § A6 guide" for the offline failure; the guide is printed by the fetch script, and § 6.1's own text quotes it — fixed. And § 3.1's Photon row had collapsed into 5 cells inside a 6-column table (a whole `URL as the repo uses it` column disappeared), which markdown renders as a mangled row rather than an error: it now says what is true — no registry, no download URL, only a `Dockerfile` whose `ARG PHOTON_SHA256` must match row 6's JAR.
- **Honesty about the fixtures' liveness, from a check that only half-worked:** both override URLs were probed here and GitHub answers `302` for each path, but the redirect target is outside this workspace's allowed hosts, so the bytes were never fetched. The doc now states exactly that, in § 3.4, under the same standard § 3.1's legend uses — "the path still exists" is not "the content was reviewed".
- **Re-verified after the edits:** 55 bash blocks pass `bash -n`, no table in the file has inconsistent column counts, no bare `<placeholder>` survives outside a code span or fence, every `§` reference resolves, and every cited repo path exists or is labelled generated/legacy.

### 2026-10-23 — audit pass on the rewritten runbook: nine claims were wrong, and two of them were load-bearing

- **Why this pass existed.** After the rewrite I re-read the new document against the code instead of against my own notes: every quoted output line, every flag, every path, every Compose field. Nine statements failed that comparison. One of them (`bun` installed in A3 from a `package.json` that is only cloned in A5) would have made the fresh-VM path fail outright, which is the definition of a doc bug worth finding.
- **The ordering bug, fixed properly:** Bun is now installed in a new **A5b**, *after* the clone, because the whole point of the install was to read the pin out of the checkout's `package.json`. A3's package list, A4's preflight line (`bun --version` now prints "not yet (installed in A5b)" rather than looking like a failure), § 3.1's link table, § 9.4's troubleshooting entry and § 1.1's overview row all moved with it.
- **Two inherited claims that were never true and I copied them:** "expect **seven** services `Up`, all `(healthy)`" — step 12's command starts **six** (nothing in the map stack depends on `postgres`; only `api` does), and `map-server` (Martin) has **no healthcheck at all**, so it can never report `healthy`. § 6.6 is now a per-service table explaining that Martin's absence of a healthcheck is deliberate and that its proof is step 13.
- **One check that belonged to the wrong step:** the rewrite listed `verify-tiles.sh` as step 9's check, but it is an HTTP client — it probes `$MARTIN_URL/health` with `--retry 5 --retry-connrefused` and then requests a tile, so on a VM that has finished step 9 it fails with "Martin health endpoint is unreachable". Step 9's check is now the two output files plus a real offline verification (`borobiya.metadata.json` must name the current selection/snapshot, and its `sourcePbfSha256` must equal `sha256sum "$MAP_PBF"`), with the reason stated.
- **Three output strings I had invented:** the resume table quoted `PBF OK` / `PMTILES OK`; the scripts actually print `OK: <pbf> matches areas … bbox … snapshot … (SHA-256 …)`, `OK: <url> (<area>) returned HTTP 200, application/vnd.mapbox-vector-tile, <n> bytes`, `Verifying routing in <area> (<id>)...` + `OK: car returned 1 route(s), <m> m, <s> s`. Step 10's "`extracting` → `partitioning` → `customizing"` became the real `Extracting car graph for borobiya from the approved PBF (2 threads)...` / `Created car, bicycle, and foot graphs for …`. Every quoted line is now copied from the source, not paraphrased.
- **One overstatement about the gateway:** I wrote that `routing-gateway`'s `/health` "reports per-profile readiness". It returns a plain `{"status":"ok"}` without touching the OSRM backends (`map-server/routing-gateway/routing.mjs`), so § 6.6 now says the opposite in as many words — `healthy` there proves the process answers — and names what does prove a graph loaded (the three TCP healthchecks that only connect once `osrm-routed` has bound :5000, then `verify-routing.sh` end to end).
- **Two mechanisms described wrongly, both now read from the scripts:** `download-photon.sh` verifies against a `PHOTON_SHA256` pinned *inside the script* (the same digest the Photon Dockerfile re-checks at build), not a downloaded `.sha256`; and the reference-layer fetcher does print a digest for a `cached` file but does not compare it to a pin — these archives are unversioned upstream, which is exactly why § 3.4 says the printed SHA-256 is the only staleness signal. `unzip`'s justification was also false (no pipeline script needs it — Planetiler reads the zips itself), and § 6.1 now states the real asymmetry: the Geofabrik fetch uses `curl -fL --retry 3` **without** `-C -` while the reference-layer fetch uses `-C -` plus `--speed-limit`, which is the actual reason `wget --continue` earns a place in step 7.
- **Two safety fixes in the proxy section:** `~/.bashrc` is no longer edited by a broad `sed -i '/_proxy\|_PROXY/d'` that would have deleted any unrelated line mentioning a proxy — § 5.1 writes a `# >>> borobiya proxy >>>` … `# <<< borobiya proxy <<<` block and § 5.4 deletes exactly that block, so the step is idempotent (re-running replaces it) and cannot touch what it did not write. Both behaviours were executed against a scratch `~/.bashrc` here. Also `ss -ltnp` → `ss -ltn` with the note that the process column needs root.
- **Still true after the pass:** every `bash` block in the file parses (`bash -n`, 54 blocks), every `§` reference resolves to a heading, every repo path the doc names exists or is labelled as generated/legacy, and every `ENV_VAR` it cites is present in `.env.example`, a pipeline script, `docker-compose.yml` or the resolver's export list.

### 2026-10-23 — the Ubuntu runbook rewritten around the developer, and the four claims it had to give up

- **What the owner asked for and what landed.** `docs/UBUNTU_VM_RUNBOOK.md` is rewritten (650 → 1,387 lines) so a developer can understand every step in one read: a one-screen table of the whole build (§ 1.1) with a `Check` and a `Re-run cost` column, a uniform shape for every pipeline step (*what it does → command → expected output → how to check → redo just this step → if it fails*), and the two commands the old doc made the reader reconstruct — **start from the first step** (§ 1.2: `./scripts/setup-ubuntu-vm.sh --reselect`, all eleven flags in a table, plus the manual path) and **start from the failed step** (§ 1.3: re-running the setup script *is* the resume mechanism, with a `verify-map-pbf.sh`/`verify-tiles.sh` decision table for the case where you don't know which step failed).
- **The missing dependencies, now installed and explained.** `bun` — read from the checkout's own `packageManager` pin (`bun@1.4.3`) and installed from the vendor's GitHub release asset, with the AVX2/baseline note, and with the honest reason it belongs in Phase A: the API *image* has its own Bun, the setup script's prerequisite loop does not look for it, and every `bunx` in `docs/DEVELOPMENT.md` needs it on the host. Also added to A3: `git`, `curl`, `wget`, `unzip`, `ca-certificates`, `openssl`, `python3`, and `openssh-server` (with A0 putting SSH *before* everything, because a build that dies on a closed laptop lid is a build you re-run).
- **Three new operational sections.** § 5.2 verifies a proxy instead of assuming one — shell env, direct egress, proxied egress with `%{proxy_addrs}`, the three real targets (apt, GitHub releases, Geofabrik), `apt-config`/Docker-daemon settings, and a container egress probe, each with what its answer means. § 7 answers "what is running" from `docker compose ps -a --format json` parsed by Python (both the array form and the per-line form), plus `docker stats`, an `oom=`/`exit=`/`restarts=` inspect line, the listening ports, and the project's volumes — no hardcoded service table to go stale. § 8 is the reset ladder: Level 1 per-artifact `rm` with what each forces, Level 2 `./scripts/clear-map-cache.sh` (dry-run by default; every flag documented from its own `argparse`), Level 3 full reset, then the never-do table and § 8.5's only-safe-way single-volume removal.
- **Link status is now a table with a verification recipe (§ 3.1–3.2).** Every source, where it is pinned, and whether it was **checked today from this workspace** — Planetiler `v0.10.2` (93,278,824 bytes), Photon tag `1.3.0` with no `v` prefix (98,219,380 bytes), Bun `bun-v1.4.3` (42,015,139 bytes) all confirmed live via `api.github.com`; osmdata's water polygons recorded as down for everyone since 2026-10-22 with the third-party copy documented as a stopgap and the reason it is *not* a script fallback; Geofabrik's dated URLs explained as the one thing that rots on purpose, with `MAP_SNAPSHOT=latest` described the way the resolver describes it ("newest common dated snapshot for all selected sources", requires an online check). Everything the sandbox cannot reach is labelled as unverified-here rather than as fine.
- **Dynamic instead of transcribed.** A4 now greps the pins out of `.env.example`, `docker-compose.yml`, `package.json` and the two download scripts and prints them next to what the machine has, so the doc never has to be right about a version for the check to work. The loader block is the doc's one definition of "load the environment" (A6, 11c and the reset blocks point at it): `set -a` stays open across `regions.py resolve`'s `eval`, because the resolver prints `KEY='value'` lines and an assignment that is not exported is invisible to the script that needs it. It also re-derives `MAP_BBOX` from `UNION_BBOX` (numbers normalized, so `51.0` and `51` are the same bbox) and tells you when `.env` disagrees — and A6 gained the once-only **write-back** of the resolved absolute paths into `.env`, because `docker-compose.yml` interpolates `${MAP_DATASET_DIR}`/`${MAP_PHOTON_DATA_DIR}` from the *file*, and blank there means Nominatim and Photon get the `.compose-unconfigured/` placeholder on purpose rather than the wrong data.
- **Four claims this rewrite had to delete, because the repo does not make them.** (1) "City boundaries are applied with the area's admin polygon" — `prepare-regions-pbf.sh` runs `osmium extract --strategy=smart --bbox=<area bbox>` and a whole-country area skips the crop (`ALL`); no polygon file is downloaded anywhere. (2) "`import-Nominatim-geocode.sql` references the Nominatim pin" — no such file exists; the image is pinned in `docker-compose.yml` only. (3) "`PLANETILER_VERSION`/`PHOTON_VERSION` live in `.env.example`, and `regions.json` carries `asOfDate`/`pinnedRelease`" — the JAR versions are `PLANETILER_VERSION=`/`PHOTON_VERSION=` lines inside the two scripts, and the catalog's per-source keys are `url`, `md5`, `bytes`, `approxSizeMb` with one top-level `snapshot` date. (4) "`fetch-planetiler-sources.sh` passes `--download-dir`" — the fetch script caches; `generate-tiles.sh` is what points Java at the directory. Each corrected sentence is now followed by the file to read if you doubt it.
- **Verified, not asserted.** All 54 `bash` blocks pass `bash -n` (the one `<service>` placeholder line was rewritten to name a real service so the block is copy-pasteable); this workspace has no Docker and cannot reach Geofabrik or the image registries, so the doc's commands are verified against the repo, against `bash -n`, and by running everything that can run here — no step was executed on the VM itself, and § 10 says so; the loader block was executed here against a synthetic `.env` (silent on the matching default, and printing the bbox note for stale and empty values); § 7.1's status table was run against both Compose JSON shapes and the empty case; `regions.py resolve/sources/verify-point/list`, `clear-map-cache.sh --dry-run` and the A6 write-back loop were each executed and their real output is what the doc now quotes; and every `map-server/**` path, flag and env var cited was checked against the tree (the only absent paths are the generated/legacy ones the doc describes as such). The step numbering (`A1–A6`, `7–13`) is preserved on purpose, because `docs/DEVELOPMENT.md`, `docs/MAP_SERVER.md`, `docs/TASKS.md` and the setup script's own failure messages quote it. Runbook docs still name no branch and carry no `git checkout` to one.

### 2026-10-22 — T3.1.5: the admin catalog screens, and the three places a form could have invented a rule

- **Shipped:** `/_admin/incidents` and `/_admin/categories` are real views (`views/_admin/AdminIncidentsView.vue`, `AdminCategoriesView.vue`) over a new typed client module (`api/admin-catalog.ts`) and a pure decision module (`admin/catalog-form.ts`). Incident types get a table plus create and rename dialogs, with the slug preview coming from `deriveIncidentSlug` in `@borobiya/shared` — the function whose own docstring says it is shared so the form can preview it rather than guess again. Categories get a table with their types resolved to names, a checkbox set for the types, and an add-members dialog built on the same debounced username search the share dialog uses.
- **`blank` is three different things, and the module says which.** An empty `icon` on create is *omitted* (sending `""` would be a 400 from `min(1)` for a field the admin never touched); an empty `icon` on rename is `null` (the only value that clears it); an empty `description` is `""`, because the route's `blankToNull` is what folds it and a client that omitted the key could never erase one. Pinning that in tests is the difference between a form that mirrors the API and one that mirrors a guess about it.
- **Two refusals the client keeps rather than fixes.** An uppercase slug is refused with the format rule quoted in Persian, not silently lowercased — the server refuses it too, and a client that quietly repaired input teaches a rule that exists nowhere. A patch with no changed keys is stopped in the dialog with «چیزی تغییر نکرد» rather than earning the contract's 400, and a re-ordered checkbox set is *not* a change, because the route replaces the whole set and an audit row for nothing records an edit that did not happen.
- **One gap stated rather than hidden:** the members dialog can add and cannot list or remove, because `categorySchema` carries `incidentTypeIds` and no members — the projection in T3.1.4 is what closes it, so the dialog says the current roster is unreadable in this build instead of offering a uuid to type. `api/admin-catalog.ts` has no `removeCategoryUser` for the same reason, with a comment naming the task that will add it.
- **A bug in my own first draft, caught by reading the schema back:** the edit dialog initially disabled the slug field, assuming a slug is immutable. It is not — `PATCH /_admin/incidents/:id` validates and reports slug conflicts, and the descriptor's own comment is about a *rename* colliding. Freezing the field would have been a rule the server does not have, so it is editable now and the hint beside it says what a rename costs (clients hardcode that value) instead of pretending the choice does not exist.
- **Verification:** 36 new client tests (17 form rules, 13 API calls, 6 pins on the `.vue` sources for rules the compiler cannot check: session refresh before every request, slug editable on rename, exactly one text field in the members dialog), client 370/370, `vue-tsc` and `vite build` clean, both views emitted as their own lazy chunks. **Not opened in a browser:** every HTTP behavior here is proven against stubbed `fetch`, so the screens are type-checked and built but not exercised against a live API — the same limit recorded for the share dialog and the playback panel. `docs/USER_MANUAL.md` §21, `STRUCTURE.md` and `TASKS.md` were updated in the same commit; the placeholder copy that called the incident-type catalog «گزارش‌های امدادی» (rescue reports) went with the placeholder.

### 2026-10-22 — T3.2.3: SOS photos arrive, and the API refuses to trust anything about them but the bytes

- **Shipped:** `POST /_user/sos/requests/:id/photo` (`src/sos/photos.ts`, `src/sos/photo-storage.ts`, `src/db/sos-photo-store.ts`, `src/security/image-payload.ts`, `src/plugins/multipart.ts`), with `@fastify/multipart` as a new server dependency and `UPLOAD_DIR`/`SOS_PHOTO_MAX_SIZE_MB` as two configuration keys the API now really reads (the second one was in `.env.example` and README §14 as a knob nothing consumed; it is consumed now). A stored photo is a `0600` file named by a server-generated UUID under `UPLOAD_DIR`, and `sos_requests.photo_url` holds `/uploads/<name>`.
- **Three things a photo upload can be told to do, and the answers this route gives:** claim to be a GIF and be refused with the word `GIF` in the message (`unsupported_format`, because the sniff reads bytes, and `file-type` would have reported "that is a GIF" as a *fact* rather than a refusal — the repo sniffs locally rather than depending on it, which `docs/SECURITY.md` §9 records as a deliberate deviation); be 6 MB and unauthenticated, and be answered `401` rather than `413` — a test in `src/app.test.ts` pins that ordering, because "the guard runs first" is the kind of sentence that is only true until someone reorders two `await app.register` lines; and name its field `image` or carry a stray `caption`, both refused with the names in the message rather than silently renamed or silently dropped, because losing a note about an emergency in silence is worse than a 400.
- **What `SECURITY.md` §9 did *not* say, and so did not get invented:** no rule about *when* a photo may be attached (not on `status`, not on `cancelled_at`, not one per request — the same discipline as the create route's missing duplicate-suppression rule), and no `415`, since the descriptor declares only 400/401/403/413 and an off-contract status is a bug with a nicer name. A re-post therefore replaces which file the row points at and leaves the superseded bytes on the volume; deleting evidence nobody asked to have deleted is not this endpoint's decision, and the orphan-retention rule waits for T3.2.6 with the rest of the read path.
- **The read path stays closed, loudly.** No `GET /uploads/:id`, no `@fastify/static`, no nginx `location` on the directory: a browser attaches no bearer token to the request an `<img>` makes, and the spec offers no substitute. `src/sos/photos.test.ts` asserts `GET /uploads/<stored file>` answers `404`, so mounting something on that path is a test failure rather than a silent disclosure, and `docs/API.md` §5.4 records this as the one endpoint that is not even declared contract-only — a descriptor would advertise an operation that cannot state who may call it.
- **Real database and real filesystem:** the attach was executed against the shipped `0012` DDL in PGlite with the actual volume writer on a real temporary directory — 14 checks, all green: the owner's row re-pointed and echoed, another account's attempt changing nothing, an unknown id and an unowned id indistinguishable, a replacement leaving both files, the mode exactly `0600`, no `.part` survivor, and `discard` idempotent. Harness `/home/user/pgcheck/t323.mjs` (outside the repo, like the earlier runs). Two fictions the harness had to drop before it was honest: `incident_types` is a stand-in because PGlite has no PostGIS, and `geography` is a text domain, which is why the geometry itself is checked in the unit tests rather than claimed here.
- **My own bug, caught while writing the tests, not after:** the first version mapped only `FST_PARTS_LIMIT` from the parser, so a body with **two file parts** escaped the handler's second door and Fastify answered a raw `413` with its own default envelope instead of the contract's `{ error, code, message, issues }`. I found it by grepping `@fastify/multipart@9.4.0/index.js` for what it actually throws (`FST_FILES_LIMIT` is the one for `limits.files`, and it is not in the plugin's `createError` list) rather than trusting the README. `multipartLimitError` now maps all three limit codes, with a comment naming which door each one is.
- **Suite state:** server 472/472 — 46 new cases in five new files (`image-payload` 12, `photo-storage` 9, `sos-photo-store` 4, `photos` 18, `multipart` 3) plus the `uploadDir`/`SOS_PHOTO_MAX_SIZE_MB` pins in `config/env.test.ts` and the two app-level ones in `app.test.ts`, shared 55/55, client 334/334, `tsc` for shared and server, `vue-tsc` for the client, and `vite build` clean. `docs/API.md` §5.4, `SECURITY.md` §9, `STRUCTURE.md`, `TASKS.md` (T3.2.3 closed, T3.2.6 opened), `README.md`, `docker-compose.yml`, `packages/server/Dockerfile` and both env samples were updated in the same commit.

### 2026-10-22 — T3.2.2: an SOS can be filed, and the create route refuses one field of its own contract

- **Shipped:** `POST /_user/sos/requests` (`src/sos/requests.ts`, `src/db/sos-request-store.ts`), registered behind the app-wide `/_user` hook and marked `implemented` in the OpenAPI document. Every rule §11.2's form states is enforced server-side through the shared schema — `severity ∈ {low, medium, high}`, `description` trimmed to 10–500 characters, `lat`/`lon` inside their ranges, `accuracy` finite and non-negative, `isManual` required, strict object — and a request whose incident type the catalog does not contain answers `400 VALIDATION_ERROR` naming that id, with nothing filed. Success is `201 { requestId, status }` with the status read back off the row, `Cache-Control: no-store`. The route also inherits the throttle §3 promised it — 3 requests per minute per verified user, keyed after the session guard.
- **`photoUrl` is refused rather than stored.** The field is in the shared input schema because the spec lists it among an SOS's fields, but no legal value can exist before the request does: the photo arrives at `POST /_user/sos/requests/:id/photo` (T3.2.3), and a URL the requester supplies is an address the dispatcher's browser would have to load to read the evidence (SECURITY §9). The refusal carries that sentence, and the store's input type has no field for the column — the hole is closed structurally, not by a check that someone might later forget. The tracker's T3.2.2 line compresses "optional photo 5MB multipart" into the same sentence as the create route; that half belongs to T3.2.3, which also owns the `@fastify/multipart` dependency this build did not have until T3.2.3 landed the same day.
- **A claim of mine that the schema did not support:** the first draft of the store honored `incidentTypes.isActive` and the first draft of the refusal told admins a type might be "deactivated". `incident_types` has no such column — the only `is_active` flags in the schema are on `users` and `cancellation_reasons` — so the check became existence-only and the wording followed. Caught by typecheck, which is the argument for writing the query before writing the apology for it.
- **Real database:** the store was executed against PostgreSQL in PGlite against the shipped `0012` DDL (the only substitution being the `geography(Point,4326)` column, stood in by a `geography` text domain with `ST_MakePoint`/`ST_SetSRID` shims), which is also how the axis order was confirmed from the stored value rather than from the SQL text: `POINT(51.3379 35.6997)` — longitude first, as PostGIS wants. The table's own CHECKs rejected a 9-character description, a 501-character one, and `severity='critical'`; an unknown requester hit the foreign key; a refused incident type left the row count unchanged. Harness: `/home/user/pgcheck/t322.mjs` (outside the repo, like the earlier runs).
- **The limiter in `SECURITY.md` §3 was a promise this commit had to keep.** The table has long said `POST /_user/sos/requests | 3 req/min | userId`, and §3's own closing line deferred such limits "to be added with their handlers" — this is that handler, so shipping the route without the row would have left the doc claiming a protection that did not exist. It runs at `preHandler` so the key is the verified `userId` rather than an IP (which is what makes a spoofed forwarded-for chain unable to burn a responder's allowance), and rejected bodies count. What was deliberately *not* invented: a "one open SOS per account" rule — nothing in the spec states one, and a suppression that swallows a second real emergency is the worse failure.
- **Suite state:** server 424/424 (17 new route cases, 7 store cases, 1 app case), shared 55/55, client 334/334, `tsc` for shared and server, `vue-tsc` for the client, and `vite build` all clean. `docs/API.md` §5.4, `SECURITY.md` §9 and `STRUCTURE.md` were updated in the same commit.

### 2026-10-22 — Planetiler's reference layers are now our download, not its own (VM run failure)

- **What the user hit:** `./scripts/setup-ubuntu-vm.sh` died with `IllegalStateException: Error getting size of https://osmdata.openstreetmap.de/download/water-polygons-split-3857.zip`, `Caused by: TimeoutException`, six seconds in — before any tile work happened. The three global archives Planetiler's OpenMapTiles profile reads on top of the dataset PBF (Natural Earth, OSM lake centerlines, OSM water polygons) were fetched *by Planetiler*, and its downloader waits a hard-coded **10 seconds** for a size probe, with no retry and no proxy support in 0.10.2 (`planetiler-core/…/Downloader.run` → `Future.get(10, TimeUnit.SECONDS)`; `--http_timeout`/`--http_retries` do not cover that call). One host having a bad day therefore kills the build, and the operator gets a Java stack trace instead of an instruction. `osmdata.openstreetmap.de` was reported down on 2026-10-22, the day of this run.
- **The fix uses a property of Planetiler rather than fighting it:** `Planetiler.getPath` registers a download only `if ((!Files.exists(path) || refresh) && url != null)`, so a file that is already present means **no request at all**. `map-server/scripts/fetch-planetiler-sources.sh` now owns those fetches — curl (which honors `http_proxy`, unlike the JVM here), resume, retries, a stall abort, ZIP verification so a truncated transfer or a saved error page is never accepted, a `.sha256` stamp for provenance, per-source mirror overrides that *replace* the public URL instead of falling back to it — and `generate-tiles.sh` runs it first, passes `--download-dir` at the same directory, and adds `--download-osm-tile-weights=false` so one more optional download cannot become one more way to fail.
- **Cached at the library, not inside a dataset bundle:** `<map-library>/planetiler-sources`. These layers do not vary with the selected areas or snapshot, so per-dataset copies meant re-downloading ~1.3 GB on every new selection, inside a directory setup prunes. An older checkout's copy inside `data/sources/` is validated and *moved* into the cache, so nobody eats a 900 MB re-download because the cache moved, and `MAP_SOURCE_POLICY=offline` now genuinely means "tiles too" — the fetch step refuses to reach out and names the exact paths it needs.
- **`--force` was not the culprit, and that is worth recording:** it looked like "force re-download", but in 0.10.2 it means "overwrite the output file and ignore disk/RAM warnings" — `--refresh_sources` is the flag that re-probes every source, and it defaults to off and is deliberately never passed. Verified against the 0.10.2 source rather than from memory, and pinned by a test that reads the script's *commands* (not its comments) so the explanation can't accidentally satisfy the assertion.
- **Tests:** `map-server/scripts/test_fetch_planetiler_sources.py`, 12 cases against a local HTTP server with request counting — the load-bearing one asserts a warm cache produces **zero** requests; also offline refusal, refresh behavior, the rejected-truncated-archive path, the legacy move, the mirror override, relative-path and bad-policy refusals, and `bash -n` on both scripts. `test_map_library` and `test_regions` still pass; the JS matrix is unaffected (server 399/399, shared 55/55, client 334/334 re-run green).
- **Docs in the same commit:** runbook (a "before you begin" warning, step 9's new output, a full *If step 9 fails* section with the three remedies, and the Java-proxy hint retired because step 9 no longer needs a JVM that can reach the internet), `MAP_LIBRARY.md` (layout + the offline boundary now that reference layers are library content), `MAP_SERVER.md`, `STRUCTURE.md`, `.env.example` and the README env sample (four new keys, all blank by default), and the setup script now prints that a first tile build may pull 1.3 GB.

### 2026-10-22 — review pass: one slug rule instead of two, and a runbook that no longer names a branch

- **A bug found by trying to write a test for a bug I suspected.** I expected `POST /_admin/incidents {name: "a-"}` to 500 on a missing slug-length CHECK. It did not: there is no CHECK, and the derived one-character slug is accepted — what was actually wrong is that the *explicit* `slug` field had **no length bound at all**, so a 5,000-character slug was storable while the identical string produced by derivation was refused. That asymmetry is the real defect, and it reaches the read side too, because `incidentTypeSchema` validates `slug` with the same schema: a stored value could be one the API refuses to serialize. Fix: `min(1).max(64)` on `incidentSlugValueSchema`, which every direction now shares, with the deliberate decision recorded — the floor stays at one character (`"0"` is legal, and a test says so) rather than inventing a minimum the ERD does not have.
- **A refusal that contradicted the screen.** The `invalid_incident_slug` message said "This name has no letters or digits to build a slug from" for *every* rejection: true of `عسل`, false of a pasted paragraph, which is refused because the slug would be too long. The message now quotes the value being refused and states the rule, with the quote capped at 60 characters so an oversized paste is not echoed back at full length in a response body. `docs/API.md` §9 also gained the note that `—` rows are reserved codes nothing returns yet, so no client has to guess which errors are real.
- **`docs/UBUNTU_VM_RUNBOOK.md` no longer tells you which branch to check out** (owner's call, and the right one): the clone pinned `arena/ec9ffc7e-borobiya` and told the reader to expect commit `7afe63d`, which was already stale and becomes invalid the moment a branch merges. A4's "expect this commit" discipline moved to where it belongs — record the checkout's own commit in the acceptance notes — and the replacement A5 ends with a preflight that fails fast if the pipeline files are missing from the checkout. A missing script used to surface forty minutes into an import. Verified in this sandbox: every file the preflight names exists, both `verify-*.sh` argument forms still resolve, and every script/image/port/env var the runbook cites matches `docker-compose.yml`, `.env.example`, and the pinned catalog (Geofabrik `2026-10-18`, Iran MD5 `a23eb2f2…`, Osmium 1.16.0, Planetiler 0.10.2, OSRM `v26.10.0-debian`, Photon 1.3.0, ports 8000/8001/5433). The one substitution left in the doc's favor: its host-side Photon import uses `${NOMINATIM_DB_PORT:-5433}` now, matching `setup-ubuntu-vm.sh`, where the manual version used the bare variable and would run with an empty port in a terminal that had not loaded `.env`.
- **`docs/WORKFLOWS.md` §7 told a release manager to run four commands that do not exist** (`bun run lint`, `bun run typecheck`, `bun test`, `bun run build` — the root `package.json` defines only `dev`). It now spells out the real gate: install, three Vitest runs, three typechecks, one client build, with a note on why the shorthand was wrong. §2's hook design keeps its proposed commands but says plainly that no hook manager is installed, and the phantom `deploy.yml`/`android.yml` trigger line is marked as not existing. `docs/DEVELOPMENT.md`'s contribution walkthrough had the same disease in a sharper way: step 5 sent newcomers to create `packages/server/src/modules/auth/auth.routes.ts`, a tree that does not exist — following it starts a second layout the docs then describe incorrectly. It now points at the real domain folders and at the contract-first rule, and step 2 says what this project actually does when a doc and `docs/TASKS.md` disagree.
- **Docs that had drifted behind shipped code:** `README.md`'s runtime-handler list and `docs/STRUCTURE.md`'s tour (app comment, `admin/` and `db/` file trees, the stores sentence, and "category membership … remain empty until their later domain migrations", which has not been true since T3.1.3) now name the incident-type catalog and responder categories, and state what genuinely still refuses: `hasCategory=true` and `category=` fail closed because no read projects membership yet, which is T3.1.4's other half.
- **`MAP_STYLE_LIGHT`/`MAP_STYLE_DARK` were removed from `.env.example`** (and from the env samples in `README.md`, `docs/DEVELOPMENT.md`, `docs/MAP_SERVER.md`), and `docs/ARCHITECTURE.md` §9.3 stopped claiming MapLibre is initialized from them. Nothing in the repo read those two keys — the client resolves the theme to the same-origin `/map/style/light|dark` — and their sample values pointed at a `/style/light` URL shape the app never asks Martin for. A config file that lists a knob nobody reads teaches readers that setting it does something; the three values that are genuinely not wired yet (SOS photo size, SOS auto-expire, mission status timeout) now say so in the file itself. A sweep of all 64 keys in `.env.example` against every source, script, compose file, and config in the repo found no others.
- **Suite state:** server 399/399 (four new route cases for the slug boundary), shared 55/55 (+1 for the shared bound), client 334/334, three typechecks and the client build clean. Nothing in this pass changed an endpoint's status: the refused/accepted slug boundary moved, which is a behavior change worth a review, and no client or migration needed one.

### 2026-10-22 — T3.2.1: `sos_requests`, and the two constraints this table deliberately does not have

- **The table the rest of Phase 3 hangs off** is now declared and migrated (`drizzle/0012_modern_sentry.sql`), matching `docs/DIAGRAMS/ERD.md` column for column, with `severity`/`status`/`description` CHECKs that restate the shared schemas' own bounds. The reason for duplicating a rule the API already enforces is narrow and real: without them, a row can exist that every read would then refuse to serialize.
- **No cascade on the three owners.** Deleting a requester or an incident type that an SOS names is *refused*. That is the opposite of `category_users`, and the difference is the rule: a membership row describes an account and dies with it, a request is evidence that somebody asked for help. Measured rather than asserted — both `DELETE` statements failed on their constraints.
- **Two absences, both explained rather than forgotten:** no index at all (including no GiST on `location`) because T3.3.1's nearest query is what will know the shape — almost certainly partial over the open statuses, as `location_shares_active_pinned_idx` is — and no cancellation cross-check because which of `cancellation_reason_id`/`cancellation_custom_text` are required together is §11.7C's decision, owned by T3.6. A constraint is not where you guess at somebody else's rule.
- **`created_at NOT NULL` from the start,** with the ERD corrected alongside: the last task found out that a nullable timestamp under a required `createdAt` in the response schema means a row with no legal response. Repeating that mistake would have needed the same follow-up migration twice, so the diagram moved instead.
- **A harness lesson worth keeping:** one line of the throwaway PGlite script reported `ACCEPTED (!)` for a phantom `cancellation_reason_id`, and the constraint was fine — the assertion's promise chain had resolved before the error surfaced. Re-running the identical statement with explicit error capture produced `violates foreign key constraint`. When a tool says the product is broken, measure the tool first; when a tool says the product is *fine*, that still has to be measured.
- **Nothing read or wrote this table at the time** — this commit changed no endpoint's behavior, only what the next one would have to work against. Server 395/395, shared 54/54, client 334/334. *Superseded the same day:* T3.2.2 registered `POST /_user/sos/requests`, so that route is live and the remaining SOS operations (photo upload, list, detail, cancel) are the ones still answering 404.

### 2026-10-22 — T3.1.3: categories, membership, and a bug only a running database could show me

- **Five routes, one store:** `GET`/`POST /_admin/categories`, `PATCH /_admin/categories/:id`, `POST /_admin/categories/:id/users`, `DELETE /_admin/categories/:id/users/:userId` are live over `DrizzleCategoryStore`, reusing `admin/authorize.ts` from the previous task. Two small helpers the incident routes owned (`blankToNull`, `validationIssues`) moved to `admin/normalize.ts` instead of being copied — the second copy of a rule is where the two start disagreeing.
- **Semantics worth stating, because they were choices:** a PATCH's `incidentTypeIds` replaces the set rather than diffing it (the contract has no "add one", and silently deleting what a stale form never showed is worse than a replace); assignment is idempotent through `on conflict ("category_id","user_id") do nothing`, so the second press reports `added: 0` and writes no audit row; removing a non-member is a `200`, because the admin asked for a state that already holds, and that is *not* the same as share revocation, where "you were never granted this" is the answer the caller needs. Unknown ids in either list are refused `400` with one issue per id pointing at its own index, before any write.
- **A real bug, caught by running the SQL and not by reading it.** The list query's link read was written `order by categories.name, incident_types.name, incident_types.id` while its FROM clause held only `category_incident_types` inner-joined to `incident_types`. Every unit test passed — they assert on the rendered string, and the string did contain that ordering. PostgreSQL answered `missing FROM-clause entry for table "categories"`. The ordering is on `incident_types` alone now, and the test additionally asserts that `"categories"` never appears in that statement's SQL, which is the assertion that would have failed before. Lesson for this project's own review: a string-match test proves intent, not validity; the executed run is what proves the query.
- **Two of my own overstatements, corrected in place:** the audit entry's `fields` list was "sorted written keys then append the set", so the same edit could be recorded in two orders depending on which fields the caller sent — it is one sorted list now. And a comment claimed Postgres folds a duplicate inside one `VALUES` list into the conflict skip "so the statement is safe even before the schema rejects duplicates"; measured on the real database, it skips without error *but* reports fewer rows than were written, so the count is only trustworthy because `uniqueIdsSchema` rejects duplicate ids first. The comment now says what is true, and cites the constraint that makes it safe.
- **T3.1.4 left open on purpose.** Its schema half is pinned (no default, no seed row, the pivot key is the pair, and a test assigns one account to two categories successfully) and an admin can now assign and remove. But no read projects categories into a profile, an admin row, or a search result yet, so the user-visible half cannot be shown end to end. Ticking it now would be a box ticked against a claim nobody can check.
- **Suite state:** server 390/390 (35 files), shared 54/54, client 334/334; three typechecks and `vite build` clean. The `0010`/`0011` DDL and the store's captured statements were both executed on PostgreSQL through PGlite (no PostGIS there, so `users` is a stand-in).

### 2026-10-22 — T3.1.2: the admin incident catalog goes live, and one authorization path to rule them

- **Three routes, one store:** `GET`/`POST /_admin/incidents` and `PATCH /_admin/incidents/:id` are implemented in `packages/server/src/admin/incidents.ts` over a new `DrizzleIncidentTypeStore`, and the OpenAPI status set now marks those operations `implemented` instead of `contract-only`. The admin checks (signed token, current account state, unrevoked session) moved out of `admin/users.ts` into `admin/authorize.ts` so both surfaces call the same function — a second copy of an authorization check is how one endpoint starts accepting what its neighbour rejects.
- **Slug policy, stated rather than implied:** the caller sends a name, the server derives the kebab slug, and an explicit `slug` overrides it because a Persian-only name has nothing to derive from (this app has Persian labels; refusing with an actionable `400` beats minting `incident-7`). Two names that differ only in case, punctuation, or accents collide on purpose — the unique index decides, and `409 INCIDENT_TYPE_SLUG_TAKEN` names the type that already owns the slug, the same way a refusal in Phase 2 names the user it is about. A PATCH writes only the fields it names and audits only what actually changed; a PATCH that changed nothing adds no audit row.
- **Contract additions, deliberately small:** `409` on create/update (a reachable collision the previous contract could not express — the sibling cancellation-reason create already had it), an optional `slug` on the body, and `null` accepted for `icon`/`color`/`description` on PATCH. That last one is the difference between "the admin can decorate a type" and "the admin can edit a type": without it there is no way to undo a color.
- **The ERD's nullable `created_at` turned out to be a bug I had just shipped.** T3.1.1 followed the diagram, and the diagram lost to the contract: `incidentTypeSchema.createdAt` is required, so a row without a creation time has no legal response, and the nullable column surfaced as a `Date | null` in the store's own record type — the typechecker caught it, which is the whole argument for typing the store rather than mapping at the last moment. `drizzle/0011_sturdy_ego.sql` backfills then sets `NOT NULL`, and `ERD.md` was corrected in the same commit. `adminAuditLog.meta` was typed to `{previousIsActive, isActive}` — one action's payload — so it became an open object; every further audited action would otherwise have needed a schema edit to say what it did.
- **Four of my own bugs in this task, all caught before commit.** (1) Building the PATCH schema as `create.extend({...})` instead of a partial would have made `name` required on a request that only clears a color — the shared tests now pin that a one-field PATCH parses. (2) My first route draft called the authorizer a second time to read `identity.userId`, doubling every account/session lookup per request and writing a second reply if the recheck failed; the fix is the single capture `admin/users.ts` already used, and a test counts the lookups. (3) I applied a blank-to-`NULL` normalization to `icon`/`color`, which the schema never allows to be blank — dead code masquerading as a rule; it now applies to `description` only, with the asymmetry written down. (4) I asserted Drizzle v1 exposes `toSQL()` on a bare `SQL` fragment (it does not): the house pattern is to export the query builder and pin `builder.toSQL().sql`, so the store now exports `incidentTypeListQuery`/`incidentTypeSlugOwnerQuery`/`incidentTypeInsertQuery`/`incidentTypeUpdateQuery`/`incidentTypeByIdQuery` and the tests read the ordering and the self-exclusion (`id <> $2`) off real rendered SQL.
- **Executed, not just unit-tested:** the store's captured statements were replayed on real PostgreSQL (PGlite, migrations `0005`/`0010`/`0011`, stand-in `users` since there is no PostGIS): the duplicate `on conflict do nothing` insert returned zero rows, the slug-owner probe named `"Fire"` for another row's slug and found nothing for its own, `order by name` produced `Alpha Rescue | Fire | Flood response`, the jsonb audit `meta` round-tripped, and a rename onto a taken slug raised the unique violation the store turns into a `409`. Two harness param bugs of mine (forgetting the `limit $3` placeholder and reusing the probe's captured id) made the first two runs fail before the product was implicated.
- **Stale reasons corrected while I was here:** `API.md`'s `hasCategory` sentence and the `admin-user-store.ts` comment both said the category tables "do not exist yet". They do now; what is missing is the join. Both say that instead, because a wrong explanation is more expensive than no explanation.
- **Suite state:** server 361/361, shared 54/54, client 334/334, all three typechecks and `vite build` clean. Next: T3.1.3 (categories + assigning users), which the store, route, and audit patterns here are built to be copied by.

### 2026-10-22 — T3.1.1: the category and incident catalog schema (3.1's first of five)

- **Four tables, no invention:** `incident_types`, `categories`, `category_incident_types`, `category_users` are now declared in `packages/server/src/db/schema.ts` and generated into `drizzle/0010_complete_namor.sql`. The declarations mirror `docs/DIAGRAMS/ERD.md` column for column — unique `slug`, free-text `icon`/`color` with no CHECK, `created_at` nullable with a default, composite-key pivots, `ON DELETE CASCADE` on all four foreign keys. Where the ERD stops, this stops too: `icon` gets no format rule (that would be enforcing our own guess), and no reverse index is added to the pivots on the theory that some later read wants it.
- **Nothing is seeded, deliberately.** `category_users` has no default and the migration inserts no rows, because T3.1.4 requires every account to start in no category — an assignment has to be a decision somebody made, and a schema that implied membership would make the admin screen's list a lie.
- **Verified by executing the DDL, not only by reading it.** `src/db/schema.test.ts` pins the Drizzle table config *and* the migration text; then `0010` was applied against real PostgreSQL in PGlite (with a stand-in `users` table, since PGlite has no PostGIS): duplicate slug refused, duplicate membership refused, a phantom `user_id` refused, and deleting a user or an incident type removed exactly its pivot rows while the category survived. Re-running `bun run db:generate` writes no second migration, so schema and `drizzle/` are provably in sync. Server 333/333, shared 47/47, client 334/334, all three typechecks green.
- **Counting the board against the tracker turned up two pre-existing errors,** both fixed here rather than quietly inherited: Phase 3's board had six rows for seven tracked sections (3.7 History & Rating was missing, so the phase percentage could not be derived), and 3.6 read 0% while T3.6.1 has been checked since 2026-10-18. The rows now carry their own `done/total` so the next reader can re-add them; Phase 3 is 2 of 39, i.e. 5%.
- **Three bugs in my own new tests, caught by the tools rather than by luck:** I asserted `fk.foreignData.onDelete` (Drizzle's `PgForeignKey` exposes `onDelete` on the object itself), left a nonsense comparison in the pivot loop from a sloppy edit, and asserted `not.toContain('DEFAULT gen_random_uuid()')` on a migration whose two `id` columns use exactly that. The last is the instructive one: I had written an assertion for the rule I meant ("no membership is defaulted") instead of the rule the file states. It now pins `DEFAULT gen_random_uuid()` to exactly two occurrences — allowed for keys, forbidden for memberships.
- **A doc line my own change made stale, corrected in the same commit:** `docs/API.md` and `docs/TASKS.md` justified the search refusal with "no tables yet". After this task the behavior is still right but the reason is false, so both now say what is actually missing — the read does not join them. A tracker that explains a limitation with a reason that no longer holds is worse than no reason, because the next reader stops trusting the rest of it.
- **Next in 3.1:** T3.1.2 (`POST /_admin/incidents` + `GET /_admin/incidents` + update), then T3.1.3 (`POST /_admin/categories` with `incidentTypeIds`, and `POST /_admin/categories/:id/users`), then T3.1.4 as written — "all users start in NO category; admin assigns; user can be in multiple categories (verify)" — which this schema makes possible but does not by itself prove; the verification belongs to that task, against the API and the admin screen. T3.1.5 is the admin frontend.

### 2026-10-22 — P2-Q1: owned share rows name their target, and a rule that only held until Tuesday

- **Date:** 2026-10-22 · **Task:** P2-Q1 (a Phase 2 follow-up, not a numbered task) · **PR:** pending · **Blockers:** none
- **Summary:** `GET /_user/location/shares` and `GET /_user/location/history/shares` answer owned rows with `targetUsername: string | null`, so "My Shares" reads as people rather than as uuid prefixes. Contract (`ownedLocationShareSchema`, `ownedLocationHistoryShareSchema`), both stores' reads, both routes, and the client's label order.
- **Details / decisions:**
  - **Left join, on an alias.** The label comes from `users` joined on `target_user_id`, under its own names (`share_target`, `history_share_target`) because the received half of the same read already joins `users` for the owner — two unaliased joins on one table is how a label silently starts describing the wrong side of the share. It is a **left** join because the username is a label and the row is the revoke control: dropping an owned row whose target cannot be read would hide an open share from the only screen that can close it. Verified against a real PostgreSQL (PGlite, minimal tables without PostGIS): an active share with a missing target row still returns with a `null` name, and revoked and expired rows return not at all.
  - **Strict where it matters, and nowhere else.** The label is *required* on owned list rows (`null` allowed, absence refused) so a server that stopped sending it fails the client's parse at the boundary instead of rendering a blank label; the `POST` create response deliberately keeps the unlabeled shape, which the new shared-schema case pins from both sides.
  - **The client kept its fallback, in a stated order.** `shareRowLabel` now reads: what the server joined → what this session saw (the picker, or a received row's owner) → the id prefix. The middle step survives because `null` is a real answer the server can give.
  - **A bug in my own earlier work, found by a fixture and named.** Adding the field made `use-device-settings.test.ts`'s POST stub fail, which is the *strict schema working as designed* — and chasing it turned up `historyWindowIssue` reading a hidden `Date.now()` while its sibling `historyWindowFromPreset` takes an injected clock. The "starts tomorrow is refused" assertion had been passing only because the calendar had not yet caught up with the fixture; it failed on its own the day this ran. The function now takes a clock (defaulting to `Date.now()`), the playback composable passes its own so the hand-typed window is judged by the clock that produced the presets, and the test pins the rule at a fixed instant. Same lesson the repo already records elsewhere: a rule with a clock inside it is not a testable rule.
  - **Drizzle note:** the generated SQL carries no `as "targetUsername"` alias — the result key comes from Drizzle's selection mapper, the same mechanism that already turns `owner_id` into `ownerId`. A raw-SQL run therefore sees `username`, which is worth knowing before someone "fixes" the assertion rather than the assumption.
- **Evidence:** client 334/334 (29 files), shared 47/47, server 328/328, three typechecks green, `vite build` clean; 2 new SQL-text pins, 2 new shared-schema cases, 2 new client label cases, plus the PGlite run above. `use-device-settings`/`use-priority-device`/`api/location` fixtures updated for the new required field.
- **What remains unverified:** no browser has rendered the labeled row (same caveat as the rest of the Phase 2 client surface), and the real PostGIS/PostgreSQL instance (P2-A2) still has to see these statements — PGlite has no PostGIS, so only the join and its cardinality were executed here, not the geography-backed parts of the same store.

### 2026-10-22 — T2.1.8 live companion markers: the server's echo, a peer with no position, and 42 kB moved out of the map chunk

- **Date:** 2026-10-22 · **Task:** T2.1.8 · **PR:** pending · **Blockers:** none
- **Summary:** Phase 2's last open line is closed. `src/live/companion-locations.ts` (the model), `src/composables/use-live-companions.ts` (the socket), `src/components/map/LiveCompanionPanel.vue` (the reader), `src/map/overlay-sync.ts` (the planner both map overlays now share) and the wiring in `UserMapView.vue`. Client 332/332 across 29 files (92 new cases in four new files, and three existing pins in `history/playback.test.ts` updated to the new theme watcher), shared 45/45, server 326/326, three typechecks green, `vite build` clean; Phase 2 is 20/20 and M2.1 is 8/8.
- **Details / decisions:**
  - **Three rules read off the server, not the client.** `owner.lastLocation` is `{lat, lon}` with no timestamp, so a bootstrapped peer is rendered **stale by construction** (`observedAtMs: null`) rather than "now", and `pruneRegistry` can never discard what it cannot date. `realtime/socket.ts` emits `location:peer-update` into the *sender's own room* as an ack echo, so `ownUserId` filters it — without that, a user who broadcasts and receives draws themselves among their own companions. And the same accepted fix reaches a receiver through two paths (the HTTP update's fan-out and the socket ack) plus a reconnect replay, so a position only moves **forwards**: an equal or older `timestamp` is dropped as `stale-replay`.
  - **The registry is the allow-list, and a positionless peer is still on it.** A `userId` the share list never named is not drawn — the client re-reads the list once instead (an in-flight read absorbs a burst of unknown ids). The first draft of `applyShareList` *skipped* an owner whose `lastLocation` was `null`, which meant the very first fix from a brand-new share was classified `unlisted` and dropped on every attempt: seeding is optional, membership is not. Pinned by a named regression case.
  - **Aging is visible, disappearance is earned.** Silence greys a dot at `STALE_AFTER_MS = 45s` (≈ ten missed updates against the 3–5s broadcast floor) and the panel says how old the position is; only past `DISCARD_AFTER_MS = 30min` does it leave the map. A dot that vanished would read as "they left the area", while "12 دقیقه پیش" reads as "their phone stopped sending", which is the truth. Staleness is noticed on a tick (5s) — a test that advanced exactly to the threshold failed for the right reason and now advances one tick past it, which is the documented semantic rather than a fudge.
  - **One planner, both overlays.** Playback and markers need the identical five maplibre rules, so `map/overlay-sync.ts` owns them and `history/playback-map-sync.ts` is a lookup; playback's existing pins were not touched, which is how the move is known to be safe. `firstLiveLayerId` → `beforeLayerId`; removal reverses both lists so sync-then-removal is a no-op; and the view names the live layer as playback's `beforeId` only when `getLayer` finds one, because an unknown `beforeId` throws.
  - **`socket.io-client` stays out of the map chunk.** The composable opens it through `await import("@/services/socket")`, with the two event names moved to a dependency-free `services/socket-events.ts` so naming an event costs nothing, and a generation counter closes a client whose import finished after sign-out. Measured across three builds: 19.9 kB → 70.39 kB (static import) → **29.13 kB** (lazy), transport in a shared 42.50 kB chunk the dashboard already fetched, entry unchanged at 437.03 kB.
  - **Bugs found in this task's own work, and named.** A checkpoint commit claimed "client 252/252" written before the package suite had been run; the measured number is 298/298, and the message was amended rather than left to look authoritative. Two files also cited a task id (`T2.3.7`) that was invented in a comment and exists nowhere in the tracker; both now cite T2.1.8.
  - **What was deliberately not built:** no accuracy circle (a radius around a GPS fix nobody is reacting to; it shows as `±N متر` text instead), no name labels (the local styles declare `glyphs`, but Persian glyph coverage at `/font/{fontstack}/{range}` is unverified here and a missing range breaks the map rather than hiding a label), no persistence (a cached position would be presented as live when it is only as fresh as the last open tab), and no camera follow (exactly two camera calls exist in the view and both belong to playback's one-per-track fit, pinned so a later watcher cannot make the map lurch).
- **Evidence:** 92 new client cases — 15 for the shared planner, 48 for the companion model, 17 for the composable under fake timers with a fake socket (one of them the pin that socket.io is reached only through a dynamic import), and 12 source pins for the view and the panel. `vue-tsc`/`tsc` green for all three packages; `vite build` with the chunk sizes above.
- **What remains unverified:** the socket round trip itself (two real browser sessions, P2-A1), anything geography-specific against PostgreSQL/PostGIS (P2-A2), and the panel in a browser — this workspace cannot mount components or run maplibre, so paint order, halo radius and the two-theme colors are pinned as data and as source, not as pixels. That caveat now applies to *both* map overlays: neither has been looked at in a browser.

### 2026-10-22 — T2.3.6 native device identity: two dependencies, and three things the client refuses to do

- **Date:** 2026-10-22 · **Task:** T2.3.6 · **PR:** pending · **Blockers:** none
- **Summary:** `packages/client` gained `@capacitor/core@8.5.3` and `@capacitor/device@8.0.3` (the user's explicit choice, taken before any Android project exists), plus `src/device/capacitor.ts` (the lazy probe), `src/device/native-label.ts` (the pure mapper), `composables/use-priority-device.ts` (the read-only answer), and one awaited line in `LoginView`. Phase 2's numbered implementation tasks are now complete (19/19).
- **Details / decisions:**
  - **The dependency stays out of the app shell.** `src/device/capacitor.ts` is the only file that imports Capacitor and it imports it *inside* the probe: `await import("@capacitor/core")` → `Capacitor.isNativePlatform()` → and only for a native shell `await import("@capacitor/device")` → `Device.getInfo()`. Measured in the build rather than asserted: the entry chunk moved 436.90 kB → 437.01 kB, the Capacitor runtime is its own 8.3 kB chunk on the login path, and the device plugin is a 357 B chunk behind the platform guard.
  - **The user-assigned name is never sent.** `DeviceInfo.name` is «John's iPhone» — personal data the owner chose for their own lock screen, generic on iOS 16+ without entitlements — while `user_sessions.device_name` is a table column the account owner reads. So the label is brand + model (`Samsung Galaxy S23`, `Apple iPhone14,5`), falling back to `iOS 17` / `Android 13` when the hardware is unknown, and to nothing at all (`undefined`) rather than the word `unknown`.
  - **A cosmetic field may not break a sign-in.** The probe swallows every failure into `null` — no bridge, unregistered plugin, rejected call — and the label is clamped to `MAX_USER_DEVICE_NAME_LENGTH` in the client, because `loginSchema` would *reject* an over-long `deviceName` and the user would be unable to log in because of a ROM's model string. `LoginView` adds the field only when it is non-empty and the store re-parses the body, so validation still happens in one place.
  - **Derivation, not enforcement.** `usePriorityDevice` answers `isListed` / `isOnline` / `broadcastingShares` / `ignoredShareIds` / `unassignedShares` from `GET /_user/devices` + `GET /_user/location/shares`, reads this session's id from its own access token (`device-identity.ts`) with an `ownDeviceId` ref a native shell may override, and **never** suppresses a broadcast: T2.3.4's server-side per-share refusal is the authority, and a client that stopped sending on a stale snapshot would create a device that cannot become priority again without a reload. It also treats a `null` pin as open to every device — the auto-pin rule — instead of inventing a stricter client-side reading. A failed refresh keeps the last good answer, because "you are not the priority device" is a claim about the server's current state.
- **Evidence:** client 240/240 (22 new: 8 native-label, 5 probe, 8 composable under fake timers, 1 source pin on `LoginView.vue` that the probe is awaited exactly once and the field is added conditionally), shared 45/45, server 326/326 (no route touched), `vue-tsc`/`tsc` green, `vite build` with the chunk sizes above. Docs: TASKS T2.3.6 (with the dependency decision recorded), ROADMAP M2.3 (6/6 now), STRUCTURE (`src/device/`, both composables, the narrative), USER_MANUAL §13 (what a native build labels, and the two refusals), PROGRESS scoreboard 100% (19/19).
- **Not verified (recorded, not claimed):** nothing native — there is no `android/` project, no `capacitor.config.ts` and no `@capacitor/cli` in this repository, so `Capacitor.isNativePlatform()` has never returned `true` in this workspace; the label path is proven by injected facts only, and a real device run belongs to the packaging task and to P2-A1. Lockfile and `package.json` moved together; CI's frozen-lockfile install is the check that they match.

### 2026-10-22 — T2.3.5 the Active Devices screen, and a settings write that cannot extend a share

- **Date:** 2026-10-22 · **Task:** T2.3.5 · **PR:** pending · **Blockers:** none
- **Summary:** `GET /_user/devices` gained its first consumer. `api/devices.ts` reads the route, `settings/priority-device.ts` holds the rules, `composables/use-device-settings.ts` sequences the two lists and the posts, `components/settings/DevicePriorityPanel.vue` renders them, and `views/_user/UserDevicesView.vue` replaces the `/_user/devices` placeholder (reachable from the dashboard's new note card).
- **Details / decisions:**
  - **No new endpoint, and that is the design.** The pin is `location_shares.priority_device_id` and `POST /_user/location/share` already re-points an active row for one (owner, target) pair, so the settings screen writes through the sharing door. What makes that safe is the body: a timed row is re-posted with the **floored minutes still remaining**, and `planShareReuse` patches an expiry only when the new instant is *strictly later* — so the call cannot lengthen what the recipient sees. Resending the original `durationMinutes` (the obvious implementation) would turn “change my phone” into “share for six more hours”, and `note` is omitted for the mirror reason: omission is what preserves the stored note.
  - **Two states are refused rather than sent.** A row whose expiry passed while the page was open (the lists hold active rows only → the POST would *create* a share, reopening live tracking that had just closed) and a `shareId` that vanished between the read and the click (same failure, so: refuse, re-read). The remaining-minutes arithmetic is borrowed from `describeLiveShareRow`, which is also why a share in its last minute reads as finished here exactly as it does in the share lists.
  - **Ages are data, not a timestamp in a template.** The device table's “۵ دقیقه پیش” hangs off a `nowMs` ref the composable ticks every 60 s and re-stamps on every refresh — the frozen-counter bug the share lists already fixed once — and `minutesSinceActive` is clamped at 0 so a session whose clock runs ahead cannot print a negative age.
  - **What a pin that left the list means.** `describeDeviceRows` counts every id the shares name, including ones the session list no longer contains, and the chooser keeps such a pin as a *disabled* option («دیگر در فهرست نیست»): while the maintenance sweep has not re-pointed it, somebody is still being shown a position, and dropping the row would display “nothing is broadcasting”. Offline-but-listed devices are disabled rather than hidden, since a minute without connectivity is not a reason for a device to disappear.
  - **The client does not pre-enforce the server's rule.** A device missing from the snapshot is *sent anyway*, and the `400 unknown_priority_device` is surfaced — the same principle T2.2.6 recorded for range limits — followed by a refresh, because that refusal means the list is stale, not that the user is wrong. The wording now comes from one `rejectionText` table, lifted out of `ShareDialog.vue` into `sharing/share-form.ts`: two switches over the same server codes drift the first time a code is added.
  - **Bulk is N posts, and says so.** There is no atomic account-wide re-pin, so `summarizeReprioritize` reports «۲ از ۳ … · ۱ مورد نیاز به تغییر نداشت · ۱ ناموفق» (skips and failures counted separately) instead of a green tick over a half-applied state, and the lists are re-read once at the end.
  - **Deliberately not built:** an account-level preference column. `users.priority_device_id` would put the same fact in two places, the realtime path compares the per-share value, and a user with no live share has nothing to re-pin — the screen says that instead of storing a preference nothing reads.
- **Evidence:** client 218/218 (34 new in this commit: 19 priority-device cases, 12 composable cases under fake timers, 3 boundary cases for the devices read), shared 45/45, server 326/326 unchanged, `vue-tsc`/`tsc` green, `vite build` code-splitting `UserDevicesView` (13.4 kB JS + 3.5 kB CSS). Three of the new cases read the panel/view/dialog sources, per the repo's no-mounting convention, to pin that no second payload builder exists, that the status line is a live region, and that neither component restates the refusal table.
- **Not verified (recorded, not claimed):** no browser run for the new screen (table layout, RTL chips, Vuetify select behavior on touch) — P2-A1; and the re-pin convergence itself depends on `planShareReuse`, whose SQL has only been read, not run against PostgreSQL (P2-A2).

### 2026-10-22 — T2.2.6 history playback: a track that grows, and the bounds the client may not invent

- **Date:** 2026-10-22 · **Task:** T2.2.6 · **PR:** pending · **Blockers:** none
- **Summary:** the map view gained the history overlay: `packages/client/src/history/playback.ts` (frames, interpolation, GeoJSON assembly, style descriptors, range presets and validation, sampling state, `datetime-local` conversion), `history/playback-map-sync.ts` (a plan of maplibre operations), `composables/use-history-playback.ts` (window, cursor, transport loop, both reads), and `components/map/HistoryPlaybackPanel.vue` (presets, manual window, transport, scrub, status), wired into `_user/UserMapView.vue`; `api/location.ts` gained the receiver's `fetchSharedLocationHistory`.
- **Details / decisions:**
  - **Nothing is drawn before it happened.** `positionAt` returns `null` before the first recorded instant instead of holding the earliest fix, because a marker sitting at home while the slider claims 06:00 is a lie about a position nobody sent; after the last frame it holds instead of running off the end. The played prefix carries the *interpolated* head so the line advances continuously, and dedupes at a frame boundary so a vertex is never doubled.
  - **Three collections, not one.** The full trace changes per load, the played prefix and the head per tick; rebuilding the trace every tick would re-upload the largest geometry 20×/s for no visual change. A one-vertex `LineString` is invalid GeoJSON, so fewer than two points yields an empty collection — "no path yet" has a representation, which also makes an unmounted panel's teardown safe.
  - **The map half is a plan, not a call sequence.** `addLayer` before the style finishes loading throws, a layer may not reference a missing source, and `MapCanvas`'s `setStyle(…, {diff:true})` on a theme switch *removes* the playback layers (the track would vanish on the next dark-mode toggle and only reappear on a reload). `planPlaybackSync`/`planPlaybackRemoval` decide all of that as data the component interprets, so the ordering rules are pinned by 9 tests instead of discovered in a browser.
  - **A throttled tab resumes; it does not finish.** The loop is a 50 ms interval whose delta is clamped at 250 ms (deliberately not `requestAnimationFrame`, which pauses entirely in a hidden tab and then delivers minutes at once), the cursor is clamped into the recorded interval, playback stops on the last frame rather than idling at 100 % progress, and a press at the end rewinds instead of doing nothing.
  - **`fitBounds` refuses a single fix**: `trackBounds` returns `null` below two frames, because a zero-area box zooms the camera inside one building; the view eases to the point at the current zoom instead, and fits once per track (`fittedFor` key) so scrubbing never yanks the camera.
  - **Client-side limits, corrected against the server:** the docstring on `fetchMyLocationHistory` claimed a 1–7 day cap on own-history reads; `locationHistoryQuerySchema` is `{from,to}` with `to > from` and nothing else, and `LOCATION_HISTORY_MAX_SHARE_DAYS` guards grant *creation*. So the picker refuses only unparsable/inverted/future windows — a 400-day look-back is offered — and a shared read skips window validation entirely, since the grant fixes range and density and refusing it would be a client bug wearing a validation costume.
  - **Sampled is not the record.** `totalPoints` next to `points.length` drives «۱٬۰۰۰ از ۸٬۴۱۲ نقطهٔ ثبت‌شده» in the status line, because the server thins a wide window by `stride = ceil(total / cap)` in SQL and a polyline that quietly represents 1/8th of a month would read as a complete history.
  - **Local wall time, everywhere.** `datetime-local` values are read as browser-local and converted to ISO on the way out and back on the way in, so the field a user typed and the clock the cursor shows agree; the same rule the share dialog's expiry labels learned in the T2.1.7 duration pass.
- **Evidence:** client 184/184 (68 new: 36 playback, 9 map-sync, 23 composable under fake timers — the panel and the view are not mounted, so five of the playback cases read their source to pin that the chips go through `formatDuration`, that the transport disables itself without a track, that the panel never touches maplibre, and that every map mutation goes through the plan); shared 45/45; server 326/326; `vue-tsc` green for client, shared and server; `vite build` compiles the new panel into the `UserMapView` chunk (19.9 kB), and a dev boot on `:5299` served the compiled panel (no `maplibre` reference in it, so the separation the source test claims also holds in the built module) and the view (calling `planPlaybackSync`/`planPlaybackRemoval`). Docs: TASKS T2.2.6, ROADMAP M2.2 + exit criterion, STRUCTURE tree and client narrative, API §12 (the `/_user/map` row also lost a `GET /_user/users/search` claim that no code on that view ever made).
- **Not verified (recorded, not claimed):** no browser run — maplibre rendering, Vuetify's slider/chip behavior, RTL layout of the panel, and touch dragging are P2-A1 scope; the map mutations are untested against a real `Map` instance by construction, which is exactly why the planner is a pure module. Deliberately unchanged: live companion markers (a separate roadmap line), no client-side span cap, and no `geojson` typing dependency (the two casts at the maplibre boundary are commented where they happen).

### 2026-10-22 — Phase 2 review, fourth pass: a health probe that could be throttled, and `no-store` as a per-handler habit

This pass read the infrastructure the sharing slices stand on — the security plugins, the OpenAPI generator, and the responses that never reach a handler — where the defects only show up under load.

- **`GET /_public/health` was rate-limited, so a busy instance could look dead.** The global throttle (`RATE_LIMIT_MAX`, default 100/min per IP) applied to every route, including the one that decides whether an orchestrator restarts the container. Compose's own probe survived on the loopback bucket, but any monitor behind the proxy shares the client bucket — and the moment a deployment is loaded enough to exhaust it, the probe starts answering `429`, which is how a *healthy-but-busy* API gets restarted in the middle of the spike that made it look unreachable. Health is now exempt through one shared-descriptor field, `ApiRouteMeta.rateLimitExempt`, that both sides read: `app.ts` sets the route's `rateLimit: false` from it, and `plugins/swagger.ts` stops attaching its implicit `429` to that operation, because a contract that advertises an error the runtime cannot produce is worse than no claim at all. The two IP-keying tests in `app.test.ts` moved off `/_public/health` onto `/docs/json` — with the probe exempt they would have gone on passing on status codes while testing nothing, which is the quiet way an exemption like this rots a suite. `/docs` stays throttled on purpose: a developer surface is not a liveness probe.
- **`cache-control: no-store` depended on 39 route files remembering it.** Every endpoint section of `docs/API.md` promises it, and 39 handlers set the header by hand — while the responses most worth not caching were the ones no handler ever saw: the limiter's `429`, Fastify's `404` for an unknown path, the `/_user` hook's pre-routing `401`, and health itself, which answers `200` with a live `uptime` and had no header at all. An `onSend` hook in `security.ts` now applies `no-store` to any response arriving without one, and an explicit handler header still wins, which is what keeps `GET /_public/security-questions` (`public, max-age=3600`) the API's only deliberately cacheable response. `404` is the case that makes this more than tidiness: RFC 9111 lets a cache treat `404` as heuristically fresh when no `Cache-Control` is present, so a shared proxy could hold a `404` for a path the caller reaches a minute later.
- Read and confirmed sound, recorded so the next pass does not re-open them: `trustProxy` is derived from `TRUSTED_PROXY_IPS`, so the limiter buckets per client rather than per deployment; the limiter's `errorResponseBuilder` emits exactly the top-level `code`/`message`/`issues` envelope `requestJson` reads, so a `429` renders as a Persian retry message rather than a generic failure; `@fastify/swagger-ui` v6 ships `index.html` with **no** inline script or style (its own `csp.json` is `{"script":[],"style":[]}` and every asset is a same-origin `./…` reference), so helmet's `default-src 'self'; script-src 'self'` does **not** blank the docs page — and `/docs` does not even inherit the strict API policy, since the plugin sends its own header (visible as `img-src 'self' data: validator.swagger.io` with no `connect-src`); `GET /_user/users/search` already answers `category: null` per row, which is what stops the client's strict response schema from failing on a field whose tables do not exist yet; and a store failure inside `/_public/security-questions` came through the error envelope with `no-store` on the way.
- Validation: full matrix from the repo root — all three typechecks clean, shared 45/45, client 116/116, server 326/326 (+3: `no-store` on a `429` and on the two pre-routing rejections, and the health probe staying reachable past the limit while a protected route still trips; the OpenAPI assertion inverts to require `200` *only* for health while every other operation keeps its `429`). A real boot with `RATE_LIMIT_MAX=1` answered ten consecutive `GET /_public/health` probes with `200` + `cache-control: no-store`, turned `/_public/security-questions` into a `500` on its first call (no database behind it, logged as an "unhandled request failure" through the error envelope) and a `429` on its second — which also shows the throttle counting failed requests, so a broken dependency cannot be used to dodge it — and returned `404` + `no-store` for an unknown path; the same boot's startup sweeps stayed contained warnings, and SIGTERM shut it down cleanly.
- Deliberately left alone: the per-handler `no-store` calls (they say *why* a route is uncacheable where the reader is, and the hook is the net rather than the mechanism); `/docs` remaining throttled; and the fact that `/_user/not-a-route` answers `401` rather than `404` because the group's auth hook runs before routing — that ordering leaks nothing (an unknown path and an unauthenticated one are indistinguishable to a caller without a token) and changing it would mean moving the hook after the router for no gain.

### 2026-10-22 — Phase 2 review, third pass: refusals that name somebody, and copy that keeps its own rule

Third fresh-eyes read of the sharing slices, this one following a failed request instead of a successful one: what does the dialog say when the server refuses?

- **A server refusal arrived and was thrown away.** `POST /_user/location/share` answers an unusable recipient with `400 VALIDATION_ERROR` plus one issue per person (`self_target`, `unknown_target`, `unavailable_target`), but the dialog's catch branch called `issueText(issues.value[0]?.code)` — `issues` being the client's *own* recomputed draft issues. Those are empty by construction for any draft that got far enough to be submitted (the button is disabled otherwise), so every refusal from the network — including "your friend deactivated their account two minutes ago", the one case nobody can diagnose alone — collapsed into «اطلاعات واردشده را بررسی کنید.» on a request that could hold 50 people. `shareRejections`/`nameShareRejections` (pure, in `share-form.ts`) now read the envelope's issues, resolve the recipient index against `recipientLabels` (deduplicated exactly as the payload's `targetUserIds` are, first occurrence winning, so an index cannot point at the wrong name), and the dialog renders a message that names the person. Codes it cannot explain still fall through to the generic copy rather than being swallowed.
- **The refusal's `path` was not a body path.** `shareRecipientIssues` emitted `path: [index]`, while every other issue in the same response — Zod's, and the device chooser's `path: ["priorityDeviceId"]` — is a body path. A client that already knows how to highlight a rejected field could not use these. They are now `["targetUserIds", index]` for both live and history creation (one shared helper, so neither can drift), and the reader accepts the old shape and a collapsed one-number form too, because a deployed client meets whichever server it talks to and a miss degrades to "one of your selections" instead of a wrong name.
- **The dialog quoted raw minutes again.** `duration_out_of_range` read "بین ۱ تا 43200 دقیقه" — a count nobody can judge, and a fifth user-facing duration after the chips, the slider label, the ceiling hint and the two lists, which the previous pass had just unified under `formatDuration`. The message now says «۱ دقیقه تا 30 روز», and because the components are not mounted in tests this repo, a source-level case pins that the dialog reaches for `durationWords(maxMinutes)` and no longer interpolates the bound.
- **A new search inherited the old search's failure.** `use-target-search` cleared `results`/`total`/`loading` when the term became too short but not `failed` when a *new* request started, so the picker showed "جستجو انجام نشد" plus a retry button above a list that was still loading — for a request that had not failed and had, in fact, not finished. `run()` now clears it as it arms the request.
- **One documented gap left open deliberately**, because closing it is a product decision rather than a defect fix: nothing retires a *deactivated* account's active shares. The broadcasts stop on their own (the socket handshake and the `/_user` hook both require a live session, and deactivation clears every refresh-token hash), so no new position is ever produced — but the last stored position and any history grants stay readable to the people that account had already shared with, because those reads filter on the *recipient's* account, not the owner's. SECURITY §4.3 now states this plainly instead of leaving it implied; whether deactivation should also revoke the rows belongs to the admin panel's follow-ups.
- Validation: full matrix from the repo root — all three typechecks clean, shared 45/45, client 116/116 (+6 cases: 5 on reading and naming refusals, 1 on the dialog's own wording rule), server 323/323 (the batch-refusal test now pins the three paths as well as the three codes). `vite build` compiles the dialog into the dashboard chunk, and a real API boot (no database answering) kept `POST /_user/location/share` and `GET /_user/users/search` at `401` with envelope bodies and `cache-control: no-store`, 55 OpenAPI paths, both startup sweeps logged as contained warnings, clean SIGTERM.
- Caught and confirmed **not** bugs while reading, recorded so the next pass does not re-litigate them: the retry after the device chooser does send `priorityDeviceId` (the chooser stays open until the success path closes it, so the gate is not a deadlock); `ApiError` really does carry `issues` from a top-level envelope; history creation's `path: ["to"]`/`["maxPoints"]` were already body paths; `historyShareSchema` being strict is what makes dropping the note in `buildHistorySharePayload` correct; and the receiver's history read takes no window parameters at all, so there is nothing there to widen.

### 2026-10-22 — Phase 2 review, second pass: one active share per recipient, a clock that ticks, and a picker that cannot offer yourself

The review continued along the path a user actually walks from `/_user/dashboard`: create a share, read the lists, revoke it. Three defects, one of them a privacy bug in T2.1.2's own reuse rule.

- **Asking for a shorter window left the longer one open.** `createShares` decided reuse-or-insert on `(owner, target, mode)`, so a permanent share and a one-hour share are two different rows: requesting one hour while a permanent share was live inserted a *second* row, the request answered `201` with `createdShareIds: [one id]`, the dialog reported one share, and the recipient kept receiving the owner's position indefinitely — with the shorter row expiring out from under a list that then showed only the permanent one. A recipient has **one** active arrangement and the request redefines it. `planShareReuse` (exported, pure) owns that decision: a mode change re-points the row (`timed` → `permanent` clears `expiresAt`, `permanent` → `timed` sets it, both in one `UPDATE` so `location_shares_expiry_mode_check` holds on the intermediate state), a same-mode repeat still extends a timed expiry only forward, and a timed request that somehow carries no expiry is refused by name instead of meeting that CHECK mid-transaction. The lookup is mode-agnostic and ordered `expires_at desc`, which sorts a permanent row's `NULL` first — so the kept row is the wider one and rewriting it can only narrow — and every *other* active row for the pair, which the old rule could leave behind, is revoked in the same transaction so existing tables converge on one row per recipient. A reuse whose `UPDATE` answers with no row now throws rather than reporting the pre-patch row as extended, matching the insert path's stance: promising a share that no longer exists is worse than a rolled-back request.
- **The share lists froze at their first render.** `ShareLists.vue` built its row sets with `const now = new Date()` *inside* the computeds. Vue caches a computed until one of its dependencies changes and a freshly constructed `Date` is not a dependency, so "۵ دقیقه مانده" stayed on screen past the deadline, expired rows never moved under the live ones, and a receiver's view of who is sharing with them was wrong until a page reload — the exact opposite of what that panel is for. It now reads a `nowMs` ref advanced on a 30-second interval (armed in `onMounted`, cleared in `onBeforeUnmount`, and pulled forward whenever `refresh()` re-reads the lists). 30 s is finer than any resolution these rows display; the tick is deliberately unconditional because "only while rows exist" is the shape that leaks timers.
- **The picker could offer your own account.** `GET /_user/users/search` returned the caller's row and only the dialog disabled its button, comparing against `auth.user?.id` — which is null while the profile fetch is in flight or has failed, at which point every click on that row produced a `400 self_target` the user cannot explain or fix. `reachableUserConditions(callerId)` now excludes it in SQL, in the page *and* the count statement, so the two describe the same set of shareable accounts and the client's grey-out is presentation rather than the rule.
- Validation: full matrix from the repo root (`bun --filter '*' typecheck && bun --filter '*' test`) — all three typechecks clean, shared 45/45, client 110/110, server 323/323 (+10 cases: 7 on `planShareReuse`'s decision table, 2 on the store's reuse/retirement statements, 1 on the vanished-row failure; plus the self-exclusion assertions on both search statements). The `order by expires_at desc` NULL ordering, the CHECK under a single `UPDATE`, the mode-agnostic active predicate, and the sweep never touching a permanent row were executed through PGlite against a schema shaped like the real table; `ne(users.id, callerId)` and the escaped `ILIKE` ride along in that harness. Row-level effects on a migrated instance remain P2-A2, and PostGIS remains unavailable in this workspace.
- Deliberately **not** changed, with the reason: `POST /_user/location/share` still ignores `note` on a no-op repeat (a repeat must not blank a note the user can no longer see in the dialog, and the note is decoration, not visibility); `location:update` still refuses to record history from a non-pinned device, which is T2.3.4's documented rule rather than an oversight; and `is_expired` boundaries in the UI stay floor-based, which shows a closing share as ended a few seconds early instead of a few seconds late.

### 2026-10-22 — reviewing Phase 2 against a real PostgreSQL: the search 500, a 500 that talked, and duration words

**Reported from the VM.** `GET /_user/users/search` answered 500, so the share dialog's picker could not find anyone. The statement ended in `round(ST_Distance(…) / 1000.0, 1)` — and **PostgreSQL has no two-argument `round` for `double precision`**: `round(x, 1)` accepts `numeric` only. `ST_Distance(geography, geography)` returns `double precision`, which is exactly the type with no such overload, so parsing failed (42883) before a single row was read. Nothing in the suite could have caught it: the store tests assert SQL *text* and parameters, and text is not a parser.

**Proven, not reasoned.** PGlite (a real PostgreSQL, WebAssembly build, run outside the repo) executed both forms: `round(metres / 1000.0, 1)` → `FAIL: function round(double precision, integer) does not exist`; `round((metres / 1000.0)::numeric, 1)::float8` → `PASS`, with 12456.7 m → `12.5`, 999 m → `1`, `NULL` in → `NULL` out, and 50 m → `0.1` (half-up, not truncated). The same harness then ran the rest of the statement — `username ilike` with the escaped pattern (the term `field_responder` matched only `field_responder`, while the unescaped pattern matched 2 rows; `50%_off` stayed literal), `coalesce(avg_rating, 0) >= $1`, `exists (select 1 from user_sessions …)`, `order by "distanceKm" nulls last, "username" asc`, and `count(*)::int` — all accepted. PostGIS itself is out of reach in PGlite (no `geography` type), so the distance *call* and the GiST index stay VM checks (P2-A2).

**Two more bugs, found by reading the same code back.**

- **The 500 that described our SQL.** With no error handler installed, Fastify serialized the driver's message into the body — the browser saw `function round(double precision, integer) does not exist`. `plugins/error-envelope.ts` now answers an unhandled failure as `{ error, code: "INTERNAL_ERROR", message, issues }` with a fixed sentence, logs the real error for 5xx (because the response no longer carries it), and maps framework 4xx onto contract codes rather than passing `FST_ERR_*` names through. A 503 keeps its status: "retry later" is the one thing a client acts on, and flattening it to 500 would throw that away.
- **`Number(null)` is 0.** The projection mapped the distance column with `mapWith(Number)`, so a `NULL` — an account with no fix — became `0` km, the *nearest possible* value: it would have sorted to the top of a "nearest first" list labelled "0.0 km away". `readDistanceKm` keeps `NULL` `NULL`, rejects non-finite values, and accepts the string a `numeric` column can arrive as.

**Duration words in the dialog.** The chips printed raw minutes, so a day read "1440 دقیقه". `formatDuration` now owns one rule for the whole sharing UI: minutes under an hour; hours above it, with a remainder only when there is one (`360` → "6 ساعت", `390` → "6 ساعت و 30 دقیقه"); days from 1440 up with the leftover hours and minutes (`1505` → "1 روز و 1 ساعت و 5 دقیقه"); and whole weeks as weeks (`10080` → "1 هفته"). The preset list gained 15 and 30 minutes, keeps no labels of its own, and derives its chip text from the same function as the slider's live line, so the two cannot disagree. `ShareLists` deleted its private copy of that arithmetic. A test walks every preset and fails on the old shape.

**Also fixed:** history-grant rows rendered their window with `timeZone: "UTC"`, four hours off for a Tehran user — now local; and the duration slider passed `step="1"` as a string where Vuetify declares a number, a prop warning on every open of the dialog.

**Further SQL executed against a real PostgreSQL.** The history window sampling was replayed on 5,007 rows: `(5000, cap 1000) → 1000`, `(5000, cap 7) → 7`, `(7, cap 5) → 4`, `(7, cap 1000) → 7` — never above the cap, and the integer-division ceil inside `greatest(1, (total + cap - 1) / cap)` behaves (its parameters are typed by the adjacent `bigint` aggregate, which is why they do not need a cast). `pg_advisory_xact_lock(hashtextextended($1, 0))`, the batched retention `delete … id in (select … limit n)` (0 rows on a fresh table), and the `min(device_id)` / `count(distinct …) = 1` device predicates all parsed and ran. One related risk was checked rather than assumed: `count(*) over ()` is `bigint`, and postgres.js hands bigints through as values `JSON.stringify` refuses — the history read maps it with `.mapWith(Number)` and the search count casts to `::int`, so no aggregate can reach a response untyped.

**Verification.** `bun --filter '*' typecheck` green; shared **45/45**, client **110/110** (+7 duration-wording cases), server **313/313** (+9: 6 envelope, 2 distance-mapping, 1 route case proving a store failure ships no internals). The client `vite build` compiles the dialog with its new chips. A real boot of the API with no database behind it stayed up, answered `GET /_user/users/search`, `GET /_user/location/shares`, and `/_user/users/search?…&category=x` with `401` + `cache-control: no-store`, kept all five share/search operations `implemented` in `/docs/json` (55 paths), logged both startup sweeps as contained warnings, and shut down on SIGTERM. Still open: the picker's happy path against a live PostGIS-enabled database (P2-A2) and two real browser sessions (P2-A1).

### 2026-10-22 — the share dialog, the picker behind it, and what the client may not decide

**What landed.** T2.1.7 in full, plus the client half of T2.3.3. `packages/client/src/api/location.ts` is the browser's first REST access to `/_user/location` (share create/revoke/list, history grants in both directions, the caller's own track) and to the search endpoint; `ShareDialog.vue` offers the recipient picker, timed/permanent modes with a duration slider, and an optional note; `ShareLists.vue` puts "My Shares", "Shared With Me" and the history grants on `/_user/dashboard` with confirm-before-revoke. The dialog shows the `409 PRIORITY_DEVICE_REQUIRED` device chooser when the account has several live devices.

**Decisions worth the reasoning.**

- **The `.vue` files render; the logic sits in two pure modules.** The client suite has no DOM (no `@vue/test-utils`, no `jsdom`), and the repository's convention is already `location-broadcast.ts` (pure, tested) beside `useLiveLocationBroadcast.ts` (glue, untested). So `sharing/share-form.ts` answers validation, payload shape, the 409's device list, and row timing; `composables/use-target-search.ts` owns scheduling. Both are covered by tests, and the components cannot drift into untested arithmetic.
- **Bounds are imported from `@shared/index`, never retyped in the client.** `MAX_LOCATION_SHARE_TARGETS`, `MAX_LOCATION_SHARE_MINUTES` and `MAX_LOCATION_SHARE_NOTE_LENGTH` drive the slider limits, the counter and the error copy. A duplicated constant is how a client ends up rejecting a request its own server accepts.
- **A one-character term is cleared locally instead of being sent.** The server answers `q_too_short` below two characters; forwarding that would flash an error at someone typing normally. The request then waits 300 ms after the last keystroke (spec §7.2) and cancels the superseded one, so a five-character name costs one `LIKE` scan and the list never belongs to an older word.
- **A stale response is dropped by request id, not by timestamp.** `isLatestSearch(requestId, latest)` is the whole rule; a clock comparison would need the server's clock to be meaningful.
- **`note: ""` is dropped, not sent.** The server stores `null` for "no note"; an empty string comes back as a blank line in the recipient's list. Same reason `durationMinutes` is only sent in timed mode (the schema refuses the pair) and why a history grant gets no note at all (`historyShareSchema` is strict — an extra key is a 400 the user cannot fix).
- **`online=false` is never the default of the toggle.** The picker sends `online` only when the user actually picks "online"; sending `false` silently would mean "only people who are currently *not* connected", which is the opposite of an untouched control.
- **Category and incident filters are absent, and the dialog says why.** The server refuses those two with `400 SEARCH_FILTER_UNSUPPORTED` until T4.1.1's tables exist. A control that looks filtered but is not is the worst outcome for a privacy screen.
- **The chooser is part of the submit path, not a separate flow.** One `submit()` sends `priorityDeviceId` only while the chooser is open: after the account drops back to a single live device, a remembered id would be refused as unavailable. Device ids are labelled `دستگاه N (xxxxxxxx…)` because the endpoint returns ids, not names.
- **Rows re-read from the server after every change.** A share can be revoked from another device at any moment, so `createdShareIds`/`reusedShareIds` refresh the lists rather than patching local state. History failures do not blank the live list: `Promise.allSettled` keeps the answer to "who can see me right now" on screen even when the grants call fails.
- **Owned rows show a short id when the name is unknown.** `GET /_user/location/shares` returns `targetUserId` with no username for outgoing rows. The dashboard labels them from names it has already seen (received rows, this session's picks) and otherwise truncates the uuid. Adding `targetUsername` server-side is a contract change and is recorded here as the follow-up instead of being slipped into a client commit.
- **Timing text is computed from an injected `now`.** `describeLiveShareRow(share, now)` floors remaining minutes and never returns a negative one — "expires in -3 minutes" reads as a broken UI, so a past deadline is simply `expired` with 0 left, and a share with `expiresAt = null` is its own kind ("permanent") rather than a very long number.

**Verification.** `bun --filter '*' typecheck` green and `bun --filter '*' test` at shared **45/45**, client **103/103** (+45: 15 API-boundary cases, 24 draft/payload/409/row cases, 6 composable cases), server **304/304** (untouched — no server code changed), and `bun run build` in the client (vue-tsc + Vite) compiles both new components into `UserDashboardView`. `docs/API.md` §12's dashboard row now matches what the page really calls.

**Boot check.** `bun run dev --port 5199` answered `200` for `/`, `/_user/dashboard`, and each new module: `ShareDialog.vue` and `ShareLists.vue` came back as compiled render functions (60 vnode calls in the dialog's output), and Vite's dependency optimizer picked up the Vuetify components only these two files use (`VAlert`, `VBtnToggle`, `VChip`, `VDialog`, `VDivider`, `VRadioGroup`, `VSelect`, `VSlider`, `VSkeletonLoader`, `VTextarea`). That is the transform side of the story, nothing more.

**Not verified.** No browser rendered the new screens in this workspace, so the Vuetify layout itself (dialog sizing, slider behavior on touch, chips, RTL alignment of the picker rows) is reasoned from the existing views rather than observed — exactly the check the user runs on the Ubuntu VM. No request has been sent to a running API either: the shapes are asserted against the shared schemas, not against a live `POST /_user/location/share` response. The new Persian copy has not been read by a native-speaking reviewer. All three are recorded as open, not passed.

### 2026-10-22 — username search, so the share dialog has something to pick from

**Why now.** T2.1.7's recipient picker needs `GET /_user/users/search`, which belongs to T4.1.1 (Phase 4, unstarted). Rather than build a dialog against a 404, the server read landed early as its own slice; T4.1.1 stays open with the parts that belong to Phase 4.

**Decisions worth the reasoning.**

- **Refuse, never ignore.** `category` and `incidentType` have no tables (category membership is explicitly later domain work), and a list returned "filtered" while the filter was dropped is worse than an error — the picker would show accounts that don't match what the user asked for. So they answer `400 SEARCH_FILTER_UNSUPPORTED` with `issues[0].filters`, and an empty `category=` (a cleared control) is treated as absent, the same tolerance `lat`/`lon`/`minRating` already had.
- **`q` is required, at least 2 characters.** Enforced in the route, not the contract: the descriptor must stay satisfiable when T4.1.1 implements term-free browsing, and a 1-character `ILIKE '%x%'` on an unindexed `username` returns most of the account table for a scan every keystroke would repeat. Trigram/prefix indexing is recorded as T4.1.1's job rather than done half-way here.
- **`LIKE` wildcards are escaped** (`%`, `_`, `\`) because usernames are `[a-z0-9_]` — an unescaped `field_responder` term would also match `fieldXresponder`, which is a wrong result a user cannot notice.
- **Liveness and rating have one definition each.** `online` is "a session still holds a refresh token" — the same rule as the device list — and `minRating` treats `NULL` as 0, so an unrated account doesn't satisfy a quality floor by having no data.
- **Distance is kilometres, one decimal, and NULL is not an exclusion.** `ST_Distance` on geography returns metres and `NULL` when either side lacks a position; the read divides by 1000 and sorts `NULLS LAST, username ASC`, so an account whose phone never reported a fix is still findable, just last. The reference point is `lat`/`lon` when given, otherwise the caller's own `users.last_location`, resolved in a scalar subquery so the whole read stays one statement.
- **The total is a second statement, not `count(*) OVER ()`.** Here the opposite trade from the history read: a page beyond the end has no rows to carry a windowed count, and a search that reports `total: 0` for page 4 of 40 makes a client stop paginating early. The pair is deliberately not transactional — on a busy instance the total can be off by whoever signed up in between, which is what a search count means.

**Verification.** Server **304/304** (+20: 10 route cases in `src/users/search.test.ts` — 401 before any lookup, `q_required`/`q_too_short`, refused vs. cleared filters, exact store input, coordinate pairing, `false` distinct from absent, empty page, positionless rows; and 10 store cases in `src/db/user-search-store.test.ts` pinning the escaped pattern parameter, the longitude-before-latitude parameter order, the `coalesce(avg_rating, 0)` floor, `exists`/`not exists` sessions, the `round(ST_Distance(...) / 1000.0, 1)` projection, and `limit/offset` math). Shared gained the empty-id tolerance cases; `app.test.ts` pins `userSearch` as `implemented` with 200/400/401/403 and adds `/_user/users/search` to the fail-closed `/_user` probe list. `docs/API.md` §5.2 now states exactly what is honored and what is refused, §9 gained the new 400 code, and the shared search descriptor carries a `description` so a generated client sees the limits.

**Still not verified:** the query cost against a real account table, and the `ST_Distance` call itself (answered 2026-10-22, one entry up: PostgreSQL *rejected* that `round` form — the projection is now `round((…) / 1000.0)::numeric, 1)::float8`, and PGlite confirmed both the rejection and the ordering/`NULLS LAST` behavior).

### 2026-10-22 — T2.2.4 the history read path: windowed reads, grant lists, and a real delete

**The task.** T2.2.3 could create a grant; nothing could read one. This closes the server half of history sharing: `GET /_user/location/history` (own window), `GET /_user/location/history/shared/:shareId` (a granted window, as a receiver), `GET /_user/location/history/shares` (both directions, so a receiver can learn a grant id at all), and `DELETE /_user/location/history/share/:shareId` — all in `src/location/history.ts` on top of four new `LocationHistoryStore` methods.

**Decisions worth the reasoning.**

- **Sampling happens inside the query.** `historyWindowQuery` filters the window and computes `row_number() over (order by timestamp, id)` plus `count(*) over ()` in one CTE, then keeps `(position - 1) % greatest(1, (total + cap - 1) / cap) = 0`. Fetching everything and thinning it in Node is the obvious version and the wrong one: a 30-day window at a 4s floor is ~650k rows per account, and the whole point of `maxPoints` is that nobody should have to move that. The filter is the `(user_id, timestamp)` index T2.2.1 added for exactly these reads, and integer stride arithmetic keeps the first point and degenerates to "everything" when the window is shorter than the target.
- **`totalPoints` joined the response.** `{ points }` alone cannot distinguish "this is the trace" from "this is 1,000 of 8,412", and a playback UI that draws 1,000 dots and calls it complete is a correctness problem wearing a design costume. The count arrives on every row of the same query, so reporting it costs nothing and avoids a second `COUNT(*)`.
- **Reads are `[from, to)` on `timestamp`** — the observation time, half-open, the same convention the range check uses. Filtering on `created_at` would key the read to ingest order while the index, the window the owner shared, and the polyline's own x-axis are all observation time.
- **A receiver gets no knobs.** `GET /_user/location/history/shared/:shareId` takes no `from`/`to`/`maxPoints`: the grant fixes the window and the density, so nobody can widen what they were given and every receiver of one grant sees the same view. The owner changes density by re-posting the same window with a new `maxPoints`, which the reuse path already applies.
- **The ceiling is a default, not a clamp.** `LOCATION_HISTORY_READ_POINTS` (new, 1–10000, validated at startup, default 1000) supplies the target when a grant stores `null` and for the owner's own read, but it never reduces a target an owner explicitly stored — silently thinning a resolution somebody asked for is the kind of surprise this feature cannot afford. Its ceiling is the contract's own bound, so a default can never ask for more than a grant could.
- **The list carries no live position.** `sharedWithMe` history rows name `owner: { id, username }` and stop there, deliberately unlike the live-share list: a grant over the past never authorized watching where the owner is now.
- **Repeat deletes answer 404, unlike live revoke's repeat 200.** A live share keeps its row and `is_revoked`, so "already revoked" is a state worth confirming; a history grant is *gone*, and there is no retained row to be idempotent about. Unknown id and somebody else's grant are also answered identically (`No share with that id belongs to this account.`).
- **No migration was needed.** `0009` had already put `max_points` on the row and the `(user_id, timestamp)` index serves the reads; a repeat `db:generate` reported no further schema changes.

**Verification.** Full matrix: three typechecks clean, shared **45/45** (+3 response/list contract cases), client 58/58, server **284/284** (+18: 11 route cases in `src/location/history.test.ts`, 6 store cases, 1 env case). The route suite pins the store's exact input per endpoint (whose `userId`, which window, which cap), the 404 symmetry plus "never reaches the history table", `accuracy` absent rather than null, the list's `owner` shape, and 401-before-any-store for all four paths. The store suite pins the generated SQL (`with "sampled" as`, the window functions, the `% greatest(1, …)` predicate, the parameter order) and the empty-window mapping. `src/app.test.ts` asserts all four operations are `implemented` with their response sets, that both reads declare `totalPoints`, that the shared list exposes `owner` without a position, that delete declares a void 200, and that each path fails closed on the real `/_user` hook. A local boot on `127.0.0.1:3112` reported `points: { maxItems: 10000 }` with `required: [lat, lon, timestamp]`, `GET`/`DELETE` answering 401 unauthenticated, and regenerating the Zopia client produced typed modules for all five history paths with no warnings; the shared route inventory count moved 59 → 61 with it.

**Still not verified (P2-A2):** that PostgreSQL accepts this CTE/window-function form as written (Drizzle emitted it; a server has not parsed it), that the plan actually seeks `location_history(user_id, timestamp)` instead of sorting, that the stride keeps ≤ `maxPoints` rows on a real skewed dataset, and that a delete really removes the row for the owner only — all of it is SQL-text evidence, not an answering database.

### 2026-10-22 — T2.2.3 history-share grant creation with a bounded window

**The task.** `POST /_user/location/history/share` {`targetUserIds`, `from`, `to`, `maxPoints?`} — grant a fixed range of stored history to other accounts, bounded by `LOCATION_HISTORY_MAX_SHARE_DAYS` and 1–50 recipients, with recipients validated as a batch. Until now the table (`0007`) and the retention prune existed but nothing ever wrote a row, so the history read path (T2.2.4) had nothing to read.

**Decisions worth the reasoning.**

- **The range bound lives in the route, not the schema.** `to - from <= locationHistoryMaxShareDays` is configuration, and `packages/shared` must not import server env (the contract is consumed by the browser too). The descriptor carries the field bounds it can know (1–50 recipients, unique UUIDs, strict body, `maxPoints` 1–`MAX_LOCATION_HISTORY_SHARE_POINTS` = 10000); the route applies the day bound after body validation and **before any database work**, answering `400 SHARE_RANGE_TOO_LARGE` with `issues: [{ code: "range_too_large", maxShareDays, requestedDays, path: ["to"] }]`. Over-long windows are rejected, not clamped: clamping would silently show a receiver fewer days than the owner meant to share.
- **Recipient rules are shared code, not copied.** `shareRecipientIssues(assessment, targetUserIds)` maps the `assessShareTargets` rows (active, non-blocked, non-deactivated accounts) to `self_target` / `unknown_target` / `unavailable_target` keyed by request index, and *both* share endpoints call it — so the refusals a user sees cannot drift between sharing live and sharing history. One unusable recipient rejects the whole batch, matching live creation.
- **`maxPoints` is stored on the grant.** The spec asked for an optional per-share cap; making it query-time-only would let each receiver pick a different density for the same grant. Migration `0009_green_proudstar.sql` adds `location_history_shares.max_points` (nullable integer, DB check `IS NULL OR > 0` so the database enforces the same bound the contract does) — additive only, and `db:generate` reports no further drift.
- **Reuse, not duplicate.** `location_history_shares` has no `is_revoked` and no `expires_at`: the unique index over exactly `(owner_id, target_user_id, from, to)` **is** the duplicate rule, so a repeat of the same window reuses the row and rewrites only `maxPoints` (including back to `null`). The response is therefore the batch shape `{ shares, createdShareIds, reusedShareIds }`; the contract's earlier `{ shareId }` implied one id for up to 50 targets and is corrected here rather than left as a docs claim.
- **Two consequences of a grant being a window rather than a subscription**: it needs **no priority device** (the server replays rows it already stored, so there is nothing to broadcast and `location_device_required` never applies), and it **cannot be empty-and-refused** — retention may have pruned the window already, so a range with no points is created normally and reads back as no points.
- **No revoke path in this commit, deliberately.** Retiring a history grant has to be a real `DELETE` (there is no flag to flip), and shipping a half of the receiver's read path without the other would leave the row unmanageable; `DELETE /_user/location/history/share/:shareId` ships with T2.2.4. A `TODO` in the route docblock keeps that visible.
- The per-owner advisory lock that protects live share creation is now `src/db/owner-lock.ts` and is taken **once per batch** by both stores, so a 50-recipient request costs one lock, not fifty.

**Verification.** Full matrix from the repo root: all three typechecks clean, shared 42/42, client 58/58, server **266/266** (+13: 8 route cases in `src/location/history.test.ts` — range math incl. the exact ceiling, the 201 payload and the exact store input, `maxPoints` omitted → `null`, `401` before any lookup, the range refusal with both stores untouched, batch recipient refusal, inverted range and `maxPoints: 0`; 4 store cases; 2 shared-schema bound cases; 2 migration/`max_points` cases), plus the `/_user` fail-closed `401` and `/docs/json` status assertions in `src/app.test.ts`. A local boot on `127.0.0.1:3112` reported `locationCreateHistoryShare` as `implemented` with 201/400/401/403/429, `maxPoints` as `{integer, minimum: 1, maximum: 10000}`, and answered an unauthenticated `POST` with `401 UNAUTHORIZED` through the production hook. Regenerating the Zopia client from that document produced typed request/response modules for the operation and completed **without the `maxPoints` legacy warning** that the unbounded field used to raise.

**Still not verified:** that `0009` applies and that the duplicate-window reuse is what PostgreSQL's unique index actually enforces under two parallel requests — the store tests record the SQL and its parameters, not an answering database (P2-A2).

### 2026-10-22 — Phase 2 defect sweep: crash containment, schedule coupling, and share integrity

A review of everything shipped in T2.1.x–T2.3.x (not a new task) turned up the defects below in the Phase 2 code. Each is fixed in this entry, with the reasoning and what remains unverified recorded alongside it.

- **A database hiccup could end the API process.** Socket.IO runs middleware and event listeners in callback style and never looks at the promise an `async` handler returns, so the awaits inside the handshake (`findUserById`, `hasActiveSession`) and inside `location:update` (`listActiveOutgoingShares`, `recordFix`) turned a connection error into an *unhandled rejection* — fatal under Node's default policy. The handshake now fails one connection with `SERVICE_UNAVAILABLE` and the update answers the same code on its ack, both logging at `warn` through the Fastify logger; nothing propagates as a rejection, including the delivery of the ack itself to a socket that vanished mid-update. Documented in API §8/§9 and SECURITY §2.3.
- **One broken job re-armed the other forever.** The scheduler advanced `lastExpiryAt` and `lastPruneAt` together, gated on the whole pass being clean. A permanently failing share sweep (a column a migration never applied, say) therefore also reset the prune's daily marker every 15 seconds, turning a batched daily `DELETE` into a hot loop. Each job now advances on its own success, and the failure labels are exported constants (`SHARE_SWEEP_FAILURE`, `HISTORY_PRUNE_FAILURE`) instead of string literals agreed on between two files.
- **A replayed fix could move the SOS position backwards.** `users.last_location` was overwritten by whatever arrived last, whatever its observation time — so a client flushing a day of buffered fixes after reconnecting dragged the marker (and every receiver's map) to where the device stood yesterday. The live path already refused observations more than 5 minutes in the *future*; it now also refuses an observation more than `MAX_LIVE_UPDATE_AGE_MS` (24h) in the past with `INVALID_TIMESTAMP`. Rejection rather than a silent skip: a device whose clock is simply behind self-heals on its next fix, while a guard on "newer than the last stored point" would freeze a slow-clocked device's marker at another device's position indefinitely.
- **A double-tapped share button could create two active rows.** `createShares` decides reuse-or-insert with a read followed by a write inside a transaction, and no unique constraint backs that decision (the table keeps retired rows for audit, so a partial unique index would collide with the expiry sweep's grace period). Two concurrent requests of one account could each read "nothing active" and both insert — duplicate list entries, duplicate fan-out, and two disagreeing priority pins. The transaction now takes a transaction-scoped advisory lock keyed on the owner id, which serializes the decision across API replicas too, since the lock lives in the database.
- **The pin was counted in sessions, not devices.** `resolvePriorityDevice` treated `listDevices` rows as devices, so several live sessions of one device id (exactly what T2.3.6's client-stable device identity will produce) would demand a choice between two identical options; the repair statement had the mirror defect with `count(*) = 1`, which would refuse to re-point a share while its owner's only live device held two sessions. Both now count *distinct* device ids.
- **The stale-pin sweep had no index to seek, and `bearerToken` in `live.ts` was dead code** left over from before the `/_user` hook guarded the fallback route. The share table only ever grows (retired rows stay for audit), so a per-minute predicate on `is_revoked`/`priority_device_id` without a matching index becomes a sequential scan of every share ever created. Migration `0008_shallow_metal_master.sql` adds `location_shares_active_pinned_idx`, a partial btree on `(owner_id, priority_device_id) WHERE is_revoked = false and priority_device_id is not null`; the sweep's two constant conditions are written to match it. The dead helper is gone.
- Contract gap: `POST /_user/location/share` could answer `409 PRIORITY_DEVICE_REQUIRED` but its shared descriptor documented only 201/400/401/403, so a generated client could not type the response the share dialog has to branch on. The descriptor now declares the 409 and carries a `description` of the batch and device rules; a local boot confirmed `/docs/json` lists 201/400/401/403/409/429 for the operation.
- Validation: full matrix from the repo root (`bun --filter '*' typecheck && bun --filter '*' test`) — all three typechecks clean, shared 42/42, server 253/253 (+9 cases: 2 realtime containment, 2 observation-age, 1 scheduler cadence, 2 share-store lock, 1 resolver/route distinct-device pair, 1 schema/migration index), client 58/58. A repeat `db:generate` reported no further schema changes, the real API booted with the new migration present, both sweeps were submitted through the driver and logged their `ECONNREFUSED` warnings while the server kept serving, and the socket test clock was fixed (it had been comparing a hardcoded payload timestamp against wall time, which the new staleness bound would have turned into a false failure the next day).
- **Still not verified:** everything that needs an answering PostgreSQL — that `0008` applies and that the sweep plan actually uses the partial index, that the advisory lock serializes two real concurrent share requests into one row, and the repair's row effects (P2-A2). Containment of the realtime failure path is unit-proven only; the crash it prevents was reasoned from Node's rejection policy, not reproduced end to end (P2-A1).
- Deliberately **not** changed, recorded as known limits rather than defects: `GET /_user/devices` caps at 50 rows, so an account with more than 50 live sessions cannot pin one beyond the cap (it gets `unknown_priority_device` and a refresh hint); `historyShareSchema.maxPoints` is still an unbounded positive integer because the endpoint that would use it (T2.2.3/T2.2.4) is unimplemented and must own the bound; `location_history` has no `created_at` index, so the prune's final "nothing left" batch costs one scan per day; revisit the retention key together with the T2.2.3 read path; and `deviceSchema.deviceId`/`shareSchema.priorityDeviceId` are both `uuid` today only because the server mints device ids — T2.3.6 must relax the two together.

### 2026-10-22 — T2.3.3 priority device chosen by the server on share creation

- `shareSchema` gained `priorityDeviceId` — an optional UUID naming the device that will broadcast the position, documented on the field as spec §7.3's per-share selection and the value `location:update` must be sent with. `locationUpdateSchema` already carried one and was left as a bounded string on purpose: its non-UUID labels belong to the realtime contract's history (T2.1.5/T2.3.4 tests) and that path compares it against the authenticated session device instead of trusting it.
- `POST /_user/location/share` resolves the field in a new `resolvePriorityDevice` step: exactly one live device pins it without asking; more than one refuse the whole batch with `409 PRIORITY_DEVICE_REQUIRED` whose `issues[0].deviceIds` is the chooser's data, so nothing lands half-chosen; an id that is not a live session of the caller is `400 VALIDATION_ERROR` with `unknown_priority_device`. The device list comes from `userDeviceStore.listDevices({ userId, currentSessionId, limit: 50 })` — the same read `GET /_user/devices` serves, so the picker and the validator can never disagree — and a malformed id never reaches it because the schema rejects it first. Zero live sessions (unreachable through the `/_user` hook, so it only guards direct store use) pins the caller's own device and still refuses any other requested id rather than widening the pin.
- The pin is per share row, which is what `ActiveOutgoingShare` in the realtime path and `locationShareSelection` in the SQL path already assumed; there is no account-wide default device and no new migration (`priority_device_id` exists since T2.1.1). Re-posting a recipient re-points the existing share whenever the requested device differs, including on a permanent share — a deliberate exception to "permanent shares are never updated", because the pin is the one field whose change the user asked for — while `note` is still only rewritten alongside an extension.
- `DrizzleLocationShareStore.repairStaleSharePins()` re-points active shares of accounts left with exactly one live device when the device they pin has signed out, run from the share-expiry step of `runLocationJobs` (`repairedPins` in the outcome, no new timer). It closes the trap the auto-pin would otherwise open: with a dead pin every `location:update` is rejected and `users.last_location` — the SOS fallback — freezes silently. Accounts with two or more live devices are never guessed at; their next share request gets the `409` again.
- Docs: API §5.3 carries the request field and the full selection rule, §9 names `unknown_priority_device` on the `VALIDATION_ERROR` row and the `deviceIds` payload on `PRIORITY_DEVICE_REQUIRED`, and SECURITY §2.3 now describes the live rule (including "no endpoint changes the pin on its own") instead of the intended one.
- Validation: shared 42/42 (+1 `priorityDeviceId` schema case), server 244/244 (+13: 5 route cases — auto-pin, refusal with nothing written, accepted selection, stale id, malformed id before any device read — plus the exact store call assertion, 2 resolver unit tests for the zero-session branches, 5 store cases — pin on insert, pinned timed re-request re-pointing and extending, permanent re-point touching no other column, unchanged pin touching nothing, and the repair statement's SQL shape — and 1 scheduler case proving shares are still reported expired when the repair throws), client 58/58, all three typechecks pass. Run from the repo root as `bun --filter '*' typecheck && bun --filter '*' test` (the root `package.json` defines no `typecheck`/`test` script of its own, so `bun run typecheck` there is not a verification).
- Local evidence beyond unit tests: the real API was booted again on `127.0.0.1:3110` and `GET /docs/json` now types the create-share body as `targetUserIds`, `mode`, `durationMinutes`, `note`, `priorityDeviceId` — the last as `{ type: "string", format: "uuid" }`, generated from the shared schema rather than a hand-written override — while the operation keeps its `implemented` status; the same boot answered `401 UNAUTHORIZED` to an unauthenticated `POST /_user/location/share` carrying a `priorityDeviceId`, so the new field is accepted by the route and the device lookup is never reached without a verified session, and `/_public/health` stayed 200.
- **Still not verified:** the repair statement has never met PostgreSQL — that it touches exactly the intended rows, and leaves multi-device accounts alone, is proven only at SQL-text level (P2-A2); and the whole path needs two real browser sessions to exercise the `409`→choose→`201` round trip plus the matching `location:update` payload (P2-A1).
- Deliberate deviations, recorded in TASKS.md: the modal itself (with the "other devices stop broadcasting" confirmation) is client work belonging to the share dialog (T2.1.7) and the settings chooser (T2.3.5), and SOS-start device selection cannot exist before SOS (T4.2.2/T4.3.1).

### 2026-10-22 — T2.3.1 + T2.3.2 active devices

- Audit first: `user_sessions` has carried every spec §7.3 field since migration `0000_wide_garia.sql` (`device_id`, `device_name`, `refresh_token_hash`, `ip`, `last_active_at`, `is_online`, plus the cascading `user_id` FK and the unique hash index from `0003`), and the write path was already complete — login inserts, refresh rotation swaps the hash and bumps `lastActiveAt`/`isOnline`, logout and admin revocation clear the hash and set `isOnline=false`. No migration was needed, so T2.3.1 is recorded as an audit plus the one real gap below.
- That gap was `device_name`: login stored the raw `User-Agent` truncated to 255. `src/auth/device-label.ts` now derives a bounded human label (`Chrome on Windows`, `Safari on iPhone`, `Microsoft Edge on Windows`, `Samsung Internet on Android`, `Automated client`) with the most-specific-browser-first ordering that Edge and iOS Chrome require, an optional client-supplied `deviceName` (1–100, trimmed — what a Capacitor build will send for T2.3.6) always wins, and an unrecognizable UA stores `null` rather than arbitrary client detail.
- `GET /_user/devices` (T2.3.2) is live: `db/device-store.ts` selects the caller's **live** sessions (`refresh_token_hash is not null`), ordered `last_active_at desc, id asc`, capped at `MAX_USER_DEVICE_LIST_ITEMS` (50), and `auth/devices.ts` maps them onto the shared `deviceSchema` with `no-store`. A missing `request.authenticatedUser` fails closed with 401 before the store is touched.
- Shared contract: `deviceSchema` gained `deviceId` — the value `location_shares.priorityDeviceId` pins — so the T2.3.3 picker can read this list without a second request; `devices.length > 1` is the exact spec condition for requiring a priority-device selection. `loginSchema` gained the optional `deviceName`. Because `devicesSchema` is shared, `GET /_admin/users/:id` now selects `device_id` too, so both device views expose the same row shape and an admin can see which device a share pins.
- Recorded semantics: a device is a live session (`deviceId` is minted per login and carried in every token claim), `lastActiveAt` is the last credential exchange, `isOnline` mirrors refresh-token liveness until socket presence differentiates it, and revoked/logged-out rows are excluded instead of accumulating as offline history because sessions have no retention job.
- Validation: shared 41/41 (+6 in the new `schemas/user.test.ts` and the login deviceName cases), server 233/233 (+20: 11 device-label, 3 device-store/SQL-shape, 4 route, 2 login), client 58/58, all three typechecks and the client build pass.
- Local evidence beyond unit tests: the real API was booted on `127.0.0.1:3110` and answered `GET /_user/devices` with `401 UNAUTHORIZED` (no token) and `401 INVALID_ACCESS_TOKEN` (garbage token) through the production `/_user` hook, `/_public/health` stayed 200, and `/docs/json` reported `userListDevices` as `implemented` with the `deviceId` property — after which `bun run generate:api` regenerated the Zopia client (`src/generated/api/_user/devices/get/index.ts`, typed strict response array, ignored by git) with only the pre-existing `maxPoints` legacy warning. The same boot re-checked the T2.1.6/T2.2.5 sweeps through the real driver: both statements were submitted, `connect ECONNREFUSED 127.0.0.1:5432` was logged as `… sweep failed` / `… prune failed` warnings, the pass retried on every 15s tick, and the server kept serving.
- **Still not verified:** anything needing an answering database — the device list against real `user_sessions` rows, the prune/expiry row effects (P2-A2), and browsers/the proxy upgrade/real PostGIS writes (P2-A1, P1-A2).

### 2026-10-22 — T2.1.6 + T2.2.5 share expiry and history retention jobs

- Added `packages/server/src/location/jobs.ts`: `runLocationJobs` performs one pass of the two Phase 2 maintenance jobs — `LocationShareStore.expireOverdueShares({ now })` retires every unrevoked timed share whose `expires_at <= now` in a single statement, and `LocationHistoryStore.pruneOlderThan({ olderThan, limit })` deletes history older than the retention cutoff in batches of `HISTORY_PRUNE_BATCH_ROWS = 5000` rows, at most `HISTORY_PRUNE_MAX_BATCHES = 40` per pass. Each job is isolated: a throw is logged as a warning and reported in `failures` instead of blocking the other job or rejecting the pass.
- `startLocationJobs` owns the schedule: a 15s `setInterval` (unref'd) re-checks cadence, expiry runs every minute and pruning daily, a pass never overlaps a still-running one, and only a clean pass advances the schedule so failures retry on the next tick.
- `parseServerEnv` now validates `LOCATION_HISTORY_RETENTION_DAYS` (default 90, 1–3650) and `LOCATION_HISTORY_MAX_SHARE_DAYS` (default 30, 1–365) and **fails startup if the share window is wider than retention**, because such a grant would promise points that had already been pruned. `docker-compose.yml` passes both through to the `api` container; `.env.example` already listed them.
- Both stores gained the SQL used by the jobs, exported as `expireOverdueSharesQuery` and `pruneLocationHistoryQuery` so the statements are tested through Drizzle's real SQL builder (parameters bound, no string interpolation, an `is not null` guard so permanent shares stay untouched, and `created_at` — not the observation timestamp — as the retention key per spec §7.2). `locationFixQueries` was extracted the same way to keep the write path's geography/insert parameters assertable.
- Wiring is deliberately opt-in: `server.ts` calls `createFastifyApp(config, { startMaintenanceJobs: true })`; `createFastifyApp` starts the timers, runs one `tick({ runAll: true })` in `onReady` so a restarted API does not keep a closed share alive, and stops them in `onClose`. Apps built for `app.inject()` therefore create no intervals at all, which the new `app.test.ts` cases assert in both directions.
- Deliberate deviations, recorded in TASKS.md: the expiry sweep marks `is_revoked = true` instead of `DELETE`-ing rows (audit trail preserved; every reader already filters `expiresAt > now`, so an expired share delivers nothing even before the sweep sees it), and there is no leader election or advisory lock — the statements are idempotent, so N API replicas mean duplicated work, not corrupted state.
- Validation: shared 35/35, server 213/213 (14 new cases: 7 scheduler/job, 3 history write + prune SQL, 1 expiry-sweep SQL, 2 app wiring, 1 env validation), client 58/58, all three typechecks and the client production build pass. Counts were only quoted after re-running every package from the repo root — `bun --filter … typecheck` prints nothing when it is invoked from a package directory, which briefly hid one real error.
- **Still not verified:** the two statements have never met PostgreSQL. There is no database in this workspace, so the batched `DELETE … id IN (SELECT … LIMIT n)`, the `UPDATE … RETURNING id` sweep, real row counts, and the lock behaviour of a large first prune are proven only at SQL-text level. Browser/VM evidence for the live path remains open under P2-A1.

#### P2-A2 — Retention job acceptance on a real database — **OPEN (Phase 2 follow-up)**

On the target VM (or any PostgreSQL with the migrated schema): confirm `0008` applied and that `EXPLAIN` for the stale-pin sweep picks `location_shares_active_pinned_idx` over a sequential scan, and fire two `POST /_user/location/share` calls for the same recipient in parallel to confirm the advisory lock leaves exactly one active row. Insert history rows straddling `LOCATION_HISTORY_RETENTION_DAYS` and confirm the prune deletes exactly the older batch, and that re-running the pass deletes nothing and logs nothing; create a timed share with a `durationMinutes` short enough to expire and confirm it disappears from `GET /_user/location/shares` at the deadline and gains `is_revoked = true` within ~60s without a restart, that a permanent share is never touched, and that `POST /_user/location/share` afterwards creates a new row instead of reusing the retired one. Also confirm the container refuses to start when `LOCATION_HISTORY_MAX_SHARE_DAYS > LOCATION_HISTORY_RETENTION_DAYS`. Both statements were since submitted through the real driver during a local boot (no database answered: connection refused, both jobs logged a warning and retried on the next 15s tick while the API kept serving), which proves the query text and the failure isolation but no row-level effect. Since T2.3.3 the same run must also cover `repairStaleSharePins`: with two live sessions of one owner and a share pinned to a signed-out device, it must re-point the active share to the remaining device; after signing the last one out it must stop, and it must never move a share belonging to an account that still has two live devices or touch a revoked/expired row. Nothing here is claimed until that run is reported.

### 2026-10-21 — T2.1.5 + T2.3.4 realtime live location

- Added Socket.IO (`socket.io` on the API, `socket.io-client` on the client) mounted at `/socket.io` on the existing API port; nginx gained a `/api/socket.io/` block that forwards `Upgrade`/`Connection` with 75s read/send timeouts (above `pingInterval` 25s + `pingTimeout` 10s), and the Vite dev proxy gained a matching `ws: true` entry ordered before the generic `/api` proxy.
- The handshake runs the same checks as the `/_user` REST hook (verified access JWT, existing account with a matching role, active, unsuspended, onboarding complete, persisted live session) and every socket joins `user:{userId}`, admins also `admin`.
- `location:update` now: throttles 60 updates/min per connection, validates `locationUpdateSchema`, requires the payload's `priorityDeviceId` to equal the connection's session device (T2.3.4 `WRONG_DEVICE`), ignores every share that pins another priority device, then in one transaction upserts `users.last_location` (`ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography`) and inserts `location_history`, and finally emits `location:peer-update` to each accepting target plus an echo to the sender's own room. A fix is stored even with no active share because SOS dispatch (T3.3.1) reads `last_location`; sustained `>50/s` auto-suspend still needs the `suspendedUntil`/`suspension_reason` columns and is not implemented.
- The deprecated `POST /_user/location/update` REST fallback shares the same service and also fans out to peers, so a polled fix is not silently local-only.
- Client: `services/socket.ts` (+ `socket-options.ts`) uses the same-origin `/api/socket.io` path, passes the token in `handshake.auth`, re-reads a rotated token on reconnect, and never keeps a socket open after logout; `composables/useLiveLocationBroadcast.ts` watches geolocation with 4s pacing and reads this session's device id from its own access token claims.
- Validation: shared 35/35, server 199/199 (22 new realtime/service cases), client 58/58, all package typechecks, and the client production build pass. Fixing `io.close()` on non-listening test apps was required so inject-only apps shut down cleanly.
- Local evidence beyond unit tests: a throwaway script (not committed) ran the real stack on `127.0.0.1` with a genuine Socket.IO WebSocket transport and injected stores — both clients connected, `location:update` acked `{ ok: true, peers: [target] }`, the fix reached the peer room, a payload naming another device acked `WRONG_DEVICE` without persisting, `POST /_user/location/update` returned 200 and also reached the peer, and an unauthenticated handshake was refused with `UNAUTHORIZED`. A temporary local app.close() rejection from `io.close()` on a never-listening server was found and fixed as part of this work.
- **Still not verified:** live browsers, the nginx/Vite proxy upgrade paths, the target VM, and real PostGIS writes (no PostgreSQL in this workspace). Reconnect/token-rotation behavior is coded but unexercised. See the new P2-A1 follow-up.

#### P2-A1 — Live broadcast acceptance — **OPEN (Phase 2 follow-up)**

Two browsers signed in as the share target and owner on the target VM should show the dot moving within ~5s while the owner walks, confirm the marker stops immediately after revoke, confirm a second device cannot overwrite the priority device, and confirm the polling fallback works when WebSocket is blocked. A local (non-VM, non-browser) real-WebSocket run already proved the server-side handshake/ack/fan-out/rejection path; the remaining gap is the browser, the proxy upgrade, and real PostGIS persistence. The same run should exercise the share-request side of T2.3.3: one account signed in on both profiles so `POST /_user/location/share` answers `409 PRIORITY_DEVICE_REQUIRED` with both `deviceIds`, then `201` once one is named, then a `location:update` accepted from the pinned browser and rejected by the other. Record browser/origin (HTTP LAN has no Service Worker), the observed latency, and sanitized server logs. Nothing here is claimed until that run is reported.

### 2026-10-21 — T2.2.1/T2.2.2 location history storage

- Added `location_history` and `location_history_shares` to the Drizzle schema in one migration (`0007_brief_hedge_knight.sql`), because both tables belong to the same history-sharing slice and one migration keeps the applied-migration story simple.
- `location_history`: `bigserial` id, cascading `user_id` FK, `double precision` lat/lon/accuracy, `timestamptz` observation timestamp plus `created_at`, latitude/longitude/accuracy checks, and the composite `(user_id, timestamp)` index. Deliberate, documented deviations: no geography column or GiST index (reads are user- and time-scoped, never radius queries) and no monthly partitioning (optional in the ERD/ARCHITECTURE, and it would complicate the FK/migration path while retention is still a `DELETE` job).
- `location_history_shares`: non-cascading owner/target FKs, `to_time > from_time` and no-self-share checks, a unique `(owner_id, target_user_id, from_time, to_time)` grant so a repeated identical request cannot stack duplicates, and owner/target `(…, from_time)` indexes.
- Validation: server 177/177 (3 new schema/migration assertions), server/shared/client typechecks, shared 35/35 and client 49/49 tests pass; a repeat `db:generate` reported no further schema changes. These tables are storage only: no writer, reader, or retention job exists yet (T2.1.5, T2.2.3–T2.2.5), and nothing here was executed against live PostgreSQL.

### 2026-10-21 — T2.1.4 active share lists

- Implemented `GET /_user/location/shares`: two owner-scoped queries return only active shares (unrevoked and either permanent or still inside `expiresAt`), newest first and capped at 100 rows per list.
- Received shares are joined to `users` so each item carries `owner.username` and the owner's PostGIS `last_location` (`ST_Y`/`ST_X` as `lat`/`lon`, `null` when unknown), which removes the need for a second request to draw a peer marker. The shared response schema gained `LocationShareOwner`/`ReceivedLocationShare` types.
- OpenAPI marks `locationListShares` implemented; `docs/API.md` §5.3 documents the list semantics.
- Validation: shared 35/35, server 174/174, client 49/49, and all three package typechecks passed. The `ST_Y/ST_X` cast is reviewed SQL but not yet executed against live PostGIS.

### 2026-10-21 — T2.1.3 live-share revocation

- Implemented `DELETE /_user/location/share/:shareId`: a single owner-scoped `UPDATE ... WHERE is_revoked = false` flips `isRevoked`, and a follow-up owner-scoped read distinguishes an already-revoked id from a missing one.
- Unknown ids and ids owned by another account both return `404 SHARE_NOT_FOUND` with one shared message; already-revoked ids return `200` with an empty body so client retries stay idempotent. The contract gained the documented 404 response and `locationRevokeShare` is now marked implemented in OpenAPI.
- Validation: shared 34/34, server 170/170 (5 new revoke cases), client 49/49, and all three package typechecks passed. (The commit message for `8e33a5d` stated 35 shared tests; the new assertions extended an existing case, so 34/34 is the correct figure.) Share revocation is not yet pushed to receivers over realtime (T2.1.5), so a peer's marker clears on the next list/update cycle.

### 2026-10-21 — T2.1.2 live-share creation

- Implemented `POST /_user/location/share`: shared Zod bounds (1-50 unique recipients, `durationMinutes` 1-43200, `note` <= 500), batched recipient checks that reject self/unknown/inactive/suspended targets with structured `400 VALIDATION_ERROR` issue codes, and one transaction that writes or reuses `location_shares` rows.
- Repeat requests are idempotent per owner/target/mode: an active permanent share is reused, and a timed share is only extended when the new expiry is later. The response now reports `shares`, `createdShareIds`, and `reusedShareIds` instead of the placeholder `shareId` shape, and `docs/API.md` §5.3 was updated to match.
- Reuse of the app-scoped `/_user` hook means share creation requires a verified access token backed by an active, unsuspended, onboarding-complete account; the OpenAPI operation is now marked `implemented`.
- Validation: shared 34/34, server 165/165, client 49/49, and all three package typechecks passed. Tests use injected stores; the constraint/transaction behavior is not yet proven against live PostgreSQL (see P1-A2-style follow-up evidence rules).

### 2026-10-21 — Phase 1 v0.1.0 released; Phase 2 T2.1.1 started

- PR #2 was merged to `main` at `95a88a3`; GitHub release `v0.1.0` was published against that merge commit.
- Implemented T2.1.1: Drizzle `location_shares` schema and migration, owner/target foreign keys, mode/expiry/self-share constraints, revocation/device/note metadata, and owner/target/expiry indexes.
- Validation: server tests 150/150, server typecheck, repeat `db:generate` (no schema changes), and `git diff --check` passed. No live PostgreSQL was available, so migration application/runtime constraint behavior remains unverified.
- This starts storage only; T2.1.2–T2.1.7 share creation, revoke/list APIs, socket updates, expiry processing, and UI remain incomplete. The Phase 1 P1 follow-ups remain separately tracked and non-blocking.

### 2026-10-21 — Ubuntu 24.04 human acceptance reported; Phase 2 unblocked

- The user reports successful setup on Ubuntu 24.04; admin login; user registration/login; light, dark, and system themes; admin user listing; map display, zoom, and fullscreen; and deactivation with subsequent login rejection.
- Recorded those exact manual checks as passed without claiming unreported service-worker outage, external-Internet-offline, or latency results.
- Per the user's explicit decision, P1-G1, P1-A1, P1-A2 extended evidence, and P1-M1 are follow-ups and do not block the Phase 1 release or Phase 2. T1.4.7's scope remains unchanged.

### 2026-10-21 — Reconciled Phase 1 implementation and acceptance tracking

- Replaced the stale Phase 1 `20%`, Auth `42%`, and Client Map `75%` figures with separate implementation-complete and acceptance-open statuses for the named T1.0–T1.5 scope.
- Added P1-G1 (external-library target-VM migration/offline check), P1-A1 (real browser map-outage test), P1-A2 (live PostgreSQL/account-flow evidence), and P1-M1 (non-blocking style-switch latency baseline), with concrete evidence criteria and boundaries. At that point the VM check was tracked as a gate; the user's later 2026-10-21 decision explicitly made these remaining follow-ups non-blocking.
- Clarified that Phase 1 account/auth handlers are implemented; contract-only location, SOS, mission, search, and other domain handlers map to T2–T4 rather than an unnamed Phase 1 backlog. T1.4.7 remains complete and unchanged.

### 2026-10-21 — Re-ran Phase 1 local implementation checks

- Test suites passed: shared 32, server 149, client 49, map-server scripts 50, safe cache-clear 5.
- All three TypeScript checks passed. The client production build passed with existing Rollup annotation/chunk-size warnings.
- Region catalog validation reported 18 countries, 59 selectable areas, and 32 sources; setup's region list also ran successfully. A safe offline setup dry-run made no changes and confirmed the sandbox lacks Docker/Java/Osmium and cached map artifacts.
- These checks validate implementation in the repository, not target-VM migration/offline behavior, a real browser outage, or PostgreSQL-backed persistence. P1-G1, P1-A1, and P1-A2 therefore remain open; P1-M1 is still unmeasured.

### 2026-10-21 — T1.4.7 complete: map caching, safe cache removal, and crop selection

- Clarified T1.4.7's scope as three user-facing features only: reuse cached map data, safely remove map-data caches, and choose whole-country or city-cropped areas in setup. Marked the task complete after checking the implementation and tests.
- Confirmed the implementation in the external map library and setup flow, plus `scripts/clear-map-cache.sh` (dry-run by default, explicit apply confirmation, symlink/root safeguards, and preservation of app Postgres, Docker image/build cache, OS packages, Java, Osmium, and tool JARs). The region catalog now exposes 18 countries and 59 selectable areas, including the 12 requested country additions.
- Validation: 50 map-server region/library tests, 5 safe-cache-clear tests, catalog validation, setup region-list output, Bash syntax, and Python compilation passed. At the time of this entry, the target-VM migration/offline check was tracked as a separate pre-merge gate, not part of T1.4.7's scope. The user later explicitly made this follow-up non-blocking for release/Phase 2; it remains documented as P1-G1.

### 2026-10-20 — Standardized external map library, selectable snapshots, and offline cache policies

- **External standardized storage:** all map content now lives by default under `~/.local/share/borobiya/map-library` (`MAP_LIBRARY_DIR`), organized as `sources/<continent>/<country>/<source>/<date>/`, `crops/<continent>/<country>/<city>/<date>/`, and complete fingerprinted dataset bundles (merged PBF, PMTiles, OSRM graphs, Photon index, stamps, and metadata). Compose mounts the active dataset/routing/geocoding directories directly; Docker images, OS packages, Java, Osmium, and tool JARs remain separate concerns.
- **Snapshot + source policy:** setup's form and CLI now support repository-pinned (default), latest-common, or specific `YYYY-MM-DD` Geofabrik snapshots, plus `cache-first` (default), `refresh`, and `offline` source policies. Non-pinned dates are verified through official MD5 sidecars and persisted as concrete dates so ordinary reruns do not drift. Manifests are version 3 with snapshot/storage provenance; crop/source metadata is standardized in the library.
- **Activation, retention, and migration:** setup builds a fingerprinted dataset, recreates map services against it, runs acceptance, then writes `current.json`/`datasets/current` and prunes replaced releases/dataset bundles (one retained release per selected country and one active bundle). Verified project-local Tehran/catalog-era artifacts migrate into the library, including the historical exact-byte `iran-latest` manifest. Fresh-checkout recovery now correctly prioritizes the library/current dataset over `.env.example` defaults.
- **Tests/docs:** Python map-script suite expanded to 27 tests (snapshot resolution, sidecar/cache behavior, categorized paths, v3 write/verify, library current/prune, and full legacy Tehran migration). Validation: shared 32, server 146, client 49, routing-gateway 19, all typechecks, ShellCheck, style verifier, catalog validator, Compose interpolation simulation, 65 changed-doc bash blocks, dry-run/form/offline/current-recovery scenarios. Live VM migration plus Tehran/Frankfurt offline acceptance remains the gate before PR #2 merge; Phase 2 is still paused.

### 2026-10-20 — Pre-VM-test audit: adjacent-country selections and install recovery

- Corrected the resolver's unnecessary overlap rejection. The official Osmium merge behavior emits an object found in multiple sorted inputs only once, and every catalog source comes from the same pinned snapshot; adjacent whole countries (for example Germany + Netherlands + France) and overlapping city/country bounds now resolve. Regression tests cover `de,nl` and selecting all six whole countries together.
- Setup now recovers an existing selection from the dataset manifest (or from legacy Tehran artifacts) when an upgraded checkout's `.env` has no `MAP_REGION_IDS`, avoiding a surprise form or needless rebuild; `--reselect` bypasses recovery. `regions.py menu-areas` also accepts country IDs case-insensitively. The v1 migration additionally accepts the historical `iran-latest` source URL only when its provider/license/MD5/byte-count/date/timestamp fields prove byte identity with the dated pin, matching the actual pre-catalog VM manifest.
- Review pass over docs, scripts, commands, environments, and Compose interpolation found no other blockers: Photon language interpolation and the `$$` healthcheck escape, OSRM/Nominatim dataset paths, gateway defaults, script environment usage, and command error paths were rechecked. At the time, live VM execution was tracked as the PR #2 acceptance gate; the user's later 2026-10-21 decision made the remaining VM/offline follow-up non-blocking.

### 2026-10-20 — Selectable map areas: country/city form in setup, multi-area dataset

- **Area catalog:** `map-server/regions.json` + `map-server/scripts/regions.py` (18 unit tests). Six countries (Iran, Germany, Turkey, France, UK, Netherlands), 29 cities + whole-country areas; every Geofabrik source pinned to the 2026-10-18 dated snapshot with its official MD5 (verified against Geofabrik's live index/sidecars). Resolver enforces: known IDs, whole-country supersedes its cities, union bbox, per-selection Photon languages, download estimates, heavy-build flags.
- **Pipeline generalized:** `prepare-tehran-pbf.sh` → `prepare-regions-pbf.sh` (per-area verified crops under `data/crops/` + `osmium merge` into the single shared dataset, version-2 provenance manifest), `verify-tehran-tiles.sh` → `verify-tiles.sh`; routing/geocoding acceptance is per-area from catalog test points. Dataset slug is now the constant `borobiya` (styles/Martin/Nginx/Vite proxy follow it; Vite derives the tile prefix from the validated map config), so changing areas is data-only. Single-source `MAP_SOURCE_*` env vars retired in favor of `MAP_REGION_IDS` + catalog pins; Photon default language is configurable (`PHOTON_DEFAULT_LANGUAGE`).
- **Setup script form:** `setup-ubuntu-vm.sh` now asks for countries then cities (multi-select, whole-country option, summary + confirm, optional admin-password prompt) and also supports `--regions`, `--list-regions`, `--reselect`, `--yes`, `--dry-run`. Stage skipping is checksum-based (PMTiles/OSRM metadata + Photon stamp vs dataset SHA-256); changing the selection rebuilds only stale stages (stale OSRM graphs moved aside; Nominatim volume + Photon index reset). Pre-catalog Tehran-only installs migrate in place (`tehran.*` → `borobiya.*`, v1→v2 manifest conversion) instead of rebuilding.
- **Client:** the map now centers on the configured areas' bounds (bbox center + one-time recenter when the fallback start lies outside the served bounds) instead of a hard-coded Tehran center; `/map-config` default region is the dataset slug.
- Docs updated across runbook (form + steps 7–13), MAP_SERVER, DEVELOPMENT, ARCHITECTURE, DIAGRAMS, README(s), TASKS/ROADMAP (incl. stale acceptance notes). Validation: shared 32, server 146, client 49, gateway 19, regions 18, all typechecks, ShellCheck, style verifier, catalog validator, 33 runbook bash blocks, synthetic manifest/migration round-trips, dry-run + piped form end-to-end.

### 2026-10-20 — One-command VM setup script, admin password reset tool, repo re-scan

- **Live map confirmed on the VM** (Tehran renders in the LAN browser after the worker fix).
- **`scripts/setup-ubuntu-vm.sh`** automates the runbook launch end-to-end: prerequisite checks (Phase A stays manual), `.env` bootstrap with generated secrets, shared crop, PMTiles, OSRM graphs, Nominatim→Photon import with health waiting, full stack start, runtime migrations + seed, and the step-13 verification scripts, finishing with admin-login and next-step guidance. Idempotent/resumable — completed stages are skipped and existing `.env`/database passwords are never rotated. Runbook gained a short "Automated setup" section pointing to it.
- **Admin recovery:** new `db:reset-admin-password` (`src/db/reset-admin-password.ts`) sets a new bootstrap-admin password and revokes admin sessions (seed remains create-only by design); documented in the runbook and DEVELOPMENT.md. Admin credentials recap: username `admin`; password is the `ADMIN_SEED_PASSWORD` used at seed time (`admin123` only for local development seeds without one).
- **Repo re-scan fixes:** stale DEVELOPMENT.md claims that map generation was future work / no styles existed; env-var usage cross-checked client/Vite vs `.env.example` (only Vite's built-in `BASE_URL` differs). Full matrix green: shared 32/32, server 146/146, client 48/48, routing-gateway 19/19, all typechecks, ShellCheck (incl. the new setup script), style verifier, 32 runbook bash blocks.

### 2026-10-20 — Fixed blank map: MapLibre v6 worker now served explicitly (raw Vite plugin + setWorkerUrl)

- Browser console from the VM pinpointed the empty map: `Error: Worker failed to load` from MapLibre, with zero tile requests (tiles are fetched inside the worker). MapLibre GL JS v6 locates its worker as a sibling of the loaded chunk (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`), but under Vite the library runs from the pre-bundled deps chunk (dev) or a hashed bundle (build), where that sibling file does not exist — Vite even logs the missing file. A `?url` asset import was rejected as a fix because in dev it serves Vite-transformed code with an injected `@vite/client` import, which is unsafe inside a worker. Instead, a small Vite plugin (`borobiya-maplibre-worker`) serves the package's self-contained `maplibre-gl-worker.mjs` **verbatim** at `/maplibre-gl-worker.mjs` in dev and emits it as a build asset, and `MapCanvas` calls `setWorkerUrl("/maplibre-gl-worker.mjs")` before creating the map.
- Validation: client typecheck + 48/48 tests; production build emits the worker byte-identical to the packaged file (SHA-256 match); dev server returns the same raw bytes (518,806 B, no `@vite/client` injection) while the old sibling-of-chunk path 404s exactly as in the browser report.

### 2026-10-20 — Fixed Photon healthcheck Compose interpolation; actionable API port-conflict error

- VM evidence confirmed the live-E2E auth root cause: the Docker `api` container (pre-cookie-fix image) owns :3000 while `bun run dev`'s API dies with `EADDRINUSE` and `--watch` keeps waiting, so Vite kept proxying to the stale API whose unconditional `Secure` refresh cookie LAN browsers drop. The API now prints an actionable hint on `EADDRINUSE` (stop the Docker `api` service or change `PORT`) instead of only a stack trace.
- Fixed a bug in the Photon healthcheck added by the second audit: its bash `$line` variable was eaten by Compose interpolation (`WARN The "line" variable is not set`), so the probe could never match HTTP 200 and Photon showed permanently `(unhealthy)` despite serving. The variable is now `$$`-escaped; validated by simulating Compose interpolation and executing the decoded probe against a live test server.
- Validation: server 146/146 + typecheck; EADDRINUSE smoke test prints the new hint.

### 2026-10-20 — Diagnostics for live client E2E: refresh-rejection reasons, MapCanvas console errors

- Follow-up to the LAN-dev fixes: sprite/style loading improved on the VM, but `POST /_auth/refresh` still returns 401 on reload and the map renders empty in the user's browser. Code re-audit found the client restore flow (deduped refresh, `credentials: "same-origin"`, tolerant profile load), server refresh rotation, service worker (guarded, network-first), style layer names (canonical OpenMapTiles), and both styles (pass the official `gl-style-validate`) all correct, so the remaining causes are environmental and need runtime evidence instead of more speculation. The refresh handler now logs a secret-free `refreshRejectionReason` (`missing_token` / `token_invalid` / `session_mismatch` / `rotation_conflict`) while the client contract stays `INVALID_REFRESH`, and `MapCanvas` logs the underlying MapLibre/config errors to the console (`[borobiya:map] ...`) alongside the user-friendly Persian toast. Prime suspects to discriminate with that evidence: a stale Docker `api` still bound to :3000 while `bun --watch` waits after an `EADDRINUSE` crash (old image = unconditional `Secure` cookie), no fresh login since the cookie fix (the pre-fix cookie was never stored), split JWT secrets between Docker/bun APIs, or WebGL unavailable in the test browser.
- Validation: server 146/146 + typecheck; client 48/48 + typecheck; both map styles pass `@maplibre/maplibre-gl-style-spec` validation.

### 2026-10-20 — Fixed LAN-dev map loading and session persistence (Vite Host preservation, conditional Secure cookie)

- Found during live client E2E (`bun run dev`, browser on another LAN host): **(1) Map failed to load** — Martin expands the relative sprite/glyph/tile URLs in served styles to absolute URLs built from the request `Host` header (verified in Martin 1.16.1 `maplibre_style.rs`/`srv/styles.rs`), and the Vite dev proxy's `changeOrigin: true` rewrote that Host to `localhost:8000`, sending LAN browsers to their own machine. Martin-bound Vite proxies (`/map`, `/tehran/`, `/sprite/`, `/font/`) now use `changeOrigin: false` — the same Host preservation Nginx already had — and the map service-worker cache was bumped to `v2` so browsers discard style JSON cached with poisoned URLs. **(2) Reload always demanded a fresh login** (`POST /_auth/refresh` → 401) — the refresh cookie was unconditionally `Secure`, which browsers silently drop over plain HTTP on non-localhost origins. `refreshTokenCookie`/`expiredRefreshTokenCookie` now take a per-request option (`refreshCookieOptionsForRequest`: `Secure` only when `request.protocol` is HTTPS, incl. trusted `X-Forwarded-Proto`); login/refresh/logout call sites and SECURITY.md updated.
- Validation: server 146/146 tests (3 new cookie unit tests; HTTP inject suites now assert no `Secure` on plain HTTP) + typecheck; client 48/48 + typecheck; live Vite smoke test against a stub Martin proved the forwarded Host now stays `172.16.20.32:5199` (LAN-style origin) instead of the proxy target.

### 2026-10-20 — Live map acceptance passed on the Ubuntu VM: T1.4.2, T1.4.4, T1.4.5 complete

- Runbook step 13 acceptance passed end-to-end on the Ubuntu 24.04 VMware VM (4 vCPU / 6 GiB / 50 GB), against the shared Geofabrik crop built through steps 7–12:
  - **Tiles (T1.4.2):** `verify-tehran-tiles.sh` — `GET /tehran/12/2632/1612` → HTTP 200, `application/x-protobuf`, 222,867 bytes.
  - **Routing (T1.4.4):** `verify-routing.sh` — car 6,643 m / 609 s, bicycle 5,090 m / 1,489 s, foot 4,803 m / 3,464 s (2 alternatives each) between the central-Tehran probe points.
  - **Geocoding (T1.4.5):** `verify-geocoding.sh` — forward `Azadi Square` → 5 features, first «میدان آزادی»; reverse at 35.70,51.40 → «هادی خداپرست». Raw `curl` equivalents for tile/route/geocode/reverse also exercised successfully.
- `docs/TASKS.md` phase-1 checklist is now fully checked; Map Server area/milestone moved to 100%. Next: apply the second-audit stack update on the VM (one `down`/`up --build`), run in-image migrations + seed and verify auth end-to-end, capture `docker stats` for memory tuning, then client live-map E2E and Phase 2 (T2.1 live location sharing).

### 2026-10-20 — Second config/script audit: decoupled Martin from Postgres, real healthchecks, in-image migrations

- **Martin no longer connects to PostgreSQL.** `martin.yaml` published zero database sources, yet the connection made Martin exit on credential drift (seen live at step 12) and carried auto-publish privacy risk; the `postgres` block, the Compose `DATABASE_URL`, and the `depends_on: postgres` are removed. Martin now serves PMTiles/styles/sprites/fonts from files only, independent of the application database.
- **Health checks now mean something.** Postgres healthcheck authenticates (`psql SELECT 1`) instead of `pg_isready`, so a password/volume mismatch reports `unhealthy` at the source. Photon (HTTP 200 on `/status` via bash `/dev/tcp`) and all three OSRM services (TCP connect after graph load) gained healthchecks; Nominatim's grace was widened to ~70 min so a slow first import is not mislabelled `unhealthy`. (corrected later: that check connected to 127.0.0.1, which the image trusts, so it did not authenticate for real - see the 2026-10-23 entry at the top of this changelog)
- **API/Compose hygiene.** Removed seven variables Compose passed to the API but `env.ts` never validated or used (`ADMIN_SEED_PASSWORD`, `MAP_*`); the service now receives exactly the 11 validated keys. Pinned the Compose subnet to `172.30.0.0/24` and defaulted `TRUSTED_PROXY_IPS` to it, so per-client rate limiting works behind Nginx. Pinned `nginx:1.30.6-alpine`.
- **Nginx re-resolves upstreams.** `nginx.conf` uses Docker's embedded DNS (`resolver 127.0.0.11 valid=10s`) with variable `proxy_pass` and hoisted proxy headers, so recreating an upstream container no longer leaves Nginx proxying to a stale IP until restart.
- **Migrations can run inside the API image.** New `src/db/migrate.ts` (drizzle-orm runtime migrator over the shipped `drizzle/` folder) plus `db:migrate:runtime`; the production image excludes drizzle-kit, so `docker compose run --rm api bun src/db/migrate.ts` is now the in-stack path. `seed.ts`/`drizzle.config.ts` dotenv banners silenced.
- **Smaller items:** routing gateway closes gracefully on SIGINT/SIGTERM and runs via direct `bun server.mjs`; `build-routing.sh` builds OSRM graphs as the invoking user instead of leaving root-owned files. Docs/runbook updated for all of the above (existing stacks need one `docker compose down` + `up` for the network change).
- Validation: Compose/Martin YAML assertions; Photon healthcheck command executed against a live test server (200→0, closed port→non-zero); Nginx config parsed clean with crossplane; ShellCheck clean on all scripts; routing-gateway tests 19/19; server tests 143/143 + typecheck; `migrate.ts` smoke (missing `DATABASE_URL` exits 1 with a clean message); style verifier OK; all 31 runbook bash blocks pass `bash -n`.

### 2026-10-20 — Runbook audit after live Step 12 success on the VM

- Live VM verification progressed: after the Step 11 Nominatim fix and the Step 12 secret/password recovery, the full serving stack runs on the Ubuntu 24.04 VM—`postgres`, `api`, `map-server` (Martin), and `routing-gateway` report `(healthy)`, and `osrm-car`/`osrm-bicycle`/`osrm-foot` and `photon` are `Up`. Step 13 acceptance scripts are the remaining gate for T1.4.2/T1.4.4/T1.4.5.
- Audited `docs/UBUNTU_VM_RUNBOOK.md` against the repo (Compose defaults, `.env.example`, map script pins/env names, verify-script endpoints—all consistent) and fixed what had drifted: A5 now clones/updates branch `arena/ec9ffc7e-borobiya` (was the old `arena/91f87b17-borobiya`) and names commit `7afe63d`-or-newer instead of stale `f32191e`; intro VM disk corrected to 50 GB; step 11 notes `health: starting` during the Nominatim import is expected; step 12 states the expected seven-service healthy result and that it does not start `api`/`nginx`.

### 2026-10-20 — Step 12 troubleshooting: stale API container and Martin/Postgres password mismatch

- Runbook step 12 now explains two restart-loop cases seen on the VM. (1) The step 12 `up -d` command intentionally starts only the map services, so a crash-looping `api` container from an earlier attempt (JWT placeholder secrets) survives untouched; the documented fix now uses `docker compose up -d --build --force-recreate api`. (2) `map-server` (Martin) restart-looping with `password authentication failed` means `POSTGRES_PASSWORD` changed after the `postgres-data` volume was initialized—the volume keeps the first password while Compose hands Martin the current terminal/`.env` value, and the Postgres healthcheck (`pg_isready`) cannot detect it. Documented recovery: restore the original password in `.env`, or at this pre-migration stage reset only `borobiya_postgres-data` and rerun step 12 (tiles, OSRM graphs, Photon index, and the Nominatim volume live elsewhere).

### 2026-10-19 — Fixed Nominatim restart loop at VM step 11 (read-only mount inside chown'ed project dir)

- Root cause, verified against the mediagis 5.3 image's own `start.sh`/`init.sh` (image-era commit `44bb833`): both run under `bash -ex` and recursively `chown -R nominatim:nominatim /nominatim` (`PROJECT_DIR`) before importing. Compose mounted `./map-server/data` read-only at `/nominatim/data`, so the `chown` failed with `Read-only file system`, the entrypoint exited 1, and the container restart-looped—Step 11 could never complete. Fixed by mounting the data directory read-only at `/osm` (outside `PROJECT_DIR`) and pointing `PBF_PATH` there; the crop stays read-only and host files are never re-owned. Existing failed attempts need no volume cleanup: no `import-finished` marker exists, so the entrypoint re-runs init and drops/re-imports the database on the next start (`--force-recreate` after `git pull`). Runbook step 11 documents the symptom and recovery.

### 2026-10-19 — Deeper Docker/runtime review: Martin privacy fix and API lifecycle hardening

- **Security fix:** disabled Martin Postgres auto-discovery (`postgres.auto_publish: false`). With only a connection string configured, Martin 1.16.1 defaults to publishing spatial tables/functions from the connected database, which would eventually include private `users.last_location` data after migrations. Only explicitly reviewed public tile tables/functions may be enabled later.
- API container lifecycle: `server.ts` now closes Fastify (and therefore the Postgres pool) on `SIGINT`/`SIGTERM` and also closes the app if `listen()` fails; the Dockerfile runs `bun src/server.ts` directly so Docker signals reach the server instead of a package-script wrapper. A blank `ADMIN_SEED_PASSWORD` passed by Compose is now treated as unset by the seed password resolver (tested), instead of failing as a literal empty password.
- Build/verification polish: excluded the Photon JAR from the root API build context (Photon's own build context is unaffected), added connection retries to `verify-tehran-tiles.sh` for a still-starting Martin, and documented reloading `.env` after the Step 12 JWT fix because Compose interpolation prefers stale shell variables over the edited file.
- Validation: server tests 143/143 and typecheck; routing-gateway tests 19/19 under Node; a direct `bun src/server.ts` smoke test served `/_public/health` and exited 0 on SIGTERM with the graceful-shutdown log line; Compose/Martin YAML parses. Remaining known gap (full app only, not map Step 13): database migrations still run from the host Bun toolchain—the production API image intentionally excludes `drizzle-kit`, so `db:migrate` cannot run inside the container.

### 2026-10-19 — Fixed API placeholder-secret crash-loop at VM step 12; Docker env hardening

- Root cause: following the runbook exactly still left the example `JWT_SECRET`/`JWT_REFRESH_SECRET` placeholders in `.env` (A6 only covered `NOMINATIM_PASSWORD`), so the API's fail-closed env validation crash-looped `borobiya-api-1` while the map services themselves started healthy. Runbook A6 now generates all secrets (two different JWT secrets, Nominatim + Postgres passwords, matching `DATABASE_URL`) with `openssl rand -hex` before the first `docker compose up`, warns against changing DB passwords after their volumes initialize, and step 12 documents the JWT-only fix (`sed` + `docker compose up -d api`) for already-running VMs.
- Docker audit fixes: removed the API service's whole-file `env_file: .env` dump from `docker-compose.yml`—Compose now passes only the variables `packages/server/src/config/env.ts` validates (plus `ADMIN_SEED_PASSWORD` for the seed script), so the container no longer receives the host `DATABASE_URL` or unrelated service passwords; updated `docs/SECURITY.md` to match. Silenced dotenv's "injected env" banner in the container (`quiet: true`; Compose supplies the environment there). Martin's Postgres dependency was checked and is intentional (`martin.yaml` configures a Postgres connection). Live Step 13 acceptance still requires the VM run.

### 2026-10-19 — Fixed OSRM image tag (VM step 12 blocker)

- Corrected the pinned OSRM image from `ghcr.io/project-osrm/osrm-backend:v26.10.0` (does not exist—upstream's publish workflow only creates suffixed tags plus bare `latest`, verified against the `v26.10.0` workflow run, which completed successfully) to the multi-arch `v26.10.0-debian` tag in `docker-compose.yml`, `build-routing.sh`, and `docs/MAP_SERVER.md`. The bad reference had made Compose abort every other pull/build in step 12 (`Interrupted`/`No such image` cascade, including Martin, PostGIS, and the locally built Photon image); Martin's `ghcr.io/maplibre/martin:1.16.1` tag was re-verified against upstream docs and is unchanged. Runbook step 12 now has a short failure note covering this and the local Photon build. If step 10 had failed on the same tag, the OSRM graphs must be rebuilt after `git pull`; live T1.4.2/.4/.5 checks still require the VM rerun.

### 2026-10-19 — Unblocked VM step 8: Osmium pin aligned to Ubuntu 24.04, host-proxy runbook section

- Re-pinned Osmium Tool to **1.16.0** (Ubuntu 24.04 apt) consistently in `prepare-tehran-pbf.sh`, `.env.example`, `docs/MAP_SERVER.md`, and the VM runbook. The previous default blocked the crop on the target VM whenever `.env` was stale or not loaded in the terminal, which then made `verify-map-pbf.sh` report the (not yet created) crop as missing. The script's version-mismatch error now prints the exact fix, and runbook step 8 documents both errors with a one-line `sed` fix for a stale `MAP_OSMIUM_VERSION`.
- Added a short Proxy section (Set proxy / Remove proxy) to `docs/UBUNTU_VM_RUNBOOK.md` with a dynamically detected VMware host (NAT gateway) address: terminal exports for downloads, plus compact `apt`/Docker/Java blocks only if needed. No proxy values were added to `.env` or Compose; the serving stack remains offline. Live T1.4.2/.4/.5 checks still require the user's VM run.

### 2026-10-19 — Added Ubuntu 24.04 low-memory VM runbook and resource tuning

- Added a complete Docker Engine/Compose, Java 21, Osmium, data, build, import, launch, and live verification walkthrough for the user's 4-vCPU/6-GiB/40-GB VMware VM.
- Reduced Planetiler's default Java heap to 3 GiB; OSRM builders now run profiles sequentially with two threads, OSRM runtimes use one worker and a 100-location table cap, and Nominatim/Photon use conservative memory defaults.
- Documented the Ubuntu 24.04 Osmium 1.16.0 package override and the current `iran-latest` checksum/date; real workload fit remains to be verified on the VM.

### 2026-10-19 — Shared OSM crop and offline geocoder pipeline (T1.4.2/4/5 implementation; live checks pending)

- Added a reproducible preparation flow for the approved Geofabrik Iran snapshot (2026-10-18): verifies official MD5, crops `MAP_BBOX` once with Osmium smart extraction, computes source/crop SHA-256 values, and writes an ODbL provenance manifest. Tile and OSRM builders validate the same crop; OSRM graphs record the PBF and manifest hashes.
- Added an opt-in Nominatim 5.3 import container consuming that crop, a checksum-verified Photon 1.3.0 JAR download/build path, local `/geocode` and `/reverse` gateway proxies, and live smoke scripts. Added linked OSM attribution in the app footer (both MapLibre styles already expose it).
- Validation: gateway unit/integration tests 19/19; client tests 48/48, typecheck and production build; shared tests 32/32 and typecheck; server tests 143/143 and typecheck; style, shell, synthetic crop-manifest, YAML parse, and diff checks pass. Docker, Java, Osmium, and the real PBF are unavailable here, so T1.4.2, T1.4.4, and T1.4.5 remain unchecked pending local service results; source SHA-256 will be recorded after the local download.

### 2026-10-19 — Added user map and dashboard views (T1.5.5; live map data unverified)

- Replaced the `/_user/map` and `/_user/dashboard` placeholders with a full-height MapCanvas view and a responsive dashboard map widget. Both views derive their map style from the resolved app theme and provide navigation between the two routes.
- Added a dashboard status area that distinguishes the currently available base map from future location-sharing/SOS features instead of displaying fabricated live-user or incident data. Added a full map link to the signed-in user navigation.
- Validation: 46/46 client tests, typecheck, production build, and `git diff --check` passed. Actual tile rendering remains unverified pending the Map Server runtime/data.

### 2026-10-19 — Added Map Server outage fallback (T1.5.4; implementation complete, live outage unverified)

- Added an accessible map error/configuration snackbar with a same-instance style retry; `/map-config` failure continues using safe local bounds/zoom. MapLibre's memory tile cache now retains eight zoom levels.
- Added a map-only network-first Service Worker cache for same-origin style/tile/sprite/glyph resources (512-entry cap), with cache fallback on offline/5xx and client notification; API/config/route/geocode requests are excluded. Persistent browser cache requires HTTPS or localhost, while the in-memory cache remains available on insecure LAN origins.
- Worker tests cover network caching, offline/5xx fallback, empty-cache 503, and request scoping. Full Map Server outage testing remains blocked by missing local map runtime/data.

### 2026-10-19 — Added app-wide theme preference and no-flash startup (T1.5.3; complete)

- Added a persisted `system`/`light`/`dark` theme preference, a header menu to select it, and live `prefers-color-scheme` updates when following the system. Vuetify's global theme and Tailwind's manual `dark:` variant stay synchronized with the root theme class.
- Added synchronous pre-paint `theme-init.js` and theme-color metadata updates to prevent a flash of the wrong theme; expanded dark palettes across the app shell and authentication screens.
- Added preference/resolution tests and VM tests for pre-paint system detection and explicit override. Client tests passed (38/38), typecheck and production build passed.

### 2026-10-19 — Added reactive light/dark map styles (T1.5.2; complete; live latency unverified)

- Made `MapCanvas.vue` react to `styleUrl` changes and exposed an imperative `setStyle(url)` method. Style switches use `map.setStyle(url, { diff: true })` on the existing MapLibre instance, retaining camera position and DOM-backed markers.
- Added option tests for style URL normalization and diff-based switching. Client tests passed (32/32), client typecheck passed, and `map-server/scripts/verify-styles.py` confirmed that light/dark styles share one source, 24 structurally matching layers, sprite/glyph endpoints, and all 9 SVG sprites.
- Both styles configure a 150ms global paint transition with no delay. The live end-to-end map-rendering target is not benchmarked because approved map tile data/server runtime is unavailable; app-wide theming was subsequently implemented in T1.5.3, while map/dashboard views remain T1.5.5.

### 2026-10-19 — Initialized the MapLibre canvas (T1.5.1; complete)

- Added MapLibre GL JS 6.15.0 and a reusable `MapCanvas.vue` with a Tehran center, same-origin light style, visible style-source attribution, zoom/compass navigation controls, metric scale, accessible canvas labeling, and lifecycle cleanup. The component applies validated runtime bbox/zoom settings when `/map-config` responds and starts with safe Tehran defaults if config is unavailable.
- Added pure option tests (3 passed). Client typecheck and production build passed; an explicit Vite entry build also compiled the MapCanvas component and MapLibre CSS. The real style/tiles were not exercised because no approved PMTiles archive exists; style switching was subsequently implemented in T1.5.2, while full map views and outage UX remain future tasks.

### 2026-10-19 — Added MapLibre styles and Martin assets (T1.4.3)

- Added light/dark v8 styles with the same `tehran` vector source and identical layer IDs, order, filters, and layouts; theme differences are in layer paint. Both documents validate against `@maplibre/maplibre-gl-style-spec` 26.4.4, and `map-server/scripts/verify-styles.py` provides a dependency-free parity/SVG check.
- Added `map-server/martin.yaml` and Compose mounts for the styles, SVG sprite source, fonts, and data. Config validates against Martin 1.16.1's published schema. Martin generates sprite PNG/JSON sheets and glyph PBF ranges dynamically; no generated binary assets or `font-maker` build are needed.
- Bundled Noto Sans Regular and Noto Naskh Arabic Regular under SIL OFL 1.1, with provenance/checksums; configured a Latin + Arabic/Persian fallback alias. Added the Borobiya POI SVG icons and updated endpoint/development documentation.
- T1.4.3 is complete based on static validation. Martin/Docker are unavailable here, so the style/sprite/font endpoints were not exercised against a real server; tile serving remains blocked under T1.4.2.

### 2026-10-19 — Configurable map settings through pipeline and runtime (T1.4.6; complete)

- Passed `MAP_REGION`, `MAP_BBOX`, `MAP_DATA_VERSION`, and zoom bounds through Compose and the routing gateway. Added the validated public `GET /config` response (same-origin `/map-config` through Nginx/Vite), shared Zod types, and a client fetch helper that rejects invalid responses without exposing service URLs.
- Updated Planetiler and OSRM build scripts to require an explicit reuse-approved PBF and use region/bounds/version/zoom settings; tile output is region-named with a checksummed metadata manifest. Updated the pipeline/runbook and clarified that non-Tehran runtime styles still need source wiring.
- Validation: Node and Bun gateway suites passed (12 tests each); all shared tests passed (32), all client tests passed (27), shared/client typechecks and client production build passed, Compose YAML parsed with expected settings, shell syntax checks and `git diff --check` passed. Docker runtime and real tile/route generation were not run; T1.4.2 and T1.4.4 remain open.

### 2026-10-19 — Configured OSRM routing scaffold (T1.4.4; incomplete)

- Added separate OSRM 26.10.0 Compose services for car, bicycle, and foot graphs, plus a `POST /route` gateway translating the project `{from,to,profile,alternatives}` body into OSRM's native POST API (`bicycle` maps to OSRM's `bike` URL profile). Added same-origin Nginx/Vite routing proxies and an MLD graph builder that requires an explicitly supplied reuse-approved Tehran PBF.
- Added Node/Bun tests, including a full loopback HTTP integration test against local OSRM-compatible fixtures; all 8 tests pass with both runtimes. Client typecheck/build, Compose YAML parsing, shell syntax, and `git diff --check` pass.
- T1.4.4 remains open: no actual OSRM graph or live offline route has been produced/tested because Docker/OSRM are unavailable and the local candidate PBF's reuse terms remain unresolved.

### 2026-10-19 — Started Tehran tile generation (T1.4.2; incomplete)

- Downloaded a 9.2 MB local Tehran OSM PBF sample into ignored `map-server/data/tehran.osm.pbf`; validated its PBF header, Tehran bounds (51.27–51.55 E, 35.60–35.81 N), and object counts with libosmium. A local source/checksum note is stored beside it; the sample is not committed.
- Corrected the Martin 1.16.1 tile URL in the runbook and task criteria: `tehran.pmtiles` is served at `/tehran/{z}/{x}/{y}`; `.pbf` is an optional redirect suffix, while the bare `/{z}/{x}/{y}.pbf` route is not a Martin source endpoint. Added `generate-tiles.sh` (pinned JAR checksum, explicit input PBF, MAP_BBOX/zoom handling, atomic archive and metadata output) and `verify-tehran-tiles.sh` (health, status, MVT content type, non-empty tile); the verifier's response handling passed against a local HTTP fixture (not Martin).
- T1.4.2 remains unchecked: no Java or Docker is installed, and the official Planetiler release download redirects to a host outside the sandbox network allowlist. No PMTiles archive was generated and no Martin tile request was run.

### 2026-10-19 — Pinned map-server toolchain versions (T1.4.1)

- Selected and documented Martin 1.16.1, Planetiler 0.10.2, OSRM 26.10.0, and Photon 1.3.0 from official stable releases. Pinned the Compose Martin image and updated the version-specific examples and Java prerequisite; recorded SHA-256 hashes for the Planetiler and Photon JARs.
- Corrected the Photon import guidance: Photon does not consume raw OSM PBF, so T1.4.5 must choose and provision a Nominatim database or Photon JSON dump.
- Validation: checked official release metadata/assets and version-tag conventions, audited stale version references, and ran `git diff --check`. Docker/Compose runtime validation remains unavailable in this environment.

### 2026-10-19 — Completed-task bug review: session revocation and admin navigation

- Found that clearing refresh-session hashes on logout, password reset, and deactivation did not invalidate already-issued access JWTs until their 15-minute expiry. User and admin authorization now also require the token's matching user/session/device row to retain an unrevoked refresh hash, so those JWTs stop working immediately after revocation.
- Found that admin login fell through to the regular user dashboard. Admins now land on `/_admin/users` unless a safe internal redirect is present; the admin page refreshes a near-expiry session before list/status requests.
- Validation: 196 workspace tests (28 shared, 143 server, 25 client), all three typechecks, client production build, and `git diff --check` passed. No live PostgreSQL is available for an end-to-end session-store smoke test.

### 2026-10-19 — Admin user-management UI (T1.3.4)

- Replaced the `/_admin/users` placeholder with a Persian RTL account table, debounced username search, active/inactive filters, server pagination, account setup/role/status details, and a confirmation dialog for status changes. Deactivation explains that active sessions are revoked; the signed-in admin cannot deactivate their own account from this view.
- Added a validated same-origin client for the admin list and status endpoints, request cancellation for stale searches, route/API tests, and an admin navigation link.
- Validation: 189 workspace tests (28 shared, 139 server, 22 client), all three typechecks, client production build, and `git diff --check` passed. No live PostgreSQL is available for an end-to-end API/database smoke test.

### 2026-10-19 — No-delete invariant (T1.3.3)

- Added a Fastify runtime regression test asserting `DELETE /_admin/users/:id` returns `404`, and an OpenAPI assertion that the user detail path has no DELETE operation. No delete handler or contract was introduced.
- Validation: 183 workspace tests (28 shared, 139 server, 16 client), all three typechecks, client production build, and `git diff --check` passed.

### 2026-10-18 — Admin user list and detail (T1.3.2)

- Implemented admin-only `GET /_admin/users` with case-insensitive username search, active/category filters, and bounded pagination, plus `GET /_admin/users/:id` with profile and session-device details. Both endpoints recheck the admin's current account state, validate input, and return no-store responses.
- Category assignment tables and mission tables are later tasks: the current schema treats all users as unassigned (`hasCategory=true` returns an empty page) and detail missions are empty until T3.5.1. Updated runtime OpenAPI status and docs.
- Validation: 182 workspace tests (28 shared, 138 server, 16 client), all three typechecks, client production build, and `git diff --check` passed. No live PostgreSQL is available, so the Drizzle reads remain unverified against a database.

### 2026-10-18 — Admin user status and audit trail (T1.3.1)

- Implemented admin-only `PATCH /_admin/users/:id/status` with signed access-token verification, current-admin role/active/suspended checks, UUID/body validation, idempotent no-op handling, and `USER_NOT_FOUND` responses.
- Added a Drizzle migration for `admin_audit_log`. Status changes, audit events with before/after active state, and refresh-session revocation on deactivation run in one row-locked transaction; reactivation does not revive old sessions. Updated OpenAPI runtime status, tests, and API/security/structure documentation.
- Validation: 174 workspace tests (28 shared, 130 server, 16 client), all three typechecks, client production build, a repeat Drizzle generation with no schema changes, and `git diff --check` passed. No live PostgreSQL is available, so migration application and database-backed transaction integration remain unverified.

### 2026-10-18 — Authentication UI and route guards (T1.2.7)

- Replaced the auth/onboarding placeholders with Persian RTL login, registration, three-step password recovery, and security-question completion forms. Added same-origin API handling, localized errors, unique question selection, and tests for API calls and client session state.
- Added an auth store that keeps access tokens in memory, restores them with the HttpOnly refresh cookie, reloads completed profiles, and detects the server onboarding gate. Router guards enforce guest-only auth pages, protected user/admin routes, safe return paths, role checks, and onboarding redirects. Implemented `GET /_public/security-questions` and `GET /_user/me` as support endpoints for catalog loading and session restoration.
- Validation: 160 workspace tests (28 shared, 116 server, 16 client), all three typechecks, client production build, and `git diff --check` passed. No live PostgreSQL is available, so database integration remains unverified.

### 2026-10-18 — Security-question onboarding and authorization gate (T1.2.6)

- Implemented authenticated `POST /_user/complete-security-questions`, validating five unique IDs against the catalog, normalizing answers with the registration normalization rule, hashing sequentially with Argon2id, and atomically inserting all five hashes while clearing `mustCompleteSecurityQuestions`.
- Added a `/_user` pre-handler that verifies the access JWT and current account state, blocks other registered user routes for incomplete accounts with `403 SECURITY_QUESTIONS_REQUIRED`, and refuses answer replacement after completion. Updated OpenAPI runtime status, contracts, API/security/task documentation, and auth/persistence/schema tests.
- Validation: 145 workspace tests (28 shared, 115 server, 2 client), all three typechecks, client production build, Drizzle generation reported no schema changes, and `git diff --check` passed. No live PostgreSQL is available, so the transaction has not been integration-tested against a database.

### 2026-10-18 — Auth hardening bug review

- Fixed token verification accepting signed JWTs with no `exp` claim and rejecting malformed UUID subject/session claims before they reach persistence queries.
- Bound login password input to the largest value accepted at account creation; malformed stored Argon2 hashes now fail with generic `INVALID_CREDENTIALS` after dummy verification rather than returning a server error.
- Centralized per-IP+username rate-limit key generation; invalid, oversized, and uppercase username variants now share a bounded invalid bucket instead of aliasing valid lowercase usernames. Unknown recovery accounts now draw from a stable, HMAC-keyed five-question decoy pool, closing the repeated-request question-catalog leak.
- Validation: 129 workspace tests (27 shared, 100 server, 2 client), all three typechecks, client production build, Drizzle generation/no-schema-change check, migration CLI help, and `git diff --check` passed. PostgreSQL integration remains unavailable.

### 2026-10-18 — Admin user creation (T1.2.5)

- Implemented admin-only `POST /_admin/users` with signed/expiring access-token checks, current admin role/active/suspended-state verification, strict body validation, Argon2id password hashing, optional active-state handling, and race-safe duplicate-username conflicts.
- The Drizzle store inserts only a regular user row, explicitly sets `mustCompleteSecurityQuestions=true`, and does not create security-answer rows. Existing schema support required no migration. Added route, access-control, persistence/schema-contract, and OpenAPI tests; documented runtime status and security behavior.
- Validation: frozen-lockfile install; 118 workspace tests (27 shared, 89 server, 2 client); all three typechecks; client production build; Drizzle generation reported no schema changes; migration CLI help; and `git diff --check` passed. No live PostgreSQL is available, so database-backed persistence/migration application remains unverified.

### 2026-10-18 — Forgot-password recovery (T1.2.4)

- Implemented request/verify/reset routes with random server-selected three-of-five questions, a persisted ten-minute challenge, normalized Argon2id answer verification, generic failures/decoys, and five-per-15-minute route limits.
- Added single-use opaque reset tokens (SHA-256 hashes only in storage), atomic password reset, invalidation of outstanding reset/challenge tokens, and revocation of all refresh sessions. Added schema migration, store/route tests, OpenAPI runtime status, and API/security/task documentation.
- Validation: frozen-lockfile install; 99 workspace tests (27 shared, 70 server, 2 client); all three typechecks; client production build; Drizzle generation with no unexpected schema changes; migration CLI help; and `git diff --check` passed. No live PostgreSQL is available, so migration application and database-backed integration remain unverified.

### 2026-10-18 — Refresh rotation and logout (T1.2.3)

- Implemented `POST /_auth/refresh` and `POST /_auth/logout` with cookie parsing, signed/unexpired token verification, persisted session/account matching, atomic single-use hash rotation, current role/account-state checks, and idempotent session revocation/cookie clearing.
- Browser clients receive rotated refresh tokens only through HttpOnly cookies; native clients omit `Origin` and receive the token in JSON. Added unique JWT `jti` values with stable `sessionId` claims and rollout compatibility for legacy T1.2.2 tokens; added a unique refresh-hash index/migration.
- Updated shared contracts, OpenAPI runtime status, API/security docs, and T1.2.3 completion status. Route tests cover transport, stale/concurrent rotation, invalid/expired/legacy tokens, account states, guest-only behavior, and logout idempotency.
- Validation: frozen-lockfile install; 80 workspace tests (26 shared, 52 server, 2 client); all three typechecks; client production build; Drizzle generation with no unexpected schema changes; migration CLI help; and `git diff --check` passed. No live PostgreSQL is available, so migration application and database-backed integration remain unverified.

### 2026-10-18 — User login and token issuance (T1.2.2)

- Implemented `POST /_auth/login` with Zod validation, Argon2id verification (including a dummy hash for unknown usernames), generic invalid-credential responses, inactive/suspended account checks, and a 5-attempt/15-minute per-IP+username limit.
- Successful login creates a session with only a SHA-256 refresh-token hash, signs 15-minute access and 7-day refresh JWTs, and returns the refresh token in a secure HttpOnly cookie for browser requests or the body for native requests. The `mustCompleteSecurityQuestions` user flag remains available to support the later onboarding gate.
- Updated the API/OpenAPI status, login/cookie contract, guest-only behavior, and documentation to clarify that the login must issue a usable token for required security-question completion.
- Validation: frozen-lockfile install; 65 workspace tests (26 shared, 37 server, 2 client); all three typechecks; client production build; Drizzle generation with no schema changes; migration CLI help; and `git diff --check` passed. No live PostgreSQL service is available for store integration testing.

### 2026-10-18 — User registration (T1.2.1)

- Implemented `POST /_auth/register`: Zod validation, five unique existing question IDs, duplicate-username conflict checks (including insert races), sequential Argon2id hashing of the password and `trim().toLowerCase()` answers, and atomic user/answer persistence.
- Added guest-only 403 handling, a 5-attempt/15-minute per-IP+username limit, runtime OpenAPI status, route regression tests, and updated API/security/task documentation. Login and remaining auth flows are still pending.
- Validation: 55 workspace tests (26 shared, 27 server, 2 client), all three typechecks, client production build, Drizzle generation with no schema changes, and migration CLI help passed. No live PostgreSQL service is available for transaction/migration integration testing.

### 2026-10-18 — Completed-task bug review

- Fixed the OpenAPI server base URL mismatch: Swagger “Try it out” now targets `/api` first behind Compose/Nginx and keeps `/` as the direct-API alternative; host development still defaults to `/`.
- Replaced the ASCII-only, unbounded new-password check with Unicode letter/decimal-digit validation and a 1024-character limit; aligned seed-password errors and documentation. Corrected the README login example to allow legacy credentials as the actual login schema does.
- Validation: frozen-lockfile install; 48 workspace tests; all three typechecks; client production build; repeat `db:generate` with no schema changes; `db:migrate --help`; gateway-path assertions; and `git diff --check` all passed.

### 2026-10-18 — User state and PostGIS last-location schema (T1.1.4)

- Added `is_active`, `is_suspended`, and `must_complete_security_questions` with safe defaults; added nullable `avg_rating NUMERIC(2,1)` constrained to 0–5.
- Added nullable `last_location GEOGRAPHY(Point,4326)`, enabled PostGIS in the migration, and created the GiST index required by future spatial lookup. Drizzle uses a custom geography type; app coordinates should be projected with spatial SQL.
- Validation: frozen-lockfile install; 46 workspace tests; all three typechecks; client production build; migration/journal/snapshot and PostGIS ordering assertions; `db:migrate --help`; and repeat `db:generate` with no schema changes all passed. The migration could not be applied because Docker, `psql`, and a local PostgreSQL server are unavailable.

### 2026-10-18 — Initial reference-data and admin seed (T1.1.3)

- Added a migration for `cancellation_reasons` and a seed command that inserts 15 Persian security questions, the documented 5 requester + 6 rescuer reasons, and an Argon2id-hashed bootstrap admin.
- Seed operations are idempotent; an existing admin password is never overwritten. The `admin` / `admin123` fallback is allowed only when `NODE_ENV` is `development` or `test`; other environments require a unique `ADMIN_SEED_PASSWORD`.
- The reasons share the key `other`; uniqueness is scoped to `(type, key)` to permit both documented reason lists.
- Validation: frozen-lockfile install; 44 workspace tests; all three typechecks; client production build; Argon2id hash/verify; migration/journal/snapshot assertions; `db:migrate --help`; and repeat `db:generate` with no schema changes all passed. The seed could not be run against PostgreSQL in this environment.

### 2026-10-18 — Initial auth-table migration (T1.1.2)

- Added the Drizzle-generated migration, journal, and snapshot for `users`, `security_questions`, `user_security_answers`, and `user_sessions`, including the username/role checks, uniqueness, foreign keys, and sessions user index.
- Added the explicit `db:migrate` command; migrations are not applied at API startup.
- Validation: frozen-lockfile install; 39 workspace tests; shared/server/client typechecks; client production build; `db:migrate --help`; and a second `db:generate` run reporting no schema changes all passed. The migration could not be applied because Docker, `psql`, and a local PostgreSQL server are unavailable.

### 2026-10-18 — Drizzle ORM and initial database schema (T1.1.1)

- Selected Drizzle ORM with Postgres.js and recorded ADR-011, including the PostGIS/raw-SQL rationale and migration tradeoffs.
- Added initial schema declarations for `users`, `security_questions`, `user_security_answers`, and `user_sessions`, a Drizzle Kit config/generation script, and an explicit database client factory. The factory is not called by the Fastify app; no migration was retained or applied.
- Validation: frozen-lockfile install, server typecheck/tests, and a temporary generated-migration smoke test (output inspected then removed) passed. PostgreSQL runtime integration was not exercised because Docker was unavailable.

### 2026-10-18 — Root dev orchestration and Compose scaffold (T1.0.7)

- Added root `bun run dev` using Bun's parallel workspace runner to start the Fastify API and Vite client together, plus an API Dockerfile, Compose services for PostGIS, Martin, API, and Nginx, and a gateway config for `/api`, `/docs`, and `/map`.
- Added Compose/Postgres host settings to `.env.example` and documented the actual scaffold limits: API config validates a database URL but does not connect, and map data/styles/routing assets are absent. Updated quick-start and development docs; marked T1.0.7 complete.
- Validation: root dev command, workspace tests/typechecks/build, Compose YAML syntax/structure validation, and `git diff --check` passed. Docker/Compose runtime validation could not run because Docker is not installed in the agent environment.

### 2026-10-18 — OpenAPI and Zopia generation (T1.0.6)

- Added Swagger UI at `/docs` and OpenAPI 3.0 JSON at `/docs/json`; the document is generated from all 59 shared Zod route descriptors, including cookie parameters, bearer security, request media types, optional bodies, and no-content responses.
- Kept unimplemented domain endpoints out of Fastify's runtime route table and marked them `x-borobiya-runtime-status: contract-only`; only the existing health handler is live. Added the global 429 response to the OpenAPI catalog and aligned the rate-limit payload with the shared error shape.
- Added `bun --filter @borobiya/client generate:api`, which fetches the live OpenAPI document and invokes Zopia into the ignored `packages/client/src/generated/api/` directory.
- Validation: server tests/typecheck, client typecheck/build, OpenAPI path/operation assertions, and Zopia generation smoke test passed.

### 2026-10-18 — Vue client foundation (T1.0.5)

- Added the `@borobiya/client` Vue 3/Vite workspace with Vuetify, Tailwind CSS 4, Pinia, VueUse, Vue Router, Persian locale, and RTL shell styling.
- Added 17 route placeholders across `/_auth`, `/_public`, `/_user`, and `/_admin`, a responsive shared shell, and a minimal route-map test suite.
- Configured Vite to bind to `0.0.0.0`, allow the Arena preview host, and proxy same-origin `/api` and `/map` requests server-side; backend targets are not exposed to browser code.
- Validation: frozen-lockfile install, 2 client tests, client typecheck, and production build passed. Feature views, auth guards, MapLibre, Capacitor, and root `bun run dev` remain future work.

### 2026-10-18 — Fastify server foundation (T1.0.4)

- Added the `@borobiya/server` workspace with Fastify 5, workspace shared contracts, dotenv loading, and Node type support.
- Added Zod environment validation for `HOST`, `PORT`, PostgreSQL URL, distinct 32+ character JWT secrets, explicit CORS origins, and global rate-limit settings; defaults bind to `0.0.0.0` for container/preview access.
- Registered Helmet, a strict credentials-aware CORS allowlist, and the global in-memory IP rate limit; added a public health endpoint and sensitive-field log redaction.
- Added 7 server tests for env validation, health/security headers, CORS, and rate limiting. At that milestone the server was only a skeleton: no database connection, auth middleware, domain handlers, Redis, or OpenAPI wiring (the contract catalog was added in T1.0.6).
- Validation: frozen-lockfile install, all shared/server tests and typechecks, and `git diff --check` passed.

### 2026-10-18 — Shared route descriptors (T1.0.3)

- Added `km-api` 0.4.1 and a `defineRoute({ method, url, schema, meta })` adapter that preserves Borobiya descriptors while producing km-api configs.
- Added 59 route contracts across auth, public, user, location, SOS, and admin APIs. Handler registration and OpenAPI server wiring remain future tasks.
- Added route tests for unique operation IDs/method paths, path-parameter alignment, OpenAPI path conversion, auth/deprecation mapping, and public exports.
- Validation: frozen-lockfile install, all 23 Vitest tests across six files, shared TypeScript typecheck, route subpath/path-helper smoke test, and `git diff --check` passed.

### 2026-10-18 — Shared contracts (T1.0.2)

- Added the private `@borobiya/shared` workspace package with Zod schemas for auth, users, location, SOS, admin, search, common responses, and enums; exported inferred types and package subpaths.
- Added 19 tests across five files covering password/question invariants, location sharing rules, coordinate and query parsing, SOS bounds, dispatch recipients, admin inputs, cancellation reasons, and the public schema barrel.
- Added TypeScript 5 and Vitest development tooling plus `bun.lock`; pinned compatible package ranges for the documented Node 20+ fallback.
- Validation: `bun install --frozen-lockfile`, all 19 Vitest tests, package TypeScript typecheck, and a package self-reference import smoke test passed with Bun 1.4.3 invoked through `npm exec`.

### 2026-10-18 — Phase 1 kickoff (T1.0.1)

- Added the private Bun workspace manifest, strict shared TypeScript configuration, secret/data-aware `.gitignore`, and documented `.env.example`.
- Aligned the active development guide with the explicit global rate limit (100 requests/minute) and same-origin browser proxy paths (`/api`, `/map`); corrected the TypeScript workspace alias example.
- Marked T1.0.1 complete. Monorepo + Contracts was 14%; no auth, map, or feature code was claimed complete.
- Validation: Node config/environment assertions, TypeScript 5 inherited-config check, Git ignore checks, `git diff --check`, and Bun 1.4.3 empty-workspace install dry-run passed. Docker/Compose runtime checks remain unavailable.

### 2025-10-18 — Docs Bootstrap

- Created 12 markdown docs + 4 diagram docs on branch `arena/071fb407-borobiya`.
- Covers ARCHITECTURE, STRUCTURE, ROADMAP, TASKS, PROGRESS, API, SECURITY, MAP_SERVER, WORKFLOWS, USER_MANUAL, DEVELOPMENT, plus DIAGRAMS (ERD, SOS_FLOW, LOCATION_SEQUENCE, MAP_PIPELINE).
- Established the initial documentation baseline; implementation followed as a separate phase.

### 2025-05-01 — Spec Released

- Frozen `README.md` with 24 sections + 39 checklist items.

---

## How to Update This File

In every feature PR, edit the relevant **%** in tables above:

```markdown
| Monorepo + Contracts | 80% | Shared schemas done, client scaffold pending |
```

And append to Changelog:

```markdown
### YYYY-MM-DD — Short title
- What landed, link to PR #n
- New % and blockers
```

Keep it human-readable and AI-parseable (tables with `|`).

---

## Demo Readiness

| Demo | Ready? | Link |
|------|--------|------|
| P1 Auth + Map offline | ⬜ | — |
| P2 Live sharing | ⬜ | — |
| P3 Full SOS | ⬜ | — |
| MVP ship (deploy + APK) | ⬜ | — |
