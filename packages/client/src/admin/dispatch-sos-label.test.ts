import { describe, expect, it } from "vitest";
import { dispatchSosLabelPlacement } from "./dispatch-sos-label";

describe("selected Dispatch SOS label placement", () => {
  it("keeps a short label tucked beside the pin head rather than far from its coordinate", () => {
    expect(dispatchSosLabelPlacement(100, 110, 400, 240, 95, 30)).toEqual({
      side: "right", belowPin: false, visible: true
    });
  });

  it("flips to the other side at the right edge and below the pin at the top", () => {
    expect(dispatchSosLabelPlacement(370, 110, 400, 240, 95, 30).side).toBe("left");
    // The chip touches the side of the pin, without a spacer.
    expect(dispatchSosLabelPlacement(170, 110, 280, 240, 76, 30).side).toBe("right");
    expect(dispatchSosLabelPlacement(100, 20, 400, 240, 95, 30)).toMatchObject({
      side: "below", belowPin: true
    });
  });

  it("chooses above the pin near the bottom on a normal-width map, then returns to a side when panned", () => {
    // Both horizontal sides fit. Previously they always won, making "above"
    // reachable only on an exceptionally narrow map.
    expect(dispatchSosLabelPlacement(190, 211, 400, 240, 95, 30)).toEqual({
      side: "above", belowPin: false, visible: true
    });
    expect(dispatchSosLabelPlacement(370, 211, 400, 240, 95, 30).side).toBe("above");
    expect(dispatchSosLabelPlacement(190, 130, 400, 240, 95, 30).side).toBe("right");
    expect(dispatchSosLabelPlacement(190, 20, 400, 240, 95, 30).side).toBe("below");
    // On a shallow map, never choose an above chip that would clip past its top.
    expect(dispatchSosLabelPlacement(190, 70, 400, 90, 95, 30).side).toBe("right");
  });

  it("attaches the same chip to a coordinate-centered circle if canvas pins are unavailable", () => {
    expect(dispatchSosLabelPlacement(100, 20, 400, 240, 95, 30, 0)).toMatchObject({
      side: "below", belowPin: true, visible: true
    });
    expect(dispatchSosLabelPlacement(370, 110, 400, 240, 95, 30, 0).side).toBe("left");
    expect(dispatchSosLabelPlacement(190, 204, 400, 240, 95, 30, 0)).toMatchObject({
      side: "above", belowPin: false, visible: true
    });
  });

  it("uses a bounded center fallback on narrow maps and hides offscreen labels", () => {
    expect(dispatchSosLabelPlacement(90, 100, 160, 240, 110, 36)).toMatchObject({ side: "below", visible: true });
    expect(dispatchSosLabelPlacement(90, 210, 160, 240, 110, 36)).toMatchObject({ side: "above", visible: true });
    expect(dispatchSosLabelPlacement(-12, 100, 400, 240, 95, 30).visible).toBe(false);
    expect(dispatchSosLabelPlacement(420, 100, 400, 240, 95, 30).visible).toBe(false);
  });
});
