import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { MissionTimeline } from "@shared/index";
import type { RealtimeClient } from "@/services/socket";
import { MISSION_STATUS_UPDATED_EVENT, MISSION_CANCELLED_BY_REQUESTER_EVENT } from "@/services/socket-events";
import { useMissionTimeline } from "./use-mission-timeline";

const ID = "70000000-0000-4000-8000-000000000001";
const OTHER = "70000000-0000-4000-8000-000000000002";
const OWNER = "70000000-0000-4000-8000-000000000003";
const at = "2026-10-24T06:00:00.000Z";
const row: MissionTimeline[number] = { id: OTHER, missionId: ID, fromStatus: null, toStatus: "pending",
  changedBy: OWNER, createdAt: at };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); await nextTick(); };

function fakeSocket() {
  const listeners = new Map<string, (value: unknown) => void>();
  const close = vi.fn();
  return { listeners, close,
    client: { socket: { on: vi.fn((event: string, handler: (value: unknown) => void) => { listeners.set(event, handler); }) },
      connect: vi.fn(), updateToken: vi.fn(), close } as unknown as RealtimeClient };
}

describe("mission timeline lifecycle", () => {
  it("clears private steps and closes the socket synchronously on logout, even if another login follows in the same tick", async () => {
    const token = ref<string | null>("first-session");
    const oldSocket = fakeSocket();
    const newSocket = fakeSocket();
    const sockets = [oldSocket, newSocket];
    const openSocket = vi.fn(async () => sockets.shift()!.client);
    const read = vi.fn(async (bearer: string) => bearer === "first-session" ? [row] : []);
    const scope = effectScope();
    const timeline = scope.run(() => useMissionTimeline(ref(ID), "user", token, ref(OWNER), undefined,
      { read, openSocket }))!;
    try {
      await settle();
      expect(timeline.entries.value).toEqual([row]);
      expect(oldSocket.close).not.toHaveBeenCalled();
      token.value = "first-session-renewed";
      expect(timeline.entries.value).toEqual([row]);
      expect(oldSocket.client.updateToken).toHaveBeenCalledWith("first-session-renewed");
      expect(oldSocket.close).not.toHaveBeenCalled();
      token.value = null;
      expect(timeline.entries.value).toEqual([]);
      expect(oldSocket.close).toHaveBeenCalledOnce();
      token.value = "second-session";
      await settle();
      expect(read).toHaveBeenCalledWith("second-session", ID, "user", expect.any(AbortSignal));
      expect(timeline.entries.value).toEqual([]);
      expect(openSocket).toHaveBeenCalledTimes(2);
    } finally { scope.stop(); }
  });

  it("clears the selected mission's steps immediately before a different mission loads", async () => {
    const id = ref<string | null>(ID);
    const first = fakeSocket();
    const scope = effectScope();
    const timeline = scope.run(() => useMissionTimeline(id, "user", ref("bearer"), ref(OWNER), undefined, {
      read: async () => [row], openSocket: async () => first.client
    }))!;
    try {
      await settle();
      expect(timeline.entries.value).toEqual([row]);
      id.value = OTHER;
      expect(timeline.entries.value).toEqual([]);
      expect(first.close).toHaveBeenCalledOnce();
    } finally { scope.stop(); }
  });

  it("reads committed steps, reacts only to its own validated events, and closes on mission/account changes", async () => {
    const id = ref<string | null>(ID);
    const owner = ref<string | null>(OWNER);
    const token = ref<string | null>("token");
    const first = fakeSocket();
    const second = fakeSocket();
    const sockets = [first, second];
    const read = vi.fn(async () => [row]);
    const scope = effectScope();
    const timeline = scope.run(() => useMissionTimeline(id, "user", token, owner, async () => {}, {
      read, openSocket: vi.fn(async () => sockets.shift()!.client)
    }))!;
    await settle();
    expect(timeline.entries.value).toEqual([row]);
    first.listeners.get(MISSION_STATUS_UPDATED_EVENT)?.({ missionId: OTHER, status: "arrived", by: OWNER, at });
    first.listeners.get(MISSION_STATUS_UPDATED_EVENT)?.({ missionId: ID, status: "made_up", by: OWNER, at });
    expect(read).toHaveBeenCalledTimes(1);
    first.listeners.get(MISSION_STATUS_UPDATED_EVENT)?.({ missionId: ID, status: "arrived", by: OWNER, at });
    await settle();
    first.listeners.get(MISSION_CANCELLED_BY_REQUESTER_EVENT)?.({ missionId: ID, sosRequestId: OTHER,
      requesterId: OWNER, rescuerId: OTHER, reason: "no longer needed", at });
    await settle();
    expect(read).toHaveBeenCalledTimes(3);
    id.value = OTHER;
    await settle();
    expect(first.close).toHaveBeenCalledOnce();
    expect(timeline.entries.value).toEqual([row]); // injected test read supplies same rows for the new mission
    first.listeners.get(MISSION_STATUS_UPDATED_EVENT)?.({ missionId: ID, status: "arrived", by: OWNER, at });
    expect(read).toHaveBeenCalledTimes(4);
    owner.value = null;
    await settle();
    expect(second.close).toHaveBeenCalledOnce();
    expect(timeline.entries.value).toEqual([]);
    scope.stop();
  });

  it("drops stale HTTP responses after a switch and recovers after token restoration", async () => {
    const id = ref<string | null>(ID);
    const token = ref<string | null>("token");
    let finish!: (rows: MissionTimeline) => void;
    const read = vi.fn(() => new Promise<MissionTimeline>((resolve) => { finish = resolve; }));
    const scope = effectScope();
    const timeline = scope.run(() => useMissionTimeline(id, "admin", token, ref(OWNER), async () => {}, {
      read, openSocket: async () => fakeSocket().client
    }))!;
    await settle();
    id.value = OTHER;
    await settle();
    finish([{ ...row, missionId: OTHER }]);
    await settle();
    expect(timeline.entries.value[0]?.missionId).toBe(OTHER);
    token.value = null;
    await settle();
    expect(timeline.entries.value).toEqual([]);
    token.value = "renewed";
    await settle();
    expect(read).toHaveBeenCalledTimes(3);
    finish([]);
    await settle();
    expect(timeline.entries.value).toEqual([]);
    scope.stop();
  });
});

describe("timeline transport fallback", () => {
  it("opens the scoped SSE on socket failure, aborts it on recovery, and ignores stale mission notices", async () => {
    const mission = ref<string | null>(ID);
    const owner = ref<string | null>(OWNER);
    const token = ref<string | null>("bearer");
    const fake = fakeSocket();
    const read = vi.fn(async () => [row]);
    const callbacks: Array<() => void> = [];
    const followEvents = vi.fn((_token: string, _id: string, signal: AbortSignal, callback: () => void) => {
      callbacks.push(callback);
      return new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
    });
    const scope = effectScope();
    const timeline = scope.run(() => useMissionTimeline(mission, "user", token, owner, async () => {}, {
      read, followEvents, openSocket: async () => fake.client
    }))!;
    await settle();
    fake.listeners.get("connect_error")?.(new Error("Socket failed"));
    await settle();
    expect(followEvents).toHaveBeenCalledWith("bearer", ID, expect.any(AbortSignal), expect.any(Function));
    fake.listeners.get("connect_error")?.(new Error("Socket still offline"));
    await settle();
    expect(followEvents).toHaveBeenCalledTimes(1); // one stream per timeline, even during repeated failures
    callbacks[0]?.();
    await settle();
    expect(read).toHaveBeenCalledTimes(2);
    fake.listeners.get("connect")?.(undefined);
    await settle();
    expect(followEvents.mock.calls[0]?.[2].aborted).toBe(true);
    callbacks[0]?.();
    await settle();
    expect(read).toHaveBeenCalledTimes(3); // socket connect reload only, stale SSE ignored
    fake.listeners.get("disconnect")?.(undefined);
    await settle();
    expect(followEvents).toHaveBeenCalledTimes(2);
    mission.value = OTHER;
    await settle();
    expect(followEvents.mock.calls[1]?.[2].aborted).toBe(true);
    callbacks[1]?.();
    await settle();
    expect(timeline.entries.value).toEqual([row]); // injected test read ignores the id
    scope.stop();
    expect(fake.close).toHaveBeenCalledTimes(2); // old mission and active mission
  });

  it("refreshes the bearer on SSE retry, stops streams on logout, and handles socket opener failure", async () => {
    const token = ref<string | null>("first");
    const fake = fakeSocket();
    const followEvents = vi.fn((_token: string, _id: string, signal: AbortSignal) =>
      new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true })));
    const scope = effectScope();
    scope.run(() => useMissionTimeline(ref(ID), "user", token, ref(OWNER), async () => {}, {
      read: async () => [row], followEvents, openSocket: async () => fake.client
    }));
    await settle();
    fake.listeners.get("connect_error")?.(new Error("Socket failed"));
    await settle();
    token.value = "second";
    await settle();
    expect(followEvents.mock.calls.map((call) => call[0])).toEqual(["first", "second"]);
    expect(followEvents.mock.calls[0]?.[2].aborted).toBe(true);
    token.value = null;
    await settle();
    expect(followEvents.mock.calls[1]?.[2].aborted).toBe(true);
    scope.stop();

    const failed = vi.fn(async () => { throw new Error("Socket unavailable"); });
    const controller = effectScope();
    controller.run(() => useMissionTimeline(ref(ID), "admin", ref("admin"), ref(OWNER), undefined, {
      read: async () => [row], openSocket: failed, followEvents
    }));
    await settle();
    expect(followEvents).toHaveBeenCalledWith("admin", ID, expect.any(AbortSignal), expect.any(Function));
    controller.stop();
  });
});
