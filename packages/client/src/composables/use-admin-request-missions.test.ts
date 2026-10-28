import { effectScope, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { Mission, SosRequestStatus } from "@shared/index";
import { useAdminRequestMissions } from "./use-admin-request-missions";

const sosId = "70000000-0000-4000-8000-000000000001";
const otherSosId = "70000000-0000-4000-8000-000000000002";
const mission: Mission = {
  id: "70000000-0000-4000-8000-000000000003", sosRequestId: sosId,
  requesterId: "70000000-0000-4000-8000-000000000004",
  rescuerId: "70000000-0000-4000-8000-000000000005",
  status: "in_progress", cancelledBy: null, cancellationReasonId: null,
  cancellationCustomText: null, cancelledAt: null,
  createdAt: "2026-10-28T10:00:00.000Z", updatedAt: "2026-10-28T10:00:00.000Z"
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

it("distinguishes pending, verified empty, failed and retried admin mission reads", async () => {
  const first = deferred<Mission[]>();
  const retry = deferred<Mission[]>();
  const read = vi.fn().mockReturnValueOnce(first.promise)
    .mockRejectedValueOnce(new Error("offline"))
    .mockReturnValueOnce(retry.promise);
  const scope = effectScope();
  const state = scope.run(() => useAdminRequestMissions(ref(sosId), ref<SosRequestStatus>("pending"),
    ref("admin-bearer"), read))!;
  try {
    expect(state.missionLoading.value).toBe(true);
    expect(state.missionLoaded.value).toBe(false);
    expect(state.requestMissions.value).toEqual([]);
    first.resolve([]);
    await first.promise;
    await Promise.resolve();
    expect(state.missionLoaded.value).toBe(true);
    expect(state.missionLoading.value).toBe(false);
    const failed = state.loadActiveMissions();
    expect(state.missionLoading.value).toBe(true);
    expect(state.missionLoaded.value).toBe(false);
    await failed;
    expect(state.missionError.value).toContain("بارگذاری نشد");
    expect(state.missionLoading.value).toBe(false);
    expect(state.missionLoaded.value).toBe(false);
    const loading = state.loadActiveMissions();
    expect(state.missionError.value).toBeNull();
    retry.resolve([mission]);
    await loading;
    expect(state.missionLoaded.value).toBe(true);
    expect(state.requestMissions.value).toEqual([mission]);
    expect(state.activeMissions.value).toEqual([mission]);
    expect(state.timelineMissionId.value).toBe(mission.id);
    expect(state.selectedTimelineMission.value).toEqual(mission);
    expect(read).toHaveBeenCalledWith("admin-bearer", sosId, true);
  } finally { scope.stop(); }
});

it("clears the previous request synchronously and discards a late reply on account loss", async () => {
  const next = deferred<Mission[]>();
  const other = deferred<Mission[]>();
  const read = vi.fn().mockResolvedValueOnce([mission])
    .mockReturnValueOnce(next.promise).mockReturnValueOnce(other.promise);
  const id = ref<string | null>(sosId);
  const token = ref<string | null>("admin-bearer");
  const status = ref<SosRequestStatus | null>("pending");
  const scope = effectScope();
  const state = scope.run(() => useAdminRequestMissions(id, status, token, read))!;
  try {
    await Promise.resolve();
    expect(state.requestMissions.value).toEqual([mission]);
    id.value = otherSosId;
    expect(state.requestMissions.value).toEqual([]);
    expect(state.missionLoading.value).toBe(true);
    token.value = null;
    expect(state.missionLoading.value).toBe(false);
    next.resolve([mission]);
    await next.promise;
    await Promise.resolve();
    expect(state.requestMissions.value).toEqual([]);
    expect(state.missionLoaded.value).toBe(false);
    token.value = "new-admin-bearer";
    expect(state.missionLoading.value).toBe(true);
    scope.stop();
    other.resolve([mission]);
    await other.promise;
    await Promise.resolve();
    expect(state.requestMissions.value).toEqual([]);
    expect(state.missionLoaded.value).toBe(false);
  } finally { next.resolve([]); other.resolve([]); scope.stop(); }
});
