# User manual

The user application is a right-to-left mobile experience served from the same origin as the API. It works in a browser and can be installed through the web app manifest. Offline static assets and map tiles remain available through the service worker; private account data requires a signed-in connection.

## Account access

Start at `/_auth/login`. Enter your username and password; the primary button becomes active when the form is valid. Use the password visibility control if needed. New accounts are created through registration with five distinct security questions and answers. Recovery begins with a username lookup, continues through three selected questions and ends with a new password. A successful recovery signs out all existing sessions. Administrator-created accounts complete the same five security questions during onboarding before normal use.

Theme follows the system by default. You can explicitly choose light or dark. The choice is applied before the first paint so the screen does not flash. Active devices can be reviewed and revoked from the profile section; login history is available for auditing your own account.

## Map and places

The map is the home surface. Use the four-part top selector to move between map, mission, companions and history. The search field finds destinations, and quick chips jump to saved places. The layers and compass controls adjust the view; recenter returns to your location. An accuracy circle shows how precise the current fix is. Live companions appear as ringed markers with freshness indicators.

Saved places can be created, edited, reordered and deleted from the profile section. Every place has a name, label, coordinates, address, icon and rank. Live location sharing can be granted to another account for a bounded duration or for a historical range, and can be revoked at any time. History playback shows only locations that an active share authorizes.

## SOS and missions

The red SOS dock requires a deliberate 0.8-second press-and-hold. The four-step form collects description, location confirmation, an optional compressed photo and a final review. Severity and incident types come from the server catalog. After submission, a tracking code and progress rail show creation, dispatch, acceptance, response and completion. You can cancel while the state machine permits it using a catalog reason.

A responder follows the mission rail through travel, arrival, response and completion. A requester can rate a completed mission once. The same durable events update the browser, WebSocket subscribers and administrator dispatch board.

## Companions and talk

Companion rows show freshness, presence and sharing state. Search for an account before granting live sharing. One-to-one talk is press-and-hold: hold the amber microphone while speaking and release to stop. Only the current speaker sends audio, and the panel explicitly states that no audio is recorded. If the connection drops, the app reconnects with a fresh ticket and catches up through the durable event cursor.

## Profile

The fifth section contains account details, username changes, security readiness, devices, login history, saved places and sign-out. Sign-out revokes the current session and closes the realtime connection. If an administrator deactivates the account, all sessions are revoked and the browser returns to login.
