# `/_user/devices` — Section 1: visual standards

## Evidence and scope

- **Genuine signed-in before/reference screenshots supplied by the user:** `reference-mobile.png` (390 × 1117), `reference-tablet.png` (645 × 860), `reference-desktop.png` (1007 × 630). These are copies of the supplied attachments, not locally generated images.
- **Local fixture-backed before/after captures:** `before-{mobile,tablet,desktop}.png` and `after-{mobile,tablet,desktop}.png`, at those same viewport sizes. Chromium rendered the actual route/CSS with *intercepted* authentication, profile, and device-list API responses (two example sessions). These are **not** screenshots of the user's authenticated backend. Vite's development overlay and the shell's floating controls may appear in them; neither belongs to the session card. The captured document has no horizontal overflow at any of the three widths, and the browser reported no page errors.
- A genuine signed-in **after** screenshot is still needed at each size to complete the requested real-backend before/after evidence. The local API is unavailable, so the assistant cannot capture one independently. Please provide those captures after the updated branch is available in your authenticated environment; do not substitute fixture images for them.

## Review, priority, and disposition

| Priority | Visual finding from genuine before screenshots | Proposed / implemented | Result |
| --- | --- | --- | --- |
| Medium | At desktop width the security card and two sparse session rows occupy almost the entire content width. | Center and cap this page's session card at 52rem, retaining full width below the cap. | Local desktop row width changed from ~906px to ~792px at 1007px; mobile and tablet widths stayed unchanged. |
| Low | Session rows have a faint boundary against the white card. | Use the existing inset-surface token and a clearer muted border in light mode, retaining the established dark override. | Row boundaries are more discernible at all three widths; no change to text, actions, or spacing. |
| Keep | Title hierarchy, small-text contrast, responsive wrapping, current-session badge, refresh and revoke actions were legible and functioning in the reference images. | Leave these elements and their interactions intact. | No shared tokens, shell, or unrelated pages modified. |

**Approval:** Section 1 was requested by the user; individual visual changes and genuine after images have not yet been explicitly approved/verified by the user. No additional changes were made merely to create a difference. Section 2 (UX/layout) has not started; Section 3 (map controls) is N/A because this page contains no map. Section 4 has not started.

## Verification

- Visually compared all three genuine before screenshots with matching-size fixture-backed local before and after captures. Current-session badge, two rows, revoke action, and hint remain readable; 390/645/1007px document widths equal their viewport widths. The genuine after comparison remains pending.
- Client Vitest: **265 files, 1,763 tests passed** (including a new visual-style/contrast assertion for the inset row).
- Vue TypeScript (`vue-tsc`), E2E TypeScript (`tsc`), production Vite build, and `git diff --check`: **passed**. Build emitted its existing large-chunk advisory; no build failure.
- Real-backend revoke behavior and authenticated after screenshots were not exercised locally. No release or merge.
