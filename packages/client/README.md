# `@borobiya/client`

Vue 3 + Vite client shell using Vuetify, Tailwind CSS, Pinia, VueUse, and Vue Router. The application is Persian-first and RTL, with placeholder routes under `/_auth`, `/_public`, `/_user`, and `/_admin`. The Vite toolchain requires Node `^20.19.0 || >=22.12.0` (Bun 1.4.3 is the repository-pinned runner).

```bash
bun --filter @borobiya/client dev
bun --filter @borobiya/client test
bun --filter @borobiya/client typecheck
bun --filter @borobiya/client build
```

The browser uses same-origin `/api`, `/map`, `/map-config`, and `/route` paths. Vite proxies them to the API, Martin, and local routing gateway; Martin's root-relative tile, sprite, and font resources are also forwarded to the map server. `getMapConfig()` reads and validates the public `MAP_REGION`, `MAP_BBOX`, `MAP_DATA_VERSION`, and zoom settings from `/map-config`; backend service URLs remain proxy-only and are not exposed to browser code. Login, registration, password recovery, security-question onboarding, cookie-backed session restoration, and guest/user/admin route guards are implemented. The access token stays in memory; only a minimal user snapshot is kept in `sessionStorage`. Remaining feature views, MapLibre, and Capacitor integration are future work.
