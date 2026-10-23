import { readFileSync } from "node:fs";
import { effectScope, ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/http";
import { useLiveCompanions } from "@/composables/use-live-companions";
import { useHistoryPlayback } from "@/composables/use-history-playback";
import { useLiveLocationBroadcast } from "@/composables/useLiveLocationBroadcast";
import type { RealtimeClient } from "@/services/socket";
import { configureAdminSosRuntimeForTests, useAdminSosStore } from "@/stores/admin-sos";
import { useAuthStore } from "@/stores/auth";

vi.mock("@/api/location", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/location")>();
  return {
    ...actual,
    listLocationHistoryShares: vi.fn(),
    fetchMyLocationHistory: vi.fn(),
    fetchSharedLocationHistory: vi.fn()
  };
});

import {
  fetchMyLocationHistory,
  listLocationHistoryShares
} from "@/api/location";

function makeJwt(deviceId: string, expSecondsFromNow = 900): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: "11111111-1111-4111-8111-111111111111",
      role: "user",
      sessionId: "22222222-2222-4222-8222-222222222222",
      deviceId,
      exp: Math.floor(Date.now() / 1000) + expSecondsFromNow
    })
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}

function makeFakeSocket() {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  let emitCount = 0;
  return {
    connected: true,
    emitCount: () => emitCount,
    on(event: string, fn: (...args: unknown[]) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
      return this;
    },
    off(event: string, fn: (...args: unknown[]) => void) {
      handlers.get(event)?.delete(fn);
      return this;
    },
    timeout() {
      return {
        emit(_event: string, _payload: unknown, cb?: (err: Error | null, ack: unknown) => void) {
          emitCount += 1;
          if (emitCount === 1) {
            cb?.(null, { ok: false, status: "rejected", code: "UNAUTHORIZED" });
          } else {
            cb?.(null, { ok: true, status: "accepted", peers: ["peer-1"] });
          }
        }
      };
    },
    dispatch(event: string, ...args: unknown[]) {
      for (const fn of handlers.get(event) ?? []) fn(...args);
    }
  };
}

describe("Phase 2 & 3 client cross-cutting bug regression suite", () => {
  afterEach(() => {
    configureAdminSosRuntimeForTests({});
    vi.restoreAllMocks();
  });

  it("useLiveCompanions.refresh() resolves with populated shares immediately after inline 401 session refresh", async () => {
    const token = ref<string | null>("stale-jwt");
    const ensureSession = vi.fn(async () => {
      token.value = "fresh-jwt";
    });
    const readShares = vi.fn(async (supplied: string) => {
      if (supplied === "stale-jwt") {
        throw Object.assign(new Error("Unauthorized"), { status: 401 });
      }
      return {
        sharedWithMe: [
          {
            id: "share-live-1",
            ownerId: "33333333-3333-4333-8333-333333333333",
            targetUserId: "11111111-1111-4111-8111-111111111111",
            mode: "permanent" as const,
            expiresAt: null,
            isRevoked: false,
            priorityDeviceId: null,
            note: null,
            createdAt: new Date().toISOString(),
            owner: {
              id: "33333333-3333-4333-8333-333333333333",
              username: "companion_sara",
              lastLocation: { lat: 35.71, lon: 51.41, updatedAt: new Date().toISOString() }
            }
          }
        ]
      };
    });

    const sock = makeFakeSocket();
    const reconnect = vi.fn();
    const scope = effectScope();
    const api = scope.run(() =>
      useLiveCompanions({
        accessToken: token,
        ensureSession,
        readShares,
        openSocket: () => ({
          socket: sock as unknown as RealtimeClient["socket"],
          connect: vi.fn(),
          reconnect,
          updateToken: vi.fn(),
          close: vi.fn()
        })
      })
    )!;

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 15));

    expect(api.shareCount.value).toBe(1);
    expect(api.peers.value).toHaveLength(1);
    expect(api.peers.value[0]?.name).toBe("companion_sara");
    expect(api.readFailed.value).toBe(false);

    // Server-initiated disconnect ("io server disconnect") triggers automatic session refresh + reconnect:
    ensureSession.mockImplementationOnce(async () => {
      token.value = "fresh-jwt-2";
    });
    sock.dispatch("disconnect", "io server disconnect");
    await new Promise((r) => setTimeout(r, 15));
    expect(reconnect).toHaveBeenCalledTimes(1);

    scope.stop();
  });

  it("useLiveLocationBroadcast forces a fresh socket reconnect when location:update ack fails with UNAUTHORIZED", async () => {
    const currentToken = ref<string | null>(makeJwt("device-alpha"));
    const reconnect = vi.fn();
    const updateToken = vi.fn();
    const sock = makeFakeSocket();

    const scope = effectScope();
    const broadcast = scope.run(() =>
      useLiveLocationBroadcast({
        accessToken: currentToken,
        ensureSession: async () => {
          currentToken.value = makeJwt("device-alpha", 1800);
        },
        openSocket: () => ({
          socket: sock as unknown as RealtimeClient["socket"],
          connect: vi.fn(),
          reconnect,
          updateToken,
          close: vi.fn()
        }),
        geolocation: {
          coords: ref({ latitude: 35.7, longitude: 51.4, accuracy: 8 }),
          error: ref(null),
          isSupported: ref(true),
          resume: vi.fn(),
          pause: vi.fn()
        }
      })
    )!;

    await broadcast.start();
    await new Promise((r) => setTimeout(r, 20));

    expect(updateToken).toHaveBeenLastCalledWith(currentToken.value);
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(broadcast.status.value).toBe("connecting");

    // Once the reconnected socket completes handshake, the queued GPS fix flushes and resumes broadcasting:
    sock.dispatch("connect");
    await new Promise((r) => setTimeout(r, 20));
    expect(broadcast.status.value).toBe("broadcasting");
    expect(broadcast.peerCount.value).toBe(1);

    scope.stop();
  });

  it("useAdminSosStore automatically refreshes session and reconnects on server-initiated disconnect", async () => {
    setActivePinia(createPinia());
    const auth = useAuthStore();
    auth.accessToken = makeJwt("admin-dev-1");
    auth.user = {
      id: "44444444-4444-4444-8444-444444444444",
      username: "dispatch_ops",
      role: "admin",
      mustCompleteSecurityQuestions: true
    };
    vi.spyOn(auth, "refreshSession").mockImplementation(async () => {
      auth.accessToken = makeJwt("admin-dev-1", 1800);
      return true;
    });

    const sock = makeFakeSocket();
    const reconnect = vi.fn();
    configureAdminSosRuntimeForTests({
      openSocket: async () => ({
        socket: sock as unknown as RealtimeClient["socket"],
        connect: vi.fn(),
        reconnect,
        updateToken: vi.fn(),
        close: vi.fn()
      }),
      listRequests: async () => ({ items: [], total: 0 })
    });

    const adminSos = useAdminSosStore();
    adminSos.startMonitoring();
    await new Promise((r) => setTimeout(r, 15));

    sock.dispatch("disconnect", "io server disconnect");
    await new Promise((r) => setTimeout(r, 15));

    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(reconnect).toHaveBeenCalledTimes(1);
    adminSos.resetState();
  });

  it("useHistoryPlayback retries automatically with refreshed token on HTTP 401 for both loadShares and load", async () => {
    const token = ref<string | null>("expired-hist-jwt");
    const refreshSession = vi.fn(async () => {
      token.value = "fresh-hist-jwt";
      return true;
    });

    vi.mocked(listLocationHistoryShares)
      .mockRejectedValueOnce(new ApiError(401, "UNAUTHORIZED", "Unauthorized"))
      .mockResolvedValueOnce({
        owned: [],
        sharedWithMe: [
          {
            id: "hist-share-1",
            ownerId: "55555555-5555-4555-8555-555555555555",
            targetUserId: "11111111-1111-4111-8111-111111111111",
            from: "2026-10-22T08:00:00.000Z",
            to: "2026-10-22T12:00:00.000Z",
            maxPoints: 500,
            createdAt: "2026-10-22T12:05:00.000Z",
            owner: { id: "55555555-5555-4555-8555-555555555555", username: "walker_ali" }
          }
        ]
      });

    vi.mocked(fetchMyLocationHistory)
      .mockRejectedValueOnce(new ApiError(401, "UNAUTHORIZED", "Unauthorized"))
      .mockResolvedValueOnce({
        points: [{ lat: 35.7, lon: 51.4, accuracy: 6, timestamp: "2026-10-23T09:00:00.000Z" }],
        totalPoints: 1
      });

    const scope = effectScope();
    const playback = scope.run(() =>
      useHistoryPlayback({
        accessToken: token,
        refreshSession
      })
    )!;

    await playback.loadShares();
    expect(playback.grantsFailed.value).toBe(false);
    expect(playback.grants.value).toHaveLength(1);

    token.value = "expired-hist-jwt";
    await playback.selectPreset(1);
    expect(playback.failed.value).toBe(false);
    expect(playback.points.value).toHaveLength(1);

    scope.stop();
  });

  it("pins UI deep-linking, live revocation sync, search filter guidance, and duplicate-member exclusion", () => {
    const shareLists = readFileSync(
      new URL("../components/sharing/ShareLists.vue", import.meta.url),
      "utf8"
    );
    const playbackPanel = readFileSync(
      new URL("../components/map/HistoryPlaybackPanel.vue", import.meta.url),
      "utf8"
    );
    const shareDialog = readFileSync(
      new URL("../components/sharing/ShareDialog.vue", import.meta.url),
      "utf8"
    );
    const adminCategories = readFileSync(
      new URL("../views/_admin/AdminCategoriesView.vue", import.meta.url),
      "utf8"
    );

    expect(shareLists).toContain("query: { historyShare: row.id }");
    expect(shareLists).toContain("SHARE_ENDED_EVENT");
    expect(shareLists).toContain("onBeforeUnmount(detachRealtimeShareSync)");

    expect(playbackPanel).toContain("route.query.historyShare");
    expect(playbackPanel).toContain('props.api.selectSource("grant")');
    expect(playbackPanel).toContain("props.api.selectGrant(");

    expect(shareDialog).toContain("incidentTypeChoice !== null || minRatingChoice !== null || onlineFilter === 'online'");

    expect(adminCategories).toContain("!assignedIds.has(candidate.id)");
    expect(adminCategories).not.toContain("در مرحلهٔ بعدی پروژه است");
  });
});
