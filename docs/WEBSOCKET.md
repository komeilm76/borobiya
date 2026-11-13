# Realtime protocol

The browser keeps exactly one authenticated WebSocket. The endpoint is served by a `Bun.serve` WebSocket upgrade handler in `src/server/core/websocket.ts`; there is no Socket.IO or `ws` package. The endpoint is `/ws`, and the protocol version is one.

## Connection

A signed-in client calls `POST /_user/realtime/ticket`. The ticket is random, short-lived, stored only as a hash, bound to the issuing IP and consumed exactly once on upgrade. The socket URL is the same host with the `ws` or `wss` scheme and a `ticket` query parameter. Invalid, expired, reused or cross-IP tickets are rejected during the HTTP upgrade.

On connect the server sends `hello` with protocol version, connection ID, user ID, role, server time, heartbeat interval, current durable event cursor and a live-location snapshot. The client uses the cursor for catch-up. Peers automatically join their own user room, session room and role room. Additional room subscriptions are validated by `subscribe` commands.

## JSON messages

Clients send `ping`, `subscribe`, `location.update`, `talk.start`, `talk.stop`, `snapshot` and `sync`. The server replies with `pong`, `ack`, `error`, `snapshot`, `presence`, `talk.state`, `location.peer` and `event` messages. Every command may carry a `requestId`; acknowledgements and typed errors echo it. Unknown command types return an `INVALID_INPUT` error rather than closing the connection.

`sync` accepts `since` and `limit` and returns a `snapshot` with `kind: "sync"`, the filtered durable events and the new cursor. Event audiences are `all`, `user:<id>`, `role:<role>`, `session:<id>`, `sos:<id>`, `mission:<id>` and `talk:<id>`. Mission team changes and support-request outcomes are published as durable events to the `mission:<id>` audience (`mission.team.updated`, `support.request.created`, `support.request.reviewed`, `support.request.cancelled`). The repository filters catch-up events so a client cannot read another user's private events.

## Live location

A `location.update` contains latitude, longitude, accuracy and optional heading, speed and recorded time. The server validates coordinates, rate-limits updates, stores the latest fix in a bounded cache, persists points at most every five seconds and sends `location.peer` only to active authorized recipients. The sender receives an acknowledgement with the recipient count. Revoking a share immediately invalidates cache entries and stops future fan-out. The message may additionally carry an optional `contextType` (`trip`|`mission`) and `contextId` pair (both or neither — one without the other is an `INVALID_INPUT` error); when present and the caller has accepted recording for that context (account opt-in plus per-context consent, accuracy no worse than 100 m), the fix is also written to the consented track store (see `docs/API.md`); otherwise recording is skipped silently and the live share path is unaffected.

## Push-to-talk

`talk.start` is permitted only for a pair connected by an active live share or an active mission. The talk floor grants one speaker for at most 30 seconds and releases after two seconds without audio. Binary frames begin with a ten-byte header: version, type, 32-bit talk ID and 32-bit sequence, all big-endian for the numeric fields. Payload is 16 kHz PCM16 audio. The server checks header, rate, active floor, speaker identity, sequence order and payload size, then forwards the frame only to the target user. Nothing is written to disk.

## Heartbeat, limits and shutdown

The hub sends pings at a configured interval and closes peers that miss a heartbeat. Frames are bounded by `WS_MAX_FRAME_BYTES`; oversized frames receive close code 1009. Room membership is bounded. On shutdown the server sends a going-away close, clears intervals, closes the database and stops the HTTP listener. Session revocation closes all peers for that user or session with a policy close code.
