import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// Source/compiler checks only; docs/TASKS.md forbids mounting Vue SFCs in unit tests.
const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;

describe("SOS center on-map labels and offscreen directions", () => {
  it("names selected incidents only, qualified nearby responders and selected responder names", () => {
    expect(source).toContain('mapTitle: selected && feature.id === selected.id ? incidentLabel(selected.incidentTypeId) : ""');
    expect(source).toContain('filter: ["==", ["get", "isSelected"], true]');
    expect(source).toContain('"text-field": ["get", "username"]');
    expect(source).toContain('RESPONDER_SELECTED_NAME_LAYER_ID');
    expect(source).toContain('"text-radial-offset": 1.5');
    expect(source).toContain('"text-variable-anchor": ["left", "right", "top", "bottom"]');
    expect(source).toContain('"text-halo-color": palettes[themeStore.isDark ? "dark" : "light"].surface');
    expect(source).toContain('!adminSos.responderSearch');
    expect(source).toContain('adminSos.nearestRequestId === adminSos.selectedRequest.id');
    expect(source).not.toContain('createMapPointElement('); // Dispatch keeps its own WebGL grammar.
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
