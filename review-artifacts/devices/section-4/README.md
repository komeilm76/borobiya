# `/_user/devices` — Section 4: design consistency and final evaluation

**Subsequent corrections:** After this no-UI-change audit, the user identified inconsistent button corners. See the [initial button-radius follow-up](button-radius-README.md) and its [latest global configuration refinement](global-button-config-README.md). The unchanged-state conclusion below describes the original Section 4 review, not these later button changes. Genuine after evidence for the latest values is still pending.

## Page and screenshot provenance

- **Genuine authenticated light-theme screenshots, current before and final unchanged state:** `real-current-mobile.png` (390 × 1105), `real-current-tablet.png` (645 × 860), and `real-current-desktop.png` (1007 × 630). These are byte-for-byte copies of the user's Section 2 after attachments (see `../section-2/README.md`). Section 4 changes **no rendered UI**: the same genuine images therefore document both the starting and final page state. They are **not** two separately captured moments, and no new authenticated screenshot is claimed.
- **Local fixture-backed light/dark comparisons:** `light-{mobile,tablet,desktop}.png` and `dark-{mobile,tablet,desktop}.png` at corresponding 390/645/1007px viewports. They use intercepted auth and example device API responses; **none** represents a live signed-in dark-theme screenshot. Development-tools overlay and floating shell controls are outside this page's session-card design.

## Design review and disposition

| Priority | Reviewed item / finding | Decision and result |
| --- | --- | --- |
| Keep | Page title, account eyebrow, count chip, card heading, muted help text, session names/status/IP and share-management link retain a clear hierarchy across all three genuine widths. | No typography, copy, spacing or route changes warranted. The compact 52rem centered card and 16px inset rows from Section 1 remain consistent. |
| Keep | Light/dark surface hierarchy, nested radius, outline, shadow, Vuetify tonal actions and selected theme colors use existing tokens. The session component is used only by this page. | No shared-token or shell change. Local dark captures show the card on dark surface and rows on the distinct inset surface; light and dark have identical row geometry. |
| Keep | Mobile revoke action, current-session badge, refresh control, long activity label and text wrapping remain readable. | Preserve the Section 1 mobile grid and Section 2 guidance/stale-warning order. Local 320/390/645/1007/1440px measurements show no horizontal overflow; at 1440px the card remains capped. |
| Test-only | Existing contrast tests checked light inset text and the presence of dark overrides, but not dark muted/error text against the actual card and row surfaces. | Add a focused dark contrast regression assertion. Muted text ratio is **5.86:1** on dark card and **5.26:1** on dark inset; inset main text **8.92:1**, error copy **6.48:1** on card (all ≥4.5:1). No rendered UI was modified. |

**Priority / approval:** No unresolved page-specific design inconsistency was confirmed, so no cosmetic UI edit is proposed or assumed approved. The user authorized Section 4 but did not separately state aesthetic approval. Section 3 remains **N/A** because `/_user/devices` has no map or map floating controls.

## Final verification and remaining limitations

- Compared the three genuine screenshots with local fixture-backed light and dark captures. At 390/645/1007px the document width matched its viewport, both session rows rendered with no browser page errors, and dark surfaces resolved to card `#294043` and inset `#304749` (light: white card and `#f4f7f6` inset). Additional 320px and 1440px light/dark fixture checks reported no overflow; these extra captures were diagnostic only and are not presented as authenticated evidence.
- Full client Vitest: **265 files, 1,765 tests passed**; Vue TypeScript, E2E TypeScript, production Vite build and `git diff --check`: **passed**. The build reported its non-failing large-chunk advisory.
- The user's authenticated screenshots cover normal light-theme layout only. Live authenticated dark theme, real-backend revoke and live failed-refresh flows were not independently exercised here; the local fixture and unit tests cover visual/deterministic aspects of those states. No release or merge.
