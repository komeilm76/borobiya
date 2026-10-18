````markdown
# Borobiya — Project Prompt & Technical Specification

> **Project Name:** Borobiya
> **Type:** Location Sharing & SOS Rescue Platform
> **Platforms:** Admin Web Panel + User Web App + Android App (Ionic + Vue)
> **Map Engine:** Self-Hosted Vector Map (PBF / SVG) via MapLibre — Fully Offline Capable
> **Last Updated:** 2025

---

## Table of Contents
1. [Introduction & Goals](#1-introduction--goals)
2. [Platform Architecture](#2-platform-architecture)
3. [Map Service — Fully Independent, Offline, Vector](#3-map-service--fully-independent-offline-vector)
4. [Theming — Dark / Light](#4-theming--dark--light)
5. [Search & Geocoding](#5-search--geocoding)
6. [Routing & Navigation](#6-routing--navigation)
7. [Location Sharing System](#7-location-sharing-system)
8. [Authentication System](#8-authentication-system)
9. [User Management by Admin](#9-user-management-by-admin)
10. [Security, Rate Limit & Suspension](#10-security-rate-limit--suspension)
11. [SOS Rescue Service — Full Workflow](#11-sos-rescue-service--full-workflow)
12. [Real-time & Disconnection Handling](#12-real-time--disconnection-handling)
13. [API Route Structure: _admin, _user, _auth, _public](#13-api-route-structure-_admin-_user-_auth-_public)
14. [Tech Stack — Mandatory Tools](#14-tech-stack--mandatory-tools)
15. [Role of Zod + km-api + Zopia (Shared Contract)](#15-role-of-zod--km-api--zopia-shared-contract)
16. [UI/UX Requirements](#16-uiux-requirements)
17. [Data Storage & Retention](#17-data-storage--retention)
18. [Documentation Requirements](#18-documentation-requirements)
19. [Workflows & CI/CD](#19-workflows--cicd)
20. [Deployment & Environments](#20-deployment--environments)
21. [Collaboration Model](#21-collaboration-model)
22. [Non-Functional Requirements](#22-non-functional-requirements)
23. [Summary Checklist](#23-summary-checklist)
24. [Appendix](#24-appendix)

---

## 1. Introduction & Goals

**Borobiya** is a location-sharing and emergency rescue system. Users can:
- Share their live location with other members continuously or for a limited time.
- Share location history for a specific time range (e.g., last 7 days).
- Perform professional routing with multi-destination support for Car / Bicycle / Walking.
- Search for users (advanced search) and for places/addresses.
- Send SOS requests in emergencies and participate in rescue missions coordinated by Admin.

The product consists of:
1. **Admin Panel (Web)** — exclusive for main admin(s).
2. **User Platform (Web)** — browser-based for all authenticated users.
3. **Android App** — built with Ionic + Vue, feature-parity with Web App.

**Development Phase Philosophy:** No excessive strictness during development, but documentation must be **fully transparent, clear, practical, and high-quality** for both Human Developer and AI Assistant.

---

## 2. Platform Architecture

### 2.1. Core Apps
- **Admin Web App:** Vue + Vuetify + Tailwind + Vite + Pinia + VueUse + MapLibre
- **User Web App:** Same stack as above
- **Android App:** Ionic + Vue (Capacitor wrapper) sharing 90%+ codebase with User Web App
- **Backend API Server:** Fastify + TypeScript + PostgreSQL (with PostGIS) + Socket.IO + OpenAPI
- **Independent Map Server:** Self-hosted Vector Tile Server + Routing Engine + Geocoding Engine (separate service/container)

### 2.2. High-Level Architecture
```
[ Web Admin ] --┐
[ Web User  ] --┼--> [ Fastify API Server + Socket.IO ] --> [ PostgreSQL + PostGIS ]
[ Android   ] --┘              |
                               |
                               +--> [ Independent Map Server ]
                                     - Vector Tiles (PBF)
                                     - Styles (Dark/Light JSON)
                                     - Routing (OSRM / Valhalla / GraphHopper)
                                     - Geocoding (Nominatim / Photon / Pelias - offline)
```

- All clients consume Map Server for: `tiles/*.pbf`, `styles/*.json`, `route`, `geocode`, `reverse-geocode`.
- Map Server is **physically separate** — can be on same Docker Compose or separate VM/physical server, but **must be independently deployable**.

---

## 3. Map Service — Fully Independent, Offline, Vector

### 3.1. “Not Tile” — Precise Definition
- **FORBIDDEN:** Raster Tiles (`256x256.png`, `512x512.jpg`, Google Maps raster, OSM raster).
- **REQUIRED:** Vector Tiles:
  - **Primary:** `PBF` (Mapbox Vector Tile / MVT — protobuf format) — e.g., `/{z}/{x}/{y}.pbf`
  - **Secondary / Optional:** `SVG` for icons/markers/overlays (not for base map raster).
- Rendering must be done client-side via **MapLibre GL JS** using vector style JSON.

**Why Vector:**
- Instant Dark/Light theme switching without re-fetching tiles.
- Resolution-independent (crisp at any zoom/pitch).
- Smaller payload, better caching, more customizable.
- Supports 3D pitch, rotation, and camera angle for navigation.

### 3.2. “Fully Offline” — Precise Definition
“Fully Offline” means:
- The **entire system MUST work on a Local Area Network (LAN) with ZERO internet access**.
- No runtime dependency on `maps.googleapis.com`, `tile.openstreetmap.org`, `api.mapbox.com`, or any online provider.
- Map data, routing graph, and search index are **pre-packaged and hosted on the internal Map Server**.
- Clients only talk to:
  - `https://borobiya.local/api` (Main API)
  - `https://borobiya.local:8000` or `https://map.borobiya.local` (Map Server)

**Scenarios to support:**
1.  **LAN Deployment:** Company/Organization intranet without internet.
2.  **Device-Level Offline (Future/Fallback):** Ability to pre-download MBTiles/PBF packs for selected region to device (optional, but architecture must allow it).

### 3.3. Independent Map Server Architecture
Map Server is a **completely separate service** responsible for:

| Service | Tool Examples (Choose one, document choice) | Endpoint Example |
|---|---|---|
| **Vector Tile Serving** | Martin, Tegola, TileServer-GL (vector mode) | `GET /tiles/{z}/{x}/{y}.pbf` |
| **Tile Data Generation** | Tippecanoe, Planetiler, OpenMapTiles | Build pipeline |
| **Style Hosting** | Static JSON + Fonts + Sprites | `GET /styles/dark.json`, `GET /styles/light.json` |
| **Routing** | OSRM, Valhalla, GraphHopper (self-hosted) | `POST /route`, `POST /route/multi` |
| **Geocoding** | Nominatim (offline), Photon, Pelias, OpenCage offline | `GET /geocode?q=...`, `GET /reverse?lat=&lon=` |
| **Data Storage** | PMTiles, MBTiles, PostgreSQL/PostGIS | Internal |

**Requirement:** Document *exact* chosen stack and why.

### 3.4. Data Preparation, Update & Distribution
- **Source:** OpenStreetMap PBF dumps (e.g., `geofabrik.de`, `openstreetmap.fr` extracts) — processed offline.
- **Pipeline:**
  1.  Download `region.osm.pbf` (e.g., Iran, Tehran, custom AOI)
  2.  Generate vector tiles: `planetiler` / `tippecanoe` -> `tiles.pmtiles` / `mbtiles`
  3.  Build routing graph: `osrm-extract` + `osrm-contract` / Valhalla `build`
  4.  Build search index: Import to Nominatim/Photon DB
  5.  Deploy to Map Server volume / object storage
- **Update Mechanism (Must be documented):**
  - Manual trigger: Admin uploads new `region.osm.pbf` or admin runs `bun run map:update --region=iran`
  - Semi-automatic: Cron job checks for new dump weekly/monthly, builds in staging, admin approves promotion to production.
  - Versioning: `/tiles/v2025.05.01/{z}/{x}/{y}.pbf` or header `X-Map-Data-Version`
  - Zero-downtime switch via symlink/volume swap.
- **Distribution:**
  - In Docker: Map Server volume (`map-data:/data`)
  - On Windows Dev (without Docker): Local `data/maps/` folder + local Martin/Valhalla binary.

### 3.5. Geographic Coverage of Offline Data
- **Configurable via ENV / Config File:**
  ```env
  MAP_REGION=iran           # iran | tehran | middle-east | custom
  MAP_BBOX=44.0,25.0,63.0,39.0
  MAP_DATA_VERSION=2025-05-01
  MAP_MAX_ZOOM=14
  MAP_MIN_ZOOM=0
  ```
- Initial dev can use **single city/province** to keep size small (e.g., Tehran, 1-2GB).
- Architecture must be **horizontally scalable** to expand to whole country later without code change.
- Document disk/RAM requirements per region.

### 3.6. Map Features to Support
- Vector rendering with MapLibre GL JS
- Dark/Light style switching in <200ms via `map.setStyle()`
- Indoor not required, but outdoor roads/buildings/POIs required
- Offline Geocoding + Reverse Geocoding (address display on click)
- Offline Routing for 3 profiles

---

## 4. Theming — Dark / Light

- **App-Wide Themes:**
  - `light` and `dark` via Vuetify theme + Tailwind `dark:` variant
  - User preference stored in `localStorage` + backend `user.preferences.theme`
  - System preference detection via `prefers-color-scheme`
- **Map Theming:**
  - Two separate MapLibre Style JSONs: `styles/borobiya-light.json` and `styles/borobiya-dark.json`
  - Styles share same `sources` (same PBF tiles) but differ in `layers` paint (background, roads, labels, water, buildings).
  - When user toggles theme, app must call `map.setStyle(newStyle)` and preserve camera position/markers.
  - Ensure **sprites and glyphs** (fonts) work for both themes (white/black labels).

---

## 5. Search & Geocoding

### 5.1. Advanced User Search
- Endpoint: `GET /_user/users/search?q=&category=&incidentType=&minRating=&sort=distance`
- Filters: username (partial), category membership, incident specialty, rating, online status, distance from me.
- Must be paginated, debounced (300ms), and support autocomplete.

### 5.2. Place / Address Search (Geocoding)
- Endpoint via Map Server: `GET /geocode?q=Azadi+Square&limit=5&bbox=...`
- Powered by **self-hosted Photon/Nominatim/Pelias** with offline index.
- Returns: `placeId, name, address, lat, lon, type, importance`
- Must work offline (no Google Places).

### 5.3. Show Address of Selected Location (Reverse Geocoding)
- On map `click` or `long-press`: `GET /reverse?lat=35.70&lon=51.40`
- Returns formatted address: `Country, City, Street, House Number`
- Display in bottom sheet / popup. Should be copyable and shareable.

---

## 6. Routing & Navigation

### 6.1. Professional Router Requirements
- **Profiles:** `car`, `bicycle`, `foot` (walking) — each with different graph weights, speed, restrictions.
- **Multi-Destination (Waypoint) Routing:**
  - User can add N waypoints (e.g., A -> B -> C -> D)
  - Drag to reorder waypoints
  - Optimize order (TSP) optional toggle: `optimize=true`
  - Engine: OSRM `route` with `waypoints`, or Valhalla `optimized_route`
- **Alternative Routes:** Return 2-3 alternatives with `distance`, `duration`, `elevation` (for bike/foot).
- **Offline Routing:** All routing computed on **self-hosted Map Server**, not OSRM online.

### 6.2. Camera Angle During Navigation
- After `Start Navigation`, map must enter **Navigation Mode:**
  - **Car:** `pitch: 60`, `bearing: follow-compass`, `zoom: 17`, 3D perspective, map follows location with smooth animation.
  - **Bicycle:** `pitch: 45`, `zoom: 16`, slight 3D
  - **Walking:** `pitch: 0` or `15`, `zoom: 17`, top-down for better orientation
- Camera updates via `map.easeTo()` / `flyTo()` on location change (throttled 1s).
- Exit navigation returns to `pitch: 0`, `bearing: 0`.

---

## 7. Location Sharing System

### 7.1. Live Location Sharing
- User A can share live location with User B (or multiple users) via: `POST /_user/location/share`
- Payload:
  ```ts
  {
    targetUserIds: string[],
    mode: "timed" | "permanent",
    durationMinutes?: number, // e.g., 60, 1440; null if permanent
    note?: string
  }
  ```
- **Timed:** Auto-expires after `durationMinutes`. Cron cleans expired shares.
- **Permanent:** No expiry until manually revoked.
- **Revocable Anytime:** `DELETE /_user/location/share/:shareId` — immediately stops sharing.
- **Real-time:** Location updates via Socket.IO `location:update` every 3-5s (configurable, throttled to save battery).

### 7.2. Location History Sharing
- User can share history of their own track for a specific time window: e.g., last 7 days, custom range.
- Endpoint: `POST /_user/location/history/share`
  ```ts
  {
    targetUserIds: string[],
    from: ISODateString, // e.g., now - 7days
    to: ISODateString,
    maxPoints?: number // downsample if needed
  }
  ```
- Receiver can view history as polyline on map with time slider.
- **Max Storage Duration via ENV:**
  ```env
  LOCATION_HISTORY_RETENTION_DAYS=90   # after 90 days, data is pruned
  LOCATION_HISTORY_MAX_SHARE_DAYS=30   # user cannot share >30 days at once
  ```
  - Background job daily prunes `location_history` where `createdAt < now - RETENTION`.

### 7.3. Multi-Device Management & Priority Device
- Since user can be logged in on **Web + Android simultaneously**:
  - Settings page must show **Active Devices Table**: `deviceId, deviceName (e.g., Chrome Windows, Samsung S23), lastActiveAt, ip, isCurrentDevice`
  - Managed via `user_sessions` table + refresh tokens per device.
  - Viewable at `GET /_user/devices`
- **Critical Conflict Rule:**
  - If user has `activeDevices.length > 1` and tries to start **Live Location Sharing** or **SOS Mission** as rescuer (which requires sending location):
  - System MUST show **warning modal**:
    > “Your account is active on 2 devices. Please select which device should broadcast your location to avoid conflict.”
  - User selects `priorityDeviceId`. Only that device's GPS is accepted by server (others ignored).
  - Stored in `location_shares.priorityDeviceId`.
  - Can be changed anytime in Settings.

### 7.4. Privacy & Access Rules (Dev Phase)
- **Current Phase (Development):** No strict privacy rules. Simple model: if User A shared with User B, User B can see.
- **Future (Production — Must Be Planned, Not Implemented Now):**
  - Allowlist/blocklist per user
  - Granular time windows
  - Admin cannot see private shares unless in SOS context
- Document this as `TODO: Privacy v2` in codebase.

---

## 8. Authentication System

### 8.1. Login
- **Only:** `username` + `password` — No email, no phone number.
- Endpoint: `POST /_auth/login`
  ```ts
  { username: string, password: string } -> { accessToken, user }
  ```
  - Web: the refresh token is set only as an HttpOnly cookie, never returned in JSON.
  - Native: the refresh token may be returned in the body for platform secure storage.
- Username is **arbitrary unique identifier** (3-30 chars, alphanumeric + underscore, lowercase).
- Rate-limited: 5 attempts / 15min per IP+username.

### 8.2. Register
- Endpoint: `POST /_auth/register`
- Payload:
  ```ts
  {
    username: string,
    password: string,
    confirmPassword: string, // validated client + server via zod refine
    securityQuestions: [
      { questionId: string, answer: string },
      { questionId: string, answer: string },
      { questionId: string, answer: string },
      { questionId: string, answer: string },
      { questionId: string, answer: string }
    ] // length 5, unique questionId
  }
  ```
- **Rules:**
  - Password: min 8 chars, at least 1 letter + 1 number (configurable via zod)
  - 5 security questions from **predefined list** (seeded in DB, e.g., 15 questions)
  - **No duplicate question** allowed — validated via `zod.superRefine` + DB unique check
  - All answers hashed (see 8.4)

### 8.3. Forgot Password
- Flow:
  1.  `POST /_auth/forgot-password/request` with `{ username }`
  2.  Server randomly picks **3 out of the user's 5 questions** and returns **only question texts** (not answers): `{ questionIds: string[], questions: string[] }`
      - Selection is **server-decided** (random or deterministic via userId hash). Must not be client-chosen.
  3.  User answers: `POST /_auth/forgot-password/verify` with `{ username, answers: [{questionId, answer}] }`
  4.  If all 3 correct (hashed compare), server issues `resetToken` (short-lived 10min)
  5.  `POST /_auth/forgot-password/reset` with `{ resetToken, newPassword, confirmPassword }`

### 8.4. Secure Storage
- **Passwords:** Hashed with `argon2id` (preferred) or `bcrypt` (cost 12) — never plain, never reversible.
- **Security Answers:** **Also hashed** with same algorithm (argon2/bcrypt). 
  - Normalize answer before hash: `trim().toLowerCase()` (document this).
  - Question text itself is stored as `questionId` FK, not hashed.
- **Never** log passwords/answers.

### 8.5. User Creation by Admin
- Endpoint: `POST /_admin/users` (Admin only)
  ```ts
  { username: string, password: string, isActive?: boolean }
  ```
- Admin **does NOT need to provide security questions**.
- Created user has flag: `mustCompleteSecurityQuestions: true`
- On first login, middleware checks this flag and:
  - Returns `403` with code `SECURITY_QUESTIONS_REQUIRED`
  - Frontend **forces redirect** to `/_auth/complete-security-questions` (or `/_user/setup-security-questions`)
  - User **cannot perform any other operation** until 5 questions are completed.
  - Endpoint: `POST /_user/complete-security-questions` (or `/_auth/...`) with same 5-question payload as register.
- Admin's own account **does not require security questions** at all (`isAdmin` bypass).

### 8.6. Security Questions Data Model
- Table `security_questions` (seeded):
  ```
  id (uuid), text (string unique), createdAt
  ```
  Example seeds: "What was your first pet's name?", "What city were you born in?", etc. (15-20 entries)
- Table `user_security_answers`:
  ```
  id, userId (FK), questionId (FK), answerHash, createdAt
  Unique(userId, questionId)
  ```
- Validation: `securityQuestions.length === 5 && new Set(questionIds).size === 5`

---

## 9. User Management by Admin

- **Activate / Deactivate:**
  - `PATCH /_admin/users/:id/status` with `{ isActive: boolean }`
  - `isActive: false` means user cannot login, existing tokens revoked, SOS missions paused/reassigned.
  - Must be audited: `admin_audit_log` table.
- **Deletion:**
  - **STRICTLY FORBIDDEN.** No `DELETE /_admin/users/:id` endpoint must exist.
  - No soft-delete UI either. Only activate/deactivate.
- **List/Search Users:**
  - `GET /_admin/users?q=&isActive=&hasCategory=&page=&limit=`
- **View User Detail:**
  - Includes: active devices, rating, mission history, location sharing status.

---

## 10. Security, Rate Limit & Suspension

### 10.1. Minimal Threat Detection (Required)
Server must have:
- **Rate Limiting:** Using `@fastify/rate-limit` (Redis-backed if scaled)
  - Global: 100 req/min per IP
  - Auth endpoints: 5-10 req/min per IP+username
  - SOS creation: 3 req/min per user
  - Location update: 60 req/min per device
- **Suspicious Account Suspension:**
  - Auto-suspend logic if:
    - >10 failed login attempts in 15min
    - >50 location updates/sec (spam)
    - >10 SOS cancels in 1 hour (abuse)
  - Action: `isSuspended=true`, `suspendedUntil=now+24h`, `suspensionReason`
  - Admin can manually unsuspend: `PATCH /_admin/users/:id/unsuspend`
  - Notify user on next login: “Account suspended due to suspicious activity. Contact admin.”
- **Other Protections:**
  - Helmet headers, CORS strict allowlist via ENV
  - Input sanitization via Zod (no raw `req.body` usage)
  - SQL injection prevention via parameterized Drizzle queries and reviewed raw SQL
  - No sensitive data in logs
  - JWT: short accessToken (15min) + long refreshToken (7d) stored httpOnly cookie or secure storage (mobile)

---

## 11. SOS Rescue Service — Full Workflow

### 11.1. Admin: Incident Types & Categories

**Incident Types:**
- Created by Admin: `POST /_admin/incidents` { name, icon, color, description }
- Examples: `fire`, `flood`, `earthquake`, `medical`, `accident`, `lost`, `other`
- Table: `incident_types (id, name, slug, icon, color, createdAt)`

**Categories:**
- Created by Admin: `POST /_admin/categories` { name, description, incidentTypeIds: string[] }
- Each category can contain **multiple incident types**.
- Table: `categories (id, name, description, createdAt)`
- Pivot: `category_incident_types (categoryId, incidentTypeId)`
- Pivot: `category_users (categoryId, userId)` — many-to-many
- **Default:** All users are in **NO category**. Admin explicitly assigns.
- **Rule:** A user can be in **multiple categories**. A category can have **multiple users** and **multiple incident types**.

### 11.2. User: Send SOS Request

**Trigger:** Big SOS button (red, always accessible in User Web + Android).

**Form Fields (Required):**
1.  **Severity:** `low` | `medium` | `high` (enum, required)
2.  **Description:** free text, 10-500 chars
3.  **Incident Type:** dropdown from `incident_types` created by admin (required)
4.  **Location:**
    - Default: auto-fetch from device GPS (`navigator.geolocation`)
    - Fallback: **Manual pick on map** (user taps map to set `lat/lon`) — required if GPS fails/filtered.
    - Store: `lat, lon, accuracy, isManual`
5.  **Photo (Optional):**
    - Take via `Camera` (Capacitor Camera on Android)
    - Or pick from `Gallery`
    - Upload to `POST /_user/sos/requests/:id/photo` (multipart, max 5MB, jpg/png/webp)

**Endpoint:** `POST /_user/sos/requests`
```ts
{
  severity: "low" | "medium" | "high",
  description: string,
  incidentTypeId: string,
  location: { lat: number, lon: number, accuracy?: number, isManual: boolean },
  photoUrl?: string // after upload
} -> { requestId, status: "pending" }
```
- Table: `sos_requests (id, requesterId, severity, description, incidentTypeId, lat, lon, accuracy, isManual, photoUrl, status, createdAt)`

### 11.3. Admin: Receive & Manage Alert

- On SOS creation, backend:
  1.  Creates `sos_request` with `status: "pending"`
  2.  Emits Socket.IO event to admin room: `sos:new-request` with payload (including location)
  3.  Admin Panel shows **professional alert on map**: pulsing marker, red popup, sound notification (optional), sidebar list item with severity color.
- **Automatic Nearest Responder Suggestion:**
  - System query:
    ```sql
    SELECT u.id, u.username, ST_Distance(u.lastLocation, sos.location) as distance
    FROM users u
    JOIN category_users cu ON cu.userId = u.id
    JOIN category_incident_types cit ON cit.categoryId = cu.categoryId
    WHERE cit.incidentTypeId = :sosIncidentTypeId
      AND u.isActive = true
      AND u.isSuspended = false
      AND u.isOnMission = false
    ORDER BY distance ASC
    LIMIT 10;
    ```
  - Requires `users.lastLocation` (PostGIS `GEOGRAPHY(Point,4326)`) updated via live location.
  - Returns top 10 nearest eligible rescuers.
  - Admin sees list with `distance`, `rating`, `lastActiveAt`, `categoryName`.
- **Admin Dispatch:**
  - Admin can select **any number** of suggested users and send rescue proposal:
    `POST /_admin/sos/requests/:id/dispatch` { rescuerIds: string[] }
  - Creates `mission_proposals` per rescuer with `status: "pending"`
  - Emits to each rescuer: `sos:proposal-received`

### 11.4. Rescuer: Receive & Accept Proposal

- Rescuer receives proposals via Socket + polling fallback.
- UI: Inbox/Bell icon with count, list of proposals: `incidentType, severity, distance, requesterName, photo, description, location`
- **Rules:**
  - Rescuer can see **multiple proposals simultaneously**.
  - But can **accept only ONE** at a time.
  - If `isOnMission = true`, **no new proposals** should be sent to them (filtered at dispatch query + runtime check).
  - Accept: `POST /_user/sos/proposals/:proposalId/accept`
    - Sets `proposal.status = "accepted"`, creates `mission` record, sets `rescuer.isOnMission = true`, auto-declines other pending proposals for that rescuer.
  - Decline: `POST /_user/sos/proposals/:proposalId/decline` { reason? }

- Tables:
  ```
  mission_proposals (id, sosRequestId, rescuerId, status: pending|accepted|declined|expired, createdAt)
  missions (id, sosRequestId, rescuerId, requesterId, status, createdAt, updatedAt)
  ```

### 11.5. Rescue Execution

**After Acceptance:**
1.  Map **zooms to fit both locations**: rescuer (`lastLocation`) + requester (`sos.location`) — `map.fitBounds([rescuerCoords, requesterCoords], {padding: 100})`
2.  Both parties + Admin can see each other **live** on map (see 12).
3.  Rescuer taps **“Go to Incident Location”** button.
4.  Rescuer chooses **Transport Mode**: `car` | `bicycle` | `foot`
5.  App calls Map Server `POST /route` with `from=rescuerLocation, to=sosLocation, profile=chosen` and shows **2-3 alternative routes** (polyline, distance, duration).
6.  Rescuer selects preferred route, taps **Start Navigation** → enters Navigation Mode (camera angle per 6.2).

### 11.6. Mission Status Updates (By Rescuer)

Rescuer MUST update status step-by-step via `PATCH /_user/missions/:id/status`:

| Order | Status Enum | Persian Label | When |
|---|---|---|---|
| 1 | `on_the_way` | در حال رفتن به محل حادثه | After starting navigation |
| 2 | `arrived` | به محل حادثه رسیدم | When within 50m of SOS location (auto-detect + manual confirm) |
| 3 | `in_progress` | در حال رسیدگی | After assessing situation |
| 4 | `completed` | ماموریت با موفقیت انجام شد | After resolving |

- Each update emits Socket event: `mission:status-updated` to `requester` + `admin` rooms.
- Admin & Requester see timeline UI with timestamps.

**Alternative Endings (Failure/Cancel) — See 11.7**

### 11.7. Mission Cancellation Rules (Critical)

#### A) Cancelled by Requester (Person Needing Help)
- Requester can cancel their own SOS: `POST /_user/sos/requests/:id/cancel`
- **Requires `cancellationReason`:** Must select from predefined reasons **BEFORE** cancel is accepted.
- Payload:
  ```ts
  { cancellationReasonId: string, customReason?: string }
  ```
- **Predefined Reasons for Requester:**
  - `need_resolved` — Need no longer exists
  - `self_resolved` — I resolved the problem myself
  - `helped_by_other` — Someone else helped me
  - `mistaken_request` — Request was sent by mistake
  - `other` — Other (requires `customReason` text, 10-200 chars)
- Flow:
  - Set `sos_requests.status = "cancelled_by_requester"`, `missions.status = "cancelled"` if mission exists
  - If mission active, emit `mission:cancelled-by-requester` to rescuer + admin
  - Rescuer's `isOnMission` set to `false` → now eligible for new proposals

#### B) Cancelled by Rescuer (Responder)
- **MUST NOT be easy.** UI should hide behind “More → Unable to continue” with confirmation + reason required.
- **Valid Reason MUST be “Inability to Rescue”:**
- Payload: `POST /_user/missions/:id/cancel` { cancellationReasonId, customReason? }
- **Predefined Reasons for Rescuer:**
  - `physical_inability` — Physical inability to reach location
  - `vehicle_breakdown` — Vehicle problem / breakdown
  - `personal_emergency` — Personal emergency
  - `lack_of_expertise` — Insufficient expertise for this incident type
  - `unsafe_conditions` — Unsafe conditions at scene
  - `other` — Other (requires `customReason` + **needs Admin approval** if `other`)
- **Immediate Admin Notification:**
  - On rescuer cancel, server:
    1.  Sets `missions.status = "cancelled_by_rescuer"`
    2.  Sets `rescuer.isOnMission = false`
    3.  **Emits URGENT Socket event to admin:** `mission:cancelled-by-rescuer` with `{ missionId, sosRequestId, rescuerId, reason, rescuerLocation }`
    4.  Admin panel shows **red flash + sound + “NEEDS REPLACEMENT” badge** on SOS request.
    5.  Admin can immediately **re-dispatch** to next nearest rescuers (reuse logic from 11.3).
- **Prevention:** Rate-limit rescuer cancels (max 3/hour), flag for review if >2 cancels/day.

#### C) Data Model for Cancellation
```sql
Table cancellation_reasons (
  id uuid PK,
  type enum('requester','rescuer'),
  key string unique, -- e.g., 'physical_inability'
  label string,
  labelFa string,
  requiresCustomText boolean,
  isActive boolean
);

Table missions (
  id uuid PK,
  sosRequestId FK,
  rescuerId FK,
  requesterId FK,
  status enum('pending','on_the_way','arrived','in_progress','completed','cancelled_by_requester','cancelled_by_rescuer','expired'),
  cancelledBy enum('requester','rescuer','admin','system') nullable,
  cancellationReasonId FK nullable,
  cancellationCustomText string nullable,
  cancelledAt timestamp nullable,
  ...
);
```

### 11.8. History & Feedback

- **Request History (for all users):** `GET /_user/sos/requests?role=requester` — list of SOS requests I created, with status, rescuer, timeline.
- **Mission History (for all users):** `GET /_user/sos/missions?role=rescuer` — list of missions I performed, with status, requester, rating received.
- **Rating & Review:**
  - After `mission.status = "completed"`, requester can submit: `POST /_user/missions/:id/rate` { rating: 1-5, comment?: string }
  - Table: `mission_ratings (id, missionId, raterId, rateeId, rating, comment, createdAt)`
  - User's average rating computed: `avgRating` cached on `users` table.
  - Used for future dispatch prioritization (higher rated rescuers first when distance tie).

---

## 12. Real-time & Disconnection Handling

### 12.1. Stack: Socket.IO (Primary) + SSE (Fallback)
- **Socket.IO** for bidirectional: location updates, SOS proposals, mission status, admin alerts.
- **SSE** as fallback for one-way admin dashboards if Socket fails (optional but architecture must allow).

### 12.2. Socket Architecture
- Namespace: `/` (default)
- Rooms:
  - `user:{userId}` — private per user (for proposals, mission updates)
  - `admin` — all admins
  - `mission:{missionId}` — participants of a mission (requester + rescuer + assigned admin) for live location
- Events:
  ```
  Client -> Server:
    location:update { lat, lon, accuracy, timestamp, priorityDeviceId }
    mission:update-status { missionId, status }
    sos:create { ... }
    mission:cancel { missionId, reason }

  Server -> Client:
    location:peer-update { userId, lat, lon }
    sos:new-request { sosRequest }
    sos:proposal-received { proposal }
    mission:status-updated { missionId, status, by }
    mission:cancelled-by-requester { missionId, reason }
    mission:cancelled-by-rescuer { missionId, reason, rescuerId }
    sos:proposal-accepted { proposal }
    admin:nearest-responders { sosRequestId, responders }
    system:suspended { reason }
  ```

### 12.3. Disconnection Detection
- Heartbeat: client `ping` every 25s, server expects `pong` within 10s else mark offline.
- On disconnect:
  - Set `user_sessions.isOnline = false`, `lastSeenAt = now`
  - If user was in active `mission` or `location_share`:
    - Keep `lastLocation` as last known.
    - Show `Offline` badge + `Last seen: 2 min ago` on map for admin/peers.
    - Do NOT auto-cancel mission for 5 minutes (grace period).
  - On reconnect:
    - Re-auth via refreshToken, rejoin rooms, sync missed events via `GET /_user/sync?since=lastDisconnectAt`

---

## 13. API Route Structure: _admin, _user, _auth, _public

### 13.1. Prefix Definitions

| Prefix | Access | Description | Example |
|---|---|---|---|
| `_auth` | **Only NOT logged-in** | Authentication flows | `_auth/login`, `_auth/register`, `_auth/forgot-password` |
| `_public` | **Everyone** | Public pages/data | `_public/landing`, `_public/incident-types` |
| `_user` | **Only authenticated users** | All user features | `_user/profile`, `_user/location/share`, `_user/sos/requests` |
| `_admin` | **Only admins** | Admin operations | `_admin/users`, `_admin/categories`, `_admin/sos/requests/:id/dispatch` |

### 13.2. Access Rules (Must be enforced both Backend & Frontend)

**`_auth/*` — Guest Only**
- If request has valid JWT (logged in), backend returns `403 { code: "ALREADY_AUTHENTICATED" }`
- Frontend `beforeEach` guard: if `authStore.isLoggedIn` → redirect to `/_user/dashboard` or `/_admin/dashboard` based on role.
- Contains:
  ```
  POST /_auth/register
  POST /_auth/login
  POST /_auth/forgot-password/request
  POST /_auth/forgot-password/verify
  POST /_auth/forgot-password/reset
  POST /_auth/refresh
  POST /_auth/logout
  ```

**`_public/*` — Open**
- No auth required, but may optionally accept auth to personalize.
- Examples:
  ```
  GET /_public/health
  GET /_public/map/styles/:theme.json
  GET /_public/incident-types   # for SOS form dropdown (or could be _user)
  GET /_public/faqs
  ```

**`_user/*` — Authenticated User**
- Requires `Authorization: Bearer <accessToken>` header.
- Fastify hook `preHandler: authenticate, authorize('user'|'admin')` — but must allow `user` role (admin may also access? — spec says _user only users; document decision: `admin` cannot access _user endpoints unless explicitly allowed).
- Examples:
  ```
  GET  /_user/me
  PATCH /_user/me
  GET  /_user/devices
  POST /_user/location/share
  DELETE /_user/location/share/:shareId
  POST /_user/sos/requests
  GET  /_user/sos/requests
  GET  /_user/sos/missions
  POST /_user/complete-security-questions
  ```

**`_admin/*` — Admin Only**
- Requires JWT with `role: 'admin'`
- Returns `403 Forbidden` if normal user tries.
- Examples:
  ```
  GET  /_admin/users
  POST /_admin/users
  PATCH /_admin/users/:id/status
  POST /_admin/categories
  POST /_admin/categories/:id/users
  POST /_admin/incidents
  GET  /_admin/sos/requests
  POST /_admin/sos/requests/:id/dispatch
  GET  /_admin/stats
  ```

### 13.3. Implementation

**Backend (Fastify):**
```ts
// plugins/auth.ts
fastify.decorate('authenticate', async (req, reply) => { verify JWT, set req.user })
fastify.decorate('authorize', (roles) => async (req, reply) => { if (!roles.includes(req.user.role)) throw 403 })

// routes
fastify.register(authRoutes, { prefix: '/_auth' })
fastify.register(publicRoutes, { prefix: '/_public' })
fastify.register(async (r) => { r.addHook('preHandler', r.authenticate); /* */ }, { prefix: '/_user' })
fastify.register(async (r) => { r.addHook('preHandler', r.authenticate); r.addHook('preHandler', r.authorize(['admin'])); /* */ }, { prefix: '/_admin' })
```

**Frontend (Vue Router):**
```ts
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.path.startsWith('/_auth') && auth.isLoggedIn) return '/_user/dashboard'
  if (to.path.startsWith('/_user') && !auth.isLoggedIn) return '/_auth/login'
  if (to.path.startsWith('/_admin') && auth.user?.role !== 'admin') return '/403'
})
```

---

## 14. Tech Stack — Mandatory Tools

| Tool | Purpose | Notes |
|---|---|---|
| **TypeScript** | Primary language | Strict mode `strict: true` everywhere (frontend + backend) |
| **Vue.js 3** | Frontend framework | Composition API + `<script setup>` |
| **Vuetify 3** | UI component library | For tables, dialogs, forms, navigation. Theme dark/light integrated |
| **Tailwind CSS** | Utility CSS | Alongside Vuetify for custom layouts, spacing, responsiveness |
| **Pinia** | State management | `auth`, `map`, `location`, `sos`, `theme` stores |
| **Vite** | Build tool | Fast HMR, build for web + ionic |
| **Ionic + Capacitor** | Android wrapper | One codebase, native Camera/GPS/Geolocation plugins |
| **MapLibre GL JS** | Vector map rendering | Core map lib, no Mapbox fees |
| **Fastify** | Backend framework | Fast, plugin-based, OpenAPI integration |
| **PostgreSQL + PostGIS** | Database | For users, missions, + geospatial queries (`ST_Distance`, `GEOGRAPHY`) |
| **Drizzle ORM + Postgres.js** | TypeScript database access | SQL-first schemas and explicit PostGIS SQL support; see ADR-011 |
| **Zod** | Schema validation | For all API input/output, shared between client/server |
| **OpenAPI / Swagger** | API docs | Generated from shared Zod route descriptors via `@fastify/swagger` |
| **JSDoc** | Code docs | For all exported functions/classes |
| **km-api** | API helper | Helper for structured API definitions (see 15) |
| **Zopia** | Swagger → Zod generator | Converts OpenAPI to Zod schemas for client (see 15) |
| **Bun** | Runtime & PM | Faster than Node for dev, install, test. `bun run dev`, `bun test` |
| **Vitest** | Unit testing | For zod schemas, utils, store logic |
| **Socket.IO** | Realtime | Location + SOS + mission live updates |
| **VueUse** | Vue composables | `useGeolocation`, `useStorage`, `useDark`, `useWebSocket`, etc. |

**Additional Recommended (Document if used):**
- Redis for rate-limit + socket adapter (optional for single-instance dev)
- Husky/Lefthook for git hooks

---

## 15. Role of Zod + km-api + Zopia (Shared Contract)

This trio creates a **type-safe, single-source-of-truth** API contract between Server and Client.

### 15.1. Zod
- Define `shared/schemas/*.ts` — e.g., `loginSchema`, `sosRequestSchema`, `locationShareSchema`
- Used for:
  - Backend validation: `fastify` route `schema.body = zodToJsonSchema(loginSchema)`
  - Frontend validation: `vee-validate` + `zodResolver`
- Example:
  ```ts
  // shared/schemas/auth.ts
  export const loginSchema = z.object({
    username: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/),
    password: z.string().min(8)
  })
  export type LoginInput = z.infer<typeof loginSchema>
  ```

### 15.2. km-api
- A helper library (by Komeil) used by `packages/shared/src/api/define-route.ts` to keep route method, path, Zod schemas, and OpenAPI metadata in a shared descriptor.
- Application handlers remain server-side and are registered separately; a shared contract does not imply a live endpoint.
- The server's Swagger catalog is built from these descriptors without creating placeholder handlers.

### 15.3. Zopia
- **Docs:** https://komeilm76.github.io/zopia/
- The Fastify server exposes **Swagger UI** at `/docs` and **OpenAPI JSON** at `/docs/json`. Start the API, then generate client modules with:
  ```bash
  bun --filter @borobiya/client generate:api
  ```
- The script fetches `http://localhost:3000/docs/json` by default and writes Zopia output to `packages/client/src/generated/api/`. Set `API_OPENAPI_URL` or `ZOPIA_OUTPUT_DIR` to override those defaults.
- All shared API contracts appear in OpenAPI; only `GET /_public/health` is currently registered at runtime. Contract-only operations are marked with `x-borobiya-runtime-status: contract-only` and return 404 until implemented.
- Benefits:
  - No manual duplication of types between server/client
  - Instant break detection if backend changes contract
  - Perfect for AI assistant to auto-consume APIs

### 15.4. Combined Workflow
```
[ shared Zod schemas + route descriptors ] --> [ Fastify Swagger plugin ] --> [ OpenAPI JSON /docs/json ]
                                                                                |
                                                                                | Zopia
                                                                                v
[ Client source ] <---------- [ Generated client modules ] <--------------------
```
- Folder `shared/` is symlinked or git-submodule between `server/` and `client/` OR monorepo `packages/shared`.

---

## 16. UI/UX Requirements

- **Professional, Attractive, User-Friendly — High UI/UX Score**
- Standards to follow:
  - **Responsive:** Mobile-first, breakpoints `sm, md, lg, xl` (Tailwind)
  - **Accessibility (a11y):** `aria-*`, keyboard nav, contrast >4.5:1 (WCAG AA)
  - **Consistency:** 8px grid, design tokens for colors/spacing/typography
  - **Feedback:** Loading skeletons, optimistic updates, toast/snackbar for every action
  - **Map UX:** Gesture-friendly, bottom sheets for mobile, not covering map
  - **Dark/Light:** No flash of wrong theme (use `useDark` + localStorage sync)
  - **Performance:** Lazy-load routes, virtual scroll for user lists, debounce search
- **Pages to include:**
  - `/_auth/login`, `/_auth/register`, `/_auth/forgot-password`
  - `/_user/dashboard` (map + my shares + nearby users)
  - `/_user/map` (full-screen map, search, routing)
  - `/_user/location/shares` (manage shares)
  - `/_user/sos/history` (my requests + my missions)
  - `/_user/settings` (devices, theme, security questions)
  - `/_admin/dashboard` (stats + live SOS alerts)
  - `/_admin/users`, `/_admin/categories`, `/_admin/incidents`

---

## 17. Data Storage & Retention

### 17.1. Key Tables (PostgreSQL)
- `users (id, username unique, passwordHash, role enum('user','admin'), isActive, isSuspended, suspendedUntil, avgRating, mustCompleteSecurityQuestions, createdAt)`
- `security_questions (id, text)`
- `user_security_answers (id, userId, questionId, answerHash)`
- `user_sessions (id, userId, deviceId, deviceName, refreshTokenHash, ip, lastActiveAt, isOnline)`
- `location_shares (id, ownerId, targetUserId, mode, expiresAt, isRevoked, priorityDeviceId, createdAt)`
- `location_history (id, userId, lat, lon, accuracy, timestamp, createdAt)` — with PostGIS index
- `location_history_shares (id, ownerId, targetUserId, from, to, createdAt)`
- `categories`, `incident_types`, `category_users`, `category_incident_types`
- `sos_requests`, `mission_proposals`, `missions`, `mission_status_history`, `cancellation_reasons`, `mission_ratings`

### 17.2. Retention via ENV
```env
LOCATION_HISTORY_RETENTION_DAYS=90
LOCATION_HISTORY_MAX_SHARE_DAYS=30
SOS_PHOTO_MAX_SIZE_MB=5
SOS_REQUEST_AUTO_EXPIRE_HOURS=24  # if no rescuer accepted, auto-expire
MISSION_STATUS_TIMEOUT_HOURS=6     # if rescuer stuck in on_the_way too long, alert admin
```
- Daily cron: `DELETE FROM location_history WHERE createdAt < NOW() - INTERVAL '90 days'`

---

## 18. Documentation Requirements

Docs must be **clear for Human + AI**. Use Markdown + Diagrams (Mermaid) + OpenAPI.

### Required Docs (in `/docs`):

| Doc | Content |
|---|---|
| `README.md` | Overview, stack, quick start (Docker + Windows), env setup |
| `ARCHITECTURE.md` | System diagram, data flow, map server arch, realtime flow |
| `STRUCTURE.md` | Folder structure (monorepo) |
| `ROADMAP.md` | Phases: Phase 1 Auth+Map, Phase 2 Sharing, Phase 3 SOS, Phase 4 Polish |
| `TASKS.md` | Task breakdown per phase with checkboxes |
| `PROGRESS.md` | % completion per feature, blockers |
| `SECURITY.md` | Hashing, rate-limit, suspension, no-delete policy, env secrets |
| `API.md` | Link to OpenAPI `/docs`, plus route prefix rules |
| `MAP_SERVER.md` | How to setup Martin/OSRM/Photon, generate tiles, update data |
| `WORKFLOWS.md` | Git hooks, deploy, android build |
| `USER_MANUAL.md` | Step-by-step for end-user: register, share location, SOS, rescue (with screenshots) |
| `DEVELOPMENT.md` | Windows without Docker vs Ubuntu with Docker |
| `DIAGRAMS/` | ERD, SOS flowchart, location sharing sequence |

**Quality Bar:** Low strictness on code style during dev, **HIGH strictness on docs completeness**.

---

## 19. Workflows & CI/CD

### 19.1. Git Hooks / Gates (planned)
- Add **Husky** or **Lefthook**:
  - `pre-commit`: `bun run lint` + `bun run typecheck` (vue-tsc + tsc)
  - `pre-push`: `bun run test` (vitest) + `bun run build` dry-run
- **Branch protection:** `main` requires PR + 1 review (if team >1) or at least passing CI.

These hooks and gates are recommendations only; no hook config, CI workflow, or root lint/test/build scripts are wired yet.

### 19.2. Launch / Deploy Workflow
- **GitHub Actions `deploy.yml` (planned; not present yet):**
  - On push to `main`: build Docker images, push to registry, SSH to Ubuntu server, `docker compose pull && docker compose up -d`
  - Includes: `api`, `postgres`, `map-server`, `nginx` (reverse proxy)
- **Local launch (scaffold):**
  ```bash
  cp .env.example .env          # replace the JWT placeholders and Postgres password
  docker compose up --build -d  # API, PostGIS, Martin, and Nginx; local ports only
  bun install
  bun --filter @borobiya/client dev  # Vite client with HMR at :5173
  ```
  For Bun-only development, stop the Compose API and run `bun run dev` from the repository root. The Compose stack is not production-hardened (Nginx is HTTP-only); API persistence and project map data/assets are not implemented yet.

### 19.3. Android Build Workflow (planned)
- **GitHub Actions `android.yml` (not present yet):**
  - On tag `v*`: `bun run build:web`, `npx cap sync android`, `cd android && ./gradlew assembleRelease`, upload APK/AAB artifact
- **Local:**
  ```bash
  bun run build
  npx cap copy android
  npx cap open android  # opens Android Studio
  ```

---

## 20. Deployment & Environments

### 20.1. Production (Ubuntu)
- OS: **Ubuntu 22.04/24.04 LTS**
- A local **Compose scaffold** is provided in [`docker-compose.yml`](./docker-compose.yml): API, PostGIS, Martin, and Nginx. Host ports bind to loopback; Nginx is HTTP-only on port 8080. It is not yet a production deployment configuration: TLS, domain routing, and production secrets still need deployment-specific setup.
- Secrets via `.env` (never commit). The API currently validates `DATABASE_URL` but does not connect to the database. The initial auth-table SQL migration is checked in but is not applied at startup; data seeds are future work. The map server has no bundled tile/style/routing/geocoding assets yet.

### 20.2. Development (Windows without Docker)
- Requirements: `Bun`; Node 20+ is a fallback for supported tools. PostgreSQL/PostGIS is optional until persistence tasks are implemented.
- Steps documented in [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md):
  ```bash
  bun install
  cp .env.example .env   # replace the JWT placeholders
  bun run dev            # API + Vite concurrently
  ```
- The API does not connect to PostgreSQL yet. `db:setup`, migrations/seeds, `map:dev`, and sample map assets are not implemented or bundled.

---

## 21. Collaboration Model

- **Team:** Human Developer + AI Assistant
- **Rules:**
  - All code comments in English, JSDoc for exported functions
  - Commit messages: `feat: add SOS dispatch`, `fix: location share expiry`, `docs: update map setup`
  - AI must read `/docs/*.md` before making changes (include in prompt)
  - Use `shared/` for contracts to avoid drift

---

## 22. Non-Functional Requirements

- **Performance:** Map load <2s on LAN, location update <500ms via socket
- **Scalability:** Support 1000 concurrent users on single Ubuntu VM (4GB RAM) — document scaling path (Redis, multiple API instances)
- **Reliability:** Graceful offline: if Map Server down, show cached tiles + error toast, not crash
- **Security:** No plaintext secrets, all hashes, rate-limit, audit logs for admin actions

---

## 23. Summary Checklist

| # | Requirement | Status |
|---|---|---|
| 1 | Vector map (PBF/SVG) self-hosted, NOT PNG raster | Mandatory |
| 2 | Fully offline on LAN, no Google/OSM online | Mandatory |
| 3 | Separate Map Server (tiles + routing + geocoding) | Mandatory |
| 4 | Data pipeline: OSM dump → PBF → deploy, with update mechanism | Mandatory |
| 5 | Configurable geographic coverage via ENV | Mandatory |
| 6 | Dark/Light theme (app + map `setStyle`) | Mandatory |
| 7 | Admin Web Panel | Mandatory |
| 8 | User Web Platform | Mandatory |
| 9 | Android App (Ionic + Vue) | Mandatory |
| 10 | Advanced user search | Mandatory |
| 11 | Place search + Reverse geocode (offline) | Mandatory |
| 12 | Professional multi-destination routing (car/bike/foot) | Mandatory |
| 13 | Camera pitch per transport (Car 60°, Bike 45°, Foot 0°) | Mandatory |
| 14 | Live location share (timed/permanent/revocable) + history share (e.g., 7 days) | Mandatory |
| 15 | History retention via ENV | Mandatory |
| 16 | Multi-device priority selection warning | Mandatory |
| 17 | Auth: username/password only, 5 security questions, no duplicate | Mandatory |
| 18 | Forgot password: server picks 3/5 random questions | Mandatory |
| 19 | Admin creates user without questions, force on first login | Mandatory |
| 20 | Admin: activate/deactivate, NO delete | Mandatory |
| 21 | Hash passwords + security answers (argon2/bcrypt) | Mandatory |
| 22 | Rate limit + auto suspend suspicious | Mandatory |
| 23 | SOS: Admin creates incidents + categories + assign users (multi) | Mandatory |
| 24 | SOS form: severity, description, incident type, GPS/manual location, photo | Mandatory |
| 25 | Admin sees SOS alert on map + auto nearest responders by category+distance | Mandatory |
| 26 | Rescuer: sees multiple proposals, accepts one, busy=no new proposals | Mandatory |
| 27 | Live location for all three (admin/requester/rescuer) via Socket | Mandatory |
| 28 | Map fit both points, choose transport + route, navigate | Mandatory |
| 29 | Mission statuses: on_the_way → arrived → in_progress → completed | Mandatory |
| 30 | Cancellation: requester with reason, rescuer hard with reason + instant admin alert & replacement | Mandatory |
| 31 | History: request history + mission history for all users | Mandatory |
| 32 | Rating after completion | Mandatory |
| 33 | Route prefixes: _auth (guest only), _public (all), _user (user), _admin (admin) | Mandatory |
| 34 | Tech stack: TS, Zod, Vue, PG, Vuetify, Tailwind, MapLibre, JSDoc, OpenAPI, Fastify, km-api, Zopia, Pinia, Vite, Bun, Vitest, Socket.IO, VueUse, Ionic | Mandatory |
| 35 | Zod+km-api+Zopia shared contract | Mandatory |
| 36 | UI/UX professional, responsive, a11y | Mandatory |
| 37 | Docs: tasks, phases, rules, goals, progress, security, diagrams, structure, workflows, roadmap, user manual (for Human+AI) | Mandatory |
| 38 | Workflows: git gates, launch/deploy, android build | Mandatory |
| 39 | Dockerized on Ubuntu + Windows dev without Docker | Mandatory |

---

## 24. Appendix

### 24.1. Example ENV
```env
# API
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://borobiya:secret@localhost:5432/borobiya
JWT_SECRET=change-me-32-chars
JWT_REFRESH_SECRET=change-me-32-chars-too
LOCATION_HISTORY_RETENTION_DAYS=90
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# Map Server
MAP_SERVER_URL=http://localhost:8000
MAP_REGION=tehran
MAP_STYLE_LIGHT=http://localhost:8000/styles/light.json
MAP_STYLE_DARK=http://localhost:8000/styles/dark.json
MAP_ROUTING_URL=http://localhost:8000/route
MAP_GEOCODE_URL=http://localhost:8000/geocode

# Android
VITE_API_URL=http://localhost:3000
VITE_MAP_URL=http://localhost:8000
```

### 24.2. Folder Structure (Monorepo)
```
borobiya/
├── docs/                 # All markdown docs
├── packages/
│   ├── shared/           # Zod schemas, TS types (used by both)
│   ├── server/           # Fastify API + Drizzle (Socket.IO/persistence integration later)
│   └── client/           # Vue + Vuetify + Tailwind + MapLibre + Ionic
│       ├── src/
│       │   ├── views/_auth, _public, _user, _admin
│       │   ├── stores/ (pinia)
│       │   ├── composables/ (vueuse)
│       │   └── components/
│       └── android/      # Capacitor android folder
├── map-server/           # Martin + OSRM + Photon configs + data/
├── docker-compose.yml
├── .env.example
└── README.md
```

### 24.3. SOS State Diagram (Mermaid)
```mermaid
stateDiagram-v2
  [*] --> pending: User creates SOS
  pending --> dispatched: Admin dispatches to rescuers
  dispatched --> accepted: Rescuer accepts one
  dispatched --> expired: No accept in 24h
  accepted --> on_the_way --> arrived --> in_progress --> completed
  accepted --> cancelled_by_rescuer: Rescuer cancels (hard, needs reason)
  pending --> cancelled_by_requester: Requester cancels (needs reason)
  dispatched --> cancelled_by_requester
  accepted --> cancelled_by_requester
  cancelled_by_rescuer --> dispatched: Admin re-dispatches
```

---

**This document is the single source of truth for initial documentation and development of Borobiya. Use it as the prompt for AI Assistant to generate docs, structure, and tasks.**
```
