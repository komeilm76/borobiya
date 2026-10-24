import { readFileSync } from "node:fs";
import { ref } from "vue";
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

  it("handles a foreign deep link without showing another request and does not confuse a network error with 404", async () => {
    const history = useSosHistory(ref("token"), ref(requesterId));
    vi.mocked(getRequesterSosRequest).mockRejectedValueOnce(new ApiError(404, "SOS_REQUEST_NOT_FOUND", "Not found"));
    await history.load(1, olderId);
    expect(history.selected.value?.id).toBe(requestId);
    expect(history.linkError.value).toContain("دسترسی ندارید");
    vi.mocked(getRequesterSosRequest).mockRejectedValueOnce(new ApiError(503, "SERVICE_UNAVAILABLE", "Offline"));
    await history.load(1, olderId);
    expect(history.error.value).toBeTruthy();
    expect(history.linkError.value).toBeNull();
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
