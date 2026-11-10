import { describe, expect, it } from "vitest";
import { historyCameraKey, historyCameraPadding } from "./camera-padding";

describe("history track camera", () => {
  it("leaves room for desktop overlays without shrinking the mobile route into a strip", () => {
    const wide = historyCameraPadding(false);
    const phone = historyCameraPadding(true);
    expect(wide).toEqual({ top: 96, bottom: 168, left: 72, right: 72 });
    expect(phone).toEqual({ top: 24, bottom: 24, left: 24, right: 24 });
    // The minimum mobile canvas height is 320px. The old desktop padding left only 56px.
    expect(320 - phone.top - phone.bottom).toBe(272);
    expect(320 - wide.top - wide.bottom).toBe(56);
  });

  it("invalidates a fit when the track moves, the canvas resizes, or padding changes", () => {
    const track = [{ ms: 0, lon: 51, lat: 35 }, { ms: 1000, lon: 52, lat: 36 }];
    const moved = [{ ms: 0, lon: 60, lat: 35 }, { ms: 1000, lon: 61, lat: 36 }];
    const bounds: [[number, number], [number, number]] = [[51, 35], [52, 36]];
    const movedBounds: [[number, number], [number, number]] = [[60, 35], [61, 36]];
    const padding = historyCameraPadding(true);
    const viewport = { width: 390, height: 650 };
    const key = historyCameraKey(track, bounds, padding, viewport);
    expect(historyCameraKey([...track], bounds, padding, viewport)).toBe(key);
    expect(historyCameraKey(moved, movedBounds, padding, viewport)).not.toBe(key);
    expect(historyCameraKey(track, bounds, padding, { width: 320, height: 650 })).not.toBe(key);
    expect(historyCameraKey(track, bounds, historyCameraPadding(true, 320), viewport)).not.toBe(key);
    expect(historyCameraKey([track[0]!], null, padding, viewport))
      .not.toBe(historyCameraKey([{ ms: 0, lon: 60, lat: 35 }], null, padding, viewport));
  });

  it("frames the track clear of phone chrome without collapsing on short viewports", () => {
    expect(historyCameraPadding(true, 568)).toEqual({ top: 128, bottom: 152, left: 24, right: 24 });
    const short = historyCameraPadding(true, 320);
    expect(short).toEqual({ top: 89, bottom: 102, left: 24, right: 24 });
    expect(320 - short.top - short.bottom).toBeGreaterThan(120);
  });
});
