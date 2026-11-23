# `/_user/devices` — button radius follow-up: global configuration

## What to edit

The existing global design configuration is **`packages/client/src/styles/tokens.ts`**. In its `radii` object, change:

- `button: 12` for ordinary flat/tonal/outlined text buttons (and the larger end-session and confirmation actions on this page).
- `"button-compact": 8` for `size="small"` and `size="x-small"` actions, including the 28px-high **تازه‌سازی** refresh button. For example, changing `8` to `6` will reduce their corners after a client rebuild/reload.

`main.ts` installs these values as `--bb-radius-button` and `--bb-radius-button-compact` CSS variables. The shared selector in `styles/tailwind.css` now targets Vuetify's actual `.v-application` root and teleported `.v-overlay-container`, instead of relying on a bare `.app-shell` class that the app does not render. Page-specific larger actions consume the **same** normal-button variable. CSS uses low-specificity `:where(...)` exclusions so intentional component overrides still win. Icon circles, tiles, pills and explicit `rounded` variants keep their own shapes.

`tokens.ts` also configures existing spacing, card/nested radii, typography, light/dark palettes and shadows. Token-backed styles respond to edits in that one file; **some legacy component-local values and explicit overrides are not token-backed**. The existing [developer guide](../../../docs/DEVELOPMENT.md#client-design-tokens) explains the boundary. This change does not claim to migrate every CSS declaration in the app.

## Evidence and review

- **Before:** Earlier genuine signed-in screenshots `real-current-{mobile,tablet,desktop}.png` in this directory show the original 4px page actions. The prior fixture-backed `radius-after-{mobile,tablet,desktop}.png` shows the intermediate 16px control shape; the user reported the small refresh button was too rounded. No authenticated screenshot of that intermediate state was supplied.
- **After, fixture-backed only:** `configured-radius-{mobile,tablet,desktop}.png` at 390/645/1007px. A local browser with intercepted auth/device API measured the share action **12px**, refresh **8px**, end-session **12px**, both dialog actions **12px**, and the back icon **50%**; the same button values were observed in local dark mode. Row geometry and document widths were unchanged; no page errors or horizontal overflow.
- **Runtime propagation check:** changing the document CSS variables to normal `10px` and compact `6px` in the browser immediately changed share/end to `10px` and refresh to `6px`. This verifies that editing the config-generated values changes rendered controls.
- **Genuine signed-in after** for the latest configuration is still pending at mobile, tablet and desktop sizes. Do not present the local fixture screenshots as authenticated evidence.

## Tests, disposition and limits

- Full client Vitest: **266 files, 1,767 tests passed**. Vue TypeScript, E2E TypeScript, Vite production build, and diff check **passed**. The build's existing large-chunk advisory was non-fatal.
- Source tests verify that `tokens.ts` emits both CSS variables, shared defaults reach the app root while respecting explicitly rounded/icon controls, and page-specific larger actions use the global normal-button variable.
- This follow-up addresses the user's refresh-radius correction and central configuration request without changing card/row radii or unrelated component-local styles. App-wide defaults may change unrounded buttons outside this page; explicit rounded variants remain as authored. A full migration of every legacy style value is a separate larger project. No release or merge.
