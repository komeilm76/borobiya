# Client style-token migration — Batch 4a: mission, SOS and history paint

## Scope

This bounded slice centralizes **presentation paint** in eight component/view style blocks: `MissionLivePanel`, `MissionTimelinePanel`, `MissionRatingPanel`, `MissionTracePanel`, `SosTriggerButton`, `SosRequestSheet`, `UserSosHistoryView` and `UserRescuerHistoryView`. `rescueColors.light/dark` in `packages/client/src/styles/tokens.ts` emits `--bb-rescue-*` roles for history heroes/rows, mission member identities and timeline/rating, and emergency action/sheet states. Existing light values and dark overrides are preserved. No raw hex or rgba color declaration remains in these eight style blocks; configured Vuetify theme variables and existing shared `--bb-color-*`/`--bb-shadow-*` references remain. Tests assert emission, consumer wiring and critical preserved values. Existing literal-based elevation/contrast tests now verify the token value as well as the consumer.

This is **not** the whole mission/SOS/history audit or the all-client migration. `UserMissionView.vue` (the map-first workspace), other mission cards/brief/status components, SOS cancellation dialog, dynamic/inline styling, remaining typography/spacing/radii/motion on these pages, admin, map-heavy views and a final client-wide audit are still outstanding. The old `/_user/mission` URL redirects to `/_user/map?tab=missions`; it is not a separate rendered page.

### Intentional local values

Map dimensions, route geometry, sheet scrolling, breakpoint thresholds, keyboard focus offset, functional icon and 44/48px touch sizes, status constants and severity choices remain with their owners. `rgb(var(--v-theme-* ))` colors follow the globally configured Vuetify palette. The light/dark avatar identity colors stay numerically as before; this batch does not purport to fix any existing contrast issue on uncaptured active mission states. No component template, API, status workflow or router code changed.

## Visual evidence and limits

The `before-*.png` captures were made from a **separate unmodified archive of pushed pre-edit commit `b96028d`**, not a CSS overlay on the edited app. That baseline Vite server needed an isolated dependency cache and read-only access to the shared dependency font files; initial captures without those permissions had missing icons/fonts and were replaced. The `after-*.png` captures were made from the edited client. A fixture-backed authenticated session supplied one request, one terminal mission and two timeline steps; there is **no live backend**. Chromium captures cover two actual history routes and the SOS sheet opened from the history page, at light/dark × 390×844/1007×700: **12 before/after pairs, all ImageMagick AE 0**. Final captures had no browser page errors or horizontal overflow. The sheet captures crop to the sheet component after the mission timeline settles; route captures are full-page. Changing three `--bb-rescue-*` variables at runtime changed the computed sheet badge, SOS FAB and history hero styles.

The fixture does not render the active live mission map/member room, completed-mission rating/trace, real geolocation, map tiles, or a submitted SOS. Those components' paint wiring is source/test-reviewed, **not visually validated**. The opened sheet may show unready/location warnings because no services are connected; the comparison concerns the same fixture state before and after, not live SOS readiness. No accessibility or contrast improvement is claimed.

## Validation

Full client Vitest: **272 files / 1,786 tests passed**. Vue and E2E TypeScript checks, Vite production build and `git diff --check` passed. Vite's large-chunk advisory is non-fatal. No backend tests, live service validation, merge or release was run. Pause for review before the next batch.
