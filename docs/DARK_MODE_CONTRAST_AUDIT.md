# Dark-mode surface contrast audit

Source-level sweep of all 50 client `.vue` files (map, mission, settings, sharing, shell, SOS, admin, auth, public and user views), the three shared CSS files, and the Vuetify/theme token wiring. This is **not** a rendered-browser or physical-device certification.

## Repeated problems and corrections

- The old dark card `#1b292a` barely separated from the page `#111c1d` (1.16:1). The shared raised surface is now `#294043` (1.58:1); hard-coded old overlay fills and device/auth fills follow the token rather than drifting away from Vuetify.
- Inset rows and selectable widgets used 3–6% translucent fills and 10–18% borders. A shared inset `#304749` and boundary `#82aaa5` now give interactive controls and inset sections a distinct layer. The boundary is at least 3:1 against both the card and the inset. Light mode keeps its existing surfaces.
- The stronger surface reduced contrast for some small semantic labels. Dark error, success, info and accent colors were adjusted so the semantic palette, muted copy and primary text remain at least 4.5:1 even over a 94%-opaque dark map card on a white tile. This includes the formerly dim red SOS icon, rating stars and disabled companion labels.
- The source sweep covered navigation, route and transport choices, guidance telemetry, map search/history/companions, sharing recipient and preset controls, profile/sidebar/proposal widgets, devices, missions, SOS, admin tables/dispatch, auth and public cards. Selected, urgent, warning and disabled treatments retain their own distinct states; phone guidance keeps its three-value layout.

`packages/client/src/styles/dark-layer-contrast.test.ts` measures these pairings, checks source coverage across every client widget/view directory, and pins the key dark overrides without mounting Vue files. Existing compiled-scoped-CSS, history/companion and admin contrast tests exercise the affected selectors.

## Follow-up: stock map and utility controls

The second pass caught a pale MapLibre loading canvas and light-only stock zoom/attribution controls, plus faint sharing rows, sidebar launchers, auth-home and public-health buttons. Dark map placeholders and MapLibre control groups now follow the theme, with readable inverted stock zoom icons, dark attribution/scale backgrounds and accent-colored attribution links. The user map's custom two-tone compass is **excluded** from stock-icon inversion; forced-colors mode keeps the browser's own control colors. Share rows and the remaining action outlines use the tested inset/outline tiers. This does not modify the map's own street, terrain or label styling or hide attribution.

## Rendered public/auth follow-up

Headless Chromium at 390px and 1280px showed differentiated dark landing, health and login surfaces. A standalone registration render exposed a Vuetify `warning` fallback: its default `#fb8c00` text was only ~3.94:1 after the 12%-opacity tonal underlay was composited over the dark raised card. The dark Vuetify warning token now uses `#fbd582` (~5.88:1 on that card and at least 4.5:1 over tested inset/translucent surfaces); light retains the original default. The shared theme token also covers warning chips and alerts in mission, SOS history and admin flows. Local API failures during registration were caused by running Vite without the backend, not a production API finding.

## Still to verify visually

Check authenticated screens, the real composited result on iOS Safari and at text zoom (including dialogs/teleported overlays and live map tiles). Source tests and public/auth browser checks cannot establish every actual pixel contrast or the visual balance of all transient Vuetify states; address any device-specific misses from screenshots rather than assuming this audit proves full WCAG conformance.
