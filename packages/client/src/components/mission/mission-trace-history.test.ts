import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileTemplate, parse } from "vue/compiler-sfc";

const timeline = readFileSync(new URL("./MissionTimelinePanel.vue", import.meta.url), "utf8");
const trace = readFileSync(new URL("./MissionTracePanel.vue", import.meta.url), "utf8");
const mission = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");

describe("member-only post-mission route comparison wiring", () => {
  it("shows the same completed-mission trace under requester, rescuer and admin timelines", () => {
    expect(timeline).toContain('<MissionTracePanel v-if="mission.status === \'completed\'" :mission-id="mission.id"');
    expect(timeline).toContain(':show-navigation="showNavigation" />');
    expect(trace).toContain('getMissionLocationTrace(token, id, abort.signal)');
    expect(trace).toContain('controller?.abort();');
    expect(trace).toContain('trace.incomplete');
    expect(trace).toContain('routeLine && rescuerTrace');
    expect(compileTemplate({ source: parse(trace).descriptor.template!.content,
      filename: "MissionTracePanel.vue", id: "mission-trace" }).errors).toEqual([]);
  });
  it("saves a real chosen route on guidance start without blocking foreground navigation", () => {
    expect(mission).toContain('if (!navigation.start()) return;');
    expect(mission).toContain('saveSuggestedMissionRoute(token, missionId, {');
    expect(mission).toContain('routeSaveWarning.value = "ذخیرهٔ مسیر پیشنهادی');
    expect(mission).toContain('desk.activeMission.value?.id === missionId && missionSession.value === session');
    expect(mission).toContain('watch(missionSession, (next) => {');
    expect(mission).toContain('routeSaveWarning.value = null;');
  });
});
