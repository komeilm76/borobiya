# Client design-token migration — Batch 3a: guest chrome and sharing feedback

## Scope and status

The user requested all *visual-design* values across client styles, in separately approved batches. This is **the first independently tested portion of Batch 3**, not completion of auth/public/sharing. `packages/client/src/styles/tokens.ts` now defines light/dark `audienceColors` plus shared `audienceTypography` and `audienceRadii`, emitted as `--bb-audience-*` by the same global stylesheet installed at startup.

This portion moves the standalone auth chrome, auth route canvas/intro backgrounds, public chrome and page canvas, sharing device success/error feedback, broadcast state indicators/headline/copy and selected share-dialog status colors to theme-aware tokens. Reuses the existing `--bb-color-error-text` token rather than defining a second text-error palette. The test suite covers light/dark token emission, semantic consumers, small-text contrast and selector compilation. Touch sizes, responsive cutoffs, API status behavior, map geometry and forced-colors system values remain functional/local.

**Outstanding Batch 3b:** most auth form and public hero/health/footer styling, and other sharing dialog/list type, spacing, radii, effects and colors remain local; they have **not** yet been migrated. They require another reviewed, tested, pushed change before this category can be considered complete. Batches 4–5 and a final audit still remain (see `../../../docs/CLIENT_STYLE_TOKEN_MIGRATION.md`). Pause for user approval before 3b.

## Visual evidence

- Local Chromium screenshots at **390×844** and **1007×700** for `/_auth/login`, `/_public/landing` and `/_public/health` in **light/dark**. Files are named `before-{light,dark}-{auth,public,health}-{mobile,desktop}.png` and `after-…`. API requests were intercepted with example responses; these are fixture-backed guest captures, not proof of a live backend or a signed-in user session.
- **Auth/login and public/landing:** all eight before/after screenshot pairs were pixel-identical (`compare -metric AE`: **0** different pixels). Their sampled computed chrome colors/backgrounds/borders/type/size also matched, with no overflow or page errors.
- **Public health:** computed sampled styles/geometry matched. The four image pairs differed only in the live **last-checked timestamp**, in a 46–50×10px text area (233–356 pixels); no layout or palette differences were observed. The API fixture does not verify actual service availability.
- An in-browser CSS variable probe on the public chrome confirmed that overriding `--bb-audience-publicBrand`, `--bb-audience-font-chromeBrand` and `--bb-audience-radius-publicMark` changed computed values to `rgb(18, 52, 86)`, `32px` and `5px` respectively. Default config was not changed.
- Sharing feedback states are guarded by source-level theme/contrast tests. No authenticated sharing flow or live permission/revoke interaction was exercised locally.

## Validation

Full client Vitest: **268 files / 1,774 tests passed**. Vue and E2E TypeScript checks, Vite production build and `git diff --check` passed. The existing large-chunk advisory from Vite was non-fatal. No release or merge performed.
