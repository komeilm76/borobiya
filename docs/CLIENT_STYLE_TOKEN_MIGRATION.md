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

- **Batch 1 implementation:** Account/device settings colors now use theme-aware semantic tokens for supporting copy, error text, headings and row/card borders. The original light/dark computed colors were preserved in fixture-backed captures at 390/645/1007px; tests and build passed. See `review-artifacts/style-token-migration/batch-1/README.md` for evidence and limitations. A genuine signed-in after comparison and the user's go-ahead remain pending before Batch 2.
- **Remaining scope:** The counts above are the baseline inventory, not a claim that all files have been migrated. Batch 1 changes one page, its settings component, and shared token definitions. The remaining batches below cover the rest of the app.

## Prioritized migration batches

1. **Account/device settings color semantics (first batch).** Use exact light/dark tokens for labels, headings, errors and row/card borders on the authenticated `/_user/devices` page. Preserve pixels and behavior; use its user-supplied before screenshots and local fixture checks. Add a regression test for semantic color wiring.
2. **Shared shell and global CSS.** Reconcile reusable colors, typography and effects in `styles/tailwind.css` and shell components; validate auth/workspace/public routes before changing shared selectors.
3. **Auth/public and sharing UI.** Migrate semantic colors and repeated type/spacing/shadow styles with per-theme contrast tests and representative captures.
4. **Mission/SOS/history and admin UI.** Migrate presentation tokens in smaller page groups, preserve status meanings and component-specific state colors.
5. **Map-heavy views and final audit.** Tokenize visual surface/marker colors and motion separately from geographic calculations, breakpoints and functional control geometry. Re-run the inventory and document every remaining design literal or intentional exception.

Each batch requires tests, typechecking/build, a reviewed diff, a separate commit/push, evidence and a wait for the user's instruction. This report does **not** mark future batches complete.
