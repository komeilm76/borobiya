# Administrator console reference

This folder defines the desktop operations console. The reference set contains 21 images across six groups: dashboard, users, dispatch, reports, groups and system views. The clean rebuild implements these surfaces in a dependency-free browser module served from the same origin as the API. All documentation here is English; the product interface is right-to-left.

## Layout

The reference canvas is 1440 by 900. A 264-pixel sidebar sits on the physical right, a 68-pixel top bar spans the remaining width and the content area is 1176 pixels with 28-pixel padding. The dispatch rail is 1148 pixels. Cards use a 16-pixel radius, buttons an 11-pixel radius, table headers `#F7FAF9`, row lines `#EFF4F2`, card edges `#E3EAE8` and a rail background `#FBFDFC`. Chart grid lines use `#E8EEEC`; chart series are teal, amber, blue, brown and green.

The sidebar groups navigation into operations, management and system sections and shows the active administrator at the bottom. The top bar contains a breadcrumb on the physical right, a global search with a keyboard hint, notifications, help and an account avatar. The first table column starts on the right, status appears on the left and row menus occupy a fixed 48-pixel column. A left chevron opens detail views.

## Overview

The overview title is accompanied by report and refresh actions. Four KPI cards show online responders, average response time, active missions and requests today, each with a semantic trend note. The lower grid contains a live operations map with incident markers, group readiness cards, a recent-requests table and a system-alert card. KPI values and tables are populated from the administrator API, not from decorative constants.

## Dispatch board

Dispatch uses three columns: the SOS queue on the physical left, a live map and nearest responders in the center, and incident detail, selected responders and the dispatch action on the right. Selecting a queue card loads the nearest-responder query for the incident location. The chosen group and responders are submitted through the dispatch endpoint; the resulting durable event updates the API, realtime sockets and the board together.

## Users and management

The users view contains four KPI cards, status filters, role filters, search, a paginated right-to-left table, user detail, role and active-state editing, user creation and CSV export. Group views expose capacity, incident coverage, membership and readiness. Incident types are shown as a stable catalog. Reports provide a seven-day trend and status distribution. Audit shows tracking codes, actors, actions, targets, timestamps and IP addresses with CSV export. Alerts can be resolved; settings control automatic dispatch, search radius, mission readiness and maintenance mode.

## Consistency rules

Every table column, filter and action maps to a declared API route. Charts use the shared series colors. Status combines color, icon and text. Detail actions never bypass the service layer or the durable event log. The console is responsive below 900 pixels by collapsing the sidebar into a compact horizontal rail while preserving full table access through horizontal scrolling.
