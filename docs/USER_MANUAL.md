# Borobiya — User Manual

> **For end users (requesters, rescuers, admins).** Step-by-step with screenshots placeholders (`[Screenshot: ...]`). Replace placeholders with real captures after UI lands.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Access & Requirements](#2-access--requirements)
3. [Registration](#3-registration)
4. [Login](#4-login)
5. [Forgot Password](#5-forgot-password)
6. [Onboarding After Admin-Created Account](#6-onboarding-after-admin-created-account)
7. [Theme](#7-theme)
8. [Map Basics](#8-map-basics)
9. [Search — Planned](#9-search--planned)
10. [Routing & Navigation — Planned](#10-routing--navigation--planned)
11. [Live Location Sharing](#11-live-location-sharing)
12. [History Sharing](#12-history-sharing)
13. [Active Devices & Priority Device](#13-active-devices--priority-device)
14. [SOS — Requesting Help](#14-sos--requesting-help)
15. [SOS — Admin Dispatch — Planned](#15-sos--admin-dispatch--planned)
16. [SOS — Responding as Rescuer — Planned](#16-sos--responding-as-rescuer--planned)
17. [Mission Statuses During Rescue — Planned](#17-mission-statuses-during-rescue--planned)
18. [Cancellation — Planned](#18-cancellation--planned)
19. [History & Rating — Planned](#19-history--rating--planned)
20. [Admin — User Management](#20-admin--user-management)
21. [Admin — Categories & Incidents](#21-admin--categories--incidents)
22. [Troubleshooting](#22-troubleshooting)
23. [Quick Reference](#23-quick-reference)

---

## 1. Introduction

**Borobiya** helps you share your live location with trusted contacts and request/receive emergency rescue coordinated by an admin. Works on browser and Android, even on a local network without internet (if your organization runs the local server).

Roles:

- **User** — shares location, sends SOS, rescues others.
- **Admin** — manages users, categories, incident types, dispatches rescuers.

---

## 2. Access & Requirements

- **Web:** Open `https://borobiya.yourdomain.com` (or `http://borobiya.local` on LAN) in Chrome/Firefox/Edge.
- **Android:** Install APK `Borobiya.apk` → allow Location + Camera. No Play Store required if sideloaded.
- **Location permission:** Allow “While using app” (browser: Allow Location prompt).
- **Offline note:** Map still loads offline on LAN; SOS/admin alerts need LAN connection to server.

---

## 3. Registration

1. Go to **Login** → click **Create account**.
2. Fill:
   - **Username** — 3–30 chars, lowercase letters/digits/underscore only (e.g., `ali_123`).
   - **Password** — 8–1024 characters, include a letter and a decimal digit (Persian-script characters are accepted).
   - **Confirm Password** — same as password.
   - **Security Questions** — pick **5 different** questions from the list, type your answers.
     - Answers are **case-insensitive** (e.g., “Tehran” = “tehran”). Trim spaces.
3. Click **Register**.

[Screenshot: Register form with 5 question pickers]

> ⚠️ If you see “Duplicate question” error, pick a different question in the dropdown.

---

## 4. Login

1. Open **Login**.
2. Enter **Username** + **Password** → **Sign in**.
3. If your account was created by an admin without security questions, you will be redirected to **Complete Security Questions** (see §6).

[Screenshot: Login page]

Errors:

- **Invalid credentials** — wrong username or password.
- **Account suspended** — too many failed attempts / abuse; contact admin.
- **Already authenticated** — you are already logged in; go to Dashboard.

---

## 5. Forgot Password

1. On Login → **Forgot password?**
2. Enter your **Username** → **Continue**.
3. Server shows **3 of your 5** questions (random, server-chosen) — answer them.
4. If all 3 correct, you get a **10-minute window** to set a new password.
5. Enter **New Password** + **Confirm** → **Reset** → login with new password.

[Screenshot: Forgot — step 2 answer 3 questions]

> Answers are compared case-insensitive; leading/trailing spaces ignored.

If answers fail: try trimming/lowercasing, verify you picked correct questions at registration.

---

## 6. Onboarding After Admin-Created Account

If admin created you (`mustCompleteSecurityQuestions` flag):

1. On first login you see **“Complete security questions to continue”** — you cannot use other pages until done.
2. Select **5 unique** questions + answers → **Save**.
3. Now Dashboard unlocks.

[Screenshot: Complete security questions forced screen]

---

## 7. Theme

- Use the theme menu in the top bar to choose **System**, **Light**, or **Dark**.
- The app and MapLibre view follow the resolved theme; style changes retain the current map instance and camera.
- The preference is stored in local browser storage. Tehran rendered on the target VM, but total light/dark switch latency has not been measured in a live browser. The configured 150ms value is the paint transition, not an end-to-end SLA; see P1-M1 in [`PROGRESS.md`](./PROGRESS.md#phase-1-acceptance-follow-ups).

[Screenshot: Theme menu + light and dark map]

---

## 8. Map Basics

Open **Map** (`/_user/map`) for the full-height MapLibre view, or use the map preview on **Dashboard** (`/_user/dashboard`). Both start centered on Tehran and follow the selected app theme.

- **Pan:** drag the map.
- **Zoom:** scroll/pinch or use the map's zoom controls.
- The scale and compass/navigation controls are provided by MapLibre.
- If map settings are unavailable, the view uses safe default bounds and zoom. Map resource errors show a retry toast; previously cached resources may still be displayed.
- The first map visit needs the local Map Server. The browser cache stores map resources after a successful load on secure origins (HTTPS or localhost); already-loaded tiles also remain in MapLibre's in-memory cache for the current page session.

**On this screen** (both are overlays on the same map, and neither moves the camera except once per loaded track):

- **تاریخچهٔ مسیر / پخش حرکت** — the playback panel: pick your own track or a companion's grant, choose 1/7/30 days or type a window, then scrub or play at 1×/4×/16×/60×. The grey dashed line is the whole recorded path, the solid one is what has been played, and the caption says when the server sampled the window (`maxPoints`) rather than showing every point.
- **موقعیت زنده / همراهان** — the live panel: one dot per companion who has an open live share with you, and a line saying what is on the map. A dot is drawn from the last position the server knows even before it moves; a companion who has gone quiet turns grey and keeps their age («۱۲ دقیقه پیش»), and only after 30 minutes of silence does the dot leave the map. If the map is empty the line names the reason — nobody has shared with you, the share list could not be read (with a retry button), or the live connection is down. Accuracy is shown as `±N متر` next to a name, never as a circle on the map.

**Current scope:** live markers and history playback are on the map; broadcast from the browser (geolocation → the socket) is available on the dashboard, and the app never claims a position it does not have. Search-based place picking, reverse geocoding, and routing on this map are not enabled yet. *(This paragraph previously said the screen "displays the base map only" — stale since playback shipped, corrected with T2.1.8.)*

[Screenshot: Dashboard map widget and full-height map view]

---

## 9. Search — Planned

User search and place/address search are not available in the current client. Search bars, filters, reverse geocoding, and place suggestions will be documented here once those features are implemented.

---

## 10. Routing & Navigation — Planned

Route selection, transport profiles, alternatives, and turn-by-turn navigation are not available in the current client. This section will be updated when the client and offline routing service are implemented.

---

## 11. Live Location Sharing

### Share

1. Open **`/_user`** → click **اشتراک تازه** (**New Share**).
2. Select **Targets** (one or more companions via debounced username search).
3. Choose **Mode:**
   - **Timed (`مدت‌دار`):** slider / presets from 15 min up to 30 days. Auto-expires.
   - **Permanent (`تا لغو دستی`):** active until manually revoked.
4. Add **Note** (optional) → **اشتراک‌گذاری** (**Share**). If multiple sessions are active on your account, choose which device broadcasts in the prompt.
5. Start broadcasting your device's GPS from the **پخش زندهٔ موقعیت** bar on **`/_user`** or the compact control on **`/_user/map`** (**شروع پخش** / **توقف پخش**).

[Screenshot: Share dialog with target picker + timed toggle]

### Manage

- **اشتراک‌های من** (**My Shares**): active and permanent shares → **لغو** (**Revoke**) cuts off access immediately across live maps.
- **با من به اشتراک گذاشته‌اند** (**Shared With Me**): incoming live shares and history grants, with direct links to **`/_user/map`**.

### Live Updates

- When active, your device streams GPS fixes over Socket.IO every 3s while moving and refreshes stationary heartbeats automatically.
- Companions viewing **`/_user/map`** see your live marker update in real time and disappear immediately upon revoke or timed expiry.

---

## 12. History Sharing

1. Open **`/_user`** → **اشتراک تازه** → choose **تاریخچه مسیر** (**Route History**).
2. Pick **Targets**, choose a quick preset (`1h`–`7d`) or custom **از زمان / تا زمان** window within the server's max share window, and optionally cap **حداکثر تعداد نقاط** (`maxPoints`).
3. Submit → recipients see the grant under **با من به اشتراک گذاشته‌اند** and can play back the polyline on **`/_user/map`** (**مسیر همراهم** toggle in the **پخش حرکت** panel, with `1×` / `4×` / `16×` / `60×` transport, scrub slider, and **تازه‌سازی**).

[Screenshot: History share date picker + polyline playback]

> Old history older than 90 days is auto-deleted (configurable). Owners can delete any history grant at any time under **بازه‌های تاریخچه** on **`/_user`**.

---

## 13. Active Devices & Priority Device

If you are logged in on **two devices** (e.g., phone + laptop):

1. When starting **Live Share** or **SOS as rescuer**, a **warning modal** appears: “Your account is active on 2 devices. Select which device broadcasts location.”
2. Choose a device (e.g., “Samsung S23”) → **Confirm**.
3. Only that device’s GPS is used; the other is ignored.

Manage at **`/_user/devices`** (linked from the dashboard card «دستگاه پخش‌کننده»): a table of the account's **live sessions** — device label, online/offline, minutes since last activity, IP, and how many of your shares each one is currently broadcasting — plus a chooser per share and an “apply to all” action.

[Screenshot: Priority device modal + Devices table]

Two things this screen will not do, both of them deliberate:

- **It does not extend a share.** Changing the device of a timed share keeps the expiry exactly where it is; if it were to run out in under a minute, the change is refused and you are told to open a fresh share instead.
- **It lists live sessions only.** A device you have logged out of is absent rather than shown as “offline”, and a share still pinned to a device that just left keeps showing that id as “no longer in the list” until the server re-points it (or you choose a new one).

In a native (Android) build the device column is filled from the platform: brand and model, e.g. `Samsung Galaxy S23`. The name **you** gave your phone in its own settings is never sent — it is personal data, and on recent iOS it is a generic string anyway. If the platform cannot be read at all, nothing is sent and the label is derived from the browser instead, so a login is never refused because a device name could not be read.

---

## 14. SOS — Requesting Help

> **Current status:** End-to-end requester SOS filing is live across API and client (`POST /_user/sos/requests` T3.2.2, `POST /_user/sos/requests/:id/photo` T3.2.3, and the global floating red SOS button + bottom-sheet form T3.2.4). Live `sos:new-request` admin broadcast (T3.2.5), authenticated photo read-back (T3.2.6), and request history pages (T3.7) remain queued.

### Big red SOS button

- Always visible across all authenticated screens after security-question onboarding: floating **SOS امداد** red button in the corner (plus the **درخواست امداد فوری (SOS)** card on `/_user/dashboard`).

### Steps

1. Tap **SOS امداد** from any screen (or **ارسال درخواست امداد (SOS)** on Dashboard) to open the bottom sheet.
2. Fill:
   - **Severity (`شدت حادثه`):** `کم‌خطر` (Low) / `متوسط` (Medium) / `بحرانی / فوری` (High).
   - **Incident Type (`نوع حادثه`):** loaded live from `/_public/incident-types` (configured by an administrator).
   - **Description (`شرح وضعیت و نیاز امدادی`):** 10–500 characters describing the emergency.
   - **Location (`موقعیت حادثه`):** automatically probes device GPS (`isManual: false`), or tap anywhere on the embedded map / drag the red pin / enter `lat` & `lon` coordinates (Persian or Latin digits) if GPS is unavailable (`isManual: true`).
   - **Photo (`تصویر صحنهٔ حادثه`, optional):** **ثبت با دوربین** (rear camera hint) or **انتخاب از گالری** — JPEG, PNG, or WebP up to 5 MB.
3. Tap **ارسال درخواست امداد فوری** → files the SOS (`status = pending`) and returns your tracking ID; if a network error interrupts optional photo upload after the SOS row is created, **تلاش دوباره برای ارسال تصویر** retries only the photo upload without creating a duplicate emergency request.

[Screenshot: SOS form with severity + map picker + photo]

> After sending, you can **track** your SOS in **History** or watch map for incoming rescuer.

---

## 15. SOS — Admin Dispatch — Planned

> **Current status:** Admin dispatch routes (`/_admin/sos/requests*`, `POST .../dispatch`) remain contract-only on the API, and `/_admin/dispatch` and `/_admin/dashboard` currently render placeholder screens in the client (tracked under T3.3).

*Admin only (`/_admin/dispatch`).*

1. New SOS appears: **pulsing red marker** + sidebar alert with severity color.
2. Click alert → map zooms to SOS location, shows **Nearest Responders** (top 10 eligible by distance + category match).
3. Each responder shows **distance, rating, category, last active**.
4. Select **one or more** → **Dispatch**.
5. Rescuers receive **proposal** (bell icon) instantly.

[Screenshot: Admin alert + nearest responders list]

If rescuer cancels later, you see **red flash “NEEDS REPLACEMENT”** → re-dispatch to next candidates.

---

## 16. SOS — Responding as Rescuer — Planned

> **Current status:** Rescuer proposal inbox, accept/decline handlers, and in-app navigation remain planned under T3.4–T3.5.

### Inbox

- **Bell icon** with unread count → click → list of proposals (incident, severity, distance, requester, photo, description).

### Rules

- You see **multiple proposals**, but can **accept only ONE** at a time.
- If `On Mission`, no new proposals come in (until you complete/cancel).

### Accept

1. Tap **Accept** on a proposal.
2. Map **fits both points** (you + requester).
3. Other proposals auto-declined.
4. Tap **Go to Incident Location** → choose transport → see routes → **Start Navigation** (§10).

[Screenshot: Proposal inbox + Accept]

---

## 17. Mission Statuses During Rescue — Planned

> **Current status:** Mission tables, `PATCH /_user/missions/:id/status`, and the rescuer status bar remain planned under T3.5.

Rescuer updates step-by-step (button in mission bar):

| Step | Status | When |
|------|--------|------|
| 1 | **On the way** — `در حال رفتن به محل حادثه` | After starting navigation |
| 2 | **Arrived** — `به محل حادثه رسیدم` | Within 50m (auto-detected + confirm) |
| 3 | **In Progress** — `در حال رسیدگی` | Assessing scene |
| 4 | **Completed** | Done |

Each update appears as **timeline** to requester + admin.

[Screenshot: Mission timeline with 4 steps]

---

## 18. Cancellation — Planned

> **Current status:** Cancellation reasons are seeded in the database (T1.1.3), while requester/rescuer cancellation routes and UI remain planned under T3.6.

### If you are the requester (need to cancel SOS)

1. Go to **SOS History** → your pending SOS → **Cancel**.
2. **Must select reason:**
   - Need no longer exists
   - I resolved myself
   - Someone else helped
   - Sent by mistake
   - Other (→ type custom 10–200 chars)
3. **Confirm** → SOS `cancelled_by_requester`, rescuer freed.

### If you are the rescuer (cannot continue)

1. In active mission → **More → Unable to continue** (hidden, requires confirm).
2. **Must pick reason:**
   - Physical inability to reach
   - Vehicle breakdown
   - Personal emergency
   - Insufficient expertise
   - Unsafe conditions
   - Other → (requires custom text, **needs admin approval** if “other”)
3. **Confirm** → Admin gets **urgent alert** and will re-dispatch.
   - Do this rarely: max 3/hour; >2/day flagged for review.

[Screenshot: Cancel with reason picker — requester vs rescuer]

### Admin view on rescuer cancel

- Red flash + sound → “NEEDS REPLACEMENT” badge on SOS request → **Re-dispatch** button.

### System cancels

- SOS auto-expires after 24h without acceptance (`expired`).
- Mission stuck `on_the_way` >6h → alert admin.

---

## 19. History & Rating — Planned

> **Current status:** `/_user/sos-history` currently renders a placeholder screen in the client, and `GET /_user/sos/requests`, `GET /_user/sos/missions`, and `POST /_user/missions/:id/rate` remain contract-only (tracked under T4.1).

- **Request History** (`/_user/sos-history`, planned): SOS I created, status, rescuer, timeline.
- **Mission History** (`/_user/sos-history`, planned): Missions I handled, rating received.

### Rating

- After **Completed**, requester can **Rate** rescuer 1–5 stars + comment → appears on rescuer profile and influences future dispatches (distance tie-break).

[Screenshot: Rating stars dialog]

---

## 20. Admin — User Management

*`/_admin/users`*

- **List:** Search by name, filter `active/suspended/has category`, pagination.
- **Detail:** View user’s devices, rating, mission history, shares.
- **Activate/Deactivate:** Toggle → confirmation → audit log; deactivated user cannot login, tokens revoked, missions paused.
- **No delete** — never exists; only activate toggle.

[Screenshot: Admin users table + detail drawer]

---

## 21. Admin — Categories & Incidents

*`/_admin/categories`, `/_admin/incidents`* — live since T3.1.5

- **Incident Types:** Create `name, icon, color, description` (e.g., Fire 🔥 red) → used in SOS dropdown. The slug is derived from the name when the field is left empty; a name with nothing slug-shaped in it (a Persian-only label is normal here) has to be given one by hand, and the form says so before the server has to. Renaming is allowed, and a taken slug is refused with a `409` naming the type that holds it.
- **Categories:** Create `name, description` + select **multiple incident types** it contains + **assign users** to category. The picker is the username search rather than a list of ids; the chosen set replaces the stored one, so unticking is how a type is removed.
- **What this screen cannot do yet:** show who is already in a category, and therefore remove one. No read returns a category's members (T3.1.4); the dialog says so instead of offering a uuid to type, and adding somebody already a member is a no-op success rather than an error.
- All users start **in no category**; admin assigns; user can be in **multiple categories**. An empty catalog is the shipped state: nothing is seeded, so the SOS form has no options until an admin adds them.

[Screenshot: Category form with incident Type multi-select + user assignment]

---

## 22. Troubleshooting

| Symptom | What to do |
|---------|-----------|
| Map blank | Check internet/LAN to `map server`; reload; if offline, wait for tiles cache |
| Location not sharing | Allow Location permission; check priority device; ensure GPS on |
| Cannot login, suspended | Contact admin with username; wait 24h |
| Cannot accept SOS | You may be On Mission — complete/cancel first |
| Photo upload fails | Under 5MB, jpg/png/webp; retry with smaller |
| Security answer rejected | Answers are case-insensitive & trimmed — try lowercase |
| Android crash | Reinstall APK; allow permissions; clear app cache |

---

## 23. Quick Reference

| Action | Where |
|--------|-------|
| Register | `/_auth/register` |
| Login | `/_auth/login` |
| Forgot password | `/_auth/forgot-password` |
| Dashboard (live + history shares) | `/_user/dashboard` |
| Location Shares | `/_user/location-shares` |
| Full map (live companions + playback) | `/_user/map` |
| Active Devices & Priority Device | `/_user/devices` |
| SOS History *(planned)* | `/_user/sos-history` |
| Settings *(planned)* | `/_user/settings` |
| Admin Dashboard *(planned)* | `/_admin/dashboard` |
| Admin Users | `/_admin/users` |
| Admin Categories | `/_admin/categories` |
| Admin Incidents | `/_admin/incidents` |
| Admin Dispatch *(planned)* | `/_admin/dispatch` |

Need help? Contact your Borobiya admin or open an issue at `github.com/komeilm76/borobiya` with steps & screenshot.

