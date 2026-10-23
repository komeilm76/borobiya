# Diagrams — SOS Rescue Flow

> State machine + sequence for the entire SOS lifecycle.

---

## 1. State Diagram

```mermaid
stateDiagram-v2
  [*] --> pending: User creates SOS
  pending --> dispatched: Admin dispatches to rescuers
  dispatched --> accepted: Rescuer accepts one
  dispatched --> expired: No accept in 24h
  pending --> cancelled_by_requester: Requester cancels
  dispatched --> cancelled_by_requester
  accepted --> cancelled_by_requester
  accepted --> on_the_way: Rescuer starts navigation
  on_the_way --> arrived: Within 50m + confirm
  arrived --> in_progress: Assessing scene
  in_progress --> completed: Resolved
  accepted --> cancelled_by_rescuer: Rescuer cancels (hard path)
  on_the_way --> cancelled_by_rescuer
  arrived --> cancelled_by_rescuer
  in_progress --> cancelled_by_rescuer
  cancelled_by_rescuer --> dispatched: Admin re-dispatches
  cancelled_by_requester --> [*]
  expired --> [*]
  completed --> [*]
```

---

## 2. Lifecycle Sequence (Happy Path)

```mermaid
sequenceDiagram
  participant R as Requester
  participant Admin
  participant Rescuer
  participant API
  participant Socket
  participant Map as Map Server (OSRM)
  R->>API: POST /_user/sos/requests {severity,desc,incidentType,location,photo}
  API->>Socket: sos:new-request → room admin
  Admin->>API: GET /_admin/sos/requests/:id/nearest → top 10
  Admin->>API: POST /_admin/sos/requests/:id/dispatch {rescuerIds}
  API->>Socket: sos:proposal-received → each rescuer
  Rescuer->>API: POST /_user/sos/proposals/:id/accept
  API->>API: create mission, isOnMission=true
  API->>Socket: sos:proposal-accepted → R+Admin
  Rescuer->>Map: POST /route {from: rescuerLoc, to: sosLoc, profile}
  Map-->>Rescuer: 2–3 alternatives {distance,duration,polyline}
  Rescuer->>API: PATCH /_user/missions/:id/status {on_the_way}
  API->>Socket: mission:status-updated → mission:{id} room
  Rescuer->>API: PATCH ... {arrived}
  Rescuer->>API: PATCH ... {in_progress}
  Rescuer->>API: PATCH ... {completed}
  R->>API: POST /_user/missions/:id/rate {5,comment}
```

---

## 3. Cancellation Sequences

### 3a. By Requester

```mermaid
sequenceDiagram
  participant R as Requester
  participant API
  participant Socket
  participant Rescuer
  R->>API: POST /_user/sos/requests/:id/cancel {cancellationReasonId, customReason?}
  API->>API: validate reason required, set status=cancelled_by_requester
  API->>API: if mission active → isOnMission=false for rescuer
  API->>Socket: mission:cancelled-by-requester → mission:{id} room
  Socket-->>Rescuer: show cancel notice
```

### 3b. By Rescuer (Hard Path + Admin Alert)

```mermaid
sequenceDiagram
  participant Rescuer
  participant API
  participant Socket
  participant Admin
  Rescuer->>API: POST /_user/missions/:id/cancel {reasonId, customReason?}
  API->>API: rate-limit 3/h, set cancelled_by_rescuer, isOnMission=false
  API->>Socket: mission:cancelled-by-rescuer → room admin (URGENT)
  Socket-->>Admin: red flash + sound + NEEDS REPLACEMENT badge + rescuerLocation
  Admin->>API: POST /_admin/sos/requests/:id/dispatch {nextRescuerIds}
  API->>Socket: sos:proposal-received → new rescuers
```

---

## 4. Mission Status Table (Rescuer Updates)

| Order | Status Enum | Persian Label | Trigger |
|-------|-------------|---------------|---------|
| 1 | `on_the_way` | در حال رفتن به محل حادثه | After “Start Navigation” |
| 2 | `arrived` | به محل حادثه رسیدم | Within 50m of SOS location (auto-detect + manual confirm) |
| 3 | `in_progress` | در حال رسیدگی | After assessing |
| 4 | `completed` | ماموریت با موفقیت انجام شد | Resolved |

Alternative terminals: `cancelled_by_requester`, `cancelled_by_rescuer`, `expired`.

Out-of-order transition → `400 INVALID_STATUS_TRANSITION`.

---

## 5. UI Map After Acceptance

```mermaid
flowchart LR
  A[Accept] --> B[map.fitBounds<br/>rescuer+requester]
  B --> C[Go to Incident Location]
  C --> D[Choose transport<br/>car/bike/foot]
  D --> E[Map Server route<br/>2-3 alternatives]
  E --> F[Select route → Start Navigation]
  F --> G[Camera pitch<br/>60/45/0 + bearing follow]
```

---

## 6. Role Summary

| Role | Can Send | Can Receive | Can Cancel |
|------|----------|-------------|------------|
| Requester | SOS + photo | Status updates + rescuer location | Own SOS anytime (with reason) |
| Rescuer | Location while on mission | Proposals, SOS location | Own mission (hard path + reason) |
| Admin | Dispatch proposals | SOS alerts + urgent cancel alerts | Re-dispatch after rescuer cancel |

