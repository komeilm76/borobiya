import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { RealtimeClient } from "@/services/socket";
import { MISSION_LOCATION_EVENT, MISSION_LOCATION_PUBLISH_EVENT, MISSION_SUBSCRIBE_EVENT } from "@/services/socket-events";
import { useMissionLiveLocations } from "./use-mission-live-locations";

const mission = { id: "70000000-0000-4000-8000-000000000001",
  requesterId: "70000000-0000-4000-8000-000000000002", rescuerId: "70000000-0000-4000-8000-000000000003" };
const token = `x.${btoa(JSON.stringify({ deviceId: "device-1" }))}.x`;

function fakeSocket() {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const emitted: { event: string; payload: unknown }[] = [];
  const socket = { connected: true,
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => { listeners.set(event, listener); }),
    timeout: vi.fn(() => ({ emit: (event: string, payload: unknown,
      ack: (error: Error | null, result?: { ok: boolean }) => void) => {
      emitted.push({ event, payload }); ack(null, { ok: true });
    } }))
  };
  const close = vi.fn();
  const client = { socket, close, connect: vi.fn(), updateToken: vi.fn() } as unknown as RealtimeClient;
  return { client, listeners, emitted, close, socket };
}

async function settle() { await Promise.resolve(); await Promise.resolve(); await nextTick(); }

describe("mission live positions (T3.5.7)", () => {
  it("subscribes privately, validates participant identity, marks stale location updates as old without conflating them with presence, and cleans on mission switch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T10:00:00.000Z"));
    const missionRef = ref<typeof mission | null>(mission);
    const session = fakeSocket();
    const opener = vi.fn(async () => session.client);
    const scope = effectScope();
    const live = scope.run(() => useMissionLiveLocations(missionRef, ref(token), ref(mission.rescuerId),
      async () => {}, { openSocket: opener }))!;
    await settle();
    expect(session.emitted[0]).toEqual({ event: MISSION_SUBSCRIBE_EVENT, payload: { missionId: mission.id } });
    const payload = { missionId: mission.id, userId: mission.requesterId, role: "requester",
      lat: 35.7, lon: 51.4, accuracy: null, timestamp: new Date().toISOString() };
    session.listeners.get(MISSION_LOCATION_EVENT)?.({ ...payload, userId: mission.rescuerId });
    session.listeners.get(MISSION_LOCATION_EVENT)?.({ ...payload, missionId: "70000000-0000-4000-8000-000000000099" });
    expect(live.locations.value.requester).toBeUndefined();
    session.listeners.get(MISSION_LOCATION_EVENT)?.(payload);
    session.listeners.get(MISSION_LOCATION_EVENT)?.({ ...payload, role: "admin", userId: "70000000-0000-4000-8000-000000000004" });
    expect(live.participantStatus.value[0]?.fresh).toBe(true);
    expect(live.locations.value.admin?.userId).toBe("70000000-0000-4000-8000-000000000004");
    session.listeners.get(MISSION_LOCATION_EVENT)?.({ ...payload, lat: 1 }); // out of order
    expect(live.locations.value.requester?.lat).toBe(35.7);
    vi.advanceTimersByTime(31_000);
    expect(live.participantStatus.value[0]?.fresh).toBe(false);
    missionRef.value = null;
    await nextTick();
    expect(session.close).toHaveBeenCalledOnce();
    expect(live.locations.value).toEqual({});
    scope.stop();
    vi.useRealTimers();
  });

  it("does not let an old GPS watch or late publish acknowledgement affect a restarted share", async () => {
    const session = fakeSocket();
    const pending: Array<(error: Error | null, result?: { ok: boolean }) => void> = [];
    session.socket.timeout.mockImplementation(() => ({ emit: (event: string, payload: unknown,
      ack: (error: Error | null, result?: { ok: boolean }) => void) => {
      session.emitted.push({ event, payload });
      if (event === MISSION_SUBSCRIBE_EVENT) ack(null, { ok: true });
      else pending.push(ack);
    } }));
    const watches: Array<(point: { lat: number; lon: number }) => void> = [];
    const clears: Array<ReturnType<typeof vi.fn>> = [];
    const scope = effectScope();
    const live = scope.run(() => useMissionLiveLocations(ref(mission), ref(token), ref(mission.rescuerId),
      async () => {}, { openSocket: async () => session.client, watchPosition: (onFix) => {
        watches.push(onFix); const clear = vi.fn(); clears.push(clear); return clear;
      } }))!;
    await settle();
    live.startSharing();
    watches[0]?.({ lat: 35.7, lon: 51.4 });
    expect(pending).toHaveLength(1);
    live.stopSharing();
    expect(clears[0]).toHaveBeenCalledOnce();
    live.startSharing();
    watches[0]?.({ lat: 40, lon: 40 }); // a queued callback from the stopped watch
    watches[1]?.({ lat: 35.8, lon: 51.5 });
    const publishes = session.emitted.filter(({ event }) => event === MISSION_LOCATION_PUBLISH_EVENT);
    expect(publishes).toHaveLength(2);
    expect(publishes[1]?.payload).toMatchObject({ location: { lat: 35.8, lon: 51.5 } });
    pending[0]?.(new Error("timed out")); // the previous share times out after the restart
    expect(live.sharing.value).toBe(true);
    expect(live.error.value).toBeNull();
    pending[1]?.(null, { ok: true });
    scope.stop();
    expect(clears[1]).toHaveBeenCalledOnce();
  });

  it("ignores a disconnect or terminal event queued by a socket replaced for the same mission", async () => {
    const first = fakeSocket();
    const second = fakeSocket();
    let opens = 0;
    const clears: Array<ReturnType<typeof vi.fn>> = [];
    const scope = effectScope();
    const live = scope.run(() => useMissionLiveLocations(ref(mission), ref(token), ref(mission.rescuerId),
      async () => {}, { openSocket: async () => ++opens === 1 ? first.client : second.client,
        watchPosition: () => { const clear = vi.fn(); clears.push(clear); return clear; } }))!;
    await settle();
    await live.start();
    expect(first.close).toHaveBeenCalledOnce();
    live.startSharing();
    first.listeners.get("disconnect")?.();
    first.listeners.get("mission:status-updated")?.({ missionId: mission.id, status: "completed",
      by: mission.rescuerId, at: new Date().toISOString() });
    expect(live.connected.value).toBe(true);
    expect(live.sharing.value).toBe(true);
    expect(second.close).not.toHaveBeenCalled();
    scope.stop();
    expect(clears[0]).toHaveBeenCalledOnce();
  });

  it("does not carry GPS consent into a new login on the same account and device", async () => {
    const first = fakeSocket();
    const second = fakeSocket();
    let opens = 0;
    const firstToken = `x.${btoa(JSON.stringify({ sub: mission.rescuerId, role: "user",
      deviceId: "device-1", sessionId: "session-1" }))}.x`;
    const secondToken = `x.${btoa(JSON.stringify({ sub: mission.rescuerId, role: "user",
      deviceId: "device-1", sessionId: "session-2" }))}.x`;
    const bearer = ref(firstToken);
    let oldFix!: (fix: { lat: number; lon: number }) => void;
    const clear = vi.fn();
    const watchPosition = vi.fn((onFix: (fix: { lat: number; lon: number }) => void) => {
      oldFix = onFix; return clear;
    });
    const scope = effectScope();
    const live = scope.run(() => useMissionLiveLocations(ref(mission), bearer, ref(mission.rescuerId),
      async () => {}, { openSocket: async () => ++opens === 1 ? first.client : second.client,
        watchPosition }))!;
    await settle();
    live.startSharing();
    bearer.value = secondToken;
    oldFix({ lat: 35.7, lon: 51.4 }); // before the Vue watcher flush
    live.stopSharing();
    live.startSharing(); // do not start another watch on the old socket with a new token
    expect(watchPosition).toHaveBeenCalledOnce();
    expect(live.sharing.value).toBe(false);
    await settle();
    expect(first.emitted.filter(({ event }) => event === MISSION_LOCATION_PUBLISH_EVENT)).toEqual([]);
    expect(first.close).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
    expect(live.sharing.value).toBe(false);
    expect(second.emitted).toContainEqual({ event: MISSION_SUBSCRIBE_EVENT, payload: { missionId: mission.id } });
    scope.stop();
  });

  it("keeps consent through an access-token refresh of the same session", async () => {
    const session = fakeSocket();
    const firstToken = `x.${btoa(JSON.stringify({ sub: mission.rescuerId, role: "user",
      deviceId: "device-1", sessionId: "session-1", exp: 100 }))}.x`;
    const renewedToken = `x.${btoa(JSON.stringify({ sub: mission.rescuerId, role: "user",
      deviceId: "device-1", sessionId: "session-1", exp: 200 }))}.x`;
    const bearer = ref(firstToken);
    const scope = effectScope();
    const live = scope.run(() => useMissionLiveLocations(ref(mission), bearer, ref(mission.rescuerId),
      async () => {}, { openSocket: async () => session.client, watchPosition: () => vi.fn() }))!;
    await settle();
    live.startSharing();
    bearer.value = renewedToken;
    await nextTick();
    expect(live.sharing.value).toBe(true);
    expect(session.close).not.toHaveBeenCalled();
    expect(session.client.updateToken).toHaveBeenCalledWith(renewedToken);
    scope.stop();
  });

  it("clears a watch that reports permission denial before returning its disposer", async () => {
    const session = fakeSocket();
    const clear = vi.fn();
    const scope = effectScope();
    const live = scope.run(() => useMissionLiveLocations(ref(mission), ref(token), ref(mission.rescuerId),
      async () => {}, { openSocket: async () => session.client,
        watchPosition: (_onFix, onError) => { onError(true); return clear; } }))!;
    await settle();
    live.startSharing();
    expect(live.sharing.value).toBe(false);
    expect(live.error.value).toContain("متوقف");
    expect(clear).toHaveBeenCalledOnce();
    scope.stop();
  });

  it("stops a consented GPS watch immediately on a terminal mission event", async () => {
    const session = fakeSocket();
    const clear = vi.fn();
    const scope = effectScope();
    const live = scope.run(() => useMissionLiveLocations(ref(mission), ref(token), ref(mission.rescuerId),
      async () => {}, { openSocket: async () => session.client,
        watchPosition: () => clear }))!;
    await settle();
    live.startSharing();
    expect(live.sharing.value).toBe(true);
    session.listeners.get("mission:status-updated")?.({ missionId: mission.id, status: "completed",
      by: mission.rescuerId, at: new Date().toISOString() });
    expect(clear).toHaveBeenCalledOnce();
    expect(live.sharing.value).toBe(false);
    expect(session.close).toHaveBeenCalledOnce();
    expect(live.error.value).toContain("پایان");
    scope.stop();
  });

  it("only publishes after explicit consent and stops GPS on denial, account change, and disposal", async () => {
    const missionRef = ref<typeof mission | null>(mission);
    const owner = ref<string | null>(mission.rescuerId);
    const session = fakeSocket();
    let fix!: (point: { lat: number; lon: number }) => void;
    let fail!: (denied: boolean) => void;
    const clear = vi.fn();
    const watchPosition = vi.fn((onFix: typeof fix, onError: typeof fail) => {
      fix = onFix; fail = onError; return clear;
    });
    const scope = effectScope();
    const live = scope.run(() => useMissionLiveLocations(missionRef, ref(token), owner, async () => {},
      { openSocket: async () => session.client, watchPosition }))!;
    await settle();
    expect(session.emitted.filter(({ event }) => event === MISSION_LOCATION_PUBLISH_EVENT)).toEqual([]);
    live.startSharing();
    fix({ lat: 35.7, lon: 51.4 });
    expect(session.emitted.find(({ event }) => event === MISSION_LOCATION_PUBLISH_EVENT)?.payload)
      .toMatchObject({ missionId: mission.id, location: { lat: 35.7, lon: 51.4, priorityDeviceId: "device-1" } });
    fail(true);
    expect(live.sharing.value).toBe(false);
    expect(clear).toHaveBeenCalledOnce();
    live.startSharing();
    owner.value = mission.requesterId;
    await nextTick();
    expect(clear).toHaveBeenCalledTimes(2);
    scope.stop();
  });
  it("reauthorizes the room and reconciles missed terminal status without restarting GPS consent", async () => {
    const session = fakeSocket();
    const clear = vi.fn();
    const readSync = vi.fn(async () => ({ events: [], missions: [{ ...mission, sosRequestId: mission.id,
      status: "cancelled_by_rescuer" as const, cancelledBy: "rescuer" as const,
      cancellationReasonId: null, cancellationCustomText: null, cancelledAt: new Date().toISOString(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
      missionsTruncated: false, nextCursor: null, location: null as null }));
    const scope = effectScope();
    const live = scope.run(() => useMissionLiveLocations(ref(mission), ref(token), ref(mission.rescuerId),
      async () => {}, { openSocket: async () => session.client, watchPosition: () => clear, readSync }))!;
    await settle();
    live.startSharing();
    session.socket.connected = false;
    session.listeners.get("disconnect")?.("transport close");
    expect(clear).toHaveBeenCalledOnce();
    expect(live.sharing.value).toBe(false);
    session.socket.connected = true;
    session.listeners.get("connect")?.();
    await settle();
    expect(session.emitted.filter(({ event }) => event === MISSION_SUBSCRIBE_EVENT)).toHaveLength(2);
    expect(readSync).toHaveBeenCalledWith(token, expect.any(String), expect.any(AbortSignal));
    expect(live.error.value).toContain("پایان");
    expect(session.close).toHaveBeenCalledOnce();
    scope.stop();
  });

  it("discards a delayed sync response after changing missions and leaves GPS stopped on sync failure", async () => {
    const session = fakeSocket();
    const missionRef = ref<typeof mission | null>(mission);
    let finish!: (value: { events: []; missions: []; missionsTruncated: false; nextCursor: null; location: null }) => void;
    const readSync = vi.fn(() => new Promise<{
      events: []; missions: []; missionsTruncated: false; nextCursor: null; location: null
    }>((resolve) => { finish = resolve; }));
    const scope = effectScope();
    const live = scope.run(() => useMissionLiveLocations(missionRef, ref(token), ref(mission.rescuerId),
      async () => {}, { openSocket: async () => session.client, readSync,
        readMission: vi.fn(async () => { throw new Error("should not run after switch"); }) }))!;
    await settle();
    session.socket.connected = false;
    session.listeners.get("disconnect")?.("transport close");
    session.socket.connected = true;
    session.listeners.get("connect")?.();
    await settle();
    missionRef.value = null;
    await settle();
    finish({ events: [], missions: [], missionsTruncated: false, nextCursor: null, location: null });
    await settle();
    expect(live.locations.value).toEqual({});
    expect(session.close).toHaveBeenCalledOnce();
    scope.stop();

    const second = fakeSocket();
    const scope2 = effectScope();
    const failed = scope2.run(() => useMissionLiveLocations(ref(mission), ref(token), ref(mission.rescuerId),
      async () => {}, { openSocket: async () => second.client,
        readSync: async () => { throw new Error("offline"); } }))!;
    await settle();
    second.socket.connected = false;
    second.listeners.get("disconnect")?.("transport close");
    second.socket.connected = true;
    second.listeners.get("connect")?.();
    await settle();
    expect(failed.sharing.value).toBe(false);
    expect(failed.error.value).toContain("همگام‌سازی");
    scope2.stop();
  });

  it("uses the scoped mission detail, not the user sync stream, for admin reconnect", async () => {
    const session = fakeSocket();
    const adminToken = `x.${btoa(JSON.stringify({ role: "admin", sub: "admin", deviceId: "device-1" }))}.x`;
    const readSync = vi.fn();
    const readMission = vi.fn(async () => ({ ...mission, sosRequestId: mission.id, status: "completed" as const,
      cancelledBy: null, cancellationReasonId: null, cancellationCustomText: null, cancelledAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      cancellationReason: null, rating: null }));
    const scope = effectScope();
    const live = scope.run(() => useMissionLiveLocations(ref(mission), ref(adminToken), ref("admin"),
      async () => {}, { openSocket: async () => session.client, readSync, readMission }))!;
    await settle();
    session.socket.connected = false;
    session.listeners.get("disconnect")?.("transport close");
    session.socket.connected = true;
    session.listeners.get("connect")?.();
    await settle();
    expect(readSync).not.toHaveBeenCalled();
    expect(readMission).toHaveBeenCalledWith(adminToken, mission.id);
    expect(live.error.value).toContain("پایان");
    scope.stop();
  });

  it("refreshes an expired socket credential before reconnecting the same private session", async () => {
    const session = fakeSocket();
    const bearer = ref(token);
    const rotated = `x.${btoa(JSON.stringify({ deviceId: "device-1", exp: 9999999999 }))}.x`;
    const ensureSession = vi.fn(async () => { if (ensureSession.mock.calls.length > 1) bearer.value = rotated; });
    const scope = effectScope();
    const live = scope.run(() => useMissionLiveLocations(ref(mission), bearer, ref(mission.rescuerId),
      ensureSession, { openSocket: async () => session.client }))!;
    await settle();
    session.socket.connected = false;
    session.listeners.get("disconnect")?.("io server disconnect");
    await settle();
    expect(ensureSession).toHaveBeenCalledTimes(2); // initial handshake and rejected reconnect
    expect(session.client.updateToken).toHaveBeenCalledWith(rotated);
    expect(session.client.connect).toHaveBeenCalledTimes(2);
    expect(session.close).not.toHaveBeenCalled();
    expect(live.sharing.value).toBe(false);
    scope.stop();
  });

});
