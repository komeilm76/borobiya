import { effectScope, ref } from "vue";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mission, MissionDetail } from "@shared/index";
import { ApiError } from "../api/http";
import { getMission, listRescuerMissions } from "../api/mission";
import { useRescuerHistory } from "./use-rescuer-history";
import { stars } from "../mission/rating-presentation";
import { routeRecords } from "../router";

vi.mock("../api/mission", () => ({ getMission: vi.fn(), listRescuerMissions: vi.fn() }));
const rescuer = "20000000-0000-4000-8000-000000000002";
const requester = "10000000-0000-4000-8000-000000000001";
const id = "30000000-0000-4000-8000-000000000003";
const otherId = "30000000-0000-4000-8000-000000000004";
const now = "2026-10-24T12:00:00.000Z";
const mission: Mission = { id, sosRequestId: id, requesterId: requester, rescuerId: rescuer, status: "completed",
  cancelledBy: null, cancellationReasonId: null, cancellationCustomText: null, cancelledAt: null,
  createdAt: now, updatedAt: now };
const detail: MissionDetail = { ...mission, cancellationReason: null, rating: 4 };
function pending<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listRescuerMissions).mockResolvedValue({ items: [mission], total: 1, totalPages: 1 });
  vi.mocked(getMission).mockResolvedValue(detail);
});

describe("rescuer mission history", () => {
  it("pins accessible history, requester rating, and participant timeline to guarded routes", () => {
    const view = readFileSync(new URL("../views/_user/UserRescuerHistoryView.vue", import.meta.url), "utf8");
    const requesterView = readFileSync(new URL("../views/_user/UserSosHistoryView.vue", import.meta.url), "utf8");
    expect(routeRecords.find((route) => route.path === "/_user/mission-history")?.component).toEqual(expect.any(Function));
    expect(view).toContain("<MissionTimelinePanel");
    expect(view).toContain("history.selected.value.rating");
    expect(view).toContain('@click="history.retryDetail()"');
    expect(view).toContain("history.requestedId.value === item.id");
    expect(requesterView).toContain("<MissionRatingPanel");
    expect(stars(4)).toBe("★★★★☆");
  });
  it("pages rescuer-only missions and reads a selected mission's persisted rating", async () => {
    const scope = effectScope();
    const state = scope.run(() => useRescuerHistory(ref("token"), ref(rescuer)))!;
    try {
      await state.load();
      expect(listRescuerMissions).toHaveBeenCalledWith("token", 1);
      expect(state.selected.value?.rating).toBe(4);
      expect(state.total.value).toBe(1);
      await state.choose(otherId);
      expect(getMission).toHaveBeenCalledTimes(1); // not in the rescuer list
    } finally { scope.stop(); }
  });
  it("rejects foreign requester deep links and never shows their detail", async () => {
    const scope = effectScope();
    const state = scope.run(() => useRescuerHistory(ref("token"), ref(rescuer)))!;
    try {
      vi.mocked(getMission).mockResolvedValueOnce({ ...detail, id: otherId, rescuerId: requester });
      await state.load(1, otherId);
      expect(state.linkError.value).toContain("دسترسی ندارید");
      expect(state.selected.value?.id).toBe(id);
      expect(state.requestedId.value).toBe(id);
      vi.mocked(getMission).mockRejectedValueOnce(new ApiError(404, "MISSION_NOT_FOUND", "Not found"));
      await state.load(1, otherId);
      expect(state.linkError.value).toContain("دسترسی ندارید");
    } finally { scope.stop(); }
  });
  it("keeps a failed detail selected and retries that mission without reloading the list", async () => {
    const second = { ...mission, id: otherId };
    vi.mocked(listRescuerMissions).mockResolvedValue({ items: [mission, second], total: 2, totalPages: 1 });
    const scope = effectScope();
    const state = scope.run(() => useRescuerHistory(ref("token"), ref(rescuer)))!;
    try {
      await state.load();
      vi.mocked(getMission).mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce({ ...detail, id: otherId });
      await state.choose(otherId);
      expect(state.selected.value).toBeNull();
      expect(state.detailError.value).toBeTruthy();
      expect(state.requestedId.value).toBe(otherId);
      await state.retryDetail();
      expect(state.selected.value?.id).toBe(otherId);
      expect(state.detailError.value).toBeNull();
      expect(getMission).toHaveBeenLastCalledWith("token", otherId);
      expect(listRescuerMissions).toHaveBeenCalledTimes(1);
    } finally { scope.stop(); }
  });

  it("keeps the last requested mission on list refresh after a failed detail read", async () => {
    const second = { ...mission, id: otherId };
    vi.mocked(listRescuerMissions).mockResolvedValue({ items: [mission, second], total: 2, totalPages: 1 });
    const scope = effectScope();
    const state = scope.run(() => useRescuerHistory(ref("token"), ref(rescuer)))!;
    try {
      await state.load();
      vi.mocked(getMission).mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce({ ...detail, id: otherId });
      await state.choose(otherId);
      await state.load();
      expect(state.selected.value?.id).toBe(otherId);
      expect(getMission).toHaveBeenLastCalledWith("token", otherId);
    } finally { scope.stop(); }
  });

  it("keeps a new selection when an older detail reply arrives after it", async () => {
    const second = { ...mission, id: otherId };
    const waiting = pending<MissionDetail>();
    const started = pending<void>();
    vi.mocked(listRescuerMissions).mockResolvedValue({ items: [mission, second], total: 2, totalPages: 1 });
    vi.mocked(getMission).mockImplementationOnce(() => { started.resolve(); return waiting.promise; })
      .mockResolvedValueOnce({ ...detail, id: otherId });
    const scope = effectScope();
    const state = scope.run(() => useRescuerHistory(ref("token"), ref(rescuer)))!;
    try {
      const first = state.load();
      // Wait for the list result and its first detail read.
      await started.promise;
      await state.choose(otherId);
      waiting.resolve(detail);
      await first;
      expect(state.selected.value?.id).toBe(otherId);
    } finally { scope.stop(); }
  });

  it("ignores late page data after logout", async () => {
    const token = ref<string | null>("token");
    const user = ref<string | null>(rescuer);
    const scope = effectScope();
    const state = scope.run(() => useRescuerHistory(token, user))!;
    try {
      const waiting = pending<{ items: Mission[]; total: number; totalPages: number }>();
      vi.mocked(listRescuerMissions).mockReturnValueOnce(waiting.promise);
      const load = state.load();
      token.value = null;
      user.value = null;
      state.reset();
      waiting.resolve({ items: [mission], total: 1, totalPages: 1 });
      await load;
      expect(state.selected.value).toBeNull();
      expect(state.requestedId.value).toBeNull();
      expect(state.items.value).toEqual([]);
    } finally { scope.stop(); }
  });
});
