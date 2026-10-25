/** Socket.IO pings every 25s and closes a missing pong after 10s. A fresh presence write
 * every 25s keeps crashed-server sessions from appearing online forever; the extra time
 * allows one delayed DB write without a spurious offline badge. This is not GPS consent. */
export const PING_INTERVAL_MS = 25_000;
export const PING_TIMEOUT_MS = 10_000;
export const PRESENCE_STALE_MS = 70_000;
