import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DISPATCH_PIN_IMAGES, DispatchPinCanvasUnavailable, SELECTED_SOS_COLOR, drawDispatchPin, ensureDispatchPinImages, isFireIncidentLabel, refreshResponderPinImages, sosPinImage } from "./dispatch-map-pins";

// Do not mount Vue components in unit tests (docs/TASKS.md).
const dispatch = readFileSync(new URL("../views/_admin/AdminDispatchView.vue", import.meta.url), "utf8");

describe("actual Dispatch map symbols", () => {
  it("uses severity-aware SOS and selected pins, including rescuer cancellation", () => {
    expect(sosPinImage("pending", "low", false)).toBe(DISPATCH_PIN_IMAGES.low);
    expect(sosPinImage("pending", "medium", true)).toBe(DISPATCH_PIN_IMAGES.selectedMedium);
    expect(sosPinImage("cancelled_by_rescuer", "low", true)).toBe(DISPATCH_PIN_IMAGES.selectedHigh);
    expect(isFireIncidentLabel("آتش‌سوزی")).toBe(true);
    expect(isFireIncidentLabel("حریق ساختمان")).toBe(true);
    expect(isFireIncidentLabel("Fire in building")).toBe(true);
    expect(isFireIncidentLabel("درخواست پزشکی")).toBe(false);
    expect(sosPinImage("pending", "low", true, isFireIncidentLabel("آتش"))).toBe(DISPATCH_PIN_IMAGES.selectedFire);
    expect(sosPinImage("pending", "low", true, false)).toBe(DISPATCH_PIN_IMAGES.selectedLow);
    expect(SELECTED_SOS_COLOR).toBe("#dc2626");
  });

  it("draws the target's red selected fire pictogram with a white rim, not the old blue/gold alert", () => {
    const ctx = {
      beginPath: vi.fn(), moveTo: vi.fn(), bezierCurveTo: vi.fn(), closePath: vi.fn(),
      fill: vi.fn(), stroke: vi.fn(), lineTo: vi.fn(), fillRect: vi.fn(), arc: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({ width, height })),
      strokeStyle: "", fillStyle: "", lineWidth: 0
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
    drawDispatchPin(SELECTED_SOS_COLOR, "sos", true, canvas, "flame");
    expect(ctx.strokeStyle).toBe("#ffffff");
    expect(ctx.bezierCurveTo.mock.calls.length).toBeGreaterThan(6);
    expect(ctx.fillRect).not.toHaveBeenCalled(); // Only generic SOS alerts contain an exclamation.
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
        if (id === DISPATCH_PIN_IMAGES.selectedLow || id === DISPATCH_PIN_IMAGES.selectedFire)
          expect(context.fillStyle).toBe(SELECTED_SOS_COLOR); // Selected fire is red even when its severity is low.
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
