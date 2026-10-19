# `@borobiya/client`

Vue 3 + Vite client shell using Vuetify, Tailwind CSS, Pinia, VueUse, and Vue Router. The application is Persian-first and RTL, with placeholder routes under `/_auth`, `/_public`, `/_user`, and `/_admin`. The Vite toolchain requires Node `^20.19.0 || >=22.12.0` (Bun 1.4.3 is the repository-pinned runner).

```bash
bun --filter @borobiya/client dev
bun --filter @borobiya/client test
bun --filter @borobiya/client typecheck
bun --filter @borobiya/client build
```

The browser uses same-origin `/api`, `/map`, `/map-config`, and `/route` paths. Vite proxies them to the API, Martin, and local routing gateway; Martin's root-relative tile, sprite, and font resources are also forwarded to the map server. `getMapConfig()` reads and validates the public `MAP_REGION`, `MAP_BBOX`, `MAP_DATA_VERSION`, and zoom settings from `/map-config`; backend service URLs remain proxy-only and are not exposed to browser code. `src/components/map/MapCanvas.vue` initializes MapLibre with the local light style, a Tehran center, source attribution, navigation/scale controls, and the public runtime zoom/bounds settings. Its reactive `styleUrl` prop and exposed `setStyle(url)` method switch between the local light/dark styles with a diff on the existing map instance, preserving the camera and DOM-backed markers. The full map/dashboard views, app-wide theme synchronization, and explicit map-server outage UX remain future tasks. Login, registration, password recovery, security-question onboarding, cookie-backed session restoration, and guest/user/admin route guards are implemented. The access token stays in memory; only a minimal user snapshot is kept in `sessionStorage`. Capacitor integration is also future work.
