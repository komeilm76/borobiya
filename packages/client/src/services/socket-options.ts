import { apiBasePath } from "../api/http";

/** Socket.IO server path. The gateway/Vite proxy strips the API prefix before Fastify sees it. */
export function socketPath(): string {
  const base = apiBasePath();
  return base === "" ? "/socket.io" : `${base}/socket.io`;
}

export interface RealtimeConnectionOptions {
  path: string;
  /** Verified `/_user` access token; the handshake middleware rejects anything else. */
  auth: { token: string };
  transports: Array<"websocket" | "polling">;
  withCredentials: boolean;
  reconnection: boolean;
  reconnectionDelay: number;
  reconnectionDelayMax: number;
  timeout: number;
  autoConnect: boolean;
}

/**
 * Connection options for live location and later SOS events. `websocket` is preferred with
 * `polling` kept as the documented fallback, and `autoConnect` stays false so the caller can
 * supply a freshly refreshed token before the first handshake.
 */
export function realtimeConnectionOptions(accessToken: string): RealtimeConnectionOptions {
  return {
    path: socketPath(),
    auth: { token: accessToken },
    transports: ["websocket", "polling"],
    withCredentials: true,
    reconnection: true,
    // Keep the first retries quick for a LAN deployment and cap the backoff so a
    // restarted API is picked up within a few seconds instead of the 5s+ default growth.
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    timeout: 10_000,
    autoConnect: false
  };
}
