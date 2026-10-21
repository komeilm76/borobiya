# Diagrams — Location Sharing Sequence

> Covers live sharing, history sharing, multi-device priority, and realtime updates.

---

## 1. Live Share — Create + Stream

```mermaid
sequenceDiagram
  participant Owner
  participant Target
  participant API
  participant Socket
  participant DB

  Owner->>API: POST /_user/location/share {targetUserIds, mode, durationMinutes, note}
  API->>API: if activeDevices>1 → require priorityDeviceId else assign current
  API->>DB: insert location_shares (expiresAt if timed)
  API-->>Owner: 201 {shareId, expiresAt}
  loop Every 3–5s (throttled)
    Owner->>Socket: location:update {lat,lon,accuracy,timestamp,priorityDeviceId}
    Socket->>API: verify JWT + priorityDeviceId match
    API->>DB: upsert users.lastLocation, insert location_history
    API->>Socket: emit location:peer-update to room user:{targetId}
    Socket-->>Target: update marker on MapLibre
  end
  Note over API,DB: Cron every 1m: expire timed shares; daily prune history >RETENTION_DAYS
  Owner->>API: DELETE /_user/location/share/:shareId → immediate revoke
  API->>DB: set isRevoked=true
  API->>Socket: emit share revoked
```

---

## 2. History Share — Send + View

```mermaid
sequenceDiagram
  participant Owner
  participant Target
  participant API
  participant DB

  Owner->>API: POST /_user/location/history/share {targetUserIds, from: -7d, to: now, maxPoints?}
  API->>API: validate to-from <= LOCATION_HISTORY_MAX_SHARE_DAYS else 400
  API->>DB: insert location_history_shares
  API-->>Owner: 201
  Target->>API: GET /_user/location/history/shared/:shareId
  API->>DB: query location_history where user_id=ownerId and from≤timestamp<to, sampled by row_number()/count(*) over ()
  API-->>Target: { points, totalPoints }
  Target->>Target: render polyline + time slider playback on map
```

---

## 3. Multi-Device Priority — Conflict Avoidance

```mermaid
sequenceDiagram
  participant Web as Web Device
  participant Phone as Phone Device
  participant API
  Web->>API: POST /_auth/login → session/device UUID created server-side
  Phone->>API: POST /_auth/login → another session/device UUID created
  Web->>API: POST /_user/location/share {...}
  API-->>Web: 409 {code:"PRIORITY_DEVICE_REQUIRED", activeDevices:[web, phone]}
  Web->>Web: show modal: "Select broadcasting device"
  Web->>API: POST /_user/location/share {targetUserIds, mode, priorityDeviceId: phone-uuid}
  API->>API: store priorityDeviceId
  Phone->>Socket: location:update {priorityDeviceId: phone-uuid} → accepted
  Web->>Socket: location:update {priorityDeviceId: web-uuid} → ignored (log warning, 409 WRONG_DEVICE)
  Note over Web,Phone: Settings → Change priority anytime
```

---

## 4. Realtime + Disconnection

```mermaid
sequenceDiagram
  participant Client
  participant Socket
  participant DB
  Client->>Socket: connect auth {token}
  Socket->>Socket: verify JWT → join room user:{userId} (+ admin if admin)
  Client->>Socket: ping every 25s
  Socket->>Client: pong (or heartbeat)
  Note over Socket,DB: If no pong in 10s → mark user_sessions.isOnline=false, lastSeenAt=now
  Socket-->>Client: keep lastLocation, show Offline badge "2 min ago"
  Note over Socket: Grace 5 min before mission consideration (no auto-cancel v1)
  Client->>Socket: reconnect with refreshToken
  Socket->>Socket: rejoin rooms
  Client->>API: GET /_user/sync?since=lastDisconnectAt → missed events
```

---

## 5. Retention & Expiry (Cron)

```mermaid
flowchart TD
  A[Every 1 minute] --> B{location_shares<br/>expiresAt < now?}
  B -->|yes| C[Set expired, notify owner]
  B -->|no| D[Keep]
  E[Daily 03:00 UTC] --> F{location_history<br/>createdAt < now-RETENTION_DAYS?}
  F -->|yes| G[DELETE rows]
  F -->|no| H[Keep]
  I[Every hour] --> J{sos_requests pending<br/>createdAt < now-24h?}
  J -->|yes| K[Set expired]
```

---

## 6. Socket Events Summary

| Event | Direction | Payload | Room |
|-------|-----------|---------|------|
| `location:update` | C→S | {lat,lon,accuracy,timestamp,priorityDeviceId} | — |
| `location:peer-update` | S→C | {userId,lat,lon,accuracy,timestamp} | `user:{targetId}`, `mission:{id}` |
| `system:offline` | S→C | {userId, lastSeenAt} | peers/admin |
| `sync` | C↔S fallback | | |

