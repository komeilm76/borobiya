import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DISPATCH_PIN_IMAGES, ensureDispatchPinImages, refreshResponderPinImages, sosPinImage } from "./dispatch-map-pins";

// Do not mount Vue components in unit tests (docs/TASKS.md).
const dispatch = readFileSync(new URL("../views/_admin/AdminDispatchView.vue", import.meta.url), "utf8");

describe("actual Dispatch map symbols", () => {
  it("uses severity-aware SOS and selected pins, including rescuer cancellation", () => {
    expect(sosPinImage("pending", "low", false)).toBe(DISPATCH_PIN_IMAGES.low);
    expect(sosPinImage("pending", "medium", true)).toBe(DISPATCH_PIN_IMAGES.selectedMedium);
    expect(sosPinImage("cancelled_by_rescuer", "low", true)).toBe(DISPATCH_PIN_IMAGES.selectedHigh);
  });

  it("registers image data for every map pin again after a map style swap", () => {
    const context = {
      beginPath: vi.fn(), moveTo: vi.fn(), bezierCurveTo: vi.fn(), closePath: vi.fn(),
      fill: vi.fn(), stroke: vi.fn(), lineTo: vi.fn(), fillRect: vi.fn(), arc: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({ width, height }))
    };
    const canvas = { width: 0, height: 0, getContext: () => context };
    const originalDocument = globalThis.document;
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
    try {
      const ids = new Set<string>();
      const addImage = vi.fn((id: string, image: { width: number; height: number }) => {
        expect(image).toMatchObject({ width: 64, height: 72 });
        ids.add(id);
      });
      const updateImage = vi.fn();
      const map = { hasImage: (id: string) => ids.has(id), addImage, updateImage };
      ensureDispatchPinImages(map as never, false);
      expect(ids.size).toBe(Object.keys(DISPATCH_PIN_IMAGES).length);
      ensureDispatchPinImages(map as never, false);
      expect(addImage).toHaveBeenCalledTimes(ids.size);
      refreshResponderPinImages(map as never, true);
      expect(updateImage).toHaveBeenCalledTimes(2);
      expect(updateImage).toHaveBeenCalledWith(DISPATCH_PIN_IMAGES.selectedHelper, expect.objectContaining({ width: 64, height: 72 }));
      ids.clear(); // setStyle discards runtime images
      ensureDispatchPinImages(map as never, true);
      expect(addImage).toHaveBeenCalledTimes(ids.size * 2);
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    }
  });

  it("plots symbols from real SOS and qualified responder sources and keeps their click layers", () => {
    expect(dispatch).toContain('id: SOS_PIN_LAYER_ID, type: "symbol", source: SOS_SOURCE_ID');
    expect(dispatch).toContain('"icon-image": ["get", "pinImage"]');
    expect(dispatch).toContain('id: RESPONDER_PIN_LAYER_ID, type: "symbol", source: RESPONDER_SOURCE_ID');
    expect(dispatch).toContain('id: RESPONDER_SELECTED_PIN_LAYER_ID, type: "symbol", source: RESPONDER_SELECTED_SOURCE_ID');
    expect(dispatch).toContain('"icon-anchor": "bottom"');
    expect(dispatch).toContain('feature.layer.id === SOS_PIN_LAYER_ID');
    expect(dispatch).toContain('feature.layer.id === RESPONDER_PIN_LAYER_ID');
    expect(dispatch).toContain('"circle-stroke-opacity": pinReady ? 0 : 1');
    expect(dispatch).toContain('const imageMissing = pinImagesSupported && map.isStyleLoaded()');
  });
});
