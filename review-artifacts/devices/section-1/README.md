# `/_user/devices` — Section 1: visual standards

## Evidence and scope

- **Genuine signed-in before/reference screenshots supplied by the user:** `reference-mobile.png` (390 × 1117), `reference-tablet.png` (645 × 860), `reference-desktop.png` (1007 × 630). These are copies of the supplied attachments, not locally generated images.
- **Local fixture-backed before/after captures:** `before-{mobile,tablet,desktop}.png` and `after-{mobile,tablet,desktop}.png`, at those same viewport sizes. Chromium rendered the actual route/CSS with *intercepted* authentication, profile, and device-list API responses (two example sessions). These are **not** screenshots of the user's authenticated backend. Vite's development overlay and the shell's floating controls may appear in them; neither belongs to the session card. The captured document has no horizontal overflow at any of the three widths, and the browser reported no page errors.
- **Genuine signed-in after screenshots supplied by the user after commit `5e69018`:** `real-after-initial-mobile.png` (390 × 1153), `real-after-initial-tablet.png` (645 × 860), `real-after-initial-desktop.png` (1007 × 630). The first mobile image exposed a long-activity-label wrap defect that the initial short-duration fixture did not exercise.
- **Genuine signed-in final mobile screenshot supplied by the user after commit `bb6f873`:** `real-after-final-mobile.png` (390 × 1132). It shows the corrected long-label case with the icon and device name on the same line and the revoke button below the details. The tablet and desktop presentation was unaffected by that mobile refinement in local browser comparisons. The black development-tools overlay near the bottom of the supplied mobile image is not part of the device card.
- `long-before-mobile.png` reproduces the discovered defect locally with a 73-minute fixture, and `long-after-mobile.png` shows the fix. These two images are **fixture-backed**, not genuine backend captures.

## Review, priority, and disposition

| Priority | Visual finding from genuine screenshots | Proposed / implemented | Result |
| --- | --- | --- | --- |
| Medium | At desktop width the security card and two sparse session rows occupy almost the entire content width. | Center and cap this page's session card at 52rem, retaining full width below the cap. | Local desktop row width changed from ~906px to ~792px at 1007px; mobile and tablet widths stayed unchanged. |
| Low | Session rows have a faint boundary against the white card. | Use the existing inset-surface token and a clearer muted border in light mode, retaining the established dark override. | Row boundaries are more discernible at all three widths. |
| Medium (found in genuine after) | At 390px, the Android row's long last-activity label pushes the icon onto its own line above the device name. | Give mobile rows a two-column icon/details grid with the revoke button below; let details shrink rather than wrap as a whole flex item. | At 390px with a 73-minute fixture, icon and name share the first line and the button stays below. At 645/1007px the row geometry is unchanged in local browser captures. The final signed-in mobile screenshot confirms the corrected alignment with a 1-hour-27-minute label. |
| Keep | Title hierarchy, small-text contrast, current-session badge, refresh and revoke actions were legible and functioning in the reference images. | Leave these elements and their interactions intact. | No shared tokens, shell, or unrelated pages modified. |

**Approval and status:** Section 1 was requested by the user, and the user supplied signed-in before, initial after, and final mobile after evidence. The user has not separately stated aesthetic approval; no such approval is assumed. The visual review and evidence are complete, with no further Section 1 changes proposed. Section 2 (UX/layout) has not started and awaits explicit instruction; Section 3 (map controls) is N/A because this page contains no map. Section 4 has not started.

## Verification

- Compared all three genuine before screenshots with the first three genuine signed-in after captures. The desktop card is focused and the row borders are visible, but the initial mobile after showed a long-label wrap defect. Fixed and compared `long-before-mobile.png` to `long-after-mobile.png` in Chromium with a 73-minute last-activity label. In local after captures, the icon stays next to the device name, the revoke action is below the details, and the 390/645/1007px documents have no horizontal overflow or page errors. Finally, compared the genuine signed-in `real-after-final-mobile.png` against both earlier mobile screenshots: with a longer 1-hour-27-minute label, the icon and name now occupy the same row, the revoke action remains visible underneath, and there is no apparent horizontal overflow.
- Client Vitest after the follow-up fix: **265 files, 1,763 tests passed**, including the mobile-grid and inset-contrast assertions.
- Vue TypeScript (`vue-tsc`), E2E TypeScript (`tsc`), production Vite build, and `git diff --check`: **passed** after the follow-up fix. Build emitted its existing large-chunk advisory; no build failure.
- Real-backend revoke behavior was not exercised locally. No release or merge.
