import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { MissionPresence } from "@shared/index";
import { useMissionPresence } from "./use-mission-presence";

const missionId = "70000000-0000-4000-8000-000000000001";
const otherMissionId = "70000000-0000-4000-8000-000000000002";
const result = (id = missionId): MissionPresence => ({ missionId: id,
  requester: { online: true, lastSeenAt: "2026-10-25T12:00:00Z" },
  rescuer: { online: false, lastSeenAt: "2026-10-25T11:58:00Z" } });

async function settle() { await Promise.resolve(); await nextTick(); await Promise.resolve(); }

describe("mission-scoped transport presence", () => {
  it("ignores a late read after a mission/account switch and clears its poller on unmount", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
    const pending: Array<{ signal: AbortSignal; resolve: (value: MissionPresence) => void }> = [];
    const read = vi.fn((_token: string, _id: string, signal?: AbortSignal) =>
      new Promise<MissionPresence>((resolve) => pending.push({ signal: signal!, resolve })));
    const id = ref<string | null>(missionId);
    const user = ref<string | null>("u1");
    const scope = effectScope();
    try {
      const presence = scope.run(() => useMissionPresence(id, ref("jwt"), user, read))!;
      await settle();
      id.value = otherMissionId;
      await settle();
      expect(pending[0]?.signal.aborted).toBe(true);
      pending[0]!.resolve(result(missionId));
      await settle();
      expect(presence.requester.value).toBe("unknown");
      pending[1]!.resolve(result(otherMissionId));
      await settle();
      expect(presence.requester.value).toBe("online");
      expect(presence.rescuer.value).toBe("grace");
      user.value = null;
      await settle();
      expect(presence.snapshot.value).toBeNull();
      vi.advanceTimersByTime(60_000);
      expect(read).toHaveBeenCalledTimes(2);
    } finally { scope.stop(); vi.useRealTimers(); }
  });

  it("does not keep stale connected state when a poll fails, and never accepts another mission ID", async () => {
    const read = vi.fn().mockResolvedValueOnce(result(otherMissionId)).mockResolvedValueOnce(result())
      .mockRejectedValueOnce(new Error("offline"));
    const scope = effectScope();
    try {
      const presence = scope.run(() => useMissionPresence(ref(missionId), ref("jwt"), ref("u1"), read))!;
      await settle();
      expect(presence.requester.value).toBe("unknown");
      await presence.refresh();
      expect(presence.snapshot.value?.missionId).toBe(missionId);
      await presence.refresh();
      expect(presence.snapshot.value).toBeNull();
    } finally { scope.stop(); }
  });
});
