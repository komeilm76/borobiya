import { computed, onScopeDispose, ref, shallowRef, watch, type ComputedRef, type Ref } from "vue";
import type { LocationSharesResponse } from "@shared/index";
import { PEER_UPDATE_EVENT, SHARE_ENDED_EVENT } from "@/services/socket-events";
import type { RealtimeClient } from "@/services/socket";
import { listLocationShares } from "@/api/location";
import {
  DISCARD_AFTER_MS,
  applyPeerUpdate,
  applyShareEnded,
  applyShareList,
  emptyRegistry,
  liveStatus,
  peersOf,
  peersOverlay,
  pruneRegistry,
  type CompanionRegistry
} from "@/live/companion-locations";

/**
 * How often the age clock moves.
 *
 * A peer's age is read in minutes and a dot turns grey only past 45s of silence, so a 5s tick is
 * fifteen chances to notice — and one interval per open map costs nothing next to the socket it is
 * watching. The clock keeps running while the socket is down on purpose: "2 دقیقه پیش" is the whole
 * point of the stale state, and it must keep being true when no updates arrive.
 */
export const PEER_TICK_MS = 5_000;
/** Bound stale grants if a share-ended notification is lost without a socket disconnect. */
export const SHARE_VERIFY_MS = 60_000;

function bearerBelongsToOwner(token: string, owner: string): boolean {
  // This is only a conservative display gate, never authentication: the server
  // verifies the signature and share scope. The production bearer is a JWT with
  // `sub`; refuse a recognisable JWT for a different/missing subject while the
  // auth store is still loading its profile (e.g. another tab changed accounts).
  const parts = token.split(".");
  if (parts.length !== 3) return true; // opaque bearers remain subject to server authorization
  try {
    const encoded = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="))) as { sub?: unknown };
    return payload.sub === owner;
  } catch {
    return false;
  }
}

export interface UseLiveCompanionsOptions {
  accessToken: Ref<string | null> | ComputedRef<string | null>;
  /**
   * The signed-in user's own id is both the peer-echo filter and the ownership boundary for
   * private positions. A changed account must discard its old map and Socket.IO room.
   */
  ownUserId: Ref<string | null> | ComputedRef<string | null>;
  /**
   * Opens the realtime connection. Production resolves `socket.io-client` lazily — see the note in
   * `useLiveCompanions` — and tests hand in a fake, which may be synchronous.
   */
  openSocket?: (token: string) => RealtimeClient | Promise<RealtimeClient>;
  /** Refreshes the access token via the HttpOnly refresh cookie if a reconnect hits an expired JWT. */
  ensureSession?: () => Promise<unknown>;
  readShares?: (token: string) => Promise<Pick<LocationSharesResponse, "sharedWithMe">>;
  now?: () => number;
  tickMs?: number;
}

/**
 * The receiving half of live sharing: which companions have an open share, where they are, and whether
 * what we are showing is actually live (T2.1.8).
 *
 * Three decisions here are not visible in the UI but are the reason the map can be trusted:
 * - **the share list is the allow-list.** `applyShareList` seeds the registry from
 *   `GET /_user/location/shares`, and `applyPeerUpdate` refuses any id that is not in it. The server
 *   only emits to a peer holding an active share, so an id we have not seen means our read is out of
 *   date — usually a share created seconds ago, which is why an unknown id costs one re-read rather
 *   than being drawn on trust.
 * - **positions only move forwards**, so the double fan-out (HTTP route plus socket ack) and a reconnect
 *   replay cannot make a dot jump backwards.
 * - **nothing is dropped quietly.** A failed list read says so instead of claiming nobody shared; a peer
 *   who goes silent is greyed with their age, and only after `DISCARD_AFTER_MS` do they leave the map.
 *
 * The socket lifecycle mirrors `useLiveLocationBroadcast`: its own client, `close()` on teardown, so the
 * two halves never fight over one connection or leave a channel open after logout.
 */
export function useLiveCompanions(options: UseLiveCompanionsOptions) {
  const openSocket =
    options.openSocket ??
    (async (token: string) => {
      // A dynamic import, not a static one: `socket.io-client` is ~50 kB of transport code and belongs
      // on a route that is actually receiving positions, the same reason `MapCanvas` lazy-loads
      // maplibre. Signed out, this view never fetches it at all.
      const { createRealtimeClient: create } = await import("@/services/socket");
      return create(token);
    });
  const readShares = options.readShares ?? ((token: string) => listLocationShares(token));
  const clock = options.now ?? (() => Date.now());
  const tickMs = options.tickMs ?? PEER_TICK_MS;

  const registry = shallowRef<CompanionRegistry>(emptyRegistry);
  const connected = ref(false);
  const shareCount = ref(0);
  const readFailed = ref(false);
  const nowMs = ref(clock());
  let lastShareVerifyAt = nowMs.value;

  let client: RealtimeClient | null = null;
  let requestId = 0;
  let refreshing = false;
  let activeReads = 0;
  let readsGeneration = 0;
  let refreshingAuth = false;
  let inRefreshRetry = false;
  let authGeneration = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let openShareIds = new Set<string>();
  let restartQueued = false;
  let disposed = false;

  function queueRestart(): void {
    if (restartQueued) return;
    restartQueued = true;
    // Coalesce the owner's and token's synchronous changes during a login. Never
    // open an old owner's socket with the next owner's bearer in between them.
    queueMicrotask(() => {
      restartQueued = false;
      const token = options.accessToken.value;
      const owner = options.ownUserId.value;
      if (disposed || !token || !owner || !bearerBelongsToOwner(token, owner)) return;
      void ensureClient();
      if (!inRefreshRetry) void refresh();
    });
  }

  const peers = computed(() => peersOf(registry.value, nowMs.value));
  const overlay = computed(() => peersOverlay(registry.value, nowMs.value));
  const status = computed(() =>
    liveStatus(registry.value, {
      connected: connected.value,
      nowMs: nowMs.value,
      shareCount: shareCount.value,
      readFailed: readFailed.value
    })
  );

  function applyShares(shares: Awaited<ReturnType<typeof readShares>>): void {
    // Only `sharedWithMe` is a source of markers: `owned` rows are about who follows *me*, and drawing
    // my own followers' targets would put a dot on the map for somebody who never shared anything.
    openShareIds = new Set(
      shares.sharedWithMe
        .map((row) => row.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    );
    shareCount.value = shares.sharedWithMe.length;
    registry.value = applyShareList(registry.value, shares.sharedWithMe);
    readFailed.value = false;
  }

  async function refresh(): Promise<void> {
    // Invalidate older HTTP replies before even awaiting a session refresh. Otherwise
    // a sign-out/revocation during that await can resurrect another account's peers.
    const request = ++requestId;
    const owner = options.ownUserId.value;
    let token = options.accessToken.value;
    if (!token && options.ensureSession) {
      try {
        await options.ensureSession();
      } catch {
        // Handled by empty-token branch below.
      }
      token = options.accessToken.value;
    }
    if (request !== requestId || options.ownUserId.value !== owner || disposed) return;
    if (!token || !owner || !bearerBelongsToOwner(token, owner)) {
      registry.value = emptyRegistry;
      openShareIds = new Set();
      shareCount.value = 0;
      readFailed.value = false;
      return;
    }
    const readsSession = readsGeneration;
    activeReads++;
    refreshing = true;
    try {
      const shares = await readShares(token);
      if (request !== requestId || options.accessToken.value !== token || options.ownUserId.value !== owner || disposed) return;
      applyShares(shares);
    } catch (error) {
      const statusCode = (error as { status?: unknown } | null)?.status;
      if (request !== requestId || options.ownUserId.value !== owner || disposed) return;
      if (statusCode === 401 && options.ensureSession && !refreshingAuth) {
        refreshingAuth = true;
        inRefreshRetry = true;
        const authSession = authGeneration;
        try {
          await options.ensureSession();
          if (request !== requestId || options.ownUserId.value !== owner || disposed) return;
          const nextToken = options.accessToken.value;
          if (nextToken && nextToken !== token) {
            const retryRequest = ++requestId;
            try {
              const retried = await readShares(nextToken);
              if (retryRequest === requestId && options.accessToken.value === nextToken &&
                options.ownUserId.value === owner && !disposed) applyShares(retried);
            } catch {
              // The retry superseded the expired-token read. Report its failure against the
              // refreshed bearer, unless a newer read/account has already taken over.
              if (retryRequest === requestId && options.accessToken.value === nextToken &&
                options.ownUserId.value === owner && !disposed) readFailed.value = true;
            }
            return;
          }
        } catch {
          // Fall through to mark readFailed cleanly.
        } finally {
          if (authSession === authGeneration) {
            inRefreshRetry = false;
            refreshingAuth = false;
          }
        }
      }
      if (request !== requestId || options.accessToken.value !== token || options.ownUserId.value !== owner || disposed) return;
      readFailed.value = true;
    } finally {
      if (readsSession === readsGeneration) {
        activeReads--;
        refreshing = activeReads > 0;
      }
    }
  }

  function onPeerUpdate(payload: unknown): void {
    const result = applyPeerUpdate(
      registry.value,
      payload as { userId?: unknown; lat?: unknown; lon?: unknown; accuracy?: unknown; timestamp?: unknown },
      options.ownUserId.value
    );
    if (result.changed) {
      registry.value = result.registry;
      return;
    }
    if (result.reason === "unlisted" && !refreshing) {
      // The fix itself is dropped — an id we cannot attribute to a share is not something to draw. The
      // next one from that peer paints, because a broadcaster sends every 3–5s and the list has re-loaded
      // by then; nothing is lost but a few seconds of one dot's history.
      void refresh();
    }
  }

  function onShareEnded(payload: unknown): void {
    const candidate = payload as { shareId?: unknown; userId?: unknown; reason?: unknown } | null | undefined;
    const result = applyShareEnded(registry.value, candidate, openShareIds);
    if (result.shareEnded) {
      if (typeof candidate?.shareId === "string") openShareIds.delete(candidate.shareId);
      shareCount.value = Math.max(0, shareCount.value - 1);
    }
    if (result.registry !== registry.value) {
      registry.value = result.registry;
    }
    // A GET started before this event may still return a revoked share, even if
    // the initial list has not populated openShareIds yet. Recheck only when a
    // read is in flight; the new request invalidates its older response.
    if (result.reason !== "invalid" && refreshing) void refresh();
  }

  function onConnect(): void {
    connected.value = true;
    // Re-reading after a (re)connect is what notices a share revoked while we were disconnected.
    void refresh();
  }

  function onDisconnect(reason?: string): void {
    connected.value = false;
    // Server-initiated disconnects (`socket.disconnect(true)`) disable automatic Socket.IO reconnection.
    if (reason === "io server disconnect") {
      void onConnectError();
    }
  }

  async function onConnectError(): Promise<void> {
    connected.value = false;
    if (!options.ensureSession || refreshingAuth) return;
    const previousToken = options.accessToken.value;
    const owner = options.ownUserId.value;
    const currentClient = client;
    const authSession = authGeneration;
    refreshingAuth = true;
    try {
      await options.ensureSession();
      const nextToken = options.accessToken.value;
      if (nextToken && nextToken !== previousToken && owner &&
        options.ownUserId.value === owner && client === currentClient && currentClient && !disposed) {
        currentClient.updateToken(nextToken);
        if (currentClient.reconnect) currentClient.reconnect();
        else currentClient.connect();
      }
    } catch {
      // Next reconnect attempt or explicit user navigation will retry cleanly.
    } finally {
      if (authSession === authGeneration) refreshingAuth = false;
    }
  }

  function teardownClient(): void {
    // Bumped even when there is nothing to close, so a pending `ensureClient` cannot attach a socket the
    // view has already left behind.
    generation += 1;
    if (!client) return;
    client.socket.off("connect", onConnect);
    client.socket.off("disconnect", onDisconnect);
    client.socket.off("connect_error", onConnectError);
    client.socket.off(PEER_UPDATE_EVENT, onPeerUpdate);
    client.socket.off(SHARE_ENDED_EVENT, onShareEnded);
    client.close();
    client = null;
    connected.value = false;
  }

  let generation = 0;

  function clearPrivateState(): void {
    requestId++;
    readsGeneration++;
    activeReads = 0;
    refreshing = false;
    authGeneration++;
    refreshingAuth = false;
    inRefreshRetry = false;
    teardownClient();
    registry.value = emptyRegistry;
    openShareIds = new Set();
    shareCount.value = 0;
    readFailed.value = false;
  }

  async function ensureClient(): Promise<void> {
    const token = options.accessToken.value;
    const owner = options.ownUserId.value;
    if (!token || !owner || !bearerBelongsToOwner(token, owner) || disposed) {
      teardownClient();
      return;
    }
    if (client) {
      client.updateToken(token);
      return;
    }
    const request = ++generation;
    const opened = await openSocket(token);
    if (request !== generation || options.ownUserId.value !== owner ||
      options.accessToken.value !== token || !bearerBelongsToOwner(token, owner) || disposed) {
      // A newer owner, bearer or view won the race. Never attach the old room's listener.
      opened.close();
      return;
    }
    client = opened;
    client.socket.on("connect", onConnect);
    client.socket.on("disconnect", onDisconnect);
    client.socket.on("connect_error", onConnectError);
    client.socket.on(PEER_UPDATE_EVENT, onPeerUpdate);
    client.socket.on(SHARE_ENDED_EVENT, onShareEnded);
    client.connect();
  }

  timer = setInterval(() => {
    nowMs.value = clock();
    const pruned = pruneRegistry(registry.value, nowMs.value, DISCARD_AFTER_MS);
    if (pruned.changed) registry.value = pruned.registry;
    // A room emit may fail after the expiry/revocation committed. An uninterrupted
    // socket does not reconnect to trigger a read, so verify existing grants at most
    // once a minute. A pending read delays (rather than replaces) this verification.
    if (shareCount.value > 0 && !refreshing &&
      nowMs.value - lastShareVerifyAt >= SHARE_VERIFY_MS &&
      options.accessToken.value && options.ownUserId.value &&
      bearerBelongsToOwner(options.accessToken.value, options.ownUserId.value)) {
      lastShareVerifyAt = nowMs.value;
      void refresh();
    }
  }, tickMs);

  watch(options.ownUserId, () => {
    // A new account can arrive via another tab's refresh cookie without an intervening
    // token-null render. Remove the previous owner's coordinates and room immediately.
    clearPrivateState();
    queueRestart();
  }, { flush: "sync" });
  watch(options.accessToken, (token) => {
    const owner = options.ownUserId.value;
    if (!token || !owner || !bearerBelongsToOwner(token, owner)) clearPrivateState();
    else queueRestart();
  }, { flush: "sync" });

  onScopeDispose(() => {
    disposed = true;
    clearPrivateState();
    if (timer) clearInterval(timer);
    timer = null;
  });

  if (options.accessToken.value && options.ownUserId.value &&
    bearerBelongsToOwner(options.accessToken.value, options.ownUserId.value)) {
    void ensureClient();
    void refresh();
  }

  return { registry, peers, overlay, status, connected, shareCount, readFailed, nowMs, refresh };
}
