# `@borobiya/client`

Vue 3 + Vite client using Vuetify, Tailwind CSS, Pinia, VueUse, and Vue Router. The application is Persian-first and RTL, with auth, public, user, and admin route groups. The Vite toolchain requires Node `^20.19.0 || >=22.12.0` (Bun 1.4.3 is the repository-pinned runner).

```bash
bun --filter @borobiya/client dev
bun --filter @borobiya/client test
bun --filter @borobiya/client typecheck
bun --filter @borobiya/client build
```

The browser uses same-origin `/api`, `/map`, `/map-config`, `/route`, `/geocode`, and `/reverse` paths. Vite proxies those requests to the API, Martin, and the local routing gateway; Martin's root-relative tile, sprite, and font resources are forwarded to Martin without rewriting the public `Host` header. The browser never receives upstream service URLs.

`getMapConfig()` validates public region, bounds, version, and zoom settings. The reusable `MapCanvas.vue` loads local styles, configures runtime bounds/zoom, provides attribution/navigation/scale controls, switches light/dark styles without replacing the map instance, and reports service failures with retry and cached-resource fallback. The MapLibre worker is served as a raw asset by Vite in development and production. On secure origins, the map-only service worker caches successful same-origin styles, tiles, sprites, and glyphs; the in-memory MapLibre tile cache remains available when service workers are unavailable.

The protected user map and dashboard map widget compose `MapCanvas` and follow the resolved app theme. The theme store persists system/light/dark choice, tracks `prefers-color-scheme`, and synchronizes Vuetify with Tailwind's manual dark variant. Search, route planning UI, live locations, and Android/Capacitor packaging remain future work; see [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md).
