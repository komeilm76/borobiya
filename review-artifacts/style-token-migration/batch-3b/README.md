# Client style-token migration — Batch 3b (bounded guest-content slice)

## Scope and outstanding work

This approved batch centralizes light/dark presentation roles for auth form headings, links, fields, recovery/question/success feedback and divider; public hero, value cards, steps, final action, health state/retry/note, footer and not-found content; and selected sharing-dialog/list font sizes, weights and pill radii. `packages/client/src/styles/tokens.ts` emits `--bb-detail-*`, `--bb-sharing-font-*`, a 32px `--bb-radius-hero` and two detail badge radii. Health online/offline/neutral colors retain distinct meanings. Button touch dimensions, responsive cutoffs, status logic and map calculations were not migrated. Source-level tests assert token emission/consumption, contrast, dark variants and existing public/auth typography constraints.

**This is not completion of the all-client request or even a full auth/public/sharing audit.** Remaining local visual values include auth intro/decorative colors/effects and form typography/spacing, public diagram colors/shadows plus further type/spacing/effects, and sharing spacing/selected-row borders/effects. A separately approved follow-up (3c), mission/SOS/admin groups, map-heavy styles and a final design-literal audit are still needed. See `../../../docs/CLIENT_STYLE_TOKEN_MIGRATION.md`.

## Visual review and its limits

No genuine **pre-edit Batch 3b screenshots** were captured. `reconstructed-css-*.png` was rendered **after** code changes with the committed HEAD versions of `auth.css` / `public.css` injected as a last stylesheet over the current app; it is a CSS-only reconstruction, **not** a historical before screenshot. `after-*.png` renders the actual edited styles. Both runs used Chromium 141 with Vue DevTools disabled, an intercepted `/api/` fixture, frozen time, self-hosted fonts, phone 390×844 and desktop 1007×700, light/dark, on login, register, forgot-password, landing and health guest routes. They do not verify a live API, authenticated sharing UI or service uptime.

- ImageMagick absolute-error comparison of the 20 CSS-reconstruction/current pairs: **16 pairs AE 0**. The four register pairs differ in an approximately 268–269×98–104px patch of Persian password helper text (AE 3,004–3,010). Visual inspection found the same words, layout, field shape and colors; do not claim pixel identity for register. A style-only overlay and independent browser font rendering are not a substitute for a captured pre-edit state.
- All 20 actual captures reported no JavaScript page errors and no horizontal overflow. The reviewed after images include light landing mobile, dark health mobile and dark login desktop. The health fixture can display the sample server-response state; it is not an uptime check.
- A live CSS-variable probe in Chromium confirmed editing `--bb-detail-publicFinalFill`, `--bb-radius-hero`, `--bb-detail-authHeading` and `--bb-detail-publicRetryFill` changed the respective computed background/radius/text/background. The radius probe ran at desktop width because the mobile layout intentionally overrides the final card's radius.
- Sharing UI is covered by source/theme tests only; no logged-in dialog or revocation flow was captured.

## Validation

Full client Vitest: **269 files / 1,777 tests passed**. Vue and E2E TypeScript checks, production Vite build and `git diff --check` passed. Vite emitted its existing non-fatal large-chunk advisory. No backend tests or release were run. Await user approval before the next migration slice.
