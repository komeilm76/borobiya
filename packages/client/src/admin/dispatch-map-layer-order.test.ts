import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { raiseDispatchLayers } from "./dispatch-map-layer-order";

const order = ["sos", "responder", "selected-sos"];
const dispatch = readFileSync(new URL("../views/_admin/AdminDispatchView.vue", import.meta.url), "utf8");
function mapWithLayers(ids: string[]) {
  const layers = ids.map((id) => ({ id }));
  const moved: string[] = [];
  return {
    getStyle: () => ({ layers }),
    getLayer: (id: string) => layers.find((layer) => layer.id === id),
    moveLayer: (id: string) => {
      moved.push(id);
      layers.splice(layers.findIndex((layer) => layer.id === id), 1);
      layers.push({ id });
    },
    layers, moved
  };
}

describe("dispatch map draw order", () => {
  it("keeps ordinary SOS below every nearby helper and the selected SOS above both", () => {
    const ids = dispatch.match(/const DISPATCH_LAYER_ORDER = \[([\s\S]*?)\] as const;/)?.[1];
    expect(ids).toBeDefined();
    const at = (id: string) => ids!.indexOf(id);
    for (const ordinary of ["SOS_PULSE_LAYER_ID", "SOS_CORE_LAYER_ID", "SOS_GLYPH_LAYER_ID", "SOS_PIN_LAYER_ID"]) {
      expect(at(ordinary)).toBeGreaterThanOrEqual(0);
      expect(at(ordinary)).toBeLessThan(at("RESPONDER_DOT_LAYER_ID"));
    }
    for (const helper of ["RESPONDER_DOT_LAYER_ID", "RESPONDER_CLUSTER_LAYER_ID", "RESPONDER_LABEL_LAYER_ID",
      "RESPONDER_PIN_LAYER_ID", "RESPONDER_COUNT_LAYER_ID", "RESPONDER_SELECTED_DOT_LAYER_ID",
      "RESPONDER_SELECTED_GLYPH_LAYER_ID", "RESPONDER_SELECTED_PIN_LAYER_ID"]) {
      expect(at(helper)).toBeGreaterThan(at("SOS_PIN_LAYER_ID"));
      expect(at(helper)).toBeLessThan(at("SOS_SELECTED_CORE_LAYER_ID"));
    }
    expect(at("SOS_SELECTED_CORE_LAYER_ID")).toBeLessThan(at("SOS_SELECTED_GLYPH_LAYER_ID"));
    expect(at("SOS_SELECTED_GLYPH_LAYER_ID")).toBeLessThan(at("SOS_SELECTED_PIN_LAYER_ID"));
    expect(dispatch).toContain('const before = map.getLayer(SOS_SELECTED_CORE_LAYER_ID) ? SOS_SELECTED_CORE_LAYER_ID : undefined;');
    expect(dispatch).toContain('raiseDispatchLayers(map, DISPATCH_LAYER_ORDER)');
  });

  it("raises preserved overlays above basemap POIs after a style diff, selected SOS last", () => {
    const map = mapWithLayers(["roads", "responder", "sos", "selected-sos", "poi"]);
    raiseDispatchLayers(map, order);
    expect(map.layers.map((layer) => layer.id)).toEqual(["roads", "poi", ...order]);
    expect(map.moved).toEqual(order);
    raiseDispatchLayers(map, order);
    expect(map.moved).toEqual(order); // No self-triggered styledata loop.
  });

  it("ignores unavailable layers during style restoration and works without a selected pin image", () => {
    const map = mapWithLayers(["sos", "poi", "responder"]);
    raiseDispatchLayers(map, order);
    expect(map.layers.map((layer) => layer.id)).toEqual(["poi", "sos", "responder"]);
    expect(map.moved).toEqual(["sos", "responder"]);
  });
});
