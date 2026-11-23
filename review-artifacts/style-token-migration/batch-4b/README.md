# Client style-token migration — Batch 4b: rescue-flow typography

## Scope

This bounded follow-up adds `rescueType` in `packages/client/src/styles/tokens.ts`: semantic `--bb-rescue-font-*`, `--bb-rescue-weight-*`, `--bb-rescue-leading-*` and `--bb-rescue-tracking-*` variables for repeated readable text, the two distinct responsive history headlines, SOS labels, mission timeline/rating text, and history/rating star tracking. Ten style blocks consume applicable roles: the two user history views, `SosRequestSheet` and all seven `components/mission/*.vue` panels. Values are numerically identical to the pre-edit CSS; role emission and consumption, headline caps, keyboard/touch dimensions and existing mission card hierarchy are asserted in tests. Older source-pinned tests were updated to check token values rather than literal CSS declarations.

### Intentionally outside this slice

This is a **selected typography pass**, not a wholesale replacement of every `font-size`, nor a completed mission/SOS migration. Isolated values such as the .81rem page counter, .83rem eyebrow, .875rem brief/phase labels, 1.23rem history heading and the compact monospace mission identifier remain local for a future design-literal audit; creating a global token for every isolated optical number would obscure intent. Functional map dimensions, SOS sheet scrolling, responsive thresholds, status workflow, touch sizes and layout geometry did not change. `UserMissionView.vue` and admin/map-heavy UI remain separate batches. `SosCancellationDialog.vue` contains only responsive action layout and no type/color declarations for this pass.

## Visual comparison

`before-*.png` was captured from a separate, unmodified source archive at pushed commit **`fc37d98`** with an isolated Vite dependency cache and font access; `after-*.png` came from the edited branch. The fixture-backed authenticated routes `/_user/sos-history` and `/_user/mission-history` showed one sample request, one terminal mission and two timeline entries; the SOS sheet was opened from history. Captures covered both themes and 390×844 / 1007×700 viewports: **12 genuine before/after pairs, all ImageMagick AE 0**. Final captures had no browser page errors or horizontal overflow. A transient map-configuration snackbar covered the sheet header at inconsistent times in initial mobile captures; the final light-mobile sheet pair waited for the notice and dismissed it via its normal Close button in *both* versions before screenshotting. Other matching pairs retained their captured states. Runtime probes changed computed hero font size (24.8→12px), hero-copy line height (30.4→16px) and toolbar font weight (800→400) when the respective tokens were overridden.

The fixtures do **not** exercise a live API, map tiles, active mission member-room/brief/map cards, completed rating/trace, or a submitted SOS. Those components have source/test coverage only, not visual proof. No contrast or accessibility improvement is claimed; this migration preserves existing visual values.

## Validation

Client Vitest **273 files / 1,788 tests passed**; Vue and E2E TypeScript checks, Vite production build and `git diff --check` passed. Vite's large-chunk advisory is non-fatal. No backend tests, merge or release were run. Pause for review before the next batch.
