import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { missionMemberCaption } from "@/mission/live-marker-sync";

// Source-level UI coverage; never mount a Vue SFC in unit tests (docs/TASKS.md).
const room = readFileSync(new URL("../mission/MissionLivePanel.vue", import.meta.url), "utf8");
const mission = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const userMap = readFileSync(new URL("../../views/_user/UserMapView.vue", import.meta.url), "utf8");
const dispatch = readFileSync(new URL("../../views/_admin/AdminDispatchView.vue", import.meta.url), "utf8");
const css = readFileSync(new URL("./map-point.css", import.meta.url), "utf8");

describe("on-map labels for each user-workspace point state", () => {
  it("keeps member identities private, fresh/stale explicit, and center conditional on authorised fixes", () => {
    expect(room).toContain('planMissionMarkerSync(paintedMarkers, live.participantStatus.value)');
    expect(room).toContain('stale: !op.next.fresh');
    expect(room).toContain('presence.snapshot.value?.rescuer.username');
    expect(room).not.toContain('element.style.opacity');
    expect(missionMemberCaption("rescuer", "requester", {
      requesterId: "requester", rescuerId: "rescuer" }, { rescuer: "saved_rescuer" })).toBe("saved_rescuer");
    expect(css).toContain('.bb-map-point--stale .bb-map-point__sign { border-style: dashed; }');
    expect(css).toContain('background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface));');
    expect(css).toContain('@media (forced-colors: active)');
  });

  it("labels incident, route origin, numbered stops and the local-only GPS without stealing tap targets", () => {
    expect(mission).toContain('caption: "حادثه", onActivate:');
    expect(mission).toContain('caption: `ایستگاه ${(index + 1).toLocaleString("fa-IR")}`');
    expect(mission).toContain('{ caption: "مبدأ مسیر" }');
    expect(mission).toContain('positionMapPointLabels(map, [rescuerMarker, ...waypointMarkers, incidentMarker])');
    expect(userMap).toContain('gpsLabel.textContent = "GPS دستگاه"');
    expect(userMap).toContain('caption: "مبدأ"');
    expect(userMap).toContain('caption: "مقصد"');
    expect(userMap).toContain('element.classList.toggle("user-map-view__selected-place--named", namedSearch)');
    expect(css).toContain('.bb-map-point.user-map-view__selected-place--named .bb-map-point__caption { display: none; }');
  });

  it("keeps the actual MapLibre marker absolute and places captions beside the 30px sign", () => {
    // MapLibre applies a translate(...) to this exact element; relative positioning
    // would place the geographic anchor at a flow-dependent, wrong coordinate.
    expect(css).toMatch(/\.bb-map-point \{ position: absolute; top: 0; left: 0;/);
    expect(css).not.toMatch(/\.bb-map-point \{ position: relative/);
    expect(css).toContain('.bb-map-point__caption { position: absolute; top: calc(50% + 19px); left: 50%;');
    expect(css).toContain('bottom: calc(50% + 19px);');
    expect(room).toContain('queueMicrotask(() => {');
    expect(mission).toContain('queueMicrotask(() => {');
    expect(userMap).toContain('if (map.value === instance) positionMapPointLabels(instance, [destinationMarker, routeOriginMarker, ownMarker]);');
    expect(userMap).toContain('if (map.value) positionVisiblePointLabelsAfterMapMove(map.value);');
    expect(userMap).toContain('.user-map-view__own-marker--mission.bb-map-point--label-flipped');
  });

  it("does not turn the Dispatch map into a repeated user-map incident label layer", () => {
    expect(dispatch).not.toContain('positionMapPointLabels(');
    expect(dispatch).not.toContain('createMapPointElement(');
  });
});
