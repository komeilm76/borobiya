import { readFileSync } from "node:fs";
import { effectScope, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SosRequest } from "@shared/index";
import { getRequesterSosRequest, listRequesterSosHistory } from "../api/sos-history";
import { ApiError } from "../api/http";
import { useSosHistory } from "./use-sos-history";

vi.mock("../api/sos-history", () => ({ getRequesterSosRequest: vi.fn(), listRequesterSosHistory: vi.fn() }));
vi.mock("../api/sos", () => ({ cancelSosRequest: vi.fn(), listSosCancellationReasons: vi.fn() }));
const requesterId = "b0000000-0000-4000-8000-000000000001";
const requestId = "b0000000-0000-4000-8000-000000000002";
const olderId = "b0000000-0000-4000-8000-000000000003";
const record: SosRequest = { id: requestId, requesterId, severity: "high", description: "A person needs help on the hillside.",
  incidentTypeId: olderId, location: { lat: 35.7, lon: 51.4, isManual: false }, status: "accepted",
  photoUrl: null, cancellationReasonId: null, cancellationCustomText: null, cancelledAt: null,
  createdAt: "2026-10-24T12:00:00.000Z" };
function pending<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listRequesterSosHistory).mockResolvedValue({ items: [record], total: 1, page: 1, limit: 12, totalPages: 1 });
  vi.mocked(getRequesterSosRequest).mockResolvedValue(record);
});

describe("requester SOS history and cancellation", () => {
  it("pins the real history route, accessible selection, secure photo access, and reason dialog", () => {
    const view = readFileSync(new URL("../views/_user/UserSosHistoryView.vue", import.meta.url), "utf8");
    expect(view).toContain('aria-label="فهرست درخواست‌های امداد"');
    expect(view).toContain('SosCancellationDialog :cancellation="history.cancellation"');
    expect(view).toContain('referrerpolicy="no-referrer"');
    expect(view).toContain('getSosPhotoSrc(id, token)');
    expect(view).toContain('history.canCancelSelected.value');
    expect(view).toContain('v-if="history.listVerified.value"');
    expect(view).toContain('v-if="history.items.value.length && !history.listVerified.value"');
    expect(view).toContain('v-else-if="!history.items.value.length" class="history__empty" role="status"');
    expect(view).toContain('v-if="history.listVerified.value && history.totalPages.value > 1"');
    expect(view).toContain(':disabled="!history.listVerified.value" @click="history.cancellation.show()"');
  });

  it("selects the owner's active request and marks a successful cancel without pretending another one changed", async () => {
    const history = useSosHistory(ref("token"), ref(requesterId));
    await history.load();
    expect(history.selected.value?.id).toBe(requestId);
    expect(history.canCancelSelected.value).toBe(true);
    const other = { ...record, id: olderId, status: "completed" as const };
    history.choose(other);
    expect(history.canCancelSelected.value).toBe(false);
    history.choose(record);
    // The dialog composable owns the confirmed server call. A success flag only updates
    // this request's visible record; no other row can be silently marked cancelled.
    history.cancellation.cancelled.value = true;
    history.markCancelled();
    expect(history.selected.value?.status).toBe("cancelled_by_requester");
    expect(history.items.value[0]?.status).toBe("cancelled_by_requester");
    expect(history.canCancelSelected.value).toBe(false);
  });

  it("keeps the chosen request selected when an older page response arrives late", async () => {
    const history = useSosHistory(ref("token"), ref(requesterId));
    await history.load();
    const waiting = pending<{ items: SosRequest[]; total: number; page: number; limit: number; totalPages: number }>();
    vi.mocked(listRequesterSosHistory).mockReturnValueOnce(waiting.promise);
    const loading = history.load(2);
    history.choose({ ...record, id: olderId });
    waiting.resolve({ items: [record], total: 1, page: 2, limit: 12, totalPages: 1 });
    await loading;
    expect(history.selected.value?.id).toBe(olderId);
  });

  it("does not let an older history reply revive a request after confirmed cancellation", async () => {
    const history = useSosHistory(ref("token"), ref(requesterId));
    await history.load();
    const waiting = pending<{ items: SosRequest[]; total: number; page: number; limit: number; totalPages: number }>();
    vi.mocked(listRequesterSosHistory).mockReturnValueOnce(waiting.promise);
    const refresh = history.load();
    expect(history.loading.value).toBe(true);

    // The cancellation endpoint committed while the older history read was on the wire.
    history.cancellation.cancelled.value = true;
    history.markCancelled();
    expect(history.selected.value?.status).toBe("cancelled_by_requester");
    waiting.resolve({ items: [record], total: 1, page: 1, limit: 12, totalPages: 1 });
    await refresh;
    expect(history.selected.value?.status).toBe("cancelled_by_requester");
    expect(history.items.value[0]?.status).toBe("cancelled_by_requester");
    expect(history.canCancelSelected.value).toBe(false);
    expect(history.loading.value).toBe(false);
  });

  it("does not verify a requester history count before success or after a failed refresh", async () => {
    const history = useSosHistory(ref("token"), ref(requesterId));
    expect(history.listVerified.value).toBe(false);
    await history.load();
    expect(history.listVerified.value).toBe(true);
    expect(history.total.value).toBe(1);
    const waiting = pending<{ items: SosRequest[]; total: number; page: number; limit: number; totalPages: number }>();
    vi.mocked(listRequesterSosHistory).mockReturnValueOnce(waiting.promise);
    const refresh = history.load();
    expect(history.listVerified.value).toBe(false); // last-known rows are not a current count during refresh
    waiting.resolve({ items: [record], total: 1, page: 1, limit: 12, totalPages: 1 });
    await refresh;
    expect(history.listVerified.value).toBe(true);
    vi.mocked(listRequesterSosHistory).mockRejectedValueOnce(new Error("offline"));
    await history.load();
    expect(history.error.value).toBeTruthy();
    expect(history.items.value).toEqual([record]); // keep cached rows; don't call them current
    expect(history.total.value).toBe(1);
    expect(history.listVerified.value).toBe(false);
    await history.load();
    expect(history.error.value).toBeNull();
    expect(history.listVerified.value).toBe(true);
    history.reset();
    expect(history.listVerified.value).toBe(false);
  });

  it("does not claim the account has no requests after a failed first history read", async () => {
    vi.mocked(listRequesterSosHistory).mockRejectedValueOnce(new Error("offline"));
    const history = useSosHistory(ref("token"), ref(requesterId));
    await history.load();
    expect(history.items.value).toEqual([]);
    expect(history.error.value).toBeTruthy();
    expect(history.listVerified.value).toBe(false);
    await history.load();
    expect(history.error.value).toBeNull();
    expect(history.listVerified.value).toBe(true);
  });

  it("handles a foreign deep link without showing another request and does not confuse a network error with 404", async () => {
    const history = useSosHistory(ref("token"), ref(requesterId));
    vi.mocked(getRequesterSosRequest).mockRejectedValueOnce(new ApiError(404, "SOS_REQUEST_NOT_FOUND", "Not found"));
    await history.load(1, olderId);
    expect(history.selected.value?.id).toBe(requestId);
    expect(history.linkError.value).toContain("دسترسی ندارید");
    expect(history.linkRetryable.value).toBe(false);

    // On the first visit the list succeeds, but an off-page linked detail is unavailable.
    // The old code incorrectly reported that the entire list failed and left it empty.
    const unavailable = useSosHistory(ref("token"), ref(requesterId));
    vi.mocked(getRequesterSosRequest).mockRejectedValueOnce(new ApiError(503, "SERVICE_UNAVAILABLE", "Offline"));
    await unavailable.load(1, olderId);
    expect(unavailable.error.value).toBeNull();
    expect(unavailable.items.value).toEqual([record]);
    expect(unavailable.total.value).toBe(1);
    expect(unavailable.selected.value?.id).toBe(requestId);
    expect(unavailable.linkError.value).toBeTruthy();
    expect(unavailable.linkRetryable.value).toBe(true);
    const view = readFileSync(new URL("../views/_user/UserSosHistoryView.vue", import.meta.url), "utf8");
    expect(view).toContain('v-if="history.linkRetryable.value"');
    expect(view).toContain('@click="history.retryLink()"');

    vi.mocked(getRequesterSosRequest).mockResolvedValueOnce({ ...record, id: olderId });
    await unavailable.retryLink();
    expect(unavailable.selected.value?.id).toBe(olderId);
    expect(unavailable.linkError.value).toBeNull();
    expect(unavailable.linkRetryable.value).toBe(false);
  });

  it("immediately drops private requester history and cancellation state when auth changes", async () => {
    const token = ref<string | null>("token");
    const userId = ref<string | null>(requesterId);
    const scope = effectScope();
    const history = scope.run(() => useSosHistory(token, userId))!;
    try {
      await history.load();
      expect(history.selected.value?.id).toBe(requestId);
      history.cancellation.open.value = true;
      token.value = "same-account-renewal";
      expect(history.selected.value?.id).toBe(requestId);
      expect(history.listVerified.value).toBe(true);
      token.value = null;
      expect(history.items.value).toEqual([]);
      expect(history.selected.value).toBeNull();
      expect(history.total.value).toBe(0);
      expect(history.listVerified.value).toBe(false);
      expect(history.cancellation.open.value).toBe(false);

      token.value = "new-account-token";
      await history.load();
      expect(history.items.value).toHaveLength(1);
      userId.value = olderId;
      expect(history.items.value).toEqual([]);
      expect(history.selected.value).toBeNull();
      expect(history.total.value).toBe(0);
    } finally { scope.stop(); }
  });

  it("invalidates a pending list when the bearer disappears without an explicit reset", async () => {
    const token = ref<string | null>("token");
    const userId = ref<string | null>(requesterId);
    const scope = effectScope();
    const history = scope.run(() => useSosHistory(token, userId))!;
    try {
      const waiting = pending<{ items: SosRequest[]; total: number; page: number; limit: number; totalPages: number }>();
      vi.mocked(listRequesterSosHistory).mockReturnValueOnce(waiting.promise);
      const oldRead = history.load();
      await vi.waitFor(() => expect(listRequesterSosHistory).toHaveBeenCalledOnce());
      token.value = null;
      expect(history.loading.value).toBe(false);
      waiting.resolve({ items: [record], total: 1, page: 1, limit: 12, totalPages: 1 });
      await oldRead;
      expect(history.items.value).toEqual([]);
      expect(history.selected.value).toBeNull();
    } finally { scope.stop(); }
  });

  it("clears the view's other private mission and photo state in the same auth turn", () => {
    const view = readFileSync(new URL("../views/_user/UserSosHistoryView.vue", import.meta.url), "utf8");
    expect(view).toContain('watch(() => auth.user?.id, () => { ++missionGeneration; selectedMissions.value = []; timelineMissionId.value = null; clearPhoto(); history.reset(); if (auth.user?.id) void history.load(); }, { flush: "sync" });');
  });

  it("clears the linked retry and all private list metadata on a missing session", async () => {
    const token = ref<string | null>("token");
    const userId = ref<string | null>(requesterId);
    const history = useSosHistory(token, userId);
    vi.mocked(getRequesterSosRequest).mockRejectedValueOnce(new ApiError(503, "SERVICE_UNAVAILABLE", "Offline"));
    await history.load(1, olderId);
    expect(history.linkRetryable.value).toBe(true);
    token.value = null;
    userId.value = null;
    await history.load();
    await history.retryLink();
    expect(history.items.value).toEqual([]);
    expect(history.total.value).toBe(0);
    expect(history.selected.value).toBeNull();
    expect(history.linkError.value).toBeNull();
    expect(history.linkRetryable.value).toBe(false);
    expect(getRequesterSosRequest).toHaveBeenCalledTimes(1);
  });

  it("resolves a deep-link outside page one through an owner-scoped read and discards late data after logout", async () => {
    const token = ref<string | null>("token");
    const userId = ref<string | null>(requesterId);
    const history = useSosHistory(token, userId);
    vi.mocked(getRequesterSosRequest).mockResolvedValue({ ...record, id: olderId });
    await history.load(1, olderId);
    expect(history.selected.value?.id).toBe(olderId);
    expect(getRequesterSosRequest).toHaveBeenCalledWith("token", olderId);
    const waiting = pending<{ items: SosRequest[]; total: number; page: number; limit: number; totalPages: number }>();
    vi.mocked(listRequesterSosHistory).mockReturnValueOnce(waiting.promise);
    const reading = history.load(2);
    token.value = null;
    userId.value = null;
    history.reset();
    waiting.resolve({ items: [record], total: 1, page: 2, limit: 12, totalPages: 1 });
    await reading;
    expect(history.items.value).toEqual([]);
    expect(history.selected.value).toBeNull();
  });
});
