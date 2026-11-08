# Diagrams — SOS Lifecycle (implemented contract)

> Source-level view of the current SOS, proposal and mission handlers. These Mermaid blocks have not yet been visually reviewed in a rendered browser; that review remains part of T4.7.1. The three records have **different** status vocabularies; do not use the SOS request's `dispatched` state as a mission status.

## 1. States (separate records)

```mermaid
stateDiagram-v2
  state "SOS request" as SOS {
    [*] --> pending: requester creates
    pending --> dispatched: admin dispatches
    dispatched --> dispatched: admin dispatches more offers
    dispatched --> accepted: rescuer accepts an offer
    accepted --> completed: last active mission completes
    pending --> cancelled_by_requester: requester cancels
    dispatched --> cancelled_by_requester: requester cancels
    accepted --> cancelled_by_requester: requester cancels active missions
    accepted --> cancelled_by_rescuer: last active rescuer cancels
    cancelled_by_rescuer --> dispatched: admin re-dispatches
  }
  state "One dispatched proposal" as PROPOSAL {
    [*] --> offer_pending: dispatch creates offer
    offer_pending --> offer_accepted: assigned rescuer accepts
    offer_pending --> offer_declined: assigned rescuer declines
    offer_pending --> offer_expired: requester cancels SOS
  }
  state "One accepted mission" as MISSION {
    [*] --> mission_pending: offer accepted
    mission_pending --> on_the_way: rescuer advances
    on_the_way --> arrived: rescuer advances
    arrived --> in_progress: rescuer advances
    in_progress --> mission_completed: rescuer advances
    mission_pending --> cancelled_by_requester: requester cancels
    mission_pending --> cancelled_by_rescuer: rescuer cancels
    on_the_way --> cancelled_by_requester: requester cancels
    on_the_way --> cancelled_by_rescuer: rescuer cancels
    arrived --> cancelled_by_requester: requester cancels
    arrived --> cancelled_by_rescuer: rescuer cancels
    in_progress --> cancelled_by_requester: requester cancels
    in_progress --> cancelled_by_rescuer: rescuer cancels
  }
```

`offer_pending` and `mission_pending` above are diagram aliases for the distinct tables' `pending` values; `mission_completed` is the mission's `completed`. The shared schemas also allow `expired` for SOS requests and missions, but this diagram does **not** imply an automatic 24-hour expiry job. Advancing a mission is an explicit rescuer request, not a GPS-triggered 50 m arrival. Repeating the current step is an unchanged success; skipping, reversing or reviving a terminal step returns **409 `INVALID_MISSION_TRANSITION`**. When several rescuers accept for one SOS, the request becomes `completed` only after the last active mission completes; it becomes `cancelled_by_rescuer` only after the last active mission is cancelled by a rescuer.

## 2. Request → dispatch → mission → rating

```mermaid
sequenceDiagram
  actor Requester
  participant API as SOS API
  participant Admin
  actor Rescuer
  Requester->>API: POST /_user/sos/requests
  API-->>Requester: 201 requestId, pending
  API-->>Admin: sos:new-request (admin room)
  opt Attach evidence after request creation
    Requester->>API: POST /_user/sos/requests/:id/photo
  end
  Admin->>API: GET /_admin/sos/requests/:id/nearest
  Admin->>API: POST /_admin/sos/requests/:id/dispatch
  API-->>Rescuer: sos:proposal-received (selected rescuer)
  Rescuer->>API: GET /_user/sos/proposals
  Rescuer->>API: POST /_user/sos/proposals/:id/accept
  API-->>Rescuer: missionId (mission pending)
  API-->>Requester: sos:proposal-accepted
  loop Each next status, in order
    Rescuer->>API: PATCH /_user/missions/:id/status
    API-->>Requester: mission:status-updated
    API-->>Rescuer: mission:status-updated
  end
  Requester->>API: POST /_user/missions/:id/rate (completed mission only)
```

The rate body requires an integer `rating` from 1 to 5 and permits an optional `comment` of at most 500 characters. Only the requester may rate their completed mission, once. Socket notifications follow committed writes; they are not a substitute for reading mission state. The list and read endpoints enforce participant scoping.

## 3. Cancellation and error paths

```mermaid
flowchart TD
  A[Active SOS request] -->|Requester: POST /_user/sos/requests/:id/cancel with reason| B[Cancel SOS and active missions; withdraw pending offers]
  A -->|Rescuer: POST /_user/missions/:id/cancel with reason| C[Cancel own active mission]
  C --> D{Other active missions for SOS?}
  D -->|No| E[SOS cancelled_by_rescuer; admin can re-dispatch]
  D -->|Yes| F[SOS remains active]
  A -->|Rescuer: PATCH /_user/missions/:id/status| G{Next ordered step?}
  G -->|Yes, or repeat same step| H[200 mission]
  G -->|Skip, reverse or terminal| I[409 INVALID_MISSION_TRANSITION]
  A -->|Requester: POST /_user/missions/:id/rate| J{Completed and not yet rated?}
  J -->|Yes| K[Rating recorded]
  J -->|No| L[409 MISSION_NOT_COMPLETED or MISSION_ALREADY_RATED]
```

Cancellation requires an active reason from `GET /_user/sos/cancellation-reasons?type=requester|rescuer` (and custom text only for reasons that require it). A stale/closed request or inactive mission can also return 409; unauthorized resource IDs are not exposed as readable missions. Neither cancellation nor expiry is an automatic escalation to the authorities.

## 4. Rescuer navigation (client-side route preview)

```mermaid
flowchart LR
  A[Accept proposal] --> B[Read active mission navigation target]
  B --> C[Get current position]
  C --> D[Choose transport profile and optional waypoints]
  D --> E[Request local map-server route choices]
  E --> F[Preview and select route]
  F --> G[Start guidance on map]
```

The incident coordinate is readable only by the assigned rescuer of an active mission. Route choices depend on the available local routing service and location permission; no fixed number of alternatives or physical-arrival inference is promised.

## 5. Role summary

| Role | May write | May read / receive |
|------|-----------|--------------------|
| Requester | Create SOS, attach photo, cancel own SOS with reason, rate completed own mission | Own request/mission updates and rescuer location in active mission |
| Rescuer | Accept/decline own offer; advance/cancel own active mission with reason; publish mission location | Own offers and active mission's incident target |
| Admin | Dispatch and re-dispatch eligible SOS requests | SOS alerts and admin SOS/mission views |

Contract references: `packages/shared/src/types/enums.ts`, `packages/shared/src/api/{sos,admin}.routes.ts`, `packages/server/src/db/{sos-dispatch,sos-cancellation,mission-progress}-store.ts`, `packages/server/src/sos/{proposals,mission-progress,cancellation}.ts`, and `packages/client/src/composables/use-mission-routes.ts`.
