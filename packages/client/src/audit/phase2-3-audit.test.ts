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
        ownUserId: ref("11111111-1111-4111-8111-111111111111"),
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
        ownerId: ref("11111111-1111-4111-8111-111111111111"),
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
    const shareSession = readFileSync(new URL("../sharing/share-list-session.ts", import.meta.url), "utf8");
    expect(shareSession).toContain("SHARE_ENDED_EVENT");
    expect(shareLists).toMatch(/onBeforeUnmount\(\(\) => \{\s*disposed = true;\s*revocationFence\.invalidate\(\);\s*readVersion \+= 1;\s*shareSync\.close\(\);\s*\}\);/);

    expect(playbackPanel).toContain("route.query.historyShare");
    expect(playbackPanel).toContain('props.api.selectSource("grant")');
    expect(playbackPanel).toContain("props.api.selectGrant(");

    expect(shareDialog).toContain("incidentTypeChoice !== null || minRatingChoice !== null || onlineFilter === 'online'");

    const memberSearch = readFileSync(new URL("../admin/use-category-member-search.ts", import.meta.url), "utf8");
    expect(adminCategories).toContain("useCategoryMemberSearch(async (term) =>");
    expect(memberSearch).toContain("!assigned.has(row.id)");
    expect(adminCategories).not.toContain("در مرحلهٔ بعدی پروژه است");

    const devicePriorityPanel = readFileSync(
      new URL("../components/settings/DevicePriorityPanel.vue", import.meta.url),
      "utf8"
    );
    expect(devicePriorityPanel).toContain('if (minutes <= 0) return "همین الان"');
  });

  it("useAdminSosStore hydrates cancelled_by_rescuer + dispatched counts accurately on initial load and prefers visible requests", async () => {
    setActivePinia(createPinia());
    const auth = useAuthStore();
    auth.accessToken = makeJwt("admin-dev-initial");
    auth.user = {
      id: "44444444-4444-4444-8444-444444444444",
      username: "dispatch_ops",
      role: "admin",
      mustCompleteSecurityQuestions: true
    };

    const listRequests = vi.fn(async (_token, params) => {
      // Unfiltered initial fetch returns all statuses including cancelled_by_rescuer + dispatched:
      expect(params.status).toBeUndefined();
      return {
        total: 3,
        items: [
          {
            id: "66666666-6666-4666-8666-666666666661",
            requesterId: "11111111-1111-4111-8111-111111111111",
            severity: "low" as const,
            description: "مأموریت تکمیل‌شده قدیمی‌تر برای تست اولویت انتخاب",
            incidentTypeId: "77777777-7777-4777-8777-777777777777",
            location: { lat: 35.71, lon: 51.41, accuracy: 8, isManual: false },
            photoUrl: null,
            status: "completed" as const,
            cancellationReasonId: null,
            cancellationCustomText: null,
            cancelledAt: null,
            createdAt: "2026-10-23T13:05:00.000Z"
          },
          {
            id: "66666666-6666-4666-8666-666666666662",
            requesterId: "11111111-1111-4111-8111-111111111111",
            severity: "high" as const,
            description: "درخواست لغوشده توسط امدادگر و نیازمند اعزام فوری مجدد",
            incidentTypeId: "77777777-7777-4777-8777-777777777777",
            location: { lat: 35.72, lon: 51.42, accuracy: 6, isManual: false },
            photoUrl: null,
            status: "cancelled_by_rescuer" as const,
            cancellationReasonId: null,
            cancellationCustomText: null,
            cancelledAt: "2026-10-23T13:02:00.000Z",
            createdAt: "2026-10-23T13:00:00.000Z"
          },
          {
            id: "66666666-6666-4666-8666-666666666663",
            requesterId: "11111111-1111-4111-8111-111111111111",
            severity: "medium" as const,
            description: "درخواست در حال انتظار پذیرش امدادگران اعزامی",
            incidentTypeId: "77777777-7777-4777-8777-777777777777",
            location: { lat: 35.73, lon: 51.43, accuracy: 10, isManual: false },
            photoUrl: null,
            status: "dispatched" as const,
            cancellationReasonId: null,
            cancellationCustomText: null,
            cancelledAt: null,
            createdAt: "2026-10-23T12:55:00.000Z"
          }
        ]
      };
    });

    const sock = makeFakeSocket();
    configureAdminSosRuntimeForTests({
      openSocket: async () => ({
        socket: sock as unknown as RealtimeClient["socket"],
        connect: vi.fn(),
        updateToken: vi.fn(),
        close: vi.fn()
      }),
      listRequests
    });

    const store = useAdminSosStore();
    await store.refreshRequests();

    expect(store.pendingCount).toBe(1);
    expect(store.dispatchedCount).toBe(1);
    expect(store.requests).toHaveLength(3);
    expect(store.visibleRequests).toHaveLength(1);
    expect(store.selectedId).toBe("66666666-6666-4666-8666-666666666662");
    store.resetState();
  });

  it("serializes category, incidentType, lat, and lon in userSearchQuery, exempts admins from client onboarding lock, and localizes Phase 3 API errors", async () => {
    const { userSearchQuery } = await import("../api/location");
    const { friendlyErrorMessage } = await import("../api/error-message");
    const { sosApiErrorMessage } = await import("../sos/sos-form");

    const { userSearchSchema } = await import("@shared/index");
    const query = userSearchQuery({
      q: "  rescuer  ",
      category: "40000000-0000-4000-8000-000000000001",
      incidentType: "30000000-0000-4000-8000-000000000001",
      minRating: 4.5,
      online: true,
      lat: 35.8012,
      lon: 51.4285,
      sortBy: "distance",
      limit: 20
    });
    const parsedQuery = new URLSearchParams(query);
    expect(parsedQuery.get("q")).toBe("rescuer");
    expect(parsedQuery.get("category")).toBe("40000000-0000-4000-8000-000000000001");
    expect(parsedQuery.get("incidentType")).toBe("30000000-0000-4000-8000-000000000001");
    expect(parsedQuery.get("minRating")).toBe("4.5");
    expect(parsedQuery.get("online")).toBe("true");
    expect(parsedQuery.get("lat")).toBe("35.8012");
    expect(parsedQuery.get("lon")).toBe("51.4285");
    expect(parsedQuery.get("sort")).toBe("distance");
    expect(parsedQuery.has("sortBy")).toBe(false);
    // Validate the exact serialized query against the server's strict userSearchSchema!
    expect(() => userSearchSchema.parse(Object.fromEntries(parsedQuery.entries()))).not.toThrow();

    // Admin accounts with mustCompleteSecurityQuestions = true are NOT locked out of admin views:
    setActivePinia(createPinia());
    const auth = useAuthStore();
    auth.accessToken = makeJwt("admin-dev-onboarding-exempt");
    auth.user = {
      id: "99999999-9999-4999-8999-999999999999",
      username: "admin_with_flag",
      role: "admin",
      mustCompleteSecurityQuestions: true
    };
    expect(auth.mustCompleteSecurityQuestions).toBe(false);

    // Phase 3 error codes resolve to localized Persian messages in both general & SOS/Admin surfaces:
    for (const code of [
      "INCIDENT_TYPE_SLUG_TAKEN",
      "SOS_REQUEST_NOT_FOUND",
      "INVALID_SOS_STATUS",
      "RESCUER_BUSY",
      "PHOTO_TOO_LARGE",
      "PHOTO_URL_NOT_ACCEPTED",
      "TOO_MANY_PARTS"
    ]) {
      const apiErr = new ApiError(409, code, "Raw English Server Message");
      const msg = friendlyErrorMessage(apiErr, "FALLBACK_SENTINEL");
      expect(msg, code).not.toBe("FALLBACK_SENTINEL");
      expect(msg, code).not.toBe("Raw English Server Message");
      expect(sosApiErrorMessage(apiErr, "FALLBACK_SENTINEL"), code).not.toBe("FALLBACK_SENTINEL");
    }

    // useAdminSosStore translates server ApiError codes into Persian instead of leaking English text:
    const sock = makeFakeSocket();
    configureAdminSosRuntimeForTests({
      openSocket: async () => ({
        socket: sock as unknown as RealtimeClient["socket"],
        connect: vi.fn(),
        updateToken: vi.fn(),
        close: vi.fn()
      }),
      listRequests: async () => ({
        total: 1,
        items: [
          {
            id: "88888888-8888-4888-8888-888888888888",
            requesterId: "11111111-1111-4111-8111-111111111111",
            severity: "high" as const,
            description: "آزمون خطای فارسی در پنل اعزام امدادگر",
            incidentTypeId: "77777777-7777-4777-8777-777777777777",
            location: { lat: 35.7, lon: 51.4, accuracy: 5, isManual: false },
            photoUrl: null,
            status: "pending" as const,
            cancellationReasonId: null,
            cancellationCustomText: null,
            cancelledAt: null,
            createdAt: "2026-10-23T14:00:00.000Z"
          }
        ]
      }),
      getNearestResponders: async () => ({
        responders: [
          {
            userId: "77777777-7777-4777-8777-777777777771",
            username: "rescuer_busy_1",
            distance: 220,
            avgRating: 4.8,
            categoryName: "امداد شهری",
            lastActiveAt: "2026-10-23T14:00:00.000Z"
          }
        ]
      }),
      dispatchResponders: async () => {
        throw new ApiError(409, "RESCUER_BUSY", "Selected responders are already assigned to an active mission.");
      }
    });

    const store = useAdminSosStore();
    await vi.waitFor(() => expect(store.nearestResponders).toHaveLength(1));
    store.toggleResponderSelection("77777777-7777-4777-8777-777777777771");
    const dispatched = await store.dispatchSelectedResponders();
    expect(dispatched).toBe(false);
    expect(store.dispatchFeedback?.type).toBe("error");
    expect(store.dispatchFeedback?.message).not.toContain("Selected responders are already assigned");
    expect(store.dispatchFeedback?.message).toContain("مأموریت فعال");
    store.resetState();
  });
});
