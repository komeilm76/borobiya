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
