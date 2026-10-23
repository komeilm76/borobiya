import { EventEmitter } from "node:events";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SosRequestRecord } from "@shared/index";
import { ApiError } from "@/api/http";
import { SOS_NEW_REQUEST_EVENT } from "@/services/socket-events";
import { useAuthStore } from "./auth";
import { configureAdminSosRuntimeForTests, useAdminSosStore } from "./admin-sos";

function makeSosRecord(overrides: Partial<SosRequestRecord> = {}): SosRequestRecord {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    requesterId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    severity: "high",
    description: "تصادف شدید زنجیره‌ای در محور کوهستانی و نیاز به امداد فوری",
    incidentTypeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    location: {
      lat: 35.75,
      lon: 51.41,
      accuracy: 8,
      isManual: false
    },
    photoUrl: null,
    status: "pending",
    cancellationReasonId: null,
    cancellationCustomText: null,
    cancelledAt: null,
    createdAt: "2026-10-23T12:00:00.000Z",
    ...overrides
  };
}

describe("useAdminSosStore (T3.2.5)", () => {
  let socketEmitter: EventEmitter & { connected: boolean };
  let playedCount = 0;

  beforeEach(() => {
    setActivePinia(createPinia());
    playedCount = 0;
    socketEmitter = Object.assign(new EventEmitter(), { connected: false });
  });

  afterEach(() => {
    configureAdminSosRuntimeForTests();
  });

  function fakeSocketOpener() {
    return async () => ({
      socket: socketEmitter as never,
      updateToken: vi.fn(),
      connect: () => {
        socketEmitter.connected = true;
      },
      close: () => {
        socketEmitter.removeAllListeners();
        socketEmitter.connected = false;
      }
    });
  }

  it("hydrates pending requests for admins, chimes once per unique SOS, updates photoUrl in place, and clears on logout", async () => {
    const initialRow = makeSosRecord({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-10-23T11:55:00.000Z"
    });
    const listRequests = vi.fn(async () => ({ items: [initialRow], total: 1 }));

    configureAdminSosRuntimeForTests({
      openSocket: fakeSocketOpener(),
      listRequests,
      createAudioContext: () => ({
        currentTime: 0,
        destination: {},
        createOscillator: () => ({
          type: "sine",
          frequency: { setValueAtTime: () => { playedCount++; } },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn()
        }),
        createGain: () => ({
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn()
          },
          connect: vi.fn()
        })
      })
    });

    const auth = useAuthStore();
    auth.accessToken = "admin-jwt-1";
    auth.user = {
      id: "admin-1",
      username: "admin",
      role: "admin",
      mustCompleteSecurityQuestions: false
    };

    const store = useAdminSosStore();
    await vi.waitFor(() => {
      expect(store.requests).toHaveLength(1);
      expect(socketEmitter.connected).toBe(true);
    });
    expect(store.pendingCount).toBe(1);
    expect(playedCount).toBe(0);

    // Live socket event arrives -> plays high severity 3-note chime and opens alert banner.
    const liveId = "22222222-2222-4222-8222-222222222222";
    socketEmitter.emit(SOS_NEW_REQUEST_EVENT, {
      sosRequest: makeSosRecord({
        id: liveId,
        severity: "high",
        photoUrl: null,
        createdAt: "2026-10-23T12:05:00.000Z"
      })
    });

    await vi.waitFor(() => {
      expect(playedCount).toBe(3);
    });
    expect(store.pendingCount).toBe(2);
    expect(store.latestAlert?.id).toBe(liveId);

    // Follow-up broadcast attaching photo updates record & banner WITHOUT re-playing chime!
    socketEmitter.emit(SOS_NEW_REQUEST_EVENT, {
      sosRequest: makeSosRecord({
        id: liveId,
        severity: "high",
        photoUrl: "uploads/live-photo.jpg",
        createdAt: "2026-10-23T12:05:00.000Z"
      })
    });

    expect(playedCount).toBe(3);
    expect(store.requests.find((r) => r.id === liveId)?.photoUrl).toBe("uploads/live-photo.jpg");
    expect(store.latestAlert?.photoUrl).toBe("uploads/live-photo.jpg");

    // Clearing auth session closes socket and resets admin state cleanly.
    auth.accessToken = null;
    auth.user = null;
    await vi.waitFor(() => {
      expect(store.requests).toHaveLength(0);
      expect(socketEmitter.connected).toBe(false);
    });
    expect(store.latestAlert).toBeNull();
  });

  it("retries list read automatically after refreshing an expired access token on HTTP 401", async () => {
    const auth = useAuthStore();
    auth.accessToken = "expired-admin-token";
    auth.user = {
      id: "admin-1",
      username: "admin",
      role: "admin",
      mustCompleteSecurityQuestions: false
    };

    vi.spyOn(auth, "refreshSession").mockImplementation(async () => {
      auth.accessToken = "fresh-admin-token";
      return true;
    });

    const row = makeSosRecord();
    const listRequests = vi.fn(async (token: string) => {
      if (token === "expired-admin-token") {
        throw new ApiError(401, "INVALID_ACCESS_TOKEN", "Token expired");
      }
      return { items: [row], total: 1 };
    });

    configureAdminSosRuntimeForTests({
      openSocket: fakeSocketOpener(),
      listRequests
    });
    const store = useAdminSosStore();
    await store.refreshRequests();

    expect(auth.refreshSession).toHaveBeenCalled();
    expect(store.requests).toEqual([row]);
    expect(store.errorMessage).toBeNull();
  });

  it("refreshes session and reconnects socket when handshake fails with data.code INVALID_ACCESS_TOKEN", async () => {
    const updateToken = vi.fn();
    configureAdminSosRuntimeForTests({
      openSocket: async () => ({
        socket: socketEmitter as never,
        updateToken,
        connect: () => {
          socketEmitter.connected = true;
        },
        close: () => {
          socketEmitter.removeAllListeners();
          socketEmitter.connected = false;
        }
      }),
      listRequests: async () => ({ items: [], total: 0 })
    });

    const auth = useAuthStore();
    auth.accessToken = "stale-ws-token";
    auth.user = {
      id: "admin-1",
      username: "admin",
      role: "admin",
      mustCompleteSecurityQuestions: false
    };
    const refreshSpy = vi.spyOn(auth, "refreshSession").mockImplementation(async () => {
      auth.accessToken = "rotated-ws-token";
      return true;
    });

    useAdminSosStore();
    await vi.waitFor(() => expect(socketEmitter.listenerCount("connect_error")).toBe(1));

    socketEmitter.emit(
      "connect_error",
      Object.assign(new Error("Handshake rejected"), { data: { code: "INVALID_ACCESS_TOKEN" } })
    );

    await vi.waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledOnce();
      expect(updateToken).toHaveBeenCalledWith("rotated-ws-token");
    });
  });
});
