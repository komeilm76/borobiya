import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
const panel = readFileSync(new URL("./MissionLivePanel.vue", import.meta.url), "utf8");
const mission = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const store = readFileSync(new URL("../../stores/rescuer-mission-share.ts", import.meta.url), "utf8");

// Source-pinned UI wiring, never mount Vue SFCs (docs/TASKS.md).
describe("assigned rescuer automatic share and other roles' general share button", () => {
  it("starts the app-scoped publisher on confirmed acceptance, not only on the mission page", () => {
    expect(app).toContain("const missionShare = useRescuerMissionShareStore(pinia);");
    expect(app).toContain("watch(() => proposalInbox.acceptedMissionId, (id) => { if (id) void missionShare.refresh(); }");
    expect(store).toContain('defineStore("rescuer-mission-share"');
    expect(store).toContain("auth.user?.role === \"user\"");
    expect(panel).toContain('<template v-if="fullscreen">');
    expect(panel).toContain('<template v-else-if="canPublish">');
    expect(panel).toContain("missionShare.mission?.id === props.mission.id && missionShare.sharing");
    expect(mission).toContain('@sharing-change="teamSharing = $event"');
    expect(mission).not.toContain("@click=\"live.stopSharing()\"");
  });
  it("shares the companion map's opt-in general broadcast control above SOS, including the requester/admin mission map", () => {
    expect(app).toContain("const broadcast = useBroadcastStore(pinia);");
    expect(app).toContain('v-if="showGeneralShareButton" class="app-general-share"');
    expect(app).toContain('route.name !== "user-map" &&');
    expect(app).toContain(':aria-pressed="broadcast.view.isActive" :disabled="!broadcast.isSupported"');
    expect(app).toContain('@click="broadcast.toggle()"');
    expect(app.indexOf('class="app-general-share"')).toBeLessThan(app.indexOf('<SosTriggerButton'));
    expect(app).toContain('inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 3.5rem);');
    expect(panel).toContain("دکمهٔ پخش عمومی کنار SOS جداست و موقعیت را به این اتاق نمی‌فرستد");
    expect(app).toContain('missionShare.statusError || missionShare.gpsError');
    expect(app).toContain('@click="missionShare.retry()"');
  });
});
