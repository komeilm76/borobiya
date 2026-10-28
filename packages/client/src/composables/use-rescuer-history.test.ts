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
      expect(state.linkRetryable.value).toBe(false);
      expect(state.selected.value?.id).toBe(id);
      expect(state.requestedId.value).toBe(id);
      vi.mocked(getMission).mockRejectedValueOnce(new ApiError(404, "MISSION_NOT_FOUND", "Not found"));
      await state.load(1, otherId);
      expect(state.linkError.value).toContain("دسترسی ندارید");
    } finally { scope.stop(); }
  });
  it("retains a successful list and retries a transient off-page deep link", async () => {
    const scope = effectScope();
    const state = scope.run(() => useRescuerHistory(ref("token"), ref(rescuer)))!;
    try {
      vi.mocked(getMission).mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Offline"));
      await state.load(1, otherId);
      expect(state.items.value).toEqual([mission]);
      expect(state.error.value).toBeNull();
      expect(state.selected.value?.id).toBe(id);
      expect(state.linkError.value).toContain("پیوندشده");
      expect(state.linkError.value).not.toContain("دسترسی ندارید");
      expect(state.linkRetryable.value).toBe(true);
      const view = readFileSync(new URL("../views/_user/UserRescuerHistoryView.vue", import.meta.url), "utf8");
      expect(view).toContain('v-if="history.linkRetryable.value"');
      expect(view).toContain('@click="history.retryLink()"');

      vi.mocked(getMission).mockResolvedValueOnce({ ...detail, id: otherId });
      await state.retryLink();
      expect(state.selected.value?.id).toBe(otherId);
      expect(state.listVerified.value).toBe(true); // the off-page detail returns early after a successful list read
      expect(state.linkError.value).toBeNull();
      expect(state.linkRetryable.value).toBe(false);
      expect(getMission).toHaveBeenLastCalledWith("token", otherId);

      vi.mocked(getMission).mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Offline"));
      await state.load(1, otherId);
      expect(state.linkRetryable.value).toBe(true);
      await state.choose(id);
      expect(state.linkError.value).toBeNull();
      expect(state.linkRetryable.value).toBe(false);
      const reads = vi.mocked(getMission).mock.calls.length;
      await state.retryLink();
      expect(getMission).toHaveBeenCalledTimes(reads);
    } finally { scope.stop(); }
  });

  it("ignores a late linked-detail error after choosing another mission", async () => {
    const started = pending<void>();
    let rejectDetail!: (reason: unknown) => void;
    vi.mocked(getMission).mockImplementationOnce(() => new Promise<MissionDetail>((_resolve, reject) => {
      rejectDetail = reject;
      started.resolve();
    })).mockResolvedValueOnce(detail);
    const scope = effectScope();
    const state = scope.run(() => useRescuerHistory(ref("token"), ref(rescuer)))!;
    try {
      const linked = state.load(1, otherId);
      await started.promise;
      await state.choose(id);
      rejectDetail(new ApiError(503, "UNAVAILABLE", "Offline"));
      await linked;
      expect(state.selected.value?.id).toBe(id);
      expect(state.linkError.value).toBeNull();
      expect(state.linkRetryable.value).toBe(false);
      expect(state.error.value).toBeNull();
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

  it("does not certify a zero count or cached mission rows before a successful latest list read", async () => {
    const scope = effectScope();
    const state = scope.run(() => useRescuerHistory(ref("token"), ref(rescuer)))!;
    try {
      expect(state.listVerified.value).toBe(false);
      vi.mocked(listRescuerMissions).mockRejectedValueOnce(new Error("offline"));
      await state.load();
      expect(state.items.value).toEqual([]);
      expect(state.error.value).toBeTruthy();
      expect(state.listVerified.value).toBe(false);
      await state.load();
      expect(state.items.value).toEqual([mission]);
      expect(state.listVerified.value).toBe(true);
      const delayed = pending<{ items: Mission[]; total: number; totalPages: number }>();
      vi.mocked(listRescuerMissions).mockReturnValueOnce(delayed.promise);
      const refreshing = state.load();
      expect(state.listVerified.value).toBe(false);
      delayed.resolve({ items: [mission], total: 1, totalPages: 1 });
      await refreshing;
      expect(state.listVerified.value).toBe(true);
      vi.mocked(listRescuerMissions).mockRejectedValueOnce(new Error("offline"));
      await state.load();
      expect(state.items.value).toEqual([mission]);
      expect(state.error.value).toBeTruthy();
      expect(state.listVerified.value).toBe(false);
      await state.load();
      expect(state.listVerified.value).toBe(true);
      state.reset();
      expect(state.listVerified.value).toBe(false);
    } finally { scope.stop(); }
  });

  it("shows only verified counts and pagination, and labels retained rows after a failed refresh", () => {
    const view = readFileSync(new URL("../views/_user/UserRescuerHistoryView.vue", import.meta.url), "utf8");
    expect(view).toContain('v-if="history.listVerified.value">{{ history.total.value.toLocaleString');
    expect(view).toContain('v-if="history.items.value.length && !history.listVerified.value"');
    expect(view).toContain('v-else-if="!history.items.value.length && history.listVerified.value"');
    expect(view).toContain('v-else-if="!history.items.value.length"');
    expect(view).toContain('v-if="history.listVerified.value && history.totalPages.value > 1"');
  });

  it("clears private mission rows synchronously on token loss and account switch without a manual reset", async () => {
    const token = ref<string | null>("token");
    const user = ref<string | null>(rescuer);
    const scope = effectScope();
    const state = scope.run(() => useRescuerHistory(token, user))!;
    try {
      await state.load();
      expect(state.selected.value?.id).toBe(id);
      token.value = null;
      expect(state.items.value).toEqual([]);
      expect(state.selected.value).toBeNull();
      expect(state.total.value).toBe(0);
      expect(state.listVerified.value).toBe(false);

      token.value = "new-token";
      await state.load();
      expect(state.items.value).toHaveLength(1);
      user.value = requester;
      expect(state.items.value).toEqual([]);
      expect(state.selected.value).toBeNull();
      expect(state.total.value).toBe(0);
      expect(state.listVerified.value).toBe(false);
    } finally { scope.stop(); }
  });

  it("keeps verified rows on a same-account bearer renewal", async () => {
    const token = ref<string | null>("token");
    const user = ref<string | null>(rescuer);
    const scope = effectScope();
    const state = scope.run(() => useRescuerHistory(token, user))!;
    try {
      await state.load();
      token.value = "renewed-token";
      expect(state.items.value).toHaveLength(1);
      expect(state.selected.value?.id).toBe(id);
      expect(state.listVerified.value).toBe(true);
      expect(listRescuerMissions).toHaveBeenCalledTimes(1);
    } finally { scope.stop(); }
  });

  it("discards an in-flight list after sign-out without requiring another refresh", async () => {
    const token = ref<string | null>("token");
    const user = ref<string | null>(rescuer);
    const scope = effectScope();
    const state = scope.run(() => useRescuerHistory(token, user))!;
    try {
      const waiting = pending<{ items: Mission[]; total: number; totalPages: number }>();
      vi.mocked(listRescuerMissions).mockReturnValueOnce(waiting.promise);
      const old = state.load();
      await vi.waitFor(() => expect(listRescuerMissions).toHaveBeenCalledOnce());
      token.value = null;
      expect(state.loading.value).toBe(false);
      waiting.resolve({ items: [mission], total: 1, totalPages: 1 });
      await old;
      expect(state.items.value).toEqual([]);
      expect(state.selected.value).toBeNull();
    } finally { scope.stop(); }
  });

  it("ignores an in-flight private mission detail after account change", async () => {
    const token = ref<string | null>("token");
    const user = ref<string | null>(rescuer);
    const scope = effectScope();
    const state = scope.run(() => useRescuerHistory(token, user))!;
    try {
      await state.load();
      const waiting = pending<MissionDetail>();
      vi.mocked(getMission).mockReturnValueOnce(waiting.promise);
      const previousReads = vi.mocked(getMission).mock.calls.length;
      const old = state.choose(id);
      await vi.waitFor(() => expect(getMission).toHaveBeenCalledTimes(previousReads + 1));
      user.value = requester;
      expect(state.items.value).toEqual([]);
      expect(state.detailLoading.value).toBe(false);
      waiting.resolve(detail);
      await old;
      expect(state.selected.value).toBeNull();
      expect(state.detailError.value).toBeNull();
    } finally { scope.stop(); }
  });

  it("clears linked retry and private list metadata on logout", async () => {
    const token = ref<string | null>("token");
    const user = ref<string | null>(rescuer);
    const scope = effectScope();
    const state = scope.run(() => useRescuerHistory(token, user))!;
    try {
      vi.mocked(getMission).mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Offline"));
      await state.load(1, otherId);
      expect(state.linkRetryable.value).toBe(true);
      token.value = null;
      user.value = null;
      await state.load();
      await state.retryLink();
      expect(state.items.value).toEqual([]);
      expect(state.total.value).toBe(0);
      expect(state.selected.value).toBeNull();
      expect(state.linkError.value).toBeNull();
      expect(state.linkRetryable.value).toBe(false);
      expect(listRescuerMissions).toHaveBeenCalledTimes(1);
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
