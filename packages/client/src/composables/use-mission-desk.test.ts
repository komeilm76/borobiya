import { readFileSync } from "node:fs";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CancellationReason, Mission } from "@shared/index";
import { ApiError } from "../api/http";
import { cancelRescuerMission, listRescuerCancellationReasons, listRescuerMissions } from "../api/mission";
import { isActiveMission, useMissionDesk } from "./use-mission-desk";

vi.mock("../api/mission", () => ({
  cancelRescuerMission: vi.fn(), listRescuerCancellationReasons: vi.fn(), listRescuerMissions: vi.fn()
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
});

describe("mission desk cancellation", () => {
  it("renders the hidden more-action and explicit reason+confirmation in the accessible view", () => {
    const view = readFileSync(new URL("../views/_user/UserMissionView.vue", import.meta.url), "utf8");
    expect(view).toContain("<v-menu location=\"bottom end\">");
    expect(view).toContain("قادر به ادامه نیستم");
    expect(view).toContain('v-radio-group v-if="desk.reasons.value.length"');
    expect(view).toContain('desk.selectedReason.value?.requiresCustomText');
    expect(view).toContain(':disabled="!desk.canCancel.value"');
    expect(view).toContain('desk.cancellationError.value');
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
