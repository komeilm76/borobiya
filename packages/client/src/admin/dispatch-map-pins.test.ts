import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DISPATCH_PIN_IMAGES, DispatchPinCanvasUnavailable, drawDispatchPin, ensureDispatchPinImages, refreshResponderPinImages, sosPinImage } from "./dispatch-map-pins";
import { SOS_MAP_MARKER_COLORS, sosMapPriority } from "./sos-alerts";

// Do not mount Vue components in unit tests (docs/TASKS.md).
const dispatch = readFileSync(new URL("../views/_admin/AdminDispatchView.vue", import.meta.url), "utf8");

describe("actual Dispatch map symbols", () => {
  it("uses severity-aware SOS and selected pins, including rescuer cancellation", () => {
    expect(sosPinImage("pending", "low", false)).toBe(DISPATCH_PIN_IMAGES.low);
    expect(sosPinImage("pending", "medium", true)).toBe(DISPATCH_PIN_IMAGES.selectedMedium);
    expect(sosPinImage("cancelled_by_rescuer", "low", true)).toBe(DISPATCH_PIN_IMAGES.selectedHigh);
    // Incident categories come from a dynamic catalog; no category changes the icon.
    expect(sosPinImage("pending", "low", true)).toBe(DISPATCH_PIN_IMAGES.selectedLow);
    expect(Object.keys(DISPATCH_PIN_IMAGES)).not.toContain("selectedFire");
    expect(Object.keys(DISPATCH_PIN_IMAGES)).not.toContain("name"); // Names are direction-aware DOM chips, not fixed raster tabs.
    expect(sosMapPriority("pending", "low")).toBe("low");
    expect(sosMapPriority("pending", "medium")).toBe("medium");
    expect(sosMapPriority("cancelled_by_rescuer", "low")).toBe("high");
  });

  it("draws the generic alert for all incident types", () => {
    const ctx = {
      beginPath: vi.fn(), moveTo: vi.fn(), bezierCurveTo: vi.fn(), closePath: vi.fn(),
      fill: vi.fn(), stroke: vi.fn(), lineTo: vi.fn(), fillRect: vi.fn(), arc: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({ width, height })),
      strokeStyle: "", fillStyle: "", lineWidth: 0
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
    drawDispatchPin(SOS_MAP_MARKER_COLORS.low, "sos", true, canvas);
    expect(ctx.strokeStyle).toBe("#ffffff");
    expect(ctx.fillRect).toHaveBeenCalledWith(30.5, 22, 3, 8);
    expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, 64, 72);
  });

  it("registers image data for every map pin again after a map style swap", () => {
    const context = {
      beginPath: vi.fn(), moveTo: vi.fn(), bezierCurveTo: vi.fn(), closePath: vi.fn(),
      fill: vi.fn(), stroke: vi.fn(), lineTo: vi.fn(), fillRect: vi.fn(), arc: vi.fn(),
      fillStyle: "", strokeStyle: "",
      getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({ width, height }))
    };
    const canvas = { width: 0, height: 0, getContext: () => context };
    const originalDocument = globalThis.document;
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
    try {
      const ids = new Set<string>();
      const addImage = vi.fn((id: string, image: { width: number; height: number }) => {
        expect(image).toMatchObject({ width: 64, height: 72 });
        for (const [severity, selectedId] of [
          ["high", DISPATCH_PIN_IMAGES.selectedHigh],
          ["medium", DISPATCH_PIN_IMAGES.selectedMedium],
          ["low", DISPATCH_PIN_IMAGES.selectedLow]
        ] as const) {
          if (id === selectedId) expect(context.fillStyle).toBe(SOS_MAP_MARKER_COLORS[severity]);
        }
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
      ids.clear();
      let failOnce = true;
      const swappingStyle = { hasImage: (id: string) => ids.has(id), addImage: (id: string) => {
        if (failOnce) { failOnce = false; throw new Error("Style is not loaded"); }
        ids.add(id);
      } };
      expect(() => ensureDispatchPinImages(swappingStyle as never, false)).toThrow("Style is not loaded");
      expect(() => ensureDispatchPinImages(swappingStyle as never, false)).not.toThrow();
      expect(ids.size).toBe(Object.keys(DISPATCH_PIN_IMAGES).length);
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    }
  });

  it("distinguishes unavailable 2D canvas from transient map-style errors", () => {
    expect(() => drawDispatchPin("#dc2626", "sos", false,
      { getContext: () => null } as unknown as HTMLCanvasElement)).toThrow(DispatchPinCanvasUnavailable);
    expect(dispatch).toContain('if (error instanceof DispatchPinCanvasUnavailable) pinImagesSupported = false');
    expect(dispatch).toContain('else throw error; // A style swap is temporary');
  });

  it("plots symbols from real SOS and qualified responder sources and keeps their click layers", () => {
    expect(dispatch).toContain('id: SOS_PIN_LAYER_ID, type: "symbol", source: SOS_SOURCE_ID');
    expect(dispatch).toContain('"icon-image": ["get", "pinImage"]');
    expect(dispatch).toContain('id: RESPONDER_PIN_LAYER_ID, type: "symbol", source: RESPONDER_SOURCE_ID');
    expect(dispatch).toContain('id: RESPONDER_SELECTED_PIN_LAYER_ID, type: "symbol", source: RESPONDER_SELECTED_SOURCE_ID');
    expect(dispatch).toContain('"icon-anchor": "bottom"');
    expect(dispatch).toContain('"icon-offset": [0, 4]');
    expect(dispatch).toContain('"circle-translate": pinReady ? [0, -35] : [0, 0]');
    expect(dispatch).toContain('feature.layer.id === SOS_PIN_LAYER_ID');
    expect(dispatch).toContain('feature.layer.id === RESPONDER_PIN_LAYER_ID');
    expect(dispatch).toContain('"circle-stroke-opacity": pinReady ? 0 : 1');
    expect(dispatch).toContain('const imageMissing = pinImagesSupported && map.isStyleLoaded()');
  });
});
