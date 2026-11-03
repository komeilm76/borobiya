import { describe, expect, it } from "vitest";
import { selectedPointShare } from "./selected-point-share";

describe("share selected destination", () => {
  it("shares only valid destination coordinates in a portable map URL", () => {
    const share = selectedPointShare({ lat: 35.6892, lon: 51.389 });
    expect(share?.url).toBe("https://www.openstreetmap.org/?mlat=35.68920&mlon=51.38900#map=16/35.68920/51.38900");
    expect(JSON.stringify(share)).not.toContain("origin");
  });
  it("refuses missing, invalid and nonfinite points", () => {
    for (const point of [null, { lat: 91, lon: 0 }, { lat: 0, lon: -181 }, { lat: NaN, lon: 1 }])
      expect(selectedPointShare(point)).toBeNull();
  });
});
