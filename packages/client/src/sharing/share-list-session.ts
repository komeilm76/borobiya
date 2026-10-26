import type { ShareEndedEvent } from "@shared/index";
import type { RealtimeClient } from "@/services/socket";
import { SHARE_ENDED_EVENT } from "@/services/socket-events";

export type ShareEndedClient = Pick<RealtimeClient, "socket" | "connect" | "close">;

/**
 * One revocation listener per current bearer. A rotated JWT needs a new handshake, not merely a
 * new token in the auth store: an already-connected Socket.IO client would keep its old handshake.
 * The sequence also stops an in-flight dynamic import from attaching after logout/account switch.
 */
export function createShareEndedSubscription(
  open: (token: string) => Promise<ShareEndedClient>,
  onEnded: (payload: ShareEndedEvent) => void
) {
  let client: ShareEndedClient | null = null;
  let activeToken: string | null = null;
  let generation = 0;
  let disposed = false;

  function detach(): void {
    const previous = client;
    client = null;
    activeToken = null;
    if (!previous) return;
    previous.socket.off(SHARE_ENDED_EVENT, onEnded);
    previous.close();
  }

  async function setToken(token: string | null): Promise<void> {
    if (disposed || (client && activeToken === token)) return;
    const request = ++generation;
    detach();
    if (!token) return;
    try {
      const opened = await open(token);
      if (disposed || request !== generation) {
        opened.close();
        return;
      }
      client = opened;
      activeToken = token;
      opened.socket.on(SHARE_ENDED_EVENT, onEnded);
      opened.connect();
    } catch {
      // Re-reads still work without realtime. A subsequent token update or re-mount can retry.
      if (request === generation) detach();
    }
  }

  function close(): void {
    disposed = true;
    generation += 1;
    detach();
  }

  return { setToken, close };
}
