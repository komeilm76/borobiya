# Borobiya — User Manual

> **For end users (requesters, rescuers, admins).** Step-by-step with screenshots placeholders (`[Screenshot: ...]`). Replace placeholders with real captures after UI lands.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Access & Requirements](#2-access--requirements)
3. [Registration](#3-registration)
4. [Login](#4-login)
5. [Forgot Password (Security Questions)](#5-forgot-password)
6. [Onboarding After Admin-Created Account](#6-onboarding-after-admin-created-account)
7. [Theme (Dark/Light)](#7-theme)
8. [Map Basics](#8-map-basics)
9. [Search — Users & Places](#9-search--users--places)
10. [Routing & Navigation](#10-routing--navigation)
11. [Live Location Sharing](#11-live-location-sharing)
12. [History Sharing](#12-history-sharing)
13. [Active Devices & Priority Device](#13-active-devices--priority-device)
14. [SOS — Requesting Help](#14-sos--requesting-help)
15. [SOS — Admin Dispatch (for Admins)](#15-sos--admin-dispatch)
16. [SOS — Responding as Rescuer](#16-sos--responding-as-rescuer)
17. [Mission Statuses During Rescue](#17-mission-statuses-during-rescue)
18. [Cancellation](#18-cancellation)
19. [History & Rating](#19-history--rating)
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

**Current scope:** this version displays the base map only. GPS location, live companion markers, search, reverse geocoding, and routing are not enabled yet.

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

1. Go to **Location Shares** → **New Share**.
2. Select **Targets** (one or more users via search).
3. Choose **Mode:**
   - **Timed:** slider 60 min, 24h, etc. Auto-expires.
   - **Permanent:** until you revoke.
4. Add **Note** (optional) → **Share**.

[Screenshot: Share dialog with target picker + timed toggle]

### Manage

- **My Shares** tab: list with green “Active” or “Expired” badges → **Revoke** to stop instantly.
- **Shared With Me** tab: live markers on map with user name.

### Live Updates

- Your device sends GPS every 3–5s (throttled to save battery).
- Receiver sees your dot move; tapping dot shows “Last seen: just now” or “Offline · 2 min ago”.

---

## 12. History Sharing

1. **Location Shares** → **Share History**.
2. Pick **Targets**, **Date range** (e.g., last 7 days) — cannot exceed 30 days at once.
3. Send → receiver sees **polyline** on map with **time slider** to playback.

[Screenshot: History share date picker + polyline playback]

> Old history older than 90 days is auto-deleted (configurable).

---

## 13. Active Devices & Priority Device

If you are logged in on **two devices** (e.g., phone + laptop):

1. When starting **Live Share** or **SOS as rescuer**, a **warning modal** appears: “Your account is active on 2 devices. Select which device broadcasts location.”
2. Choose a device (e.g., “Samsung S23”) → **Confirm**.
3. Only that device’s GPS is used; the other is ignored.

Manage at **Settings → Active Devices** — table with `deviceName, lastActiveAt, IP` + change priority anytime.

[Screenshot: Priority device modal + Devices table]

---

## 14. SOS — Requesting Help

### Big red SOS button

- Always visible: floating **red button** on User Web + Android.

### Steps

1. Tap **SOS**.
2. Fill:
   - **Severity:** Low / Medium / High.
   - **Description:** 10–500 chars what happened.
   - **Incident Type:** dropdown (Fire, Flood, Medical, etc. — created by admin).
   - **Location:** auto GPS (blue dot) or **Pick on Map** (tap to set marker) if GPS fails.
   - **Photo (optional):** **Camera** or **Gallery** → max 5MB jpg/png/webp.
3. **Send SOS** → status `pending`; admin notified instantly (pulsing marker on their map + sound).

[Screenshot: SOS form with severity + map picker + photo]

> After sending, you can **track** your SOS in **History** or watch map for incoming rescuer.

---

## 15. SOS — Admin Dispatch

*Admin only (`/_admin/dashboard`).*

1. New SOS appears: **pulsing red marker** + sidebar alert with severity color.
2. Click alert → map zooms to SOS location, shows **Nearest Responders** (top 10 eligible by distance + category match).
3. Each responder shows **distance, rating, category, last active**.
4. Select **one or more** → **Dispatch**.
5. Rescuers receive **proposal** (bell icon) instantly.

[Screenshot: Admin alert + nearest responders list]

If rescuer cancels later, you see **red flash “NEEDS REPLACEMENT”** → re-dispatch to next candidates.

---

## 16. SOS — Responding as Rescuer

### Inbox

- **Bell icon** with unread count → click → list of proposals (incident, severity, distance, requester, photo, description).

### Rules

- You see **multiple proposals**, but can **accept only ONE** at a time.
- If `On Mission`, no new proposals come in (until you complete/cancel).

### Accept

1. Tap **Accept** on a proposal.
2. Map **fits both points** (you + requester).
3. Other proposals auto-declined.
4. Tap **Go to Incident Location** → choose transport → see routes → **Start Navigation** (§10.5).

[Screenshot: Proposal inbox + Accept]

---

## 17. Mission Statuses During Rescue

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

## 18. Cancellation

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

## 19. History & Rating

- **Request History** (`/_user/sos/history?role=requester`): SOS I created, status, rescuer, timeline.
- **Mission History** (`/_user/sos/history?role=rescuer`): Missions I handled, rating received.

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

*`/_admin/categories`, `/_admin/incidents`*

- **Incident Types:** Create `name, icon, color, description` (e.g., Fire 🔥 red) → used in SOS dropdown.
- **Categories:** Create `name, description` + select **multiple incident types** it contains + **assign users** to category.
- All users start **in no category**; admin assigns; user can be in **multiple categories**.

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
| Dashboard | `/_user/dashboard` |
| Full map + routing | `/_user/map` |
| Location shares | `/_user/location/shares` |
| SOS History | `/_user/sos/history` |
| Settings / Devices | `/_user/settings` |
| Admin Dashboard | `/_admin/dashboard` |
| Admin Users | `/_admin/users` |

Need help? Contact your Borobiya admin or open an issue at `github.com/komeilm76/borobiya` with steps & screenshot.

