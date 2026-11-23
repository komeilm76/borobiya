# Client visual-style token migration — inventory and staged plan

## Scope and counting method

The user chose **all visual-design values** across client pages/components (colors,
type, spacing, radii, shadows and related presentation constants), delivered in
**separately tested/pushed batches with approval between batches**. Functional
geometry — map calculations, device/touch dimensions, media breakpoints, protocol
values, transform coordinates and state-dependent layout — stays local unless a
specific design inconsistency is confirmed. Do not create a token for each
isolated number merely to remove a literal; token names should describe intent.

Source inventory: all client `.css` files and every `<style>` block in `.vue`
files, plus a search for inline `style`, bound `:style`, `element.style`, and
`setProperty` in Vue/TypeScript. The counts below are **lexical occurrences**,
including fallback values and comments; they are a triage index, not a claim
that each match is a defect. Existing global design config:
`packages/client/src/styles/tokens.ts` (installed by `src/main.ts`). No other
package or backend styles are included in this client visual audit.

- 48 files with CSS (4 CSS files, 44 Vue styles); 12 Vue components/views without local `<style>` blocks were also considered for inline styling.
- 531 hex-color occurrences, 2187 `px` occurrences, 2559 `rem` occurrences, 824 color/gradient function occurrences, 652 existing `var(--bb-…)` references.
- A separate grep also found 76 lines mentioning inline `style`, `:style`, `.style`, or `setProperty`; many are deliberate dynamic map positioning or browser API usage and require context before migration.

## File-level CSS inventory

| Source relative to `packages/client/src` | Hex | px | rem | color/gradient funcs | `--bb-` refs |
| --- | ---: | ---: | ---: | ---: | ---: |
| `views/_user/UserMissionView.vue` | 6 | 375 | 399 | 84 | 76 |
| `views/_admin/AdminDispatchView.vue` | 41 | 274 | 440 | 116 | 111 |
| `views/_user/UserMapView.vue` | 36 | 297 | 255 | 101 | 53 |
| `styles/public.css` | 141 | 74 | 153 | 21 | 20 |
| `styles/auth.css` | 97 | 87 | 129 | 68 | 24 |
| `components/shell/ProposalInboxContent.vue` | 12 | 166 | 117 | 39 | 34 |
| `styles/tailwind.css` | 48 | 95 | 99 | 43 | 52 |
| `views/_admin/AdminUsersView.vue` | 4 | 43 | 85 | 26 | 37 |
| `components/map/PointRouteSheet.vue` | 0 | 53 | 71 | 26 | 6 |
| `views/_user/UserSosHistoryView.vue` | 6 | 73 | 17 | 22 | 14 |
| `components/shell/MapProposalSidebar.vue` | 0 | 35 | 57 | 21 | 5 |
| `components/map/map-point.css` | 21 | 55 | 12 | 17 | 17 |
| `components/mission/MissionLivePanel.vue` | 3 | 50 | 34 | 15 | 16 |
| `components/map/PointTransportChoicesSheet.vue` | 0 | 41 | 44 | 10 | 8 |
| `components/shell/MapSidebar.vue` | 0 | 28 | 50 | 21 | 5 |
| `components/sharing/ShareDialog.vue` | 8 | 16 | 50 | 7 | 20 |
| `components/map/HistoryPlaybackPanel.vue` | 8 | 18 | 42 | 10 | 10 |
| `components/map/PointRouteChoicesSheet.vue` | 0 | 29 | 39 | 10 | 5 |
| `components/map/LiveCompanionPanel.vue` | 27 | 10 | 25 | 6 | 6 |
| `components/map/PlaceSearchPanel.vue` | 9 | 19 | 34 | 16 | 4 |
| `components/mission/MissionBriefDetails.vue` | 0 | 29 | 32 | 10 | 8 |
| `views/_user/UserRescuerHistoryView.vue` | 7 | 42 | 10 | 12 | 13 |
| `components/sos/SosRequestSheet.vue` | 3 | 16 | 35 | 11 | 6 |
| `components/shell/AccountProfileMenu.vue` | 0 | 17 | 36 | 16 | 5 |
| `components/settings/DevicePriorityPanel.vue` | 10 | 9 | 32 | 3 | 10 |
| `components/sharing/ShareLists.vue` | 4 | 12 | 35 | 3 | 15 |
| `components/mission/MissionMapCards.vue` | 0 | 26 | 22 | 17 | 10 |
| `views/_admin/AdminUserProfileDialog.vue` | 0 | 16 | 30 | 8 | 13 |
| `App.vue` | 0 | 21 | 23 | 6 | 12 |
| `components/map/MapPointKey.vue` | 3 | 32 | 4 | 8 | 3 |
| `components/mission/MissionTimelinePanel.vue` | 2 | 24 | 7 | 6 | 5 |
| `components/map/OwnPositionBar.vue` | 8 | 6 | 15 | 5 | 1 |
| `components/mission/MissionRatingPanel.vue` | 3 | 19 | 6 | 3 | 3 |
| `components/sharing/LiveBroadcastBar.vue` | 7 | 6 | 15 | 4 | 2 |
| `components/map/CompanionDetailSheet.vue` | 0 | 5 | 18 | 4 | 0 |
| `components/map/MapCanvas.vue` | 3 | 12 | 7 | 10 | 14 |
| `components/mission/MissionTracePanel.vue` | 3 | 11 | 8 | 3 | 5 |
| `views/_user/UserDevicesView.vue` | 5 | 2 | 11 | 0 | 0 |
| `components/sos/SosTriggerButton.vue` | 4 | 7 | 6 | 5 | 0 |
| `views/_admin/AdminIncidentsView.vue` | 0 | 9 | 8 | 2 | 0 |
| `views/_admin/AdminCategoriesView.vue` | 0 | 6 | 10 | 1 | 0 |
| `components/map/ReverseAddressSheet.vue` | 0 | 5 | 10 | 1 | 0 |
| `views/_user/UserLocationSharesView.vue` | 2 | 0 | 10 | 1 | 1 |
| `components/mission/MissionStatusPanel.vue` | 0 | 4 | 7 | 2 | 0 |
| `components/shell/NetworkStatusIcon.vue` | 0 | 8 | 3 | 4 | 2 |
| `components/sharing/HistoryDateTimeField.vue` | 0 | 2 | 4 | 0 | 1 |
| `components/sharing/PublicProfileFacts.vue` | 0 | 0 | 3 | 0 | 0 |
| `components/sos/SosCancellationDialog.vue` | 0 | 3 | 0 | 0 | 0 |

## Batch status

- **Batch 1 implementation:** Account/device settings colors now use theme-aware semantic tokens for supporting copy, error text, headings and row/card borders. The original light/dark computed colors were preserved in fixture-backed captures at 390/645/1007px; tests and build passed. See `review-artifacts/style-token-migration/batch-1/README.md` for evidence and limitations. A genuine signed-in after comparison was not available; the user approved continuing to Batch 2.
- **Batch 2 implementation:** Shared chrome, placeholder/welcome surfaces and the global error alert now use light/dark `shellColors` and shared shell typography/layout/radii in `tokens.ts`; the account-profile menu and toast actions use the same type/radius configuration. The color-pinned baseline and new render of `/_user/settings` were pixel-identical in fixture-backed Chromium at 390/645/1007px (light and dark). See `review-artifacts/style-token-migration/batch-2/README.md`. The user approved proceeding to Batch 3.
- **Batch 3a implementation:** Guest auth/public chrome and canvas treatments, plus sharing/broadcast feedback semantics, now use theme-aware `audienceColors` and configurable audience type/radii. Fixture-backed auth/login and public/landing before/after images matched at phone and desktop widths in both themes; public health differences were confined to the live checked-time string. See `review-artifacts/style-token-migration/batch-3/README.md`.
- **Batch 3b implementation (bounded):** Auth form/link/recovery/success colors, public landing/steps/final/health/footer/not-found colors and selected radii, and sharing-dialog/list type/weights/pill radii use global roles. Full client validation and fixture-backed visual review are in `review-artifacts/style-token-migration/batch-3b/README.md`. No pre-edit 3b screenshots were recorded; the CSS-overlay images are a reconstructed comparison only.
- **Batch 3c implementation (bounded):** Remaining auth decorative/overlay, public diagram and sharing row/chip paint roles, shared guest typography/leading, selected radii, motion and major insets use tokens. Authentic pre-edit 3c fixture captures and edited captures match pixel-for-pixel on 20 guest route/theme/viewport pairs; see `review-artifacts/style-token-migration/batch-3c/README.md`. No live signed-in sharing flow was captured.
- **Batch 3d implementation:** Remaining nonzero rem margin/padding/gap values in `auth.css`, `public.css`, and **all five** sharing Vue styles use a shared rem rhythm or named optical role. Guest text measures, decorative icon sizes, underline offsets, separator thickness and pattern density are configurable. Broadcast/facts/date-time sharing paint/type/spacing roles are included. Authentic guest before/after fixture captures remain pixel-identical on 20 pairs; see `review-artifacts/style-token-migration/batch-3d/README.md`. Local zero/auto resets, control hit sizes, breakpoints, viewport/scroll constraints, CSS forced-colors system values and diagram geometry are intentional functional/compositional exceptions (catalogued there). Authenticated sharing visuals were not captured. **This closes the planned guest/sharing style pass, not the all-client migration.** Wait for approval before the next batch.
- **Batch 4a implementation (bounded):** Paint roles in the two user history routes, the SOS trigger/sheet and four mission live/timeline/rating/trace panels now use light/dark `rescueColors` from `tokens.ts`. A separate unmodified `b96028d` source archive and the edited app produced 12 pixel-identical authenticated-fixture before/after pairs (history pages and an opened SOS sheet); full client checks passed. See `review-artifacts/style-token-migration/batch-4a/README.md` for scope, genuine-baseline method and uncaptured active-map/rating limitations. **Only paint was addressed in these eight files**, not their remaining visual typography/spacing or the large map-first mission page. Pause before the next group.
- **Batch 4b implementation (bounded):** `rescueType` now centralizes repeated rescue/history font sizes, weights, leading and star tracking across both user history routes, the SOS sheet and seven mission panels. Separate authentic `fc37d98` source captures and edited fixture captures match across 12 route/sheet × theme × viewport pairs; three live typography-variable probes changed computed CSS. See `review-artifacts/style-token-migration/batch-4b/README.md` for uncaptured mission-map states and intentional isolated type values. This is not the full mission/SOS pass; pause before the next batch.
- **Remaining scope:** The counts above are the baseline inventory, not migration-completion figures. Batches 1–3d cover account/device, selected shell styles and the guest/sharing style pass; 4a–4b cover bounded rescue/history paint and typography. Mission workspace, residual SOS/mission component styling, admin, map-heavy UI and a final all-client audit including isolated shell presentation values remain. The user selected all *visual-design* values as the end goal; this is not yet complete.

## Prioritized migration batches

1. **Account/device settings color semantics (first batch).** Use exact light/dark tokens for labels, headings, errors and row/card borders on the authenticated `/_user/devices` page. Preserve pixels and behavior; use its user-supplied before screenshots and local fixture checks. Add a regression test for semantic color wiring.
2. **Shared shell and global CSS.** Reconcile reusable colors, typography and effects in `styles/tailwind.css` and shell components; validate auth/workspace/public routes before changing shared selectors.
3. **Auth/public and sharing UI, split for review.** **3a** moved guest chrome/canvas and sharing feedback; **3b** moved guest content colors and sharing typography; **3c** moved decorative colors/effects, content type and major layout insets; **3d** finished the residual rem spacing, text measures and symbol/optical audit, including the other sharing Vue styles. Functional touch dimensions, breakpoints, zero/auto resets and composed diagram geometry stay local with reasons in the 3d review. The final all-client audit may still uncover shared-style values to revisit. Pause for approval before the next group.
4. **Mission/SOS/history and admin UI.** Migrate presentation tokens in smaller page groups, preserve status meanings and component-specific state colors.
5. **Map-heavy views and final audit.** Tokenize visual surface/marker colors and motion separately from geographic calculations, breakpoints and functional control geometry. Re-run the inventory and document every remaining design literal or intentional exception.

Each batch requires tests, typechecking/build, a reviewed diff, a separate commit/push, evidence and a wait for the user's instruction. This report does **not** mark future batches complete.
