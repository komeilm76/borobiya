# Administrator manual

The administrator console is a right-to-left desktop application served at `/_admin/overview`. It requires an administrator session and uses the same declarative API, durable events and realtime connection as the mobile app. The sidebar groups operations, management and system views. Ctrl K opens a quick navigation palette.

## Overview

The overview shows four KPIs: online responders, average response time, active missions and requests today. Trend notes are semantic and color-coded. The live operations map uses offline vector tiles with incident and responder markers. Group readiness cards show capacity, incident coverage and paused state. The alert card allows an unresolved item to be marked reviewed. The recent-requests table links to SOS detail. Use the refresh action to reload all console data; realtime events also trigger a refresh.

## Access and keyboard support

The skip link moves focus directly to the main content, and `Ctrl` or `Command` plus `K` opens the command palette. Use the arrow keys, `Home`, `End` and `Enter` to navigate palette results, and `Escape` to close it. Active navigation items expose `aria-current`, and dialogs keep keyboard focus inside the modal until they close. Focus returns to the control that opened a dialog.

## Dispatch board

The dispatch board has a queue on the physical left, a map and nearest responders in the center, and incident detail with selected responders on the right. Select a queue card to load nearest responders for that incident (the search point and the incident filter derive from the SOS record itself, nearest first; distance, rating and readiness are null-safe when unknown). Choose an active group and at least one responder, then pick how the dispatch goes out: **offer** sends each named responder an offer that they must accept (a single named responder is also pinned as the assigned responder for legacy readers; multi-recipient offers are identified by the offers table only), or **immediate** assigns exactly one responder without an acceptance step — the SOS moves straight to `accepted` and the mission starts in the `assigned` state, from which the worker presses start to begin the journey. The response updates the SOS state and emits durable events to the requester, responders and all administrators. Eligibility is per responder job type: a `ready_only` worker who is not on standby blocks the dispatch and is listed by the server; `all`-policy workers may be offered regardless of readiness and become ready on acceptance. The dispatch action cannot be repeated once the state machine has advanced.

## Mission teams and support requests

The dispatch board offers a third dispatch mode, **team dispatch**. Switch to it to create a team mission in place of an ordinary offer or immediate assignment: pick the group, an explicit leader (who must be an active member of that group) and a per-type composition (job type and quantity, built from the catalog). Optionally add immediate riders — everyone except the chosen leader — who join at creation. A rejected dispatch keeps the panel open and shows the server's reason.

The support-requests queue (sidebar, with a live pending-count badge) lists requests filed by team leaders asking to staff the shortage of their required composition. Each pending request opens a review drawer: the required lines versus the filled count, an optional administrator note, a candidate picker (search by username, filter by job type; ineligible responders are listed with their reason — already on a mission, not ready, inactive — but cannot be selected) and a decision. **Full approval** stays disabled until the picked workers exactly match the approved quantities for every line (the server enforces the same hand-count-for-hand rule and returns 409 otherwise). **Partial approval** stays disabled until at least one line is approved below its requested quantity. **Rejection** posts no workers. Double review is refused with 409.

Roster management happens in the same team drawer on an in-flight mission: add members by username search, remove a member only after a two-step confirmation (the leader cannot be removed), designate a new leader after a two-step confirmation (the previous leader remains a member), and edit the required composition with the requirements editor. Removed members and their reasons stay visible to administrators only. Every action is audit-logged.

## Users and groups

The users view provides four KPI cards, search, role and status filters, a paginated table, user detail, role changes, active-state changes, user creation and CSV export. Deactivating an account revokes all of its sessions and disconnects its realtime peers. The last active administrator cannot be removed, and an administrator cannot suspend or demote their own active account. Newly created users must complete five security questions during onboarding.

Groups expose name, color, capacity, incident coverage, status and membership. Add members by user identifier and choose member or leader role. Incident types are shown as a stable catalog with labels, icons and colors. Every mutation is recorded in the audit log.

The job-types screen lists the catalog with the number of active responders per type and lets you create a type or edit its policy and activation state. The `all` policy offers work regardless of readiness (acceptance flips the worker ready inside the same transaction; Policy A). The `ready_only` policy offers only to workers on standby at dispatch and at acceptance (Policy B). A responder without an explicit job type — or with an inactive one — is treated with the strictest `ready_only` policy. Assign a job type to a responder from the users view; responders created before this existed keep working and can be typed at any time.

## Reports, audit and settings

Reports show the seven-day request trend and status distribution. Audit shows a tracking code, actor, action, target, timestamp and IP address; CSV export escapes spreadsheet formulas. Alerts can be resolved from the alert view. Settings control automatic dispatch, default search radius and maintenance mode (the former `mission_ready_required` toggle is deprecated and no longer enforced; per-job-type offer policies in the job-types screen supersede it). Health shows live peers, talk-floor counters, map cache size, database tables and uptime. The mission-offers endpoint (`/_admin/mission-offers`, filterable by status) reports every offer row and its policy, accepted/declined outcome and responder for dispatch-board monitoring; the users CSV now carries the responder job type.

## CSV and operational safety

User and audit CSV responses use no-store headers and content-disposition attachments. They are generated server-side from the same filtered data as the tables. Do not paste exported values into spreadsheets without reviewing formula escaping. Use the audit tracking code when correlating an action with an application log or a user report. All administrator actions pass through the same service layer; there is no direct database console in the browser.
