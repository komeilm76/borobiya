# One map workspace (`/_user/map`)

The user map owns the **only MapCanvas** used for personal trips, rescuer mission execution, live companion sharing and location history. `/_user/mission` redirects to `/_user/map?tab=missions` (including any existing query parameters). Offer review remains available from the global bell even when Missions is disabled; its details no longer mount a second WebGL map. The MissionLivePanel still supports its own canvas in the unrelated requester/admin detail pages, but uses the map's existing instance and Marker constructor in the rescuer workspace. This preserves the separate authenticated mission room and route state without duplicating the map lifecycle. The current embedded mission component retains its filename, `UserMissionView.vue`, but is no longer routed as a page.

## Interaction and safety rules

| Verified state | Missions | Trips | Sharing | History | Mission offers |
|---|---|---|---|---|---|
| Idle | Available | Available | Available | Available | Available |
| Trip guidance active or awaiting GPS | Disabled | Available | Available | Disabled | Still received; acceptance needs explicit confirmation |
| Active mission | Available | Disabled | Available | Disabled | Existing mission remains available |
| Mission status unavailable | Available unless already navigating a trip | Only an already-started trip remains accessible | Available | Disabled | Inbox remains separate from status |

A pending personal Start counts as a trip. Accepting an offer during a trip explicitly confirms ending it first; its watcher, route requests and destination are cleared **before** the accept API request. A failed Stop blocks acceptance. Failed acceptance does not restore the old trip. An assignment received on another device also stops a local personal trip before the mission can take over the canvas. The automatic rescuer mission-room publisher remains app-owned across tabs/pages and distinct from the general broadcast icon; Sharing remains accessible in either navigation state.

The same `PlaceSearchPanel` and `usePlaceSearch` serve every mode, including phone guidance. On an active mission, a selected result opens an explicit add-*intermediate-station* dialog; confirmation stops guidance before mutating the mission's waypoint list, never replaces the incident. With no verified mission, the add action is disabled. The shared map releases its installed-library camera clamp for mission incidents outside coverage and restores it for personal modes. Mission/member overlays are scoped to the authenticated mission and removed on session change or verified end. Source tests cannot substitute for browser/device testing of GPS permissions, camera transitions, overlay stacking, focus, safe areas and short phones.

## Verification

Unit tests do not mount Vue SFCs (`docs/TASKS.md`). Pure policy/handoff tests, compiled-template/source wiring, route redirects, store lifecycle tests and repository checks should run before push. Device/browser verification is still required, especially accepting an offer mid-guidance, switching Sharing while mission navigation runs, GPS-denied search and mission completion after a network outage.
