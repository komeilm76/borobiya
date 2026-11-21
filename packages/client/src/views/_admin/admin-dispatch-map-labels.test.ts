import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";
import { SOS_MAP_MARKER_COLORS } from "@/admin/sos-alerts";

// Source/compiler checks only; docs/TASKS.md forbids mounting Vue SFCs in unit tests.
const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;

describe("SOS center on-map labels and offscreen directions", () => {
  it("names selected incidents only, qualified nearby responders and selected responder names", () => {
    expect(source).toContain('chip.textContent = incidentLabel(incident.incidentTypeId)');
    expect(source).not.toContain('"text-field": ["get", "mapTitle"]');
    expect(source).toContain('selectedSosLabelMarker = new mapLabelMarkerClass({ element, anchor: "center" })');
    expect(source).toMatch(/element\.hidden = false;[\s\S]*?chip\.offsetWidth, chip\.offsetHeight, hasPin \? -35 : 0\);[\s\S]*?element\.hidden = !placement\.visible;/);
    expect(source).toContain('element.style.setProperty("--dispatch-label-color"');
    expect(source).toContain('element.className = "dispatch-sos-label-anchor dispatch-responder-label-anchor"');
    expect(source).toContain('chip.className = "dispatch-sos-label dispatch-responder-label"');
    expect(source).toContain('chip.textContent = feature.properties.username');
    expect(source).toContain('element.style.setProperty("--dispatch-label-color", themeStore.isDark ? "#205fd1" : "#0868c8")');
    expect(source).toContain('positionResponderLabels(map)');
    expect(source).toContain('nonOverlappingResponderLabelIds(candidates');
    expect(source).not.toContain('RESPONDER_SELECTED_NAME_LAYER_ID');
    expect(source).not.toContain('DISPATCH_PIN_IMAGES.name');
    expect(source).toContain('!adminSos.responderSearch');
    // Selection alone (before/without a nearest fetch) updates the opaque on-map title.
    expect(source).toMatch(/watch\(\(\) => \[adminSos\.visibleRequests, adminSos\.selectedId\][\s\S]*?syncMapData\(\); syncSelectedSosLabel\(\); updateMapEdgeCues\(\)/);
    expect(source).toContain('watch(incidentNameById, () => { syncMapData(); syncSelectedSosLabel(); updateMapEdgeCues(); });');
    expect(styles[0]!.content).toContain(':global(.dispatch-sos-label) { position: absolute; top: -35px; left: 16px;');
    expect(styles[0]!.content).toContain('border-radius: 999px; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface));');
    const labelCss = styles[0]!.content;
    expect(labelCss).toContain('border-left: 3px solid var(--dispatch-label-color, #dc2626)');
    expect(labelCss).not.toContain('border-inline-start: 3px solid var(--dispatch-label-color');
    expect(labelCss).toContain(':global(.dispatch-sos-label::after)');
    expect(labelCss).toContain('left: -8px; top: calc(50% - 4px);');
    expect(labelCss).toContain(':global(.dispatch-sos-label-anchor--left .dispatch-sos-label)');
    expect(labelCss).toContain('border-right: 3px solid var(--dispatch-label-color');
    expect(labelCss).toContain(':global(.dispatch-sos-label-anchor--center .dispatch-sos-label::after)');
    expect(labelCss).toContain(':global(.dispatch-sos-label-anchor--center.dispatch-sos-label-anchor--above .dispatch-sos-label::after)');
    expect(source).toContain('filter: ["==", ["get", "isSelected"], false]');
    expect(source).toContain('"circle-color": SELECTED_SOS_COLOR, "circle-radius": 23');
    // Clustered responders otherwise lose both their pin and username at low zoom.
    expect(source).toContain('features: nearbyFeatures.value.features.filter((feature) => feature.properties.isSelected)');
    expect(source).toContain('visibleResponderLabelIds(map.queryRenderedFeatures({ layers })');
    expect(source).toContain('syncResponderLabels(); // The new cluster/pin frame is now queryable.');
    expect(source).toContain('clearResponderLabels();');
    expect(source).toContain('map.off("render", onRender);');
    expect(styles[0]!.content).toContain(':global(.dispatch-responder-label-anchor) { z-index: 3; }');
    expect(source).toContain('id: RESPONDER_SELECTED_DOT_LAYER_ID, type: "circle", source: RESPONDER_SELECTED_SOURCE_ID');
    expect(source).toContain('feature.layer.id === RESPONDER_SELECTED_DOT_LAYER_ID');
    expect(source).toContain('RESPONDER_SELECTED_DOT_LAYER_ID, RESPONDER_SELECTED_GLYPH_LAYER_ID,');
    expect(source).toContain('adminSos.nearestRequestId === adminSos.selectedRequest.id');
    expect(source).not.toContain('createMapPointElement('); // Dispatch pins remain WebGL; labels share the attached DOM chip.
  });

  it("uses contrasting blue responder glyphs, severity-coded SOS markers and a context-aware legend", () => {
    const contrastWithWhite = (hex: string) => {
      const channels = [1, 3, 5].map((offset) => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 1.05 / (0.05 + channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722);
    };
    for (const color of [...Object.values(SOS_MAP_MARKER_COLORS), "#205fd1", "#0868c8"])
      expect(contrastWithWhite(color), color).toBeGreaterThanOrEqual(4.5);
    expect(source).toContain('const responderPin = themeStore.isDark ? "#205fd1" : "#0868c8"');
    expect(source).toContain('"circle-stroke-color": "#f7b632"');
    expect(source).toContain('paint: { "text-color": "#ffffff" }');
    expect(template!.content).toContain('class="dispatch-map-key" aria-label="راهنمای نشانگرهای نقشه"');
    expect(template!.content).toContain('v-for="item in sosSeverityKey"');
    expect(template!.content).toContain('SOS_MAP_MARKER_COLORS[item.severity]');
    expect(template!.content).toContain('nearbyFeatures.features.length > 1');
    expect(template!.content).toContain('dispatch-map-key__icon--selected-sos');
    expect(source).toContain('id: SOS_AURA_LAYER_ID, type: "circle", source: SOS_SOURCE_ID');
    expect(source).toContain('"circle-color": ["case", ["boolean", ["get", "isSelected"], false], SELECTED_SOS_COLOR');
    expect(source).not.toContain("isFireIncidentLabel");
    expect(template!.content).not.toContain("mdi-fire");
    expect(styles[0]!.content).toContain('background: var(--dispatch-helper-color, #0868c8)');
    expect(template!.content).toContain('<li v-if="adminSos.selectedRequest">');
    expect(source).toContain('window.matchMedia?.("(prefers-reduced-motion: reduce)").matches');
    expect(source).toContain('watch(() => themeStore.isDark, () => {');
    expect(source).toContain('map.setPaintProperty(id, "circle-color", responderPin)');
  });

  it("places bounded screen-edge buttons for the selected SOS and authorised responders", () => {
    expect(source).toContain('<div v-if="mapEdgeCues.length" class="dispatch-map-edge-cues"');
    expect(source).toContain('@click="focusEdgeCue(cue)"');
    expect(source).toContain('dispatchMapEdgeCues(canvas.clientWidth, canvas.clientHeight');
    expect(source).toContain('map.on("move", updateMapEdgeCues);');
    expect(source).toContain('map.on("resize", updateMapEdgeCues);');
    expect(source).toContain('map.off("move", updateMapEdgeCues);');
    expect(source).toContain('nearbyFeatures.value.features.some((feature) => feature.id === cue.id)');
    expect(styles[0]!.content).toContain('pointer-events: none;');
    expect(styles[0]!.content).toContain('min-height: 44px;');
    expect(compileTemplate({ source: template!.content, filename: "AdminDispatchView.vue", id: "dispatch-labels" }).errors).toEqual([]);
    expect(compileStyle({ source: styles[0]!.content, filename: "AdminDispatchView.vue", id: "dispatch-labels", scoped: true }).errors).toEqual([]);
  });
});
