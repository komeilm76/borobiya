import { describe, expect, it } from "vitest";
import { historyCameraPadding } from "./camera-padding";

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

  it("frames the track clear of phone chrome without collapsing on short viewports", () => {
    expect(historyCameraPadding(true, 568)).toEqual({ top: 128, bottom: 152, left: 24, right: 24 });
    const short = historyCameraPadding(true, 320);
    expect(short).toEqual({ top: 89, bottom: 102, left: 24, right: 24 });
    expect(320 - short.top - short.bottom).toBeGreaterThan(120);
  });
});
