import { io, type Socket } from "socket.io-client";
import {
  LOCATION_UPDATE_EVENT,
  PEER_UPDATE_EVENT,
  SHARE_ENDED_EVENT,
  SOS_NEW_REQUEST_EVENT
} from "./socket-events";
import { realtimeConnectionOptions } from "./socket-options";

// Re-exported so the broadcast composable and every existing caller keep their import path while the
// constants themselves live in a module free of `socket.io-client` (see `socket-events.ts`).
export {
  LOCATION_UPDATE_EVENT,
  PEER_UPDATE_EVENT,
  SHARE_ENDED_EVENT,
  SOS_NEW_REQUEST_EVENT
};

export interface RealtimeClient {
  readonly socket: Socket;
  /** Applies a rotated access token; Socket.IO re-reads `auth` on every (re)connect. */
  updateToken(accessToken: string): void;
  connect(): void;
  close(): void;
}

/**
 * Single lazily connected Socket.IO client for the signed-in account. Callers attach their own
 * listeners; `close()` is what the auth store invokes on logout so a stale session never keeps
 * a broadcast channel open.
 */
export function createRealtimeClient(accessToken: string | null): RealtimeClient {
  const socket = io(realtimeConnectionOptions(accessToken ?? ""));

  return {
    socket,
    updateToken(next) {
      socket.auth = { token: next };
    },
    connect() {
      if (!socket.connected) socket.connect();
    },
    close() {
      socket.removeAllListeners();
      socket.close();
    }
  };
}
