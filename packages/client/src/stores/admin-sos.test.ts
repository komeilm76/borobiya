import { EventEmitter } from "node:events";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mission, SosRequestRecord } from "@shared/index";
import { ApiError } from "@/api/http";
import { MISSION_CANCELLED_BY_RESCUER_EVENT, SOS_NEW_REQUEST_EVENT } from "@/services/socket-events";
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

  it("retries failed SOS socket setup and handshake, then stops retrying on logout", async () => {
    vi.useFakeTimers();
    try {
      const connect = vi.fn(() => { socketEmitter.connected = true; });
      const close = vi.fn();
      const openSocket = vi.fn().mockRejectedValueOnce(new Error("temporary setup failure"))
        .mockResolvedValue({ socket: socketEmitter, updateToken: vi.fn(), connect, close });
      configureAdminSosRuntimeForTests({ openSocket,
        listRequests: async () => ({ items: [], total: 0 }) });
      const auth = useAuthStore();
      auth.user = { id: "admin-1", username: "admin", role: "admin", mustCompleteSecurityQuestions: false };
      auth.accessToken = "admin-token";
      useAdminSosStore();
      await nextTick();
      await Promise.resolve();
      expect(openSocket).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(openSocket).toHaveBeenCalledTimes(2);
      expect(connect).toHaveBeenCalledOnce();
      socketEmitter.connected = false;
      socketEmitter.emit("connect_error", new Error("temporary handshake failure"));
      await vi.advanceTimersByTimeAsync(30_000);
      expect(connect).toHaveBeenCalledTimes(2);
      auth.accessToken = null;
      auth.user = null;
      await nextTick();
      expect(close).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(connect).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  const cancelledEvent = (sosRequestId: string) => ({
    missionId: "11111111-1111-4111-8111-111111111111",
    sosRequestId,
    rescuerId: "22222222-2222-4222-8222-222222222222",
    reason: "ناتوانی در ادامه",
    at: "2026-10-24T12:00:00.000Z",
    rescuerLocation: { lat: 35.7, lon: 51.4 },
    reviewRequired: true
  });

  it("deduplicates urgent cancellations, resolves exact SOSs beyond the queue, and clears private data on logout", async () => {
    const row = makeSosRecord({ status: "cancelled_by_rescuer" });
    const getRequest = vi.fn(async () => row);
    configureAdminSosRuntimeForTests({
      openSocket: fakeSocketOpener(),
      listRequests: async () => ({ items: [], total: 0 }), getRequest,
      getNearestResponders: async () => ({ responders: [] }),
      createAudioContext: () => ({
        currentTime: 0, destination: {},
        createOscillator: () => ({ type: "sine", frequency: { setValueAtTime: () => { playedCount++; } },
          connect: vi.fn(), start: vi.fn(), stop: vi.fn() }),
        createGain: () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() })
      })
    });
    const auth = useAuthStore();
    auth.accessToken = "admin-jwt";
    auth.user = { id: "admin-1", username: "admin", role: "admin", mustCompleteSecurityQuestions: false };
    const store = useAdminSosStore();
    await vi.waitFor(() => expect(socketEmitter.listenerCount(MISSION_CANCELLED_BY_RESCUER_EVENT)).toBe(1));
    const event = cancelledEvent(row.id);
    socketEmitter.emit(MISSION_CANCELLED_BY_RESCUER_EVENT, { ...event, reviewRequired: undefined });
    socketEmitter.emit(MISSION_CANCELLED_BY_RESCUER_EVENT, { ...event, rescuerLocation: { lat: 200, lon: 51 } });
    expect(store.urgentReplacement).toBeNull();
    socketEmitter.emit(MISSION_CANCELLED_BY_RESCUER_EVENT, event);
    socketEmitter.emit(MISSION_CANCELLED_BY_RESCUER_EVENT, event);
    await vi.waitFor(() => expect(store.requests.find((item) => item.id === row.id)).toEqual(row));
    expect(store.pendingCount).toBe(1);
    expect(store.urgentReplacement?.reviewRequired).toBe(true);
    expect(store.replacementByRequest[row.id]?.rescuerLocation).toEqual(event.rescuerLocation);
    expect(getRequest).toHaveBeenCalledTimes(1);
    expect(playedCount).toBe(3);
    store.dismissUrgentReplacement();
    expect(store.urgentReplacement).toBeNull();
    expect(store.replacementByRequest[row.id]).toBeDefined();
    auth.accessToken = null;
    auth.user = null;
    await nextTick();
    expect(store.requests).toEqual([]);
    expect(store.replacementByRequest).toEqual({});
    expect(socketEmitter.listenerCount(MISSION_CANCELLED_BY_RESCUER_EVENT)).toBe(0);
  });

  it("ignores a pre-event list reply and clears replacement after a successful dispatch", async () => {
    const accepted = makeSosRecord({ status: "accepted" });
    const cancelled = makeSosRecord({ status: "cancelled_by_rescuer" });
    let finishOldList!: (value: { items: SosRequestRecord[]; total: number }) => void;
    const oldList = new Promise<{ items: SosRequestRecord[]; total: number }>((resolve) => { finishOldList = resolve; });
    const listRequests = vi.fn().mockImplementationOnce(() => oldList)
      .mockResolvedValue({ items: [cancelled], total: 1 });
    configureAdminSosRuntimeForTests({
      openSocket: fakeSocketOpener(), listRequests,
      getRequest: async () => cancelled,
      getNearestResponders: async () => ({ responders: [] }),
      dispatchResponders: async () => ({ proposals: [] })
    });
    const auth = useAuthStore();
    auth.accessToken = "admin-jwt";
    auth.user = { id: "admin-1", username: "admin", role: "admin", mustCompleteSecurityQuestions: false };
    const store = useAdminSosStore();
    await vi.waitFor(() => expect(listRequests).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(socketEmitter.listenerCount(MISSION_CANCELLED_BY_RESCUER_EVENT)).toBe(1));
    socketEmitter.emit(MISSION_CANCELLED_BY_RESCUER_EVENT, cancelledEvent(cancelled.id));
    await vi.waitFor(() => expect(store.selectedRequest?.status).toBe("cancelled_by_rescuer"));
    finishOldList({ items: [accepted], total: 1 });
    await oldList;
    await nextTick();
    expect(store.selectedRequest?.status).toBe("cancelled_by_rescuer");
    store.selectedResponderIds = ["44444444-4444-4444-8444-444444444441"];
    expect(await store.dispatchSelectedResponders()).toBe(true);
    expect(store.selectedRequest?.status).toBe("dispatched");
    expect(store.urgentReplacement).toBeNull();
    expect(store.replacementByRequest[cancelled.id]).toBeUndefined();
  });

  it("re-dispatches immediately to up to ten new nearby responders, never a previously assigned rescuer", async () => {
    const row = makeSosRecord({ status: "cancelled_by_rescuer" });
    const old = "22222222-2222-4222-8222-222222222222";
    const newId = "44444444-4444-4444-8444-444444444441";
    const another = "44444444-4444-4444-8444-444444444442";
    const past: Mission = { id: "11111111-1111-4111-8111-111111111111", sosRequestId: row.id,
      requesterId: row.requesterId, rescuerId: old, status: "cancelled_by_rescuer", cancelledBy: "rescuer",
      cancellationReasonId: null, cancellationCustomText: null, cancelledAt: row.createdAt,
      createdAt: row.createdAt, updatedAt: row.createdAt };
    const getRequest = vi.fn(async () => row);
    const listRequestMissions = vi.fn(async () => [past]);
    const getNearestResponders = vi.fn(async () => ({ responders: [old, newId, another].map((userId) => ({
      userId, username: `r_${userId.slice(-4)}`, categoryName: "rescue", distance: 100,
      avgRating: null, lastActiveAt: row.createdAt
    })) }));
    const dispatchResponders = vi.fn(async () => ({ proposals: [] }));
    configureAdminSosRuntimeForTests({ openSocket: fakeSocketOpener(),
      listRequests: async () => ({ items: [row], total: 1 }),
      getRequest, listRequestMissions, getNearestResponders, dispatchResponders });
    const auth = useAuthStore();
    auth.accessToken = "admin-jwt";
    auth.user = { id: "admin-1", username: "admin", role: "admin", mustCompleteSecurityQuestions: false };
    const store = useAdminSosStore();
    await vi.waitFor(() => expect(store.selectedRequest?.id).toBe(row.id));
    expect(await store.redispatchNearest(row.id)).toBe(true); // works after reload without a socket alert
    expect(listRequestMissions).toHaveBeenCalledWith("admin-jwt", row.id, true);
    expect(getNearestResponders).toHaveBeenCalledWith(row.id, "admin-jwt", undefined, true);
    expect(dispatchResponders).toHaveBeenCalledWith(row.id, [newId, another], "admin-jwt");
    expect(store.selectedRequest?.status).toBe("dispatched");
    expect(store.quickDispatchFeedback?.type).toBe("success");
    expect(await store.redispatchNearest(row.id)).toBe(false); // no repeat after success
  });

  it("rechecks replacement status and refuses stale SOS, empty candidates, and late logout responses", async () => {
    const row = makeSosRecord({ status: "cancelled_by_rescuer" });
    const dispatchResponders = vi.fn(async () => ({ proposals: [] }));
    let current = makeSosRecord({ status: "accepted" });
    let finish!: (value: SosRequestRecord) => void;
    const getRequest = vi.fn(async () => current);
    configureAdminSosRuntimeForTests({ openSocket: fakeSocketOpener(),
      listRequests: async () => ({ items: [row], total: 1 }), getRequest,
      getNearestResponders: async () => ({ responders: [] }),
      listRequestMissions: async () => [], dispatchResponders });
    const auth = useAuthStore();
    auth.accessToken = "admin-jwt";
    auth.user = { id: "admin-1", username: "admin", role: "admin", mustCompleteSecurityQuestions: false };
    const store = useAdminSosStore();
    await vi.waitFor(() => expect(store.selectedRequest?.id).toBe(row.id));
    expect(await store.redispatchNearest(row.id)).toBe(false);
    expect(store.selectedRequest?.status).toBe("accepted");
    expect(dispatchResponders).not.toHaveBeenCalled();
    store.requests = [row];
    current = row;
    expect(await store.redispatchNearest(row.id)).toBe(false);
    expect(store.quickDispatchFeedback?.message).toContain("یافت نشد");
    const pending = new Promise<SosRequestRecord>((resolve) => { finish = resolve; });
    getRequest.mockImplementationOnce(() => pending);
    const running = store.redispatchNearest(row.id);
    auth.accessToken = null;
    auth.user = null;
    await nextTick();
    finish(row);
    expect(await running).toBe(false);
    expect(store.requests).toEqual([]);
    expect(store.quickDispatchFeedback).toBeNull();
    expect(dispatchResponders).not.toHaveBeenCalled();
  });

  it("does not expose dispatch while another mission remains active, or rehydrate after logout", async () => {
    const row = makeSosRecord({ status: "accepted" });
    let finish!: (value: SosRequestRecord) => void;
    const pending = new Promise<SosRequestRecord>((resolve) => { finish = resolve; });
    configureAdminSosRuntimeForTests({
      openSocket: fakeSocketOpener(),
      listRequests: async () => ({ items: [row], total: 1 }),
      getRequest: () => pending,
      getNearestResponders: async () => ({ responders: [] })
    });
    const auth = useAuthStore();
    auth.accessToken = "admin-jwt";
    auth.user = { id: "admin-1", username: "admin", role: "admin", mustCompleteSecurityQuestions: false };
    const store = useAdminSosStore();
    await vi.waitFor(() => expect(store.selectedRequest?.id).toBe(row.id));
    await vi.waitFor(() => expect(socketEmitter.listenerCount(MISSION_CANCELLED_BY_RESCUER_EVENT)).toBe(1));
    socketEmitter.emit(MISSION_CANCELLED_BY_RESCUER_EVENT, cancelledEvent(row.id));
    expect(store.selectedRequest?.status).toBe("accepted");
    expect(store.canDispatchSelected).toBe(false);
    await vi.waitFor(() => expect(store.urgentReplacement).toBeNull());
    expect(store.replacementByRequest[row.id]).toBeUndefined();
    auth.accessToken = null;
    auth.user = null;
    await nextTick();
    finish(makeSosRecord({ status: "cancelled_by_rescuer" }));
    await pending;
    await nextTick();
    expect(store.requests).toEqual([]);
    expect(store.urgentReplacement).toBeNull();
  });

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

  it("discards a pending nearest-responder reply when the selected SOS is cleared", async () => {
    const request = makeSosRecord();
    let resolveNearest!: (result: { responders: { userId: string; username: string; distance: number; avgRating: number; categoryName: string; lastActiveAt: string }[] }) => void;
    const pendingNearest = new Promise<{
      responders: { userId: string; username: string; distance: number; avgRating: number; categoryName: string; lastActiveAt: string }[];
    }>((resolve) => { resolveNearest = resolve; });
    const getNearestResponders = vi.fn(() => pendingNearest);
    configureAdminSosRuntimeForTests({
      openSocket: fakeSocketOpener(),
      listRequests: async () => ({ items: [request], total: 1 }),
      getNearestResponders
    });

    const auth = useAuthStore();
    auth.accessToken = "admin-jwt";
    auth.user = { id: "admin-1", username: "admin", role: "admin", mustCompleteSecurityQuestions: false };
    const store = useAdminSosStore();
    await vi.waitFor(() => expect(getNearestResponders).toHaveBeenCalledOnce());
    store.selectRequest(null);
    await nextTick();
    expect(store.nearestResponders).toEqual([]);
    expect(store.nearestLoading).toBe(false);

    resolveNearest({ responders: [{
      userId: "44444444-4444-4444-8444-444444444441",
      username: "rescuer_one", distance: 380, avgRating: 4.9,
      categoryName: "امداد شهری", lastActiveAt: "2026-10-23T12:10:00.000Z"
    }] });
    await pendingNearest;
    await nextTick();
    expect(store.nearestResponders).toEqual([]);
    expect(store.selectedResponderIds).toEqual([]);
  });

  it("hides the previous SOS's responders while loading a different SOS", async () => {
    const first = makeSosRecord();
    const second = makeSosRecord({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
    const firstRescuer = {
      userId: "44444444-4444-4444-8444-444444444441", username: "rescuer_one",
      distance: 380, avgRating: 4.9, categoryName: "امداد شهری",
      lastActiveAt: "2026-10-23T12:10:00.000Z"
    };
    let finishSecond!: (result: { responders: typeof firstRescuer[] }) => void;
    const secondNearest = new Promise<{ responders: typeof firstRescuer[] }>((resolve) => { finishSecond = resolve; });
    configureAdminSosRuntimeForTests({
      openSocket: fakeSocketOpener(),
      listRequests: async () => ({ items: [first, second], total: 2 }),
      getNearestResponders: (id) => id === first.id
        ? Promise.resolve({ responders: [firstRescuer] }) : secondNearest
    });
    const auth = useAuthStore();
    auth.accessToken = "admin-jwt";
    auth.user = { id: "admin-1", username: "admin", role: "admin", mustCompleteSecurityQuestions: false };
    const store = useAdminSosStore();
    await vi.waitFor(() => expect(store.nearestResponders).toEqual([firstRescuer]));

    store.selectRequest(second.id);
    await nextTick();
    expect(store.nearestLoading).toBe(true);
    expect(store.nearestResponders).toEqual([]);
    expect(store.canDispatchSelected).toBe(false);
    finishSecond({ responders: [] });
    await secondNearest;
  });

  it("searches beyond the nearest ten without dropping previously selected rescuers", async () => {
    const request = makeSosRecord();
    const near = { userId: "44444444-4444-4444-8444-444444444441", username: "rescuer_near",
      distance: 100, avgRating: null, categoryName: "امداد", lastActiveAt: "2026-10-23T12:10:00.000Z" };
    const far = { ...near, userId: "44444444-4444-4444-8444-444444444442", username: "rescuer_far", distance: 12000 };
    const getNearestResponders = vi.fn(async (_id: string, _token: string,
      _signal?: AbortSignal, _excludeAssigned?: boolean, search?: string) => ({ responders: search ? [far] : [near] }));
    configureAdminSosRuntimeForTests({
      openSocket: fakeSocketOpener(),
      listRequests: async () => ({ items: [request], total: 1 }),
      getNearestResponders
    });
    const auth = useAuthStore();
    auth.accessToken = "admin-jwt";
    auth.user = { id: "admin-1", username: "admin", role: "admin", mustCompleteSecurityQuestions: false };
    const store = useAdminSosStore();
    await vi.waitFor(() => expect(store.nearestResponders).toEqual([near]));
    store.selectAllNearestResponders();
    store.setResponderSearch(" rescuer_far ");
    await store.loadNearestResponders();
    expect(getNearestResponders).toHaveBeenLastCalledWith(request.id, "admin-jwt", undefined, false, "rescuer_far");
    expect(store.nearestResponders).toEqual([far]);
    store.selectAllNearestResponders();
    expect(store.selectedResponderIds).toEqual([near.userId, far.userId]);
    expect(store.selectedResponderNames[near.userId]).toBe("rescuer_near");
    store.setResponderSearch("");
    await store.loadNearestResponders();
    expect(store.selectedResponderIds).toEqual([near.userId, far.userId]);
    store.toggleResponderSelection(far.userId);
    expect(store.selectedResponderIds).toEqual([near.userId]);
    store.selectRequest(null);
    await nextTick();
    expect(store.selectedResponderNames).toEqual({});
    expect(store.responderSearch).toBe("");
  });

  it("ignores a late nearest-list response after a username search starts", async () => {
    const request = makeSosRecord();
    const near = { userId: "44444444-4444-4444-8444-444444444441", username: "rescuer_near",
      distance: 100, avgRating: null, categoryName: null, lastActiveAt: "2026-10-23T12:10:00.000Z" };
    const far = { ...near, userId: "44444444-4444-4444-8444-444444444442", username: "rescuer_far" };
    let finishInitial!: (value: { responders: typeof near[] }) => void;
    const pendingInitial = new Promise<{ responders: typeof near[] }>((resolve) => { finishInitial = resolve; });
    const getNearestResponders = vi.fn((_id: string, _token: string, _signal?: AbortSignal,
      _excludeAssigned?: boolean, search?: string) => search ? Promise.resolve({ responders: [far] }) : pendingInitial);
    configureAdminSosRuntimeForTests({
      openSocket: fakeSocketOpener(),
      listRequests: async () => ({ items: [request], total: 1 }), getNearestResponders
    });
    const auth = useAuthStore();
    auth.accessToken = "admin-jwt";
    auth.user = { id: "admin-1", username: "admin", role: "admin", mustCompleteSecurityQuestions: false };
    const store = useAdminSosStore();
    await vi.waitFor(() => expect(getNearestResponders).toHaveBeenCalledOnce());
    store.setResponderSearch("rescuer_far");
    await store.loadNearestResponders();
    finishInitial({ responders: [near] });
    await vi.waitFor(() => expect(store.nearestResponders).toEqual([far]));
  });

  it("does not clear another SOS's selection or show its dispatch feedback when a previous dispatch finishes", async () => {
    const first = makeSosRecord();
    const second = makeSosRecord({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
    const firstRescuer = "44444444-4444-4444-8444-444444444441";
    const secondRescuer = "44444444-4444-4444-8444-444444444442";
    let completeDispatch!: (value: { proposals: { id: string; sosRequestId: string; rescuerId: string; status: "pending"; createdAt: string }[] }) => void;
    const pendingDispatch = new Promise<{ proposals: { id: string; sosRequestId: string; rescuerId: string; status: "pending"; createdAt: string }[] }>((resolve) => { completeDispatch = resolve; });
    configureAdminSosRuntimeForTests({
      openSocket: fakeSocketOpener(),
      listRequests: async () => ({ items: [first, second], total: 2 }),
      getNearestResponders: async (requestId) => ({ responders: requestId === second.id ? [{
        userId: secondRescuer, username: "rescuer_two", distance: 200,
        avgRating: 4.5, categoryName: "امداد شهری", lastActiveAt: "2026-10-23T12:10:00.000Z"
      }] : [] }),
      dispatchResponders: () => pendingDispatch
    });
    const auth = useAuthStore();
    auth.accessToken = "admin-jwt";
    auth.user = { id: "admin-1", username: "admin", role: "admin", mustCompleteSecurityQuestions: false };
    const store = useAdminSosStore();
    await vi.waitFor(() => expect(store.requests).toHaveLength(2));
    store.selectRequest(first.id);
    await nextTick();
    store.selectedResponderIds = [firstRescuer];
    const dispatch = store.dispatchSelectedResponders();
    store.selectRequest(second.id);
    await vi.waitFor(() => {
      expect(store.selectedId).toBe(second.id);
      expect(store.nearestResponders.map((responder) => responder.userId)).toEqual([secondRescuer]);
      expect(store.nearestLoading).toBe(false);
    });
    store.selectedResponderIds = [secondRescuer];

    completeDispatch({ proposals: [{
      id: "55555555-5555-4555-8555-555555555551",
      sosRequestId: first.id, rescuerId: firstRescuer,
      status: "pending", createdAt: "2026-10-23T12:12:00.000Z"
    }] });
    expect(await dispatch).toBe(true);
    expect(store.requests.find((item) => item.id === first.id)?.status).toBe("dispatched");
    expect(store.selectedResponderIds).toEqual([secondRescuer]);
    expect(store.dispatchFeedback).toBeNull();
  });

  it("resets private SOS state and reconnects when switching directly between admin accounts", async () => {
    const first = makeSosRecord();
    const close = vi.fn();
    const openSocket = vi.fn(async () => ({
      socket: socketEmitter as never,
      updateToken: vi.fn(),
      connect: vi.fn(),
      close
    }));
    const listRequests = vi.fn(async (token: string) => ({
      items: token === "admin-one-token" ? [first] : [], total: token === "admin-one-token" ? 1 : 0
    }));
    configureAdminSosRuntimeForTests({ openSocket, listRequests, getNearestResponders: async () => ({ responders: [] }) });
    const auth = useAuthStore();
    auth.accessToken = "admin-one-token";
    auth.user = { id: "admin-1", username: "first_admin", role: "admin", mustCompleteSecurityQuestions: false };
    const store = useAdminSosStore();
    await vi.waitFor(() => expect(store.requests).toEqual([first]));
    await vi.waitFor(() => expect(openSocket).toHaveBeenCalledOnce());

    // A fresh login can replace a session without an intervening unauthenticated render.
    auth.accessToken = "admin-two-token";
    auth.user = { id: "admin-2", username: "second_admin", role: "admin", mustCompleteSecurityQuestions: false };
    await vi.waitFor(() => expect(listRequests).toHaveBeenCalledWith("admin-two-token", expect.anything()));
    expect(store.requests).toEqual([]);
    expect(store.selectedId).toBeNull();
    expect(close).toHaveBeenCalled();
    await vi.waitFor(() => expect(openSocket).toHaveBeenCalledWith("admin-two-token"));
  });

  it("ignores a dispatch reply arriving after admin logout instead of restoring private SOS data", async () => {
    const request = makeSosRecord();
    let finishDispatch!: (value: { proposals: never[] }) => void;
    const pendingDispatch = new Promise<{ proposals: never[] }>((resolve) => { finishDispatch = resolve; });
    configureAdminSosRuntimeForTests({
      openSocket: fakeSocketOpener(),
      listRequests: async () => ({ items: [request], total: 1 }),
      getNearestResponders: async () => ({ responders: [] }),
      dispatchResponders: () => pendingDispatch
    });
    const auth = useAuthStore();
    auth.accessToken = "admin-jwt";
    auth.user = { id: "admin-1", username: "admin", role: "admin", mustCompleteSecurityQuestions: false };
    const store = useAdminSosStore();
    await vi.waitFor(() => expect(store.selectedRequest?.id).toBe(request.id));
    store.selectedResponderIds = ["44444444-4444-4444-8444-444444444441"];
    const dispatch = store.dispatchSelectedResponders();
    auth.accessToken = null;
    auth.user = null;
    await nextTick();
    finishDispatch({ proposals: [] });
    expect(await dispatch).toBe(false);
    expect(store.requests).toEqual([]);
    expect(store.dispatchFeedback).toBeNull();
    expect(store.dispatchSubmitting).toBe(false);
  });

  it("loads nearest responders on selection, supports multi-select, and dispatches proposals cleanly (T3.3.4)", async () => {
    const reqRow = makeSosRecord({
      id: "33333333-3333-4333-8333-333333333333",
      status: "pending"
    });
    const nearestA = {
      userId: "44444444-4444-4444-8444-444444444441",
      username: "rescuer_one",
      distance: 380,
      avgRating: 4.9,
      categoryName: "امداد شهری",
      lastActiveAt: "2026-10-23T12:10:00.000Z"
    };
    const nearestB = {
      userId: "44444444-4444-4444-8444-444444444442",
      username: "rescuer_two",
      distance: 1450,
      avgRating: 4.3,
      categoryName: "امداد کوهستان",
      lastActiveAt: "2026-10-23T12:00:00.000Z"
    };
    const getNearestResponders = vi.fn(async () => ({ responders: [nearestA, nearestB] }));
    const dispatchResponders = vi.fn(async (_requestId: string, rescuerIds: string[]) => ({
      proposals: rescuerIds.map((rescuerId, idx) => ({
        id: `55555555-5555-4555-8555-55555555555${idx + 1}`,
        sosRequestId: reqRow.id,
        rescuerId,
        status: "pending" as const,
        createdAt: "2026-10-23T12:12:00.000Z"
      }))
    }));

    configureAdminSosRuntimeForTests({
      openSocket: fakeSocketOpener(),
      listRequests: async () => ({ items: [reqRow], total: 1 }),
      getNearestResponders,
      dispatchResponders
    });

    const auth = useAuthStore();
    auth.accessToken = "admin-jwt-dispatch";
    auth.user = {
      id: "admin-1",
      username: "admin",
      role: "admin",
      mustCompleteSecurityQuestions: false
    };

    const store = useAdminSosStore();
    await vi.waitFor(() => {
      expect(store.nearestResponders).toHaveLength(2);
    });
    expect(getNearestResponders).toHaveBeenCalledWith(reqRow.id, "admin-jwt-dispatch");

    store.selectAllNearestResponders();
    expect(store.selectedResponderIds).toEqual([nearestA.userId, nearestB.userId]);
    store.toggleResponderSelection(nearestB.userId);
    expect(store.selectedResponderIds).toEqual([nearestA.userId]);
    expect(store.canDispatchSelected).toBe(true);

    const ok = await store.dispatchSelectedResponders();
    expect(ok).toBe(true);
    expect(dispatchResponders).toHaveBeenCalledWith(reqRow.id, [nearestA.userId], "admin-jwt-dispatch");
    expect(store.selectedRequest?.status).toBe("dispatched");
    expect(store.dispatchedCount).toBe(1);
    expect(store.selectedResponderIds).toEqual([]);
    expect(store.selectedRequestProposals).toHaveLength(1);
    expect(store.dispatchFeedback?.type).toBe("success");
  });
});
