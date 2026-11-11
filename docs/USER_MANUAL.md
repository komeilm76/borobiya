# User manual

The user application is a right-to-left mobile experience served from the same origin as the API. It works in a browser and can be installed through the web app manifest. Offline static assets and map tiles remain available through the service worker; private account data requires a signed-in connection.

## Account access

Start at `/_auth/login`. Enter your username and password; the primary button becomes active when the form is valid. Use the password visibility control if needed. New accounts are created through registration with five distinct security questions and answers. Recovery begins with a username lookup, continues through three selected questions and ends with a new password. A successful recovery signs out all existing sessions. Administrator-created accounts complete the same five security questions during onboarding before normal use.

Theme follows the system by default. You can explicitly choose light or dark. The choice is applied before the first paint so the screen does not flash. Active devices can be reviewed and revoked from the profile section; login history is available for auditing your own account.

## Loading, offline and keyboard access

The shell shows a loading skeleton while a view is fetched, an offline panel when navigation requires a route that has not been cached, and a retryable error panel if a view cannot be loaded. The service worker caches application routes and static assets; map tiles use a bounded offline cache. On reconnect, the realtime client resumes durable event synchronization instead of asking you to reload. Use the skip link at the start of the page to jump directly to the main content, and press `Ctrl` or `Command` plus `K` to open the command palette.

## Map and places

The map is the home surface. Use the four-part top selector to move between map, mission, companions and history. The search field finds destinations, and quick chips jump to saved places. The layers and compass controls adjust the view; recenter returns to your location. An accuracy circle shows how precise the current fix is. Live companions appear as ringed markers with freshness indicators.

A destination is selected by tapping the map: the sheet shows its coordinates and, with a fix available, the distance, and can save it as a place (name, label, address and icon). Saved places are listed, edited inline and deleted from the profile section. Every place has a name, label, coordinates, address, icon and rank; reordering exists as an API but not as UI yet. Live location sharing can be granted to another account for a bounded duration or for a historical range, and can be revoked at any time. History playback shows only locations that an active share authorizes.

## SOS and missions

The red SOS dock on the left edge requires a deliberate 0.8-second press-and-hold. The four-step form collects description, location confirmation, an optional photo and a final review; on the location step you can either adopt your current fix or arm tap-to-place and drop the incident pin anywhere on the map (a dashed marker marks a manually pinned location, and the review repeats that the position is manual) — the photo is resized and re-compressed in the browser before it is sent, so a camera frame does not blow past the server's size limit. Severity and incident types come from the server catalog. After submission, a tracking code and progress rail show creation, dispatch, acceptance, response and completion. You can cancel while the state machine permits it using a catalog reason — some reasons ask for a short written explanation (at least ten characters). Dispatchers see the nearest responders with distance, rating and readiness and pick the group and the people explicitly before anything is dispatched. Responders see dispatched requests as an offer card on the mission screen — severity, incident type, accuracy, whether the location was set manually, distance and the requester — and can accept or, if they cannot take it, cancel their own mission with a note. Once the mission is complete, the requester can rate it from one to five stars and attach an optional short note for the responders; the note is stored with the rating and shown on the mission card afterwards.

A responder follows the mission rail through travel, arrival, response and completion. A requester can rate a completed mission once. The same durable events update the browser, WebSocket subscribers and administrator dispatch board.

## Companions and talk

Companion rows show freshness, presence and sharing state. Each active share lists the counterpart and the direction of the share, and outgoing shares can be revoked from the same list. Search for an account before granting live sharing. One-to-one talk is press-and-hold: hold the amber microphone while speaking and release to stop. Only the current speaker sends audio, and the panel explicitly states that no audio is recorded. If the connection drops, the app reconnects with a fresh ticket and catches up through the durable event cursor.

## Profile

The fifth section contains account details, username changes, responder mission readiness, security readiness, devices, login history, saved places and sign-out. Responders get a readiness switch on this screen: dispatchers see it as ready/busy on the dispatch board. Recent logins (device, IP, success or failure) are listed at the bottom. Sign-out revokes the current session and closes the realtime connection. If an administrator deactivates the account, all sessions are revoked and the browser returns to login.
