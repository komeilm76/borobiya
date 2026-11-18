import { effectScope, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { Mission } from "@shared/index";
import type { RealtimeClient } from "@/services/socket";
import { MISSION_SUBSCRIBE_EVENT } from "@/services/socket-events";
import { useRequesterMissionAutoShare } from "./use-requester-mission-auto-share";

const requesterId = "70000000-0000-4000-8000-000000000001";
const first = { id: "70000000-0000-4000-8000-000000000002", requesterId,
  rescuerId: "70000000-0000-4000-8000-000000000003", status: "pending" } as Mission;
const second = { id: "70000000-0000-4000-8000-000000000004", requesterId,
  rescuerId: "70000000-0000-4000-8000-000000000005", status: "on_the_way" } as Mission;
const bearer = (sessionId: string) => `x.${btoa(JSON.stringify({ sub: requesterId, role: "user", deviceId: "phone", sessionId }))}.x`;
const page = (items: Mission[], totalPages = 1) => ({ items, totalPages });
function fakeSocket() {
  const emitted: string[] = [];
  const socket = { connected: true, on: vi.fn(), timeout: vi.fn(() => ({
    emit: (event: string, _body: unknown, ack: (error: null, result: { ok: true }) => void) => {
      emitted.push(event); ack(null, { ok: true });
    }
  })) };
  const close = vi.fn();
  return { emitted, close, client: { socket, close, connect: vi.fn(), updateToken: vi.fn() } as unknown as RealtimeClient };
}

describe("requester app-owned private sharing across multiple assignments", () => {
  it("publishes to every active mission, never a terminal row, and stops only the ended assignment", async () => {
    const sockets = [fakeSocket(), fakeSocket()];
    const disposer = vi.fn();
    const watchPosition = vi.fn(() => disposer);
    const list = vi.fn(async () => page([first, second]));
    let index = 0;
    const scope = effectScope();
    const manager = scope.run(() => useRequesterMissionAutoShare(ref(bearer("login-a")), ref(requesterId), undefined,
      { list, live: { openSocket: async () => sockets[index++]!.client, watchPosition } }))!;
    try {
      await vi.waitFor(() => expect(manager.isSharingMission(second.id)).toBe(true));
      expect(watchPosition).toHaveBeenCalledOnce(); // One native GPS watch, two private mission sockets.
      expect(manager.missions.value.map((mission) => mission.id)).toEqual([first.id, second.id]);
      expect(manager.isSharingMission(first.id)).toBe(true);
      expect(manager.isSharingMission(second.id)).toBe(true);
      expect(sockets.every((socket) => socket.emitted.includes(MISSION_SUBSCRIBE_EVENT))).toBe(true);
      list.mockResolvedValue(page([{ ...first, status: "completed" }, second]));
      await manager.refresh();
      expect(manager.isSharingMission(first.id)).toBe(false);
      expect(manager.isSharingMission(second.id)).toBe(true);
      expect(disposer).not.toHaveBeenCalled(); // The other mission still needs GPS.
    } finally { scope.stop(); }
    expect(disposer).toHaveBeenCalledOnce();
  });

  it("paginates active assignments and fails closed when verification fails", async () => {
    const list = vi.fn(async (_token: string, pageNumber = 1) => page(
      pageNumber === 1 ? [first] : [second, { ...first, status: "completed" }], 2));
    const sockets = [fakeSocket(), fakeSocket()];
    let index = 0;
    const token = ref(bearer("login-a"));
    const watchPosition = vi.fn(() => vi.fn());
    const scope = effectScope();
    const manager = scope.run(() => useRequesterMissionAutoShare(token, ref(requesterId), undefined,
      { list, live: { openSocket: async () => sockets[index++]!.client, watchPosition } }))!;
    try {
      await vi.waitFor(() => expect(manager.missions.value).toHaveLength(2));
      expect(list.mock.calls.map((args) => args[1])).toEqual([1, 2]);
      list.mockRejectedValue(new Error("offline"));
      await manager.refresh();
      expect(manager.missions.value).toHaveLength(0);
      expect(manager.isSharingMission(first.id)).toBe(false);
      expect(manager.isSharingMission(second.id)).toBe(false);
      expect(manager.error.value).toContain("تأیید نشد");
    } finally { scope.stop(); }
  });

  it("rejects an old requester's late list after a JWT session replacement", async () => {
    let resolve!: (value: ReturnType<typeof page>) => void;
    const pending = new Promise<ReturnType<typeof page>>((done) => { resolve = done; });
    const list = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(page([]));
    const token = ref(bearer("login-a"));
    const scope = effectScope();
    const manager = scope.run(() => useRequesterMissionAutoShare(token, ref(requesterId), undefined, { list }))!;
    try {
      await vi.waitFor(() => expect(list).toHaveBeenCalledOnce());
      token.value = bearer("login-b");
      resolve(page([first]));
      await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
      expect(manager.missions.value).toEqual([]);
    } finally { scope.stop(); }
  });
});
