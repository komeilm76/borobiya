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
      ack: (error: null, result: { ok: boolean }) => void) => {
      emitted.push({ event, payload }); ack(null, { ok: true });
    } }))
  };
  const close = vi.fn();
  const client = { socket, close, connect: vi.fn(), updateToken: vi.fn() } as unknown as RealtimeClient;
  return { client, listeners, emitted, close, socket };
}

async function settle() { await Promise.resolve(); await Promise.resolve(); await nextTick(); }

describe("mission live positions (T3.5.7)", () => {
  it("subscribes privately, validates participant identity, marks stale updates offline, and cleans on mission switch", async () => {
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
    expect(live.participantStatus.value[0]?.online).toBe(true);
    expect(live.locations.value.admin?.userId).toBe("70000000-0000-4000-8000-000000000004");
    session.listeners.get(MISSION_LOCATION_EVENT)?.({ ...payload, lat: 1 }); // out of order
    expect(live.locations.value.requester?.lat).toBe(35.7);
    vi.advanceTimersByTime(31_000);
    expect(live.participantStatus.value[0]?.online).toBe(false);
    missionRef.value = null;
    await nextTick();
    expect(session.close).toHaveBeenCalledOnce();
    expect(live.locations.value).toEqual({});
    scope.stop();
    vi.useRealTimers();
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
});
