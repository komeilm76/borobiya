# Borobiya v0.3.0

This is a **branch release** from `arena/c55d6f56-borobiya` after v0.2.0. The three workspace packages, lockfile and server-reported health/OpenAPI versions are 0.3.0. It is **not** the v1.0.0 production sign-off; the acceptance items in `docs/TASKS.md` remain open.

## Highlights since v0.2.0

- SOS and missions: dispatch/proposals, responder acceptance and mission progress/cancellation, participant notifications, ratings and request history, with authorization and transaction-focused regression coverage.
- Map and navigation: a full-screen user map with companion selection, search and history, opt-in broadcast controls, route preview/alternatives, turn guidance, arrival handling, a compact mobile planner and map-visible tools. Weak GPS is reported rather than inventing coordinates or legal speed limits.
- Sharing and accounts: revised recipient/device management and profile panels; transient auth-refresh and profile failures now recover after network reconnection without replaying old writes or inheriting consent across accounts. A map and toolbar icon reports **API health** (not GPS, tiles or realtime room state). Health probes now time out even if a transport ignores cancellation.
- Operations: LAN/HTTPS and VM deployment helpers, diagnostics, migration/schema checks, release-workflow scaffolding and offline routing/geocoding/elevation preparation. The Android project and signed APK are **not** included in this release.

## Upgrade and limitations

- Back up the database and application uploads before changing a live VM. Review and apply migrations **0013–0019** with the repository's VM/runbook process; the API does **not** migrate or seed automatically. Do not reset an existing database volume to upgrade.
- This tag is on the work branch, **not on `main`**. The main-only deployment Action will not deploy it, and the tag-triggered Android Action requires a tag on `main` and a configured protected production environment. Do not expect an APK or production deployment from this release.
- A physical-phone/browser outage/reconnect run, target-VM PostGIS/map/routing verification, full Playwright flow and Android install/signature checks are still outstanding. Unit/integration checks and the browser build are not substitutes for those acceptance runs. See `docs/TASKS.md` for the remaining work; T4.7.3 (v1.0.0 sign-off) remains open.
