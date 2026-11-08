# Release notes

## Version 2.0.0 — Bun and Vue migration

Release date: 2026-11-08. Branch: `arena/250278b6-borobiya`.

### Summary

Version 2.0.0 replaces the Node.js runtime and the hand-written browser modules of the 1.0.0 clean rebuild with a Bun-only runtime and a Vue 3 TypeScript application. One Bun process still serves the SPA, the JSON API, the offline SVG tiles and the realtime endpoint, but every runtime primitive is now Bun-native and every browser surface is a typed single-file component. The canonical design images under `design/` remain the visual contract, and the database schema is unchanged (`SCHEMA_VERSION = 2`).

### Runtime

- `Bun.serve` handles HTTP and WebSocket upgrades; the custom RFC 6455 implementation and the `node:http`/`node:stream` imports are gone.
- `bun:sqlite` replaces `node:sqlite`; the schema, the idempotent `photo_data_url` migration and the transaction boundary are unchanged.
- `Bun.password` hashes with Argon2id. Stored hashes remain self-describing, so the format is verifiable and upgradable.
- `Bun.file`, `Bun.write` and `Bun.Glob` replace every filesystem helper; `scripts/*.ts` run through `bun` and the `boro` shim only executes Bun.
- `bun run build` clears the previous bundle before building, so a rebuild of unchanged sources is byte-identical instead of accumulating stale hashed chunks.
- The toolchain is pinned to Bun 1.4.4 in `.bun-version`, `packageManager` and CI; CI installs that exact version from the npm registry tarball because the GitHub release CDN intermittently returns 504. `package-lock.json` is deleted and `bun.lock` is committed; CI installs with `bun install --frozen-lockfile`.
- `engines.node` and `@types/node` are removed, and no active source imports `node:http`, `node:stream`, `node:sqlite`, `node:fs` or `node:crypto` for runtime behavior.

### Browser application

- Vue 3.5 with `<script setup lang="ts">` in every view, layout and component; 20 views cover the four authentication screens, six mobile map screens and nine administrator screens.
- Vue Router 4 with typed `ROUTE_NAMES`, lazy view imports and role-aware guards.
- Vuetify 3 registered through `vite-plugin-vuetify`, compiled with the Borobiya design tokens; Tailwind CSS 4 through `@tailwindcss/vite` with preflight disabled so Vuetify's reset stays authoritative.
- Seven Pinia setup stores (`auth`, `map`, `sos`, `realtime`, `admin`, `settings`, `offline`) and VueUse for storage, online/network state, media queries, geolocation, debouncing and event listeners.
- Motion is declarative first: `<Transition>` and `<TransitionGroup>` for routes, sheets and live lists, `motion-v` with `@vueuse/motion` variants for cards and the command palette, and GSAP for one coordinated reveal timeline. Every duration is `0` under `prefers-reduced-motion`.
- The service worker is authored in TypeScript (`src/client/service-worker/sw.ts`) and compiled to the browser artifact at build time; `public/` is generated output and git-ignored.

### Preserved behavior

- Strict request envelopes, typed validators, typed errors, CSP, CORS, CSRF and origin checks, request IDs, no-store API responses, body limits, rate limits and static path safety.
- Preview-proxy trusted headers with sanitized `FRAME_ANCESTORS` (empty stays deny-by-default; no wildcard default), plus the omission of the conflicting `X-Frame-Options` header when frame ancestors are explicitly allowed.
- One-use IP-bound WebSocket tickets, audience-filtered durable events, cursor sync, presence, live location fan-out, SOS fan-out and binary push-to-talk.
- Sign-in accepts any provisioned secret while the 12-character/letters-and-numbers policy still applies where a password is chosen, so the documented bootstrap administrator password works on a fresh install.
- A push-to-talk hold streams for its whole duration; the per-frame payload ceiling is no longer mistaken for a session budget.
- An expired session during the profile device read clears the local session and redirects instead of raising an unhandled rejection.
- In the command palette, holding Ctrl/Cmd and pressing K registered the chord, and one arrow press moved the highlight two rows because both the window handler and the search-field handler counted the same event; the field now owns the step and stops the event.
- The palette announces its match count in a polite live region, so filtering to no results is no longer silent for a screen reader.
- The mission screen's rating form is reachable: it sat inside a block gated on the *active* mission, and an active mission by definition excludes completed ones, so the form could never render.
- Eight client view types now describe the payloads the API actually sends; the drift had emptied the administrator reports panel (`statuses` vs `statusCounts`), the overview trend (`{day,count}` vs `{label,value}`), the recent-requests panel, the open-alert KPI, the mission timeline, the share list keys, the map's initial zoom (`zoom` vs `defaultZoom`), the user activation toggle (`isActive` vs `active`) and the tracking code type.
- A contract test parses those interfaces and checks each against a live response, so a rename on either side fails the build.
- The profile device list reads the fields the API actually returns (`sessionId`, `lastActiveAt`, `isCurrentDevice`), so names and timestamps appear and the current session cannot revoke itself; revoking another device now uses `DELETE /_user/devices/:sessionId` instead of a route that did not exist.
- Password recovery checks the password policy before submitting, so a short or digit-free password is explained in place instead of being posted to earn an uninformative "Invalid request." from the server.
- The Vitest suite is hermetic: `tests/setup.ts` strips the repository `.env` from the environment, so `./boro check` and `bunx --bun vitest` agree.
- Full authentication, recovery, onboarding, SOS, dispatch, mission, administration, CSV export and audit behavior, with the production safety guards (`SEED_DEMO_USERS=0`, `COOKIE_SECURE=1`, `TRUST_PROXY=1`, unique administrator password).
- Service-worker versioned precache, stale-while-revalidate, private-route bypass and a bounded 256-entry tile cache.

### Validation

`bun run check` is the gate: it builds the Vue bundle and the service worker, typechecks the Bun server (`tsc`), typechecks the Vue client (`vue-tsc --noEmit`), runs the English-only documentation and clean-rebuild guard, and executes the Vitest suite with coverage. `./boro doctor`, `./boro verify`, `bun run bench`, `bun run smoke`, `bun run acceptance` and `./boro deploy:check` complete the release gate.

The suite is Vitest with `@vue/test-utils` and `happy-dom`, and covers core rules, HTTP contracts, authentication, security headers, realtime coordination, journeys, architecture, assets, the compiled service worker, accessibility contrast, performance budgets, the database migration, production guards, Vuetify component mounting, all 20 routed views plus the route guard, the mobile shell's realtime, geolocation and hold-to-SOS behaviour, Pinia stores, composables, the browser WebSocket transport and push-to-talk codec, and an in-process preview smoke. The documentation guard recognizes 24 required documents and 154 canonical design images.

Professional visual acceptance against the canonical PNG references remains a deliberately deferred human review: this release contains no browser-driven end-to-end sign-off, no screenshot comparison and no real-device testing.

### Operational notes

Install Bun 1.4.4, set a unique `ADMIN_PASSWORD`, disable demo seeding, enable `COOKIE_SECURE=1`, configure exact allowed origins, terminate HTTPS at a trusted proxy and persist the SQLite data directory. Audio is never stored. Use graceful shutdown and back up the database and WAL together. See `docs/DEPLOYMENT.md` and `docs/OPERATIONS.md` for the full procedure.

### Tag

The acceptance checklist is closed for this branch. No tag and no GitHub release are created from it.
