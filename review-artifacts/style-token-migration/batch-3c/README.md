# Client style-token migration — Batch 3c: decorative finishes and content type

## Scope and boundaries

`packages/client/src/styles/tokens.ts` now emits light/dark `audienceFinishes` (`--bb-finish-*`) for the auth intro/decorative and account-overlay paint, the public network illustration, and sharing result/chip/list borders, fills and selected edge. `audienceContentType` centralizes auth/public text sizes, optical font weights and line heights. `audienceContentLayout`, `audienceContentRadii`, `audienceContentMotion` and expanded `audienceDetailRadii` cover prominent panel insets, repeated sharing row spacing, corners, opacity and transition timing. Existing light/dark and state values were retained; the 0.17-alpha dark question index edge remains distinct from the 0.16-alpha field edge. Border declarations keep their original widths/styles outside the color variables. Static diagram positions, responsive breakpoints, minimum touch sizes, route heights, form behavior and API state are functional and remain local.

**The area is not fully migrated:** several individual optical margins/gaps/padding and other isolated visual declarations remain in auth/public/sharing. A separately approved 3d must finish their classification and migration or explain functional exceptions before calling these files complete. Mission/SOS/admin, map-heavy UI and an all-client audit are still outstanding. See `../../../docs/CLIENT_STYLE_TOKEN_MIGRATION.md`.

## Authentic pre-edit visual comparison

Before changing Batch 3c code, 20 `before-*.png` captures were made against the clean `9f6e2a5` branch head. The 20 `after-*.png` captures use the Batch 3c edits. Chromium 141 ran with Vue DevTools disabled at **390×844** and **1007×700**, in **light and dark** on `/_auth/login`, `/_auth/register`, `/_auth/forgot-password`, `/_public/landing` and `/_public/health`. Requests under `/api/` used deterministic example responses; time was frozen. These are guest fixture captures, **not** evidence of a live API, real health status, or an authenticated sharing session.

ImageMagick `compare -metric AE`: **0 differing pixels in all 20 before/after pairs**. All 20 after captures had no page errors or horizontal overflow. A live CSS-variable probe changed computed public-network gradient, network-node radius, section inset, public heading font size and auth heading font size as configured. Sharing states are covered by source/theme tests, not a signed-in screenshot or a live permission/revocation interaction.

## Validation

Full client Vitest: **270 files / 1,780 tests passed**. Vue and E2E TypeScript checks, Vite production build and `git diff --check` passed. The pre-existing large-chunk advisory is non-fatal. No backend tests, release or merge were run. Await approval before Batch 3d.
