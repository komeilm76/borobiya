# Client style-token migration — Batch 3d: guest/sharing spacing audit

## Scope

This slice closes the planned guest/sharing style pass. `audienceRhythm` in `packages/client/src/styles/tokens.ts` is a **rem** spacing scale (33 repeated steps, including one negative optical overlap); `audienceContentLayout` adds 10 named, isolated offsets. Exactly 193 nonzero rem occurrences in gap/margin/padding declarations across `auth.css`, `public.css`, `ShareDialog.vue` and `ShareLists.vue` were migrated. These files now have no raw rem values in those declarations. Shared values remain rem-based so root font scaling works. `audienceContentWidths`, `audienceIconSizes` and `audienceContentOptics` centralize reading measures, noninteractive badges/marks, underline offsets, hairline thickness and diagram-grid density.

The other three sharing styles were also reviewed: `LiveBroadcastBar.vue` now consumes theme-aware border/fill/blur roles plus the rem rhythm and an indicator-size token; `HistoryDateTimeField.vue` uses sharing caption type and spacing; `PublicProfileFacts.vue` uses sharing facts type, spacing and a configured caption opacity. Regression tests cover token emission/consumption, legacy visual values, and the absence of raw guest/sharing color and rem-spacing declarations.

### Values intentionally local

- `0`, `auto`, `none`, `100%`, `50%` and responsive visibility/centering resets are CSS layout/circle semantics, not independent palette or spacing decisions. The source-level audit specifically permits zero/auto resets while rejecting remaining rem spacing literals.
- `44px`/`52px` minimum action sizes, `66px` result row height, `2.5rem` preset control height, form-field/button hit areas, scrollable-dialog constraints, and responsive thresholds (900/760/599/560/440/400/380px) are functional reachability and layout behavior.
- Auth/public viewport-height calculations, grid column fractions and minmax widths, network diagram orbital/node coordinates, transforms, connected shape sizes, and responsive illustration heights form composed geometry. Moving them into a broad spacing scale would decouple dependent positions and break the illustration/phone layout. Foreground/gradient/border/opacity/density and decorative badge sizes **are** token-backed.
- `ButtonText` in forced-colors mode is a system color; `rgb(var(--v-theme-primary))` is the existing globally configured Vuetify focus color. Inline Vuetify `color="primary"`/`color="error"` attributes use that same theme. No hardcoded hex/rgba colors remain in these seven style blocks.

This is **not** completion of the all-client task: mission/SOS/history/admin, map-heavy views and final remaining shell/inline-style audit still require separately approved batches.

## Visual review

`before-*.png` was captured from clean `688bb1a` **before Batch 3d edits**, and `after-*.png` from the edited branch. Fixture-backed Chromium 141 captures covered light/dark × 390×844/1007×700 × login/register/forgot-password/landing/health (20 pairs), with Vue DevTools disabled, frozen time and intercepted `/api/` example responses. All **20 pairs had ImageMagick AE 0**, and all after captures had no page errors or horizontal overflow. A live CSS-variable probe changed computed public-value icon width (52→24px), footer nav gap (22.4→5px), auth-kicker padding (13.6→27px), and public network grid density (39→18px). These are guest fixture captures, not authenticated sharing screenshots or proof of actual API health; the three other sharing components are source/test-reviewed only.

## Validation

Full client Vitest: **271 files / 1,783 tests passed**. Vue and E2E TypeScript checks, Vite production build and `git diff --check` passed. The existing large-chunk advisory is non-fatal. No backend tests, merge or release were run. Await approval before moving to mission/SOS/admin.
