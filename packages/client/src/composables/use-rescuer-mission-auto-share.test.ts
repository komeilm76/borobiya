import { effectScope, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { Mission, UserSyncResponse } from "@shared/index";
import type { RealtimeClient } from "@/services/socket";
import { MISSION_LOCATION_PUBLISH_EVENT, MISSION_SUBSCRIBE_EVENT } from "@/services/socket-events";
import { useRescuerMissionAutoShare } from "./use-rescuer-mission-auto-share";

const rescuerId = "70000000-0000-4000-8000-000000000003";
const missionId = "70000000-0000-4000-8000-000000000001";
const active = { id: missionId, rescuerId, requesterId: "70000000-0000-4000-8000-000000000002",
  status: "pending" } as Mission;
const bearer = (sessionId: string) => `x.${btoa(JSON.stringify({ sub: rescuerId, role: "user", deviceId: "device-1", sessionId }))}.x`;
const page = (items: Mission[]) => ({ items, total: items.length, totalPages: items.length ? 1 : 0 });
function fakeSocket() {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const emitted: string[] = [];
  const socket = { connected: true,
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => { listeners.set(event, callback); }),
    timeout: vi.fn(() => ({ emit: (event: string, _body: unknown, ack: (err: Error | null, reply: { ok: boolean }) => void) => {
      emitted.push(event); ack(null, { ok: true });
    } }))
  };
  const close = vi.fn();
  const client = { socket, close, connect: vi.fn(), updateToken: vi.fn() } as unknown as RealtimeClient;
  return { socket, listeners, emitted, close, client };
}

describe("app-owned rescuer mission location sharing", () => {
  it("starts automatically after server assignment and room acknowledgement, across page changes, and stops after termination", async () => {
    const session = fakeSocket();
    const watchPosition = vi.fn(() => vi.fn());
    const list = vi.fn(async () => page([active]));
    const scope = effectScope();
    const manager = scope.run(() => useRescuerMissionAutoShare(ref(bearer("login-a")), ref(rescuerId), undefined,
      { list, live: { openSocket: async () => session.client, watchPosition } }))!;
    try {
      await vi.waitFor(() => expect(watchPosition).toHaveBeenCalledOnce());
      expect(manager.mission.value?.id).toBe(missionId);
      expect(manager.live.sharing.value).toBe(true);
      expect(session.emitted).toContain(MISSION_SUBSCRIBE_EVENT);
      // This store is not owned by UserMissionView: no page navigation can unmount it.
      list.mockResolvedValue(page([{ ...active, status: "completed" }]));
      await manager.refresh();
      expect(manager.mission.value).toBeNull();
      expect(manager.live.sharing.value).toBe(false);
      expect(watchPosition.mock.results[0]?.value).toHaveBeenCalledOnce();
    } finally { scope.stop(); }
  });

  it("stops at once when the server rejects a terminal assignment and never republishes an old fix", async () => {
    const session = fakeSocket();
    let onFix!: (fix: { lat: number; lon: number }) => void;
    const clear = vi.fn();
    const list = vi.fn().mockResolvedValueOnce(page([active])).mockResolvedValue(page([]));
    session.socket.timeout.mockImplementation(() => ({ emit: (event: string, _body: unknown,
      ack: (error: Error | null, result: { ok: boolean; code?: string }) => void) => {
      session.emitted.push(event);
      ack(null, event === MISSION_SUBSCRIBE_EVENT ? { ok: true } : { ok: false, code: "MISSION_UNAVAILABLE" });
    } }));
    const scope = effectScope();
    const manager = scope.run(() => useRescuerMissionAutoShare(ref(bearer("login-a")), ref(rescuerId), undefined,
      { list, live: { openSocket: async () => session.client,
        watchPosition: (fix) => { onFix = fix; return clear; } } }))!;
    try {
      await vi.waitFor(() => expect(manager.live.sharing.value).toBe(true));
      onFix({ lat: 35.7, lon: 51.4 });
      expect(manager.mission.value).toBeNull();
      expect(clear).toHaveBeenCalledOnce();
      onFix({ lat: 35.8, lon: 51.5 });
      expect(session.emitted.filter((event) => event === MISSION_LOCATION_PUBLISH_EVENT)).toHaveLength(1);
      await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
      expect(manager.live.sharing.value).toBe(false);
    } finally { scope.stop(); }
  });

  it("never publishes while the assignment list is unverified or after a session switch", async () => {
    let resolve!: (value: ReturnType<typeof page>) => void;
    const pending = new Promise<ReturnType<typeof page>>((done) => { resolve = done; });
    const list = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(page([]));
    const token = ref(bearer("login-a"));
    const scope = effectScope();
    const socket = fakeSocket();
    const watchPosition = vi.fn(() => vi.fn());
    const manager = scope.run(() => useRescuerMissionAutoShare(token, ref(rescuerId), undefined,
      { list, live: { openSocket: async () => socket.client, watchPosition } }))!;
    try {
      expect(manager.mission.value).toBeNull();
      await vi.waitFor(() => expect(list).toHaveBeenCalledOnce());
      token.value = bearer("login-b");
      resolve(page([active])); // Old session must never acquire GPS or join the room.
      await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
      await Promise.resolve();
      expect(manager.mission.value).toBeNull();
      expect(watchPosition).not.toHaveBeenCalled();
      expect(socket.emitted).not.toContain(MISSION_SUBSCRIBE_EVENT);
    } finally { scope.stop(); }
  });

  it("pauses on disconnect and resumes only after missed-status verification", async () => {
    const session = fakeSocket();
    let resolveSync!: (value: UserSyncResponse) => void;
    const snapshot = new Promise<UserSyncResponse>((done) => { resolveSync = done; });
    const watchPosition = vi.fn(() => vi.fn());
    const scope = effectScope();
    const manager = scope.run(() => useRescuerMissionAutoShare(ref(bearer("login-a")), ref(rescuerId), undefined,
      { list: async () => page([active]), live: { openSocket: async () => session.client,
        readSync: () => snapshot, watchPosition } }))!;
    try {
      await vi.waitFor(() => expect(watchPosition).toHaveBeenCalledOnce());
      session.socket.connected = false;
      session.listeners.get("disconnect")?.("transport close");
      expect(manager.live.sharing.value).toBe(false);
      session.socket.connected = true;
      session.listeners.get("connect")?.();
      expect(watchPosition).toHaveBeenCalledTimes(1);
      resolveSync({ missions: [{ ...active }] } as UserSyncResponse);
      await vi.waitFor(() => expect(watchPosition).toHaveBeenCalledTimes(2));
      expect(manager.live.sharing.value).toBe(true);
    } finally { scope.stop(); }
  });

  it("shows a denied GPS watch without silently claiming sharing and can retry after device permission changes", async () => {
    const session = fakeSocket();
    const cleanup = vi.fn();
    const watchPosition = vi.fn()
      .mockImplementationOnce((_onFix, onError: (denied: boolean) => void) => { onError(true); return cleanup; })
      .mockImplementationOnce(() => cleanup);
    const scope = effectScope();
    const manager = scope.run(() => useRescuerMissionAutoShare(ref(bearer("login-a")), ref(rescuerId), undefined,
      { list: async () => page([active]), live: { openSocket: async () => session.client, watchPosition } }))!;
    try {
      await vi.waitFor(() => expect(manager.live.error.value).toContain("اجازه"));
      expect(manager.live.sharing.value).toBe(false);
      expect(cleanup).toHaveBeenCalledOnce();
      manager.retry(); // Retry is not a switch to disable required mission sharing.
      expect(watchPosition).toHaveBeenCalledTimes(2);
      expect(manager.live.sharing.value).toBe(true);
    } finally { scope.stop(); }
  });

  it("keeps the automatic GPS watch out of other roles' optional room sharing", async () => {
    const session = fakeSocket();
    const token = ref(bearer("login-a"));
    const scope = effectScope();
    const manager = scope.run(() => useRescuerMissionAutoShare(token, ref(rescuerId), undefined,
      { list: async () => page([]), live: { openSocket: async () => session.client } }))!;
    try {
      await manager.refresh();
      expect(manager.mission.value).toBeNull();
      expect(session.emitted).not.toContain(MISSION_LOCATION_PUBLISH_EVENT);
    } finally { scope.stop(); }
  });
});
