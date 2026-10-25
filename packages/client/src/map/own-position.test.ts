import { describe, expect, it } from "vitest";
import { ownPositionLabel } from "./own-position";

describe("own map position text", () => {
  it("shows private opt-in, waiting, coordinates and accuracy without claiming sharing", () => {
    expect(ownPositionLabel(null, false, null)).toContain("خاموش");
    expect(ownPositionLabel(null, true, null)).toContain("GPS");
    expect(ownPositionLabel({ lat: 35.71234, lon: 51.41235, accuracy: 12.4 }, true, null))
      .toContain("35.71234، طول 51.41235، دقت ±12 متر");
    expect(ownPositionLabel({ lat: 35.7, lon: 51.4, accuracy: null }, true, null)).not.toContain("دقت");
    expect(ownPositionLabel(null, false, "GPS denied")).toBe("GPS denied");
  });
});
