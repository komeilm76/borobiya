import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { actorLabel, isTerminal, statusLabel } from "./timeline-presentation";

const mission = { rescuerId: "rescuer", requesterId: "requester" };
describe("mission timeline UI (T3.5.8)", () => {
  it("labels every terminal step and attributes only known participant IDs", () => {
    for (const status of ["completed", "cancelled_by_requester", "cancelled_by_rescuer", "expired"] as const) {
      expect(isTerminal(status)).toBe(true);
      expect(statusLabel(status)).toBeTruthy();
    }
    expect(isTerminal("pending")).toBe(false);
    expect(actorLabel(null, mission)).toContain("سامانه");
    expect(actorLabel("requester", mission)).toContain("درخواست‌کننده");
    expect(actorLabel("rescuer", mission)).toContain("امدادگر");
    expect(actorLabel("other", mission)).toContain("مرکز");
  });

  it("shows persisted steps on both history views while reserving live maps for active missions", () => {
    const requester = readFileSync(new URL("../views/_user/UserSosHistoryView.vue", import.meta.url), "utf8");
    const admin = readFileSync(new URL("../views/_admin/AdminDispatchView.vue", import.meta.url), "utf8");
    const panel = readFileSync(new URL("../components/mission/MissionTimelinePanel.vue", import.meta.url), "utf8");
    expect(requester).toContain('audience="user"');
    expect(requester).toContain('listRequesterMissions(token, page, id)');
    expect(admin).toContain('audience="admin"');
    expect(admin).toContain('useAdminRequestMissions(');
    const adminRead = readFileSync(new URL("../composables/use-admin-request-missions.ts", import.meta.url), "utf8");
    expect(adminRead).toContain('read: typeof listActiveSosMissions = listActiveSosMissions');
    expect(adminRead).toContain('read(bearer, id, true)');
    expect(requester).toContain('<MissionLivePanel v-if="selectedMission"');
    expect(admin).toContain('v-for="mission in activeMissions"');
    expect(panel).toContain('<time :datetime="step.createdAt"');
    expect(panel).toContain('@click="timeline.load()"');
  });
});
