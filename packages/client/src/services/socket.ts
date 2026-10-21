import { io, type Socket } from "socket.io-client";
import { realtimeConnectionOptions } from "./socket-options";

export const LOCATION_UPDATE_EVENT = "location:update";
export const PEER_UPDATE_EVENT = "location:peer-update";

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
