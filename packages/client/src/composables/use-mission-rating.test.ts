import { effectScope, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mission, MissionDetail } from "@shared/index";
import { ApiError } from "../api/http";
import { getMission, rateMission } from "../api/mission";
import { useMissionRating } from "./use-mission-rating";

vi.mock("../api/mission", () => ({ getMission: vi.fn(), rateMission: vi.fn() }));
const requesterId = "10000000-0000-4000-8000-000000000001";
const rescuerId = "20000000-0000-4000-8000-000000000002";
const id = "30000000-0000-4000-8000-000000000003";
const now = "2026-10-24T12:00:00.000Z";
const mission: Mission = { id, sosRequestId: id, requesterId, rescuerId, status: "completed",
  cancelledBy: null, cancellationReasonId: null, cancellationCustomText: null, cancelledAt: null,
  createdAt: now, updatedAt: now };
const detail: MissionDetail = { ...mission, rating: null, cancellationReason: null };
function bearer(sub: string, sessionId: string, nonce = 0) {
  return `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ sub, sessionId, nonce }))}.signature`;
}
function pending<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getMission).mockResolvedValue(detail);
  vi.mocked(rateMission).mockResolvedValue(undefined);
});

const flush = async () => { await nextTick(); await new Promise<void>((resolve) => setTimeout(resolve, 0)); };
describe("requester rating composable", () => {
  it("shows persisted rating and never offers a duplicate submit", async () => {
    vi.mocked(getMission).mockResolvedValue({ ...detail, rating: 4 });
    const scope = effectScope();
    const state = scope.run(() => useMissionRating(ref(mission), ref("token"), ref(requesterId)))!;
    try {
      await flush();
      expect(state.rating.value).toBe(4);
      expect(state.canSubmit.value).toBe(false);
      expect(getMission).toHaveBeenCalledWith("token", id);
    } finally { scope.stop(); }
  });
  it("submits one trimmed rating, and reloads persisted state if another tab already rated", async () => {
    const scope = effectScope();
    const state = scope.run(() => useMissionRating(ref(mission), ref("token"), ref(requesterId)))!;
    try {
      await flush();
      state.score.value = 5;
      state.comment.value = "  Thanks  ";
      expect(state.canSubmit.value).toBe(true);
      await state.submit();
      expect(rateMission).toHaveBeenCalledWith("token", id, { rating: 5, comment: "Thanks" });
      expect(state.rating.value).toBe(5);
    } finally { scope.stop(); }
    vi.mocked(rateMission).mockRejectedValueOnce(new ApiError(409, "MISSION_ALREADY_RATED", "Already rated"));
    vi.mocked(getMission).mockResolvedValueOnce(detail).mockResolvedValueOnce({ ...detail, rating: 3 });
    const scope2 = effectScope();
    const state2 = scope2.run(() => useMissionRating(ref(mission), ref("token"), ref(requesterId)))!;
    try {
      await flush();
      state2.score.value = 5;
      await state2.submit();
      expect(state2.rating.value).toBe(3);
      expect(state2.canSubmit.value).toBe(false);
    } finally { scope2.stop(); }
  });
  it("does not discard a rating submission when ensuring the same session rotates its token", async () => {
    const token = ref<string | null>(bearer(requesterId, "session-a"));
    const renewed = bearer(requesterId, "session-a", 1);
    let rotates = false;
    const scope = effectScope();
    const state = scope.run(() => useMissionRating(ref(mission), token, ref(requesterId), async () => {
      if (rotates) { token.value = renewed; await nextTick(); }
    }))!;
    try {
      await flush();
      rotates = true;
      state.score.value = 5;
      await state.submit();
      expect(rateMission).toHaveBeenCalledWith(renewed, id, { rating: 5 });
      expect(state.rating.value).toBe(5);
    } finally { scope.stop(); }
  });

  it("clears the previous mission's saved score and draft immediately on selection change", async () => {
    vi.mocked(getMission).mockResolvedValueOnce({ ...detail, rating: 4 });
    const selected = ref<Mission | null>(mission);
    const scope = effectScope();
    const state = scope.run(() => useMissionRating(selected, ref("token"), ref(requesterId)))!;
    try {
      await flush();
      expect(state.rating.value).toBe(4);
      state.score.value = 5;
      state.comment.value = "Previous mission only";
      const nextId = "30000000-0000-4000-8000-000000000004";
      const wait = pending<MissionDetail>();
      vi.mocked(getMission).mockReturnValueOnce(wait.promise);
      selected.value = { ...mission, id: nextId };
      expect(state.rating.value).toBeNull();
      expect(state.loaded.value).toBe(false);
      expect(state.score.value).toBe(0);
      expect(state.comment.value).toBe("");
      await nextTick();
      wait.resolve({ ...detail, id: nextId, rating: null });
      await flush();
      expect(state.loaded.value).toBe(true);
    } finally { scope.stop(); }
  });

  it("clears a rating immediately on token loss and ignores a late read from the old session", async () => {
    const token = ref<string | null>(bearer(requesterId, "session-a"));
    const scope = effectScope();
    const state = scope.run(() => useMissionRating(ref(mission), token, ref(requesterId)))!;
    try {
      await flush();
      state.score.value = 5;
      const wait = pending<MissionDetail>();
      vi.mocked(getMission).mockReturnValueOnce(wait.promise);
      const loading = state.load();
      await nextTick();
      token.value = null;
      expect(state.loading.value).toBe(false);
      expect(state.loaded.value).toBe(false);
      expect(state.score.value).toBe(0);
      wait.resolve({ ...detail, rating: 4 });
      await loading;
      expect(state.rating.value).toBeNull();
    } finally { scope.stop(); }
  });

  it("does not read or submit a rating under a JWT for a different displayed owner", async () => {
    const token = ref<string | null>(bearer(requesterId, "session-a"));
    const scope = effectScope();
    const state = scope.run(() => useMissionRating(ref(mission), token, ref(requesterId)))!;
    try {
      await flush();
      state.score.value = 5;
      expect(state.canSubmit.value).toBe(true);
      token.value = bearer(rescuerId, "session-b");
      expect(state.loaded.value).toBe(false);
      expect(state.score.value).toBe(0);
      expect(state.canSubmit.value).toBe(false);
      await state.load();
      await state.submit();
      expect(getMission).toHaveBeenCalledTimes(1);
      expect(rateMission).not.toHaveBeenCalled();
    } finally { scope.stop(); }
  });

  it("resets on a new session for the same account but preserves drafts on bearer renewal", async () => {
    const token = ref<string | null>(bearer(requesterId, "session-a"));
    const scope = effectScope();
    const state = scope.run(() => useMissionRating(ref(mission), token, ref(requesterId)))!;
    try {
      await flush();
      state.score.value = 5;
      state.comment.value = "My feedback";
      token.value = bearer(requesterId, "session-a", 1);
      expect(state.loaded.value).toBe(true);
      expect(state.score.value).toBe(5);
      expect(state.comment.value).toBe("My feedback");
      await nextTick();
      expect(getMission).toHaveBeenCalledTimes(1);
      const wait = pending<MissionDetail>();
      vi.mocked(getMission).mockReturnValueOnce(wait.promise);
      token.value = bearer(requesterId, "session-b");
      expect(state.loaded.value).toBe(false);
      expect(state.score.value).toBe(0);
      expect(state.comment.value).toBe("");
      await nextTick();
      wait.resolve(detail);
      await flush();
      expect(getMission).toHaveBeenCalledTimes(2);
    } finally { scope.stop(); }
  });

  it("does not offer an unrated form when the existing-rating read failed", async () => {
    vi.mocked(getMission).mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Offline"));
    const scope = effectScope();
    const state = scope.run(() => useMissionRating(ref(mission), ref("token"), ref(requesterId)))!;
    try {
      await flush();
      state.score.value = 5;
      expect(state.error.value).toBeTruthy();
      expect(state.loaded.value).toBe(false);
      expect(state.canSubmit.value).toBe(false);
      await state.submit();
      expect(rateMission).not.toHaveBeenCalled();
    } finally { scope.stop(); }
  });

  it("prevents foreign and incomplete missions and discards delayed replies after an account switch", async () => {
    const token = ref<string | null>("token");
    const owner = ref<string | null>(rescuerId);
    const selected = ref<Mission | null>(mission);
    const scope = effectScope();
    const state = scope.run(() => useMissionRating(selected, token, owner))!;
    try {
      await flush();
      expect(state.eligible.value).toBe(false);
      expect(getMission).not.toHaveBeenCalled();
      owner.value = requesterId;
      selected.value = { ...mission, status: "pending" };
      await flush();
      expect(state.eligible.value).toBe(false);
      const waiting = pending<MissionDetail>();
      vi.mocked(getMission).mockReturnValueOnce(waiting.promise);
      selected.value = mission;
      await flush();
      owner.value = rescuerId;
      await nextTick();
      waiting.resolve({ ...detail, rating: 5 });
      await flush();
      expect(state.rating.value).toBeNull();
      expect(state.canSubmit.value).toBe(false);
    } finally { scope.stop(); }
  });
});
