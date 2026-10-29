import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Vue views are not mounted in unit tests; pin the wiring while decisions live in the composable. */
describe("three-role mission live UI (T3.5.7)", () => {
  it("renders the same private room panel from the rescuer desk, requester history and admin dispatch", () => {
    const views = ["../../views/_user/UserMissionView.vue", "../../views/_user/UserSosHistoryView.vue",
      "../../views/_admin/AdminDispatchView.vue"];
    for (const path of views) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source).toContain("<MissionLivePanel");
      expect(source).toContain('import MissionLivePanel from "@/components/mission/MissionLivePanel.vue"');
    }
    expect(readFileSync(new URL("../../views/_user/UserSosHistoryView.vue", import.meta.url), "utf8"))
      .toContain("listRequesterMissions(token, page, id)");
    expect(readFileSync(new URL("../../views/_admin/AdminDispatchView.vue", import.meta.url), "utf8"))
      .toContain("useAdminRequestMissions(");
    const adminRead = readFileSync(new URL("../../composables/use-admin-request-missions.ts", import.meta.url), "utf8");
    expect(adminRead).toContain("read: typeof listActiveSosMissions = listActiveSosMissions");
    expect(adminRead).toContain("read(bearer, id, true)");
  });

  it("defers MapLibre on the live panel until its canvas is ready, without losing markers", () => {
    const panel = readFileSync(new URL("./MissionLivePanel.vue", import.meta.url), "utf8");
    const canvas = readFileSync(new URL("../map/MapCanvas.vue", import.meta.url), "utf8");
    // A value import here pulls MapLibre into requester history even when the panel is hidden.
    expect(panel).not.toMatch(/import\s*\{[^}]*\bMarker\b[^}]*\}\s*from\s*["']maplibre-gl["']/);
    expect(panel).toContain('import type { Map as MapLibreMap, Marker } from "maplibre-gl"');
    expect(canvas).toContain('emit("ready", instance, Marker)');
    expect(panel).toContain('function onMapReady(instance: MapLibreMap, MarkerClass: typeof Marker)');
    expect(panel).toContain('markerConstructor = MarkerClass');
    expect(panel).toContain('new markerConstructor(');
    expect(panel).toContain('markers[member.role]?.remove()');
    expect(panel).toContain('markerConstructor = null');
  });

  it("keeps the publish action disabled and shows verification feedback while reconnect status is unknown", () => {
    const panel = readFileSync(new URL("./MissionLivePanel.vue", import.meta.url), "utf8");
    expect(panel).toContain('live.recoveryPending.value ? \'وضعیت مأموریت تأیید نشده\'');
    expect(panel).toContain('v-if="live.recoveryPending.value && !live.error.value"');
    expect(panel).toContain('role="status"');
    expect(panel).toContain(':disabled="!live.connected.value || live.recoveryPending.value"');
    expect(panel).toContain('@click="live.start()"'); // retry must recheck, not just dismiss the warning
  });

  it("keeps explicit sharing consent, three markers, last-seen text and an accessible stale badge", () => {
    const panel = readFileSync(new URL("./MissionLivePanel.vue", import.meta.url), "utf8");
    expect(panel).toContain('aria-label="نقشهٔ موقعیت زندهٔ درخواست‌کننده، امدادگر و مدیر"');
    expect(panel).toContain("member.role === 'rescuer' ? 'امدادگر' : 'مدیر مرکز'");
    expect(panel).toContain("آخرین مشاهده:");
    expect(panel).toContain("useMissionPresence");
    expect(panel).toContain("missionPresenceLabel[presence.rescuer.value]");
    expect(panel).toContain("مأموریت خودکار لغو نمی‌شود");
    expect(panel).toContain("!member.entry ? 'اشتراک آغاز نشده' : member.fresh ? 'موقعیت تازه' : 'موقعیت قدیمی'");
    expect(panel).toContain("@click=\"live.startSharing()\"");
    expect(panel).toContain("@click=\"live.stopSharing()\"");
    expect(panel).toContain('aria-live="polite"');
  });
});
