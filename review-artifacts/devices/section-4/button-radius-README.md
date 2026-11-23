# `/_user/devices` — Section 4 follow-up: button corner consistency

## Evidence

- **Genuine authenticated before:** the user's three signed-in light screenshots, already preserved as `real-current-{mobile,tablet,desktop}.png` in this folder (390 × 1105, 645 × 860, 1007 × 630). They show the original, square-ish page action buttons. These are not new captures.
- **Local fixture-backed before:** `light-{mobile,tablet,desktop}.png`, captured before this fix; Chromium measured the share-management, refresh, and end-session buttons at **4px** border radius, while the back icon was correctly circular (`50%`).
- **Local fixture-backed after:** `radius-after-{mobile,tablet,desktop}.png` at the same widths, rendered with intercepted authentication/device responses, **not the user's backend**. Chromium measured those three text actions at **16px**, both confirmation-dialog actions at **16px**, and the back icon still at **50%**. The document had no horizontal overflow or page errors at these widths, and the session rows retained their previous geometry.
- **Genuine authenticated after is pending** for this follow-up. Please supply mobile, tablet, and desktop captures of the updated branch if live signed-in after evidence is required. Fixture images must not be presented as genuine after screenshots.

## Review and decision

| Priority | Finding | Change / result |
| --- | --- | --- |
| Medium | Device-page text actions used Vuetify's 4px corners rather than the project's `--bb-radius-nested` (16px) control style. | Apply the existing radius token to the page's share-management link, refresh, end-session, and confirmation actions. Keep the icon-only back action circular and preserve button sizes, placement, colors, copy, and behavior. |
| Keep / scoped | A shared CSS primitive names `.app-shell`, while the current Vuetify root uses modifier classes such as `.app-shell--workspace`; it did not affect these page buttons. Broadly changing the shell/global selector could change unrelated routes. | Leave shared primitives and other pages untouched. This follow-up changes only the named page and its dialog. A broader shared-selector audit is a separate potential task, not part of this fix. |

**Approval:** The user requested the radius correction; no separate visual acceptance or final authenticated after screenshots have been supplied yet. Section 3 remains N/A (no map on this page).

## Verification

- Fixture-backed Chromium computed styles at 390/1007px: text action radii 4px → 16px, dialog actions 16px, back icon 50%. Local captures at 390/645/1007px show no document overflow or page errors.
- Client Vitest: **266 files, 1,766 tests passed** (including a new page-scoped radius contract). Vue TypeScript, E2E TypeScript, production Vite build, and diff check: **passed**. The build's large-chunk advisory did not fail the build.
- No live backend session revoke was performed, and no release or merge occurred.
