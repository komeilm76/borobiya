# Administrator manual

The administrator console is a right-to-left desktop application served at `/_admin/overview`. It requires an administrator session and uses the same declarative API, durable events and realtime connection as the mobile app. The sidebar groups operations, management and system views. Ctrl K opens a quick navigation palette.

## Overview

The overview shows four KPIs: online responders, average response time, active missions and requests today. Trend notes are semantic and color-coded. The live operations map uses offline vector tiles with incident and responder markers. Group readiness cards show capacity, incident coverage and paused state. The alert card allows an unresolved item to be marked reviewed. The recent-requests table links to SOS detail. Use the refresh action to reload all console data; realtime events also trigger a refresh.

## Dispatch board

The dispatch board has a queue on the physical left, a map and nearest responders in the center, and incident detail with selected responders on the right. Select a queue card to load nearest responders for that incident location and type. Choose an active group and at least one responder, then submit the dispatch. The response updates the SOS state and emits durable events to the requester, responders and all administrators. The dispatch action cannot be repeated once the state machine has advanced.

## Users and groups

The users view provides four KPI cards, search, role and status filters, a paginated table, user detail, role changes, active-state changes, user creation and CSV export. Deactivating an account revokes all of its sessions and disconnects its realtime peers. The last active administrator cannot be removed, and an administrator cannot suspend or demote their own active account. Newly created users must complete five security questions during onboarding.

Groups expose name, color, capacity, incident coverage, status and membership. Add members by user identifier and choose member or leader role. Incident types are shown as a stable catalog with labels, icons and colors. Every mutation is recorded in the audit log.

## Reports, audit and settings

Reports show the seven-day request trend and status distribution. Audit shows a tracking code, actor, action, target, timestamp and IP address; CSV export escapes spreadsheet formulas. Alerts can be resolved from the alert view. Settings control automatic dispatch, default search radius, required mission readiness and maintenance mode. Health shows live peers, talk-floor counters, map cache size, database tables and uptime.

## CSV and operational safety

User and audit CSV responses use no-store headers and content-disposition attachments. They are generated server-side from the same filtered data as the tables. Do not paste exported values into spreadsheets without reviewing formula escaping. Use the audit tracking code when correlating an action with an application log or a user report. All administrator actions pass through the same service layer; there is no direct database console in the browser.
