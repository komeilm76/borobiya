import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Contract tests: do not mount Vue SFCs (docs/TASKS.md).
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const panel = readFileSync(new URL("../../components/map/LiveCompanionPanel.vue", import.meta.url), "utf8");
const bar = readFileSync(new URL("../../components/sharing/LiveBroadcastBar.vue", import.meta.url), "utf8");

function functionBody(name: string): string {
  const start = view.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = view.indexOf("\nfunction ", start + 1);
  return view.slice(start, end < 0 ? view.length : end);
}

describe("map companions tool", () => {
  it("opens a real fullscreen, scrollable, dismissible Vuetify dialog on phones instead of a bottom sheet", () => {
    expect(view).toContain('import { VBottomSheet, VDialog } from "vuetify/components"');
    expect(view).toContain(`:is="isPhone ? VDialog : 'div'"`);
    expect(view).toContain('class="user-map-view__live-dialog"');
    expect(view).toContain('fullscreen: true');
    expect(view).toContain('scrollable: true');
    expect(view).toContain('modelValue: activeTool.value === "live"');
    expect(view).toContain('modelValue: activeTool.value === "search" || activeTool.value === "history"');
    expect(view).toContain('aria-label="اشتراک و همراهان"');
    expect(view).toContain('id="map-live-panel"');
    expect(view).toContain('aria-label="بستن همراهان"');
    expect(view).toContain('.user-map-view__live-dialog:not(.v-overlay) { display: contents; }');
    // Vuetify's Back hook and the map's route-leave guard must not both move history.
    expect(view.slice(view.indexOf('const phoneLiveDialogProps'), view.indexOf('// Keep Vuetify\'s models')))
      .toContain('closeOnBack: false');
    expect(view).toContain('env(safe-area-inset-top, 0px)');
    expect(view).toContain('env(safe-area-inset-bottom, 0px)');
  });

  it("offers just the consentful broadcast toggle in this tool; dashboard retains devices navigation", () => {
    expect(view).toContain('<LiveBroadcastBar compact map-mode />');
    expect(bar).toContain('mapMode?: boolean');
    expect(bar).toContain('v-if="state.showDevicesLink && !mapMode"');
    expect(bar).toContain('broadcast.toggle()');
    expect(bar).toContain('state.tone === \'warn\' || state.tone === \'error\'');
    expect(bar).toContain('to="/_user/devices"'); // Other instances still offer this where appropriate.
    expect(view).not.toContain('to="/_user/devices"');
  });

  it("keeps all granted companions in a selectable list and provides a separate map-visibility switch", () => {
    expect(panel).toContain('api.registry.value');
    expect(panel).toContain('api.peers.value');
    expect(panel).toContain('<v-switch');
    expect(panel).toContain('aria-label="نمایش همراهان روی نقشه"');
    expect(panel).toContain("$emit('update:visible'");
    expect(panel).toContain(":disabled=\"!member.position\"");
    expect(panel).toContain("$emit('select', member.userId)");
    expect(view).toContain(':visible="showCompanions"');
    expect(view).toContain('@update:visible="showCompanions = $event"');
    expect(view).toContain('@select="selectCompanion"');
    expect(functionBody("paintLive")).toContain('showCompanions.value ? live.overlay.value : emptyCompanionOverlay');
    expect(view).toContain('watch(showCompanions, (visible) => { if (!visible) removeSelectedCompanion(); paintLive(); syncPeerAvatars(); }, { flush: "sync" })');
  });

  it("centers only on an explicitly chosen, currently authorized, positioned companion and shows their data", () => {
    const select = functionBody("selectCompanion");
    expect(select).toContain('live.registry.value[userId]');
    expect(select).toContain('live.peers.value.find(');
    expect(select).toContain('if (!instance || !authorized || !peer || !auth.user?.id) return;');
    expect(select).toContain('bounds.contains(peer.position)');
    expect(select).toContain('showCompanions.value = true');
    expect(select).toContain('instance.flyTo(');
    expect(select).toContain('selectedCompanionId.value = userId');
    expect(view).toContain('<CompanionDetailSheet');
    const details = readFileSync(new URL("../../components/map/CompanionDetailSheet.vue", import.meta.url), "utf8");
    expect(details).toContain('ageWords(peer.ageMs)');
    expect(details).toContain('peer.accuracy');
    expect(view).toContain('watch(() => live.registry.value,');
    expect(view).toContain('profileController?.abort()');
    // Realtime updates move avatars and update the sheet, never fly the camera again.
    expect(functionBody("paintLive")).not.toMatch(/flyTo|fitBounds|easeTo/);
    expect(functionBody("syncSelectedCompanion")).not.toMatch(/flyTo|fitBounds|easeTo/);
  });
});
