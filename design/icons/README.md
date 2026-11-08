# Icon reference and inventory

This folder documents the icon system used by the clean rebuild. The overview image describes 146 selected icons, 375 total uses and 51 source files from the original reference inventory. The new implementation does not copy those source files; it ships a deterministic subset of the same Material Design Icons font and verifies every glyph used by the new browser application.

## Canonical inventory

`design/icons/icons.json` is the canonical list of icon names, roles, usage counts and legacy source files. Each entry begins with the `mdi-` prefix. The generator in `scripts/build-assets.mjs` reads the upstream CSS-mapping source in this design tree, combines it with the generator icon names and a curated set of names required by the new UI, then writes `public/assets/icons.css` and copies the single self-hosted webfont. The generated CSS contains only glyphs that actually exist in the font.

The asset test parses every literal `icon(...)` call in `public/js`, every catalog icon in `src/domain/catalog.ts` and every name in `icons.json`, then asserts that each name has a generated CSS rule. This is the equivalent inventory test for the rebuilt architecture. A missing glyph fails `npm test` and `npm run check` rather than producing a blank square in the interface.

## Size ramp

The overview uses a 76-pixel display icon. Standard interface sizes are 22, 20, 18 and 16 pixels, with 26 pixels reserved for prominent SOS, microphone and status controls. Icons are aligned on the physical right of right-to-left controls and are separated from labels by the shared 8-pixel spacing token. Icon-only buttons keep a 38 to 46 pixel touch target even when the glyph is smaller.

## Meaning and color

Status must never rely on color alone: every status pairs an icon, a label and a semantic color. Danger red is reserved for SOS, incidents and errors; amber marks talk or caution; teal marks primary actions and live presence; green marks success and availability; blue marks information. Decorative icons use muted text color. Icons inside filled buttons use the button foreground color.

## Operational rules

Do not reference an external icon CDN. Do not add a new `mdi-*` class without adding the same name to the generated subset. Do not edit the generated CSS directly; edit the asset generator input and rerun `npm run assets`. Keep icon names stable across server, browser and tests so the inventory check remains meaningful.
