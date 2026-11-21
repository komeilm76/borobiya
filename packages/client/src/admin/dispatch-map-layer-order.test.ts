import { describe, expect, it } from "vitest";
import { raiseDispatchLayers } from "./dispatch-map-layer-order";

const order = ["responder", "sos", "selected-sos"];
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
    expect(map.layers.map((layer) => layer.id)).toEqual(["poi", "responder", "sos"]);
    expect(map.moved).toEqual(["responder", "sos"]);
  });
});
