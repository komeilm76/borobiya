import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";
import { SOS_MAP_MARKER_COLORS } from "@/admin/sos-alerts";

// Source/compiler checks only; docs/TASKS.md forbids mounting Vue SFCs in unit tests.
const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;

describe("SOS center on-map labels and offscreen directions", () => {
  it("names selected incidents only, qualified nearby responders and selected responder names", () => {
    expect(source).toContain('mapTitle: selected && feature.id === selected.id ? incidentLabel(selected.incidentTypeId) : ""');
    expect(source).toContain('filter: ["==", ["get", "isSelected"], true]');
    expect(source).toContain('"text-field": ["get", "username"]');
    expect(source).toContain('RESPONDER_SELECTED_NAME_LAYER_ID');
    expect(source).toContain('"text-radial-offset": 3.8');
    expect(source).toContain('"text-variable-anchor": ["left", "right", "top", "bottom"]');
    expect(source).toContain('"text-halo-color": palettes[themeStore.isDark ? "dark" : "light"].surface');
    expect(source).toContain('!adminSos.responderSearch');
    // Selection alone (before/without a nearest fetch) updates the WebGL SOS title.
    expect(source).toMatch(/watch\(\(\) => \[adminSos\.visibleRequests, adminSos\.selectedId\][\s\S]*?syncMapData\(\); updateMapEdgeCues\(\)/);
    // Clustered responders otherwise lose both their pin and username at low zoom.
    expect(source).toContain('features: nearbyFeatures.value.features.filter((feature) => feature.properties.isSelected)');
    expect(source).toContain('id: RESPONDER_SELECTED_NAME_LAYER_ID, type: "symbol", source: RESPONDER_SELECTED_SOURCE_ID');
    expect(source).toContain('id: RESPONDER_SELECTED_DOT_LAYER_ID, type: "circle", source: RESPONDER_SELECTED_SOURCE_ID');
    expect(source).toContain('feature.layer.id === RESPONDER_SELECTED_DOT_LAYER_ID');
    expect(source).toContain('RESPONDER_SELECTED_DOT_LAYER_ID, RESPONDER_SELECTED_GLYPH_LAYER_ID,');
    expect(source).toContain('adminSos.nearestRequestId === adminSos.selectedRequest.id');
    expect(source).not.toContain('createMapPointElement('); // Dispatch keeps its own WebGL grammar.
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
