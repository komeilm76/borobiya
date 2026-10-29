import { readFileSync } from "node:fs";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CancellationReason, Mission } from "@shared/index";
import { ApiError } from "../api/http";
import { advanceRescuerMission, cancelRescuerMission, listRescuerCancellationReasons, listRescuerMissions } from "../api/mission";
import { isActiveMission, useMissionDesk } from "./use-mission-desk";

vi.mock("../api/mission", () => ({
  advanceRescuerMission: vi.fn(), cancelRescuerMission: vi.fn(), listRescuerCancellationReasons: vi.fn(), listRescuerMissions: vi.fn()
}));
const requesterId = "a0000000-0000-4000-8000-000000000001";
const rescuerId = "a0000000-0000-4000-8000-000000000002";
const missionId = "a0000000-0000-4000-8000-000000000003";
const now = "2026-10-24T12:00:00.000Z";
const mission: Mission = { id: missionId, sosRequestId: requesterId, rescuerId, requesterId,
  status: "on_the_way", createdAt: now, updatedAt: now, cancelledBy: null, cancellationReasonId: null,
  cancellationCustomText: null, cancelledAt: null };
const reasons: CancellationReason[] = [
  { id: "a0000000-0000-4000-8000-000000000004", type: "rescuer", key: "physical_inability",
    label: "Unable", labelFa: "ناتوانی", isActive: true, requiresCustomText: false },
  { id: "a0000000-0000-4000-8000-000000000005", type: "rescuer", key: "other",
    label: "Other", labelFa: "سایر", isActive: true, requiresCustomText: true }
];
function bearer(sub: string, sessionId: string, nonce = 0): string {
  return `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ sub, sessionId, nonce }))}.signature`;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listRescuerMissions).mockResolvedValue({ items: [mission], total: 1, totalPages: 1 });
  vi.mocked(listRescuerCancellationReasons).mockResolvedValue(reasons);
  vi.mocked(cancelRescuerMission).mockResolvedValue();
  vi.mocked(advanceRescuerMission).mockResolvedValue(mission);
});

describe("mission desk cancellation", () => {
  it("renders the hidden more-action and explicit reason+confirmation in the accessible view", () => {
    const view = readFileSync(new URL("../views/_user/UserMissionView.vue", import.meta.url), "utf8");
    expect(view).toContain("<v-menu location=\"bottom end\">");
    expect(view).toContain("قادر به ادامه نیستم");
    expect(view).toContain('v-radio-group v-if="desk.reasons.value.length && !desk.missionChanged.value"');
    expect(view).toContain('desk.selectedReason.value?.requiresCustomText');
    expect(view).toContain(':disabled="!desk.canCancel.value"');
    expect(view).toContain('desk.cancellationError.value');
    expect(view).toContain('v-if="desk.missionChanged.value"');
    expect(view).toContain('v-if="desk.reasons.value.length && !desk.missionChanged.value"');
  });

  it("only reloads the mission view for a matching JWT owner and session, with synchronous cleanup", () => {
    const view = readFileSync(new URL("../views/_user/UserMissionView.vue", import.meta.url), "utf8");
    expect(view).toContain("const missionSession = computed(() => {");
    expect(view).toContain("claims?.sub !== owner");
    expect(view).toContain('typeof claims.sessionId !== "string"');
    expect(view).toContain("return JSON.stringify([owner, claims.sessionId]);");
    expect(view).toContain("watch(missionSession, (next) => {\n  closeRoutes();\n  desk.reset();");
    expect(view).toContain("if (next) void desk.load()");
    expect(view).toMatch(/watch\(missionSession,[\s\S]*?\{ flush: "sync" \}\);/);
    expect(view).toContain("onMounted(() => { if (missionSession.value) void desk.load(); });");
  });

  it("never cancels without a reason or short Other explanation; sends only once while waiting", async () => {
    const desk = useMissionDesk(ref("token"), ref(rescuerId));
    await desk.load();
    expect(isActiveMission(desk.activeMission.value!.status)).toBe(true);
    await desk.showCancellation();
    await desk.confirmCancellation();
    expect(cancelRescuerMission).not.toHaveBeenCalled();
    desk.reasonId.value = reasons[1]!.id;
    desk.customReason.value = "short";
    expect(desk.canCancel.value).toBe(false);
    desk.customReason.value = "I cannot continue safely.";
    const pending = deferred<void>();
    vi.mocked(cancelRescuerMission).mockReturnValueOnce(pending.promise);
    const saving = desk.confirmCancellation();
    expect(desk.cancelling.value).toBe(true);
    desk.dismissCancellation();
    expect(desk.cancellationOpen.value).toBe(true);
    await desk.confirmCancellation();
    expect(cancelRescuerMission).toHaveBeenCalledTimes(1);
    expect(cancelRescuerMission).toHaveBeenCalledWith("token", missionId, reasons[1]!.id, "I cannot continue safely.");
    pending.resolve();
    await saving;
    expect(desk.activeMission.value).toBeNull();
    expect(desk.cancelledMissionId.value).toBe(missionId);
  });

  it("keeps an accepted-status conflict visible rather than claiming the rescue stopped", async () => {
    const desk = useMissionDesk(ref("token"), ref(rescuerId));
    await desk.load();
    await desk.showCancellation();
    desk.reasonId.value = reasons[0]!.id;
    vi.mocked(cancelRescuerMission).mockRejectedValueOnce(new ApiError(409, "MISSION_NOT_ACTIVE", "Changed"));
    await desk.confirmCancellation();
    expect(desk.activeMission.value?.status).toBe("on_the_way");
    expect(desk.canCancel.value).toBe(false);
    expect(desk.cancellationError.value).toContain("هیچ لغوی ثبت نشد");
  });

  it("does not offer stale rescuer reasons or hide Retry after a reopened picker fails", async () => {
    const desk = useMissionDesk(ref("token"), ref(rescuerId));
    await desk.load();
    await desk.showCancellation();
    expect(desk.reasons.value).toEqual(reasons);
    desk.dismissCancellation();
    vi.mocked(listRescuerCancellationReasons).mockRejectedValueOnce(new Error("offline"));
    const refresh = desk.showCancellation();
    expect(desk.reasons.value).toEqual([]);
    await refresh;
    expect(desk.cancellationError.value).toBeTruthy();
    expect(desk.reasons.value).toEqual([]); // View shows Retry only when reasons are empty.
    desk.reasonId.value = reasons[0]!.id;
    expect(desk.canCancel.value).toBe(false);
    await desk.confirmCancellation();
    expect(cancelRescuerMission).not.toHaveBeenCalled();
    await desk.showCancellation();
    expect(desk.reasons.value).toEqual(reasons);
  });

  it("cannot confirm a different mission that became active after opening the cancellation dialog", async () => {
    const nextMission = { ...mission, id: "a0000000-0000-4000-8000-000000000006" };
    const desk = useMissionDesk(ref("token"), ref(rescuerId));
    await desk.load();
    await desk.showCancellation();
    desk.reasonId.value = reasons[0]!.id;
    expect(desk.canCancel.value).toBe(true);
    vi.mocked(listRescuerMissions).mockResolvedValueOnce({ items: [nextMission], total: 1, totalPages: 1 });
    await desk.load();
    expect(desk.activeMission.value?.id).toBe(nextMission.id);
    expect(desk.missionChanged.value).toBe(true);
    expect(desk.canCancel.value).toBe(false);
    await desk.confirmCancellation();
    expect(cancelRescuerMission).not.toHaveBeenCalled();
    desk.dismissCancellation();
    await desk.showCancellation(); // New explicit decision for the new mission.
    desk.reasonId.value = reasons[0]!.id;
    await desk.confirmCancellation();
    expect(cancelRescuerMission).toHaveBeenCalledOnce();
    expect(cancelRescuerMission).toHaveBeenCalledWith("token", nextMission.id, reasons[0]!.id, undefined);
  });

  it("does not let a late cancellation acknowledgement claim the replacement mission was cancelled", async () => {
    const nextMission = { ...mission, id: "a0000000-0000-4000-8000-000000000006" };
    const desk = useMissionDesk(ref("token"), ref(rescuerId));
    await desk.load();
    await desk.showCancellation();
    desk.reasonId.value = reasons[0]!.id;
    const pending = deferred<void>();
    vi.mocked(cancelRescuerMission).mockReturnValueOnce(pending.promise);
    const saving = desk.confirmCancellation();
    vi.mocked(listRescuerMissions).mockResolvedValueOnce({ items: [nextMission], total: 1, totalPages: 1 });
    await desk.load();
    pending.resolve();
    await saving;
    expect(desk.activeMission.value?.id).toBe(nextMission.id);
    expect(desk.cancelledMissionId.value).toBeNull();
    expect(desk.missionChanged.value).toBe(true);
    expect(desk.cancellationOpen.value).toBe(true);
  });

  it("does not keep the prior cancellation banner above a verified replacement mission", async () => {
    const nextMission = { ...mission, id: "a0000000-0000-4000-8000-000000000006" };
    const desk = useMissionDesk(ref("token"), ref(rescuerId));
    await desk.load();
    await desk.showCancellation();
    desk.reasonId.value = reasons[0]!.id;
    await desk.confirmCancellation();
    expect(desk.cancelledMissionId.value).toBe(missionId);
    vi.mocked(listRescuerMissions).mockResolvedValueOnce({ items: [nextMission], total: 1, totalPages: 1 });
    await desk.load();
    expect(desk.activeMission.value?.id).toBe(nextMission.id);
    expect(desk.cancelledMissionId.value).toBeNull();
  });

  it("does not strand the list spinner when the cancellation dialog opens during a refresh", async () => {
    const desk = useMissionDesk(ref("token"), ref(rescuerId));
    await desk.load();
    const slowList = deferred<{ items: Mission[]; total: number; totalPages: number }>();
    vi.mocked(listRescuerMissions).mockReturnValueOnce(slowList.promise);
    const refresh = desk.load();
    expect(desk.loading.value).toBe(true);
    await desk.showCancellation();
    slowList.resolve({ items: [mission], total: 1, totalPages: 1 });
    await refresh;
    expect(desk.loading.value).toBe(false);
    expect(desk.activeMission.value?.id).toBe(mission.id);
  });

  it("ignores a list started before a committed cancellation even if it answers afterwards", async () => {
    const desk = useMissionDesk(ref("token"), ref(rescuerId));
    await desk.load();
    await desk.showCancellation();
    desk.reasonId.value = reasons[0]!.id;
    const slowList = deferred<{ items: Mission[]; total: number; totalPages: number }>();
    vi.mocked(listRescuerMissions).mockReturnValueOnce(slowList.promise);
    const refresh = desk.load();
    await desk.confirmCancellation();
    expect(desk.cancelledMissionId.value).toBe(missionId);
    slowList.resolve({ items: [mission], total: 1, totalPages: 1 });
    await refresh;
    expect(desk.activeMission.value).toBeNull();
    expect(desk.loading.value).toBe(false);
  });

  it("does not apply a previous panel's cancellation response after reset for the same account", async () => {
    const desk = useMissionDesk(ref("token"), ref(rescuerId));
    await desk.load();
    await desk.showCancellation();
    desk.reasonId.value = reasons[0]!.id;
    const slowCancel = deferred<void>();
    vi.mocked(cancelRescuerMission).mockReturnValueOnce(slowCancel.promise);
    const saving = desk.confirmCancellation();
    desk.reset(); // e.g. the mission view unmounted and reopened for the same account
    await desk.load();
    expect(desk.activeMission.value?.id).toBe(missionId);
    slowCancel.resolve();
    await saving;
    expect(desk.activeMission.value?.id).toBe(missionId);
    expect(desk.cancelledMissionId.value).toBeNull();
    expect(desk.cancellationOpen.value).toBe(false);
    expect(desk.cancelling.value).toBe(false);
  });

  it("clears private missions and cancellation state immediately on token loss without an explicit reset", async () => {
    const token = ref<string | null>("token");
    const owner = ref<string | null>(rescuerId);
    const desk = useMissionDesk(token, owner);
    await desk.load();
    await desk.showCancellation();
    expect(desk.missions.value).toHaveLength(1);
    expect(desk.cancellationOpen.value).toBe(true);
    token.value = null;
    expect(desk.missions.value).toEqual([]);
    expect(desk.cancellationOpen.value).toBe(false);
    expect(desk.reasons.value).toEqual([]);
    expect(desk.loading.value).toBe(false);
  });

  it("does not carry old rows or a late reply into a new owner before the view's next tick", async () => {
    const token = ref<string | null>("token-a");
    const owner = ref<string | null>(rescuerId);
    const desk = useMissionDesk(token, owner);
    await desk.load();
    const pending = deferred<{ items: Mission[]; total: number; totalPages: number }>();
    vi.mocked(listRescuerMissions).mockReturnValueOnce(pending.promise);
    const oldRead = desk.load();
    expect(desk.loading.value).toBe(true);
    owner.value = requesterId;
    token.value = "token-b";
    expect(desk.missions.value).toEqual([]);
    expect(desk.loading.value).toBe(false);
    pending.resolve({ items: [mission], total: 1, totalPages: 1 });
    await oldRead;
    expect(desk.missions.value).toEqual([]);
  });

  it("keeps missions and an open reason panel through same-session bearer rotation", async () => {
    const token = ref<string | null>(bearer(rescuerId, "session-a"));
    const desk = useMissionDesk(token, ref(rescuerId));
    await desk.load();
    await desk.showCancellation();
    const pending = deferred<{ items: Mission[]; total: number; totalPages: number }>();
    vi.mocked(listRescuerMissions).mockReturnValueOnce(pending.promise);
    const refresh = desk.load();
    token.value = bearer(rescuerId, "session-a", 1);
    expect(desk.missions.value).toEqual([mission]);
    expect(desk.cancellationOpen.value).toBe(true);
    pending.resolve({ items: [mission], total: 1, totalPages: 1 });
    await refresh;
    expect(desk.loading.value).toBe(false);
    expect(desk.activeMission.value?.id).toBe(missionId);
  });

  it("clears on a new session for the same owner and rejects a mismatched bearer before reading", async () => {
    const token = ref<string | null>(bearer(rescuerId, "session-a"));
    const desk = useMissionDesk(token, ref(rescuerId));
    await desk.load();
    await desk.showCancellation();
    token.value = bearer(rescuerId, "session-b");
    expect(desk.missions.value).toEqual([]);
    expect(desk.cancellationOpen.value).toBe(false);
    await desk.load();
    expect(desk.missions.value).toEqual([mission]);
    token.value = bearer(requesterId, "session-c");
    expect(desk.missions.value).toEqual([]);
    expect(desk.canCancel.value).toBe(false);
    await desk.load();
    await desk.showCancellation();
    expect(listRescuerMissions).toHaveBeenCalledTimes(2);
    expect(listRescuerCancellationReasons).toHaveBeenCalledTimes(1);
  });

  it("does not send a mission read after session recovery changes to a different owner", async () => {
    const token = ref<string | null>(bearer(rescuerId, "session-a"));
    const recovery = deferred<void>();
    const desk = useMissionDesk(token, ref(rescuerId), () => recovery.promise);
    const loading = desk.load();
    token.value = bearer(requesterId, "session-b");
    expect(desk.loading.value).toBe(false);
    recovery.resolve();
    await loading;
    expect(listRescuerMissions).not.toHaveBeenCalled();
    expect(desk.missions.value).toEqual([]);
  });

  it("discards an in-flight cancellation after the token vanishes without explicit reset", async () => {
    const token = ref<string | null>(bearer(rescuerId, "session-a"));
    const desk = useMissionDesk(token, ref(rescuerId));
    await desk.load();
    await desk.showCancellation();
    desk.reasonId.value = reasons[0]!.id;
    const pending = deferred<void>();
    vi.mocked(cancelRescuerMission).mockReturnValueOnce(pending.promise);
    const saving = desk.confirmCancellation();
    token.value = null;
    expect(desk.missions.value).toEqual([]);
    expect(desk.cancelling.value).toBe(false);
    pending.resolve();
    await saving;
    expect(desk.cancelledMissionId.value).toBeNull();
    expect(desk.cancellationOpen.value).toBe(false);
  });

  it("drops a late mission list after sign-out or account switch", async () => {
    const token = ref<string | null>("token");
    const owner = ref<string | null>(rescuerId);
    const pending = deferred<{ items: Mission[]; total: number; totalPages: number }>();
    vi.mocked(listRescuerMissions).mockReturnValueOnce(pending.promise);
    const desk = useMissionDesk(token, owner);
    const fetching = desk.load();
    token.value = null;
    owner.value = requesterId;
    desk.reset();
    pending.resolve({ items: [mission], total: 1, totalPages: 1 });
    await fetching;
    expect(desk.missions.value).toEqual([]);
  });
});

describe("rescuer mission progression", () => {
  it("exposes an explicit accessible next-step control and error/refresh state without mounting the view", () => {
    const view = readFileSync(new URL("../views/_user/UserMissionView.vue", import.meta.url), "utf8");
    expect(view).toContain('desk.nextStatus.value');
    expect(view).toContain('desk.advanceStatus()');
    expect(view).toContain(':loading="desk.progressing.value"');
    expect(view).toContain(':disabled="!desk.canAdvance.value"');
    expect(view).toContain('desk.progressError.value');
    expect(view).toContain('role="alert"');
  });

  it("advances each server-confirmed step in order, exactly once per pending write, and completes the mission", async () => {
    const desk = useMissionDesk(ref("token"), ref(rescuerId));
    vi.mocked(listRescuerMissions).mockResolvedValueOnce({ items: [{ ...mission, status: "pending" }], total: 1, totalPages: 1 });
    await desk.load();
    const expected = ["on_the_way", "arrived", "in_progress", "completed"] as const;
    for (const status of expected) {
      expect(desk.nextStatus.value).toBe(status);
      const pending = deferred<Mission>();
      vi.mocked(advanceRescuerMission).mockReturnValueOnce(pending.promise);
      const saving = desk.advanceStatus();
      expect(desk.progressing.value).toBe(true);
      expect(desk.canAdvance.value).toBe(false);
      await desk.advanceStatus();
      await desk.load(); // a stale read must not overwrite the committed response
      expect(advanceRescuerMission).toHaveBeenCalledTimes(expected.indexOf(status) + 1);
      expect(advanceRescuerMission).toHaveBeenLastCalledWith("token", missionId, status);
      pending.resolve({ ...mission, status });
      await saving;
      expect(desk.progressing.value).toBe(false);
      expect(desk.missions.value.find((item) => item.id === missionId)?.status).toBe(status);
    }
    expect(desk.activeMission.value).toBeNull();
    expect(desk.nextStatus.value).toBeNull();
    await desk.advanceStatus();
    expect(advanceRescuerMission).toHaveBeenCalledTimes(4);
  });

  it("blocks uncertain or conflicting writes until a fresh server read verifies the mission", async () => {
    const desk = useMissionDesk(ref("token"), ref(rescuerId));
    await desk.load();
    vi.mocked(advanceRescuerMission).mockRejectedValueOnce(new ApiError(409, "INVALID_MISSION_TRANSITION", "Changed"));
    await desk.advanceStatus();
    expect(desk.activeMission.value?.status).toBe("on_the_way");
    expect(desk.canAdvance.value).toBe(false);
    expect(desk.progressError.value).toContain("تازه");
    await desk.advanceStatus();
    expect(advanceRescuerMission).toHaveBeenCalledTimes(1);
    vi.mocked(listRescuerMissions).mockResolvedValueOnce({ items: [{ ...mission, status: "arrived" }], total: 1, totalPages: 1 });
    await desk.load();
    expect(desk.progressError.value).toBeNull();
    expect(desk.nextStatus.value).toBe("in_progress");
    expect(desk.canAdvance.value).toBe(true);
  });

  it("discards a pre-mutation list and a late acknowledgement after a new session or unmount reset", async () => {
    const token = ref<string | null>(bearer(rescuerId, "session-a"));
    const desk = useMissionDesk(token, ref(rescuerId));
    await desk.load();
    const slowList = deferred<{ items: Mission[]; total: number; totalPages: number }>();
    vi.mocked(listRescuerMissions).mockReturnValueOnce(slowList.promise);
    const reading = desk.load();
    const slowWrite = deferred<Mission>();
    vi.mocked(advanceRescuerMission).mockReturnValueOnce(slowWrite.promise);
    const saving = desk.advanceStatus();
    slowWrite.resolve({ ...mission, status: "arrived" });
    await saving;
    slowList.resolve({ items: [mission], total: 1, totalPages: 1 });
    await reading;
    expect(desk.activeMission.value?.status).toBe("arrived");
    const deferredWrite = deferred<Mission>();
    vi.mocked(advanceRescuerMission).mockReturnValueOnce(deferredWrite.promise);
    const late = desk.advanceStatus();
    token.value = bearer(rescuerId, "session-b");
    expect(desk.missions.value).toEqual([]);
    deferredWrite.resolve({ ...mission, status: "in_progress" });
    await late;
    expect(desk.missions.value).toEqual([]);
    expect(desk.progressing.value).toBe(false);
  });

  it("does not advance while cancellation is open, or open cancellation during a progression write", async () => {
    const desk = useMissionDesk(ref("token"), ref(rescuerId));
    await desk.load();
    await desk.showCancellation();
    expect(desk.canAdvance.value).toBe(false);
    await desk.advanceStatus();
    expect(advanceRescuerMission).not.toHaveBeenCalled();
    desk.dismissCancellation();
    const pending = deferred<Mission>();
    vi.mocked(advanceRescuerMission).mockReturnValueOnce(pending.promise);
    const saving = desk.advanceStatus();
    await desk.showCancellation();
    expect(desk.cancellationOpen.value).toBe(false);
    pending.resolve({ ...mission, status: "arrived" });
    await saving;
  });
});

describe("mission progression uncertainty", () => {
  it("keeps a possibly committed network failure blocked through a failed refresh and clears it only after a verified read", async () => {
    const desk = useMissionDesk(ref("token"), ref(rescuerId));
    await desk.load();
    vi.mocked(advanceRescuerMission).mockRejectedValueOnce(new TypeError("Network unavailable"));
    await desk.advanceStatus();
    expect(desk.canAdvance.value).toBe(false);
    expect(desk.progressError.value).toContain("تازه");
    vi.mocked(listRescuerMissions).mockRejectedValueOnce(new Error("Offline"));
    await desk.load();
    expect(desk.canAdvance.value).toBe(false);
    vi.mocked(listRescuerMissions).mockResolvedValueOnce({ items: [{ ...mission, status: "completed" }], total: 1, totalPages: 1 });
    await desk.load();
    expect(desk.progressError.value).toBeNull();
    expect(desk.canAdvance.value).toBe(false);
    expect(desk.activeMission.value).toBeNull();
  });

  it("keeps completion visible until a verified new assignment and discards a late response after reset", async () => {
    const desk = useMissionDesk(ref("token"), ref(rescuerId));
    await desk.load();
    vi.mocked(advanceRescuerMission).mockResolvedValueOnce({ ...mission, status: "arrived" });
    await desk.advanceStatus();
    vi.mocked(advanceRescuerMission).mockResolvedValueOnce({ ...mission, status: "in_progress" });
    await desk.advanceStatus();
    vi.mocked(advanceRescuerMission).mockResolvedValueOnce({ ...mission, status: "completed" });
    await desk.advanceStatus();
    expect(desk.completedMissionId.value).toBe(missionId);
    const other = { ...mission, id: "a0000000-0000-4000-8000-000000000006", status: "pending" as const };
    vi.mocked(listRescuerMissions).mockResolvedValueOnce({ items: [other], total: 1, totalPages: 1 });
    await desk.load();
    expect(desk.completedMissionId.value).toBeNull();
    const pending = deferred<Mission>();
    vi.mocked(advanceRescuerMission).mockReturnValueOnce(pending.promise);
    const saving = desk.advanceStatus();
    desk.reset();
    pending.resolve({ ...other, status: "on_the_way" });
    await saving;
    expect(desk.missions.value).toEqual([]);
    expect(desk.completedMissionId.value).toBeNull();
  });
});
