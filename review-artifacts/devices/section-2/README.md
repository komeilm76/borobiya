# `/_user/devices` — Section 2: UX and layout

## Evidence and scope

- **Genuine signed-in before screenshots supplied by the user:** `real-before-mobile.png` (390 × 1132; copied from Section 1's final mobile screenshot), `real-before-tablet.png` (645 × 860), and `real-before-desktop.png` (1007 × 630; the latter two copied from Section 1's signed-in after screenshots). The Section 1 follow-up changed only the mobile row arrangement; local 645/1007px geometry was checked unchanged. These files are copies of user attachments, not generated images.
- **Local fixture-backed before/after screenshots:** `fixture-{before,after}-{mobile,tablet,desktop}.png` at matching viewport widths (390, 645, 1007px), plus `fixture-stale-after-mobile.png` showing the failed-refresh state with retained rows. These render this route with intercepted authentication and example session API responses, **not** the user's live backend. Development overlay and shell floating controls may appear; they are not device-page actions.
- **Genuine signed-in after screenshots at all three sizes are pending** for the final Section 2 build. The local API is unavailable, so locally generated after images cannot stand in for authenticated captures.

## Review and changes

| Priority | Finding | Proposal / implemented | Result |
| --- | --- | --- | --- |
| Medium | After a failed refresh, previously loaded sessions remain visible with a disabled termination button, but the explanation was *below* the rows. On narrow screens a user could meet the disabled action before its reason. | Announce the stale-list warning above the session list; say “rows below,” keep existing disabled-action and retry safeguards. | Fixture-backed mobile refresh-failure capture puts the alert at y=466 before the list at y=524, and the revoke control remains disabled. The first-read failure still shows its own retry message. |
| Low | The page introduction repeated an IP warning already near the IP values and used different wording (“not exact” versus “not approximate”). This lengthened the path to the sessions on mobile. | Keep the IP caveat once, in the card near the values, and clarify that IP does not show the exact login location. | The intro is one line shorter in the local 390px capture, moving the card up about 28px; the IP caveat stays visible in the card. At 645px, the shortened card hint still fits one line. |
| Keep | Sessions and current-session count, share-management wayfinding, refresh, confirmation, revocation safeguards, loading/error/empty states, and the mobile icon/details arrangement all have a clear purpose. | Preserve routes, actions, tap targets, hierarchy, and session management behavior. | No shared design tokens, shell, or unrelated pages changed. No arbitrary rearrangement. |

**Approval/status:** The user authorized Section 2, not each individual change; explicit aesthetic approval is not presumed. Implementation, tests, and fixture comparison are complete. Genuine signed-in after screenshots and their final comparison remain pending. Section 3 is N/A (no map on this page); Section 4 has not started.

## Verification

- Chromium fixture captures at 390/645/1007px: no page errors or horizontal overflow; all two sessions, badges, actions and the share-management route remain visible. The 390px confirmation dialog opens and cancels without issuing a revoke request.
- After a simulated failed refresh of a previously loaded list, the 390px browser capture shows the single warning before rows and the termination button disabled, with no horizontal overflow.
- Full client Vitest: **265 files, 1,764 tests passed**. Vue TypeScript, E2E TypeScript, production Vite build, and `git diff --check`: **passed**. The build's large-chunk advisory did not fail the build.
- Real-backend revocation and authenticated after screenshots were not exercised locally; no release or merge.
