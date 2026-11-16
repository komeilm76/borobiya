# One map workspace: migration contract

The target is one `/_user/map` route and one mounted MapCanvas, with four top-level modes: **Missions**, **Trips**, **Sharing**, and **History**. `/_user/mission` becomes a legacy redirect only *after* the mission map and its private overlays have moved into the shared canvas. Do not implement a cosmetic tab bar that merely switches between two live map instances or silently drops a GPS watch on query changes.

## Interaction and safety rules

| State | Missions | Trips | Sharing | History | Mission offers |
|---|---|---|---|---|---|
| Idle | Available | Available | Available | Available | Available |
| Trip guidance active or awaiting GPS | Disabled | Available | Available | Disabled | Still received; acceptance needs explicit confirmation |
| Active mission | Available | Disabled | Available | Disabled | Existing mission remains available |

If a trip is active, accepting an offer must show a confirmation to **end the current trip and start the mission**. End/cancel the personal watcher, pending route requests and destination before calling the accept API; if stopping fails, do not submit acceptance. The confirmation must state that an unsuccessful accept does not restore the old trip. Sharing remains accessible in either mode; mission-specific rescuer sharing stays automatic, distinct from the general broadcast control.

Search is a **single shared map widget/controller** across modes. On Missions, selecting a result must offer an *explicit* add-as-intermediate-stop action, never replace the incident or silently commit a route. Search results, map interactions and live members must not leak across account or mission changes. Keep SOS, Stop guidance, keyboard focus and screen-reader labels usable while tabs or sheets are open.

## Incremental migration (do not mistake an intermediate step for completion)

1. **Safety boundary (implemented):** model mode availability and publish only the trip's active/pending flag and synchronous Stop callback to the proposal confirmation. Preserve the map instance on offer/tab query changes. This does **not** yet display tabs or remove the mission page.
2. **Shared shell:** expose accessible top tabs, selected mode in a stable map route (query changes must not remount the canvas), and a mode-aware proposal bell. Disable tabs according to the policy, including after server-verified mission changes. Preserve Sharing access during trip/mission navigation.
3. **One canvas:** move mission live-room markers, private target and route overlays onto the map's single MapCanvas, keeping private incident data scoped to the current verified mission. Extract shared search surface and map-camera controls; avoid duplicating personal-trip and mission GPS watchers. Mission-only search results offer explicit waypoint insertion.
4. **Retire legacy page:** redirect old mission bookmarks and accepted-offer links to Missions mode. Delete the separate mission view and redundant map lifecycle, then update route tests, manual, and navigation links. Confirm no concurrent canvases, stale private overlays, GPS consent regression or missing SOS/Stop controls.

## Verification gates

Unit tests must not mount Vue SFCs (`docs/TASKS.md`). Add pure policy tests plus source/compiled-style wiring tests; verify stop-before-accept in foreground and weak-GPS pending states, account changes, rejected accepts and stale callbacks. Run typechecks, lint, full tests and build per increment. Browser/device verification is still necessary for responsive tab overlap, modal focus, map/sheet stacking, safe areas, and switching with actual navigation; source tests cannot prove these visually.
