import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
const panel = readFileSync(new URL("./MissionLivePanel.vue", import.meta.url), "utf8");
const mission = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const store = readFileSync(new URL("../../stores/rescuer-mission-share.ts", import.meta.url), "utf8");

// Source-pinned UI wiring, never mount Vue SFCs (docs/TASKS.md).
describe("participant automatic mission share and independent general share button", () => {
  it("starts the app-scoped publisher on confirmed acceptance, not only on the mission page", () => {
    expect(app).toContain("const missionShare = useRescuerMissionShareStore(pinia);");
    expect(app).toContain("watch(() => proposalInbox.acceptedMissionId, (id) => { if (id) void missionShare.refresh(); }");
    expect(store).toContain('defineStore("rescuer-mission-share"');
    expect(store).toContain("auth.user?.role === \"user\"");
    expect(panel).toContain('v-if="!fullscreen && isAdmin" class="live-panel__privacy"');
    expect(panel).toContain('v-if="!fullscreen && !isAdmin"');
    expect(panel).not.toContain('v-if="canPublish"');
    expect(app).toContain('useRequesterMissionShareStore(pinia);');
    expect(panel).toContain('requesterShare.isSharingMission(props.mission.id)');
    expect(panel).toContain("missionShare.mission?.id === props.mission.id && missionShare.sharing");
    expect(mission).toContain('@sharing-change="teamSharing = $event"');
    expect(mission).not.toContain("@click=\"live.stopSharing()\"");
  });
  it("records only verified activities without a manual broadcast control", () => {
    expect(app).toContain('broadcast.setAutomatic("mission", active)');
    expect(app).toContain('broadcast.setAutomatic("navigation", active)');
    expect(app).toContain('mapTripSession.endForMission()');
    expect(app).not.toContain('@click="broadcast.toggle()"');
    expect(app).not.toContain('class="app-general-share"');
    expect(app).toContain('missionShare.statusError || missionShare.gpsError');
  });
});
