import { describe, expect, it } from "vitest";
import { dispatchSosLabelPlacement } from "./dispatch-sos-label";

describe("selected Dispatch SOS label placement", () => {
  it("keeps a short label by the pin head rather than far from its coordinate", () => {
    expect(dispatchSosLabelPlacement(100, 110, 400, 240, 95, 30)).toEqual({
      side: "right", belowPin: false, visible: true
    });
  });

  it("flips to the other side at the right edge and below the pin at the top", () => {
    expect(dispatchSosLabelPlacement(370, 110, 400, 240, 95, 30).side).toBe("left");
    expect(dispatchSosLabelPlacement(100, 20, 400, 240, 95, 30)).toMatchObject({
      side: "right", belowPin: true
    });
  });

  it("uses a bounded center fallback on narrow maps and hides offscreen labels", () => {
    expect(dispatchSosLabelPlacement(90, 100, 160, 240, 110, 36)).toMatchObject({ side: "below", visible: true });
    expect(dispatchSosLabelPlacement(90, 210, 160, 240, 110, 36)).toMatchObject({ side: "above", visible: true });
    expect(dispatchSosLabelPlacement(-12, 100, 400, 240, 95, 30).visible).toBe(false);
    expect(dispatchSosLabelPlacement(420, 100, 400, 240, 95, 30).visible).toBe(false);
  });
});
