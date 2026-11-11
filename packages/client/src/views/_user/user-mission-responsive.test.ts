import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const view = readFileSync(new URL("./UserMissionView.vue", import.meta.url), "utf8");
const panel = readFileSync(new URL("../../components/mission/MissionLivePanel.vue", import.meta.url), "utf8");

describe("rescuer route phone controls (source-pinned; no Vue mount)", () => {
  it("uses one transport profile for the phone select and desktop buttons, locked during navigation", () => {
    expect(view).toMatch(/<v-select :model-value="routing\.profile\.value" :items="transportProfiles"[\s\S]*?class="mission-route__profile-select d-sm-none"[\s\S]*?label="وسیلهٔ حرکت"[\s\S]*?:disabled="navigation\.active\.value"[\s\S]*?@update:model-value="onProfileChange"/);
    expect(view).toMatch(/<v-btn-toggle class="d-none d-sm-inline-flex" :model-value="routing\.profile\.value"[\s\S]*?:disabled="navigation\.active\.value"[\s\S]*?@update:model-value="onProfileChange"/);
    expect(view).toContain('if (value === "car" || value === "bicycle" || value === "foot") routing.selectProfile(value as TransportProfile)');
    expect(view).toContain('] satisfies { title: string; value: TransportProfile }[];');
  });

  it("states the actual mission outcome and keeps optional stops out of the primary route path", () => {
    expect(view).toContain('<h1>{{ missionHeadline }}</h1>');
    expect(view).toContain('v-if="desk.cancellationNeedsRefresh.value && !desk.cancellationOpen.value"');
    expect(view).toContain('پیش از تغییر مرحله، وضعیت مأموریت را از سرور تازه کنید.');
    expect(view).toContain('if (desk.error.value) return "وضعیت تازهٔ مأموریت تأیید نشد.";');
    expect(view).toContain('if (desk.activeMission.value) return "کمک در جریان است.";');
    expect(view).toContain('if (desk.loading.value) return "در حال بررسی مأموریت…";');
    expect(view).toContain('return "مأموریت فعالی ندارید.";');
    expect(view).toContain('<details class="mission-route__stops" @toggle="onWaypointDisclosureToggle">');
    expect(view).toContain('<summary class="mission-route__stops-toggle">ایستگاه‌های میانی (اختیاری، حداکثر ۶)');
    expect(view).toContain('if (!(event.target as HTMLDetailsElement).open) pickingWaypoint.value = false;');
    const stopsStart = view.indexOf('<details class="mission-route__stops"');
    const editor = view.slice(stopsStart, view.indexOf('</details>', stopsStart));
    expect(editor).toContain('@click="addTypedWaypoint"');
    expect(editor).toContain('@click="routing.removeWaypoint(index)"');
    expect(editor).not.toContain('class="mission-route__step-control"');
    expect(view.indexOf('class="mission-route__step-control"')).toBeGreaterThan(stopsStart);
    expect(view).toContain('.mission-route__stops-toggle:focus-visible { outline: 3px solid rgb(var(--v-theme-primary));');
  });

  it("keeps mission cancellation actions reachable on narrow and short screens", () => {
    const phone = view.split("@media(max-width: 599px) {")[1]!.split("@media(max-width: 480px)")[0]!;
    expect(view).toContain('<v-dialog :model-value="desk.cancellationOpen.value" max-width="510" scrollable');
    expect(view).toContain('<v-card-actions class="mission-cancel-actions">');
    expect(phone).toContain('.mission-cancel-actions { flex-direction: column; align-items: stretch; gap: 8px; }');
    expect(phone).toContain('.mission-cancel-actions :deep(.v-spacer) { display: none; }');
    expect(phone).toContain('.mission-cancel-actions :deep(.v-btn) { width: 100%; min-width: 0; min-height: 44px; height: auto; margin: 0; }');
    expect(phone).toContain('.mission-cancel-actions :deep(.v-btn__content) { white-space: normal; text-align: center; }');
    expect(view).toContain(':disabled="!desk.canCancel.value" @click="desk.confirmCancellation()"');
  });

  it("gives the active mission a genuine full-bleed map, with compact closable overlay tools", () => {
    const app = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
    const shell = readFileSync(new URL("../../styles/tailwind.css", import.meta.url), "utf8");
    expect(app).toContain('route.name === "user-map" || route.name === "user-mission"');
    expect(app).toContain("'app-shell--map': isMapRoute");
    expect(app).toContain('<MapSidebar\n      v-if="isMapRoute"');
    expect(shell).toContain('.app-shell--map .app-main {');
    expect(shell).toContain('.app-shell--map .app-footer { display: none; }');
    expect(view).toContain("height: 100dvh; min-height: 0; padding: 0; overflow: hidden;");
    expect(view).toContain('.mission-desk:not(.mission-desk--active) { position: relative; height: 100dvh; min-height: 0; padding: 0; overflow: hidden; }');
    expect(view).toContain('watch(() => [routing.error.value, navigation.error.value] as const,');
    expect(view).toContain('v-show="activeTool === \'status\'" id="mission-status-panel"');
    expect(view).toContain('v-show="routing.visible.value && activeTool === \'route\'" id="mission-route-panel"');
    expect(view).toContain(':room-open="activeTool === \'team\'"');
    expect(view).toContain('const activeTool = ref<"status" | "route" | "team" | null>(null);');
    expect(view).toContain('aria-label="ابزارهای مأموریت"');
    expect(view).toContain('function dismissTool(): void {');
    expect(view).toContain('activeTool.value = pickingWaypoint.value ? null : "route";');
    expect(view).toContain('if (navigation.start()) closeTool("route");');
    expect(view).not.toContain('scrollIntoView(');
    expect(view).toContain('<MapCanvas v-if="!desk.activeMission.value" class="mission-desk__idle-map"');
    expect(view).toContain('<div v-if="desk.activeMission.value" id="mission-workspace"');
    expect(view.match(/<MapCanvas\b/g)).toHaveLength(1); // Public fallback, never alongside the active mission.
    expect(panel.match(/<MapCanvas\b/g)).toHaveLength(1);
    expect(panel.indexOf('<slot name="route-planner"')).toBeGreaterThan(panel.indexOf('<MapCanvas'));
    expect(panel).toContain('fullscreen?: boolean; roomOpen?: boolean;');
    expect(panel).toContain('v-show="!fullscreen || roomOpen"');
    expect(panel).toContain('v-if="!fullscreen && live.error.value"');
    expect(panel).toContain('v-if="fullscreen" class="live-panel__room-heading"');
    expect(panel).toContain('@click="live.startSharing()"');
    expect(panel).toContain('.live-panel--fullscreen .live-panel__map :deep(.map-canvas)');
    expect(panel).toContain('height: 100%; min-height: 0; border-radius: 0;');
    expect(view).toContain('routing.findRoutes(true)');
    expect(view).toContain('if (!routing.addWaypoint({ lat, lon }))');
    expect(view).toContain('missionMapCamera(incident, routing.from.value, routing.via.value)');
    expect(view).toContain('@update:model-value="focusRouteStep(Number($event))"');
    expect(view).toContain('missionRouteStop(incident, routing.from.value, routing.via.value,');
    expect(view).toContain('highlightRouteStop();');
    expect(view).toContain(':disabled="navigation.active.value"');
    expect(view).toContain('if (!routing.addWaypoint({ lat: event.lngLat.lat, lon: normalizedLon }))');
    expect(view).toContain('id="mission-cancel-waypoint"');
    expect(view).toContain('pickingWaypoint.value ? "mission-cancel-waypoint" : "mission-route-panel"');
    expect(view).toContain('@sharing-change="teamSharing = $event"');
    expect(view).toContain('mission-desk__dock-sharing');
    expect(panel).toContain('watch(live.sharing, (sharing) => emit("sharing-change", sharing)');
    expect(panel).toContain('aria-label="بستن پنل اعضای مأموریت"');
    expect(panel).toContain('watch(live.endedMissionId, (id) => { if (id) emit("mission-ended", id); }');
    expect(view).toContain('@mission-ended="onMissionEnded"');
    expect(view).toContain('desk.markTerminalEvent(id);');
    expect(view).toContain('closeRoutes(); // Revoke GPS guidance and private incident overlays immediately.');
    expect(view).toContain('void desk.load(); // A socket event is a signal to verify');
    expect(view).toContain('routing.clearPlan();');
    expect(view).toContain('v-if="desk.terminalHold.value"');
    expect(view).toContain('!routing.target.value || routing.targetLoading.value');
    for (const [source, filename] of [[view, "UserMissionView.vue"], [panel, "MissionLivePanel.vue"]] as const) {
      const { descriptor } = parse(source, { filename });
      const style = compileStyle({ source: descriptor.styles[0]!.content, filename, id: "data-v-mission-map", scoped: true });
      expect(style.errors).toEqual([]);
      expect(style.code).toContain(filename === "UserMissionView.vue" ? "100dvh" : ".live-panel--fullscreen");
    }
  });
});
