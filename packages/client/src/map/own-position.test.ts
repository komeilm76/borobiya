import { describe, expect, it } from "vitest";
import { ownPositionAnnouncement, ownPositionLabel } from "./own-position";

describe("own map position text", () => {
  it("announces only private GPS state changes, not each coordinate or accuracy update", () => {
    const first = { lat: 35.71234, lon: 51.41235, accuracy: 12.4 };
    const next = { lat: 35.71299, lon: 51.41301, accuracy: 8 };
    const ready = ownPositionAnnouncement(first, true, null, true);
    expect(ready).toBe(ownPositionAnnouncement(next, true, null, true));
    expect(ready).not.toContain("35.");
    expect(ready).not.toContain("دقت");
    expect(ready).toContain("اشتراک");
    expect(ownPositionAnnouncement(null, true, null, true)).not.toBe(ready);
    expect(ownPositionAnnouncement(null, false, null, true)).not.toBe(ready);
    expect(ownPositionAnnouncement(null, false, "GPS denied", true)).toContain("GPS denied");
    expect(ownPositionAnnouncement(null, false, null, false)).not.toBe(ready);
  });

  it("shows private opt-in, waiting, coordinates and accuracy without claiming sharing", () => {
    expect(ownPositionLabel(null, false, null)).toContain("خاموش");
    expect(ownPositionLabel(null, true, null)).toContain("GPS");
    expect(ownPositionLabel({ lat: 35.71234, lon: 51.41235, accuracy: 12.4 }, true, null))
      .toContain("35.71234، طول 51.41235، دقت ±12 متر");
    expect(ownPositionLabel({ lat: 35.7, lon: 51.4, accuracy: null }, true, null)).not.toContain("دقت");
    expect(ownPositionLabel(null, false, "GPS denied")).toBe("GPS denied");
  });
});
